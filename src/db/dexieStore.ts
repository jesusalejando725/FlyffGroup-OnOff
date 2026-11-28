import { restoreEquipment } from '../data/madrigalEquipment';
import { canEquip } from '../data/equipmentRules';
import type { WalletKey } from '../types/game';
import { forge } from '../data/jewelForge';
import { equippedGearBonuses } from '../data/flyffEconomy';
import { findHeroAppearance } from '../data/heroAppearances';
import { inventorySellValue } from '../data/itemPricing';
import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_BUTTON_LAYOUTS,
  MU_CLASSES,
  getDefaultComboConfig,
  getStarterItemsForMuClass,
} from '../data/muSkillsAndClasses';
import {
  MU_CHAOS_WINGS_RECIPES,
  displayItemName,
  getMapById,
} from '../data/muWorldData';
import {
  MAX_HERO_LEVEL,
  MAX_STAT_POINTS,
  getSkillRank,
  getSkillUpgradeCost,
  getXpRequiredForLevel,
} from '../game/combatAndProgression';
import {
  DEFAULT_CAMERA_DISTANCE,
  DEFAULT_LOOT_FILTERS,
  DEFAULT_POTION_CONFIG,
  type LootFilterSettings,
  type PotionConfig,
} from '../game/worldPhysicsMath';
import type {
  AsyncDuelRecord,
  ButtonLayoutItem,
  CharacterComboConfig,
  ChatMessageRecord,
  EventSessionRecord,
  GameSettings,
  HeroClass,
  HudButtonId,
  ItemSlot,
  MuAccount,
  MuCharacter,
  MuItem,
  SharedLedgerEntry,
  ShopItemDef,
} from '../types/game';

interface KvMetaRecord {
  key: string;
  value: unknown;
}

class MuLorenciaDatabase extends Dexie {
  accounts!: Table<MuAccount, string>;
  characters!: Table<MuCharacter, string>;
  items!: Table<MuItem, string>;
  sharedLedger!: Table<SharedLedgerEntry, string>;
  eventSessions!: Table<EventSessionRecord, string>;
  chatMessages!: Table<ChatMessageRecord, string>;
  asyncDuels!: Table<AsyncDuelRecord, string>;
  kvMeta!: Table<KvMetaRecord, string>;

  constructor() {
    super('MuLorenciaOfflineDB');
    this.version(1).stores({
      accounts: 'id, username, updatedAt, isSynced',
      characters: 'id, accountId, updatedAt, isSynced',
      items: 'id, charId, slot, isEquipped',
      sharedLedger: 'id, sessionId, createdAt',
      eventSessions: 'id, sessionCode, startedAt',
      chatMessages: 'id, createdAt',
      asyncDuels: 'id, createdAt',
      kvMeta: 'key',
    });
    this.version(2).stores({}).upgrade(async tx=>{
      for (const c of await tx.table<MuCharacter>('characters').toArray()) {
        const rows=await tx.table<MuItem>('items').where('charId').equals(c.id).toArray();
        const keep: MuItem[]=[];
        for (const row of rows) {
          const item=restoreEquipment(row,c.classType,c.sex);
          if (item.isEquipped && !canEquip(c,item)) item.isEquipped=false;
          const stack=item.slot==='consumable' && keep.find(i=>sameStack(i,item));
          if (stack) {stack.quantity=(stack.quantity ?? 1)+(item.quantity ?? 1); await tx.table('items').delete(item.id);}
          else keep.push(item);
        }
        await tx.table('items').bulkPut(keep);
        await tx.table('characters').put({...applyGearHealth(c,keep),life:c.life+(c.chaos||0)+(c.harmony||0)+(c.creation||0)+(c.talisman||0),
          chaos:0,harmony:0,creation:0,talisman:0,inventory:keep.filter(i=>!i.isEquipped),equipment:keep.filter(i=>i.isEquipped),updatedAt:Date.now(),isSynced:false});
      }
    });
  }
}

export const db = new MuLorenciaDatabase();

export async function getKvSetting<T>(key: string, fallback: T): Promise<T> {
  await initDexie();
  return ((await db.kvMeta.get(key))?.value as T | undefined) ?? fallback;
}

export async function setKvSetting(key: string, value: unknown): Promise<void> {
  await initDexie();
  await db.kvMeta.put({ key, value });
}

const DEFAULT_SETTINGS: GameSettings = {
  brightness: 1.08,
  volume: 0.75,
  muted: false,
  musicEnabled: true,
  musicVolume: 0.45,
  free3dCamera: false,
  cameraDistance: DEFAULT_CAMERA_DISTANCE,
  cameraDistanceMigratedV2: true,
  cameraDistanceMigratedV3: true,
  autoAimAssist: true,
  targetFps: 60,
};

// Pure-TS deterministic SHA-256 so hashing works identically in HTTP, HTTPS, and Node
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map((v) => v.toString(16).padStart(8, '0')).join('');
}

export async function hashSecret(raw: string): Promise<string> {
  return sha256Hex(`mu-lorencia:${raw}`);
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

export function applyGearHealth(c: MuCharacter, items: readonly MuItem[]): MuCharacter {
  const gear = equippedGearBonuses(items);
  const baseHp = Math.max(120, c.maxHp - (c.gearHpBonus ?? 0));
  const bonus = Math.round(baseHp * (gear.hpPct ?? 0) / 100) + (gear.hp ?? 0);
  const maxHp = baseHp + bonus;
  return c.maxHp === maxHp && (c.gearHpBonus ?? 0) === bonus ? c :
    { ...c, gearHpBonus: bonus, maxHp, hp: Math.min(c.hp, maxHp) };
}

export function normalizeCharacterRecord(c: MuCharacter): MuCharacter {
  const safeLevel = Math.max(1, Math.min(MAX_HERO_LEVEL, Number(c.level) || 1));
  const maxHp = Math.max(120, Number(c.maxHp) || 220);
  const maxMp = Math.max(60, Number(c.maxMp) || 100);
  const maxSd = Math.max(80, Number(c.maxSd) || 160);
  const maxAg = Math.max(50, Number(c.maxAg) || 90);
  return {
    ...c,
    sex: c.sex === 'female' ? 'female' : 'male',
    appearanceId: findHeroAppearance(c.appearanceId, c.classType)?.id,
    level: safeLevel,
    resets: Math.max(0, Number(c.resets) || 0),
    xp: Math.max(0, Number(c.xp) || 0),
    xpToNext: Math.max(100, Number(c.xpToNext) || getXpRequiredForLevel(safeLevel)),
    hp: Math.max(1, Math.min(maxHp, Number(c.hp) || maxHp)),
    maxHp,
    mp: Math.max(0, Math.min(maxMp, Number(c.mp ?? maxMp))),
    maxMp,
    sd: Math.max(0, Math.min(maxSd, Number(c.sd ?? maxSd))),
    maxSd,
    ag: Math.max(0, Math.min(maxAg, Number(c.ag ?? maxAg))),
    maxAg,
    str: Math.max(10, Number(c.str) || 20),
    agi: Math.max(10, Number(c.agi) || 20),
    vit: Math.max(10, Number(c.vit) || 20),
    ene: Math.max(10, Number(c.ene) || 15),
    cmd: Math.max(10, Number(c.cmd) || 10),
    unspentPoints: Math.max(0, Number(c.unspentPoints) || 0),
    skillPoints: Math.max(0, Number(c.skillPoints ?? 2)),
    skillRanks: c.skillRanks || {},
    specialization: c.specialization || 'balanced',
    unlockedAchievements: Array.isArray(c.unlockedAchievements) ? c.unlockedAchievements : [],
    duelWins: Math.max(0, Number(c.duelWins) || 0),
    duelLosses: Math.max(0, Number(c.duelLosses) || 0),
    zen: Math.max(0, Number(c.zen) || 0),
    bless: Math.max(0, Number(c.bless) || 0),
    soul: Math.max(0, Number(c.soul) || 0),
    life: [c.life,c.chaos,c.harmony,c.creation,c.talisman].reduce<number>((n,v)=>n+Math.max(0,Number(v)||0),0),
    chaos:0,harmony:0,creation:0,talisman:0,
    kills: Math.max(0, Number(c.kills) || 0),
    currentMapId: getMapById(c.currentMapId).id,
    updatedAt: Number(c.updatedAt) || Date.now(),
    isSynced: Boolean(c.isSynced),
  };
}

let initPromise: Promise<void> | null = null;

export async function initDexie(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = db.open().then(() => undefined).catch(error => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

const ADMIN_PROFILE_ID = 'acc-world-admin';
export async function getWorldAdminProfile(username: string): Promise<MuAccount> {
  await initDexie();
  return db.transaction('rw', db.accounts, async () => {
    const existing = await db.accounts.get(ADMIN_PROFILE_ID);
    if (existing) return existing;
    const account: MuAccount = {
      id: ADMIN_PROFILE_ID, username, passwordHash: '', secretQ1: '', secretA1: '',
      secretQ2: '', secretA2: '', createdAt: new Date().toISOString(), updatedAt: Date.now(), isSynced: false,
    };
    await db.accounts.add(account);
    return account;
  });
}

export async function listAccounts(): Promise<MuAccount[]> {
  await initDexie();
  return (await db.accounts.toArray()).filter(account => account.id !== ADMIN_PROFILE_ID);
}

export async function loginAccount(
  username: string,
  password: string,
): Promise<{ ok: true; account: MuAccount } | { ok: false; error: string }> {
  await initDexie();
  const cleanUser = username.trim().toLowerCase();
  const acc = (await db.accounts.toArray()).find((a) => a.id !== ADMIN_PROFILE_ID && a.username.toLowerCase() === cleanUser);
  if (!acc) {
    return { ok: false, error: `No existe la cuenta "${cleanUser}" en IndexedDB.` };
  }
  const passHash = await hashSecret(password);
  if (acc.passwordHash !== passHash) {
    return { ok: false, error: 'Contraseña incorrecta.' };
  }
  return { ok: true, account: acc };
}

export async function registerAccount(input: {
  username: string;
  password: string;
  secretQ1: string;
  secretA1: string;
  secretQ2: string;
  secretA2: string;
}): Promise<{ ok: true; account: MuAccount } | { ok: false; error: string }> {
  await initDexie();
  const cleanUser = input.username.trim().toLowerCase();
  if (cleanUser.length < 3) {
    return { ok: false, error: 'El nombre de usuario debe tener al menos 3 caracteres.' };
  }
  if (input.password.length < 4) {
    return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
  }
  if (!input.secretA1.trim() || !input.secretA2.trim()) {
    return { ok: false, error: 'Debes completar ambas preguntas secretas.' };
  }

  const account: MuAccount = {
    id: 'acc-' + Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),
    username: cleanUser,
    passwordHash: await hashSecret(input.password),
    secretQ1: input.secretQ1,
    secretA1: await hashSecret(normalizeAnswer(input.secretA1)),
    secretQ2: input.secretQ2,
    secretA2: await hashSecret(normalizeAnswer(input.secretA2)),
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    isSynced: false,
  };
  return db.transaction('rw',db.accounts,db.kvMeta,async () => {
    if (await db.accounts.where('username').equalsIgnoreCase(cleanUser).first())
      return {ok:false,error:'Ese ID ya existe en este dispositivo.'};
    await db.accounts.add(account);
    await db.kvMeta.put({key:'privateBackup:pending:' + account.id,value:true});
    return { ok:true,account };
  });
}

export async function changeAccountPassword(
  username: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  await initDexie();
  const cleanUser = username.trim().toLowerCase();
  const acc = (await db.accounts.toArray()).find((a) => a.id !== ADMIN_PROFILE_ID && a.username.toLowerCase() === cleanUser);
  if (!acc) return { ok: false, error: 'Cuenta no encontrada.' };
  if ((await hashSecret(oldPassword)) !== acc.passwordHash) {
    return { ok: false, error: 'La contraseña actual no coincide.' };
  }
  if (newPassword.length < 4) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres.' };
  }
  const passwordHash = await hashSecret(newPassword);
  await db.transaction('rw',db.accounts,db.kvMeta,async()=>{
    await db.accounts.put({...acc,passwordHash,updatedAt:Math.max(Date.now(),acc.updatedAt+1),isSynced:false});
    await db.kvMeta.put({key:'privateBackup:pending:' + acc.id,value:true});
  });
  return { ok: true };
}

export async function getLocalRecoveryQuestions(
  username: string,
): Promise<{ found: true; secretQ1: string; secretQ2: string } | { found: false }> {
  await initDexie();
  const cleanUser = username.trim().toLowerCase();
  const acc = (await db.accounts.toArray()).find((a) => a.id !== ADMIN_PROFILE_ID && a.username.toLowerCase() === cleanUser);
  if (!acc) return { found: false };
  return { found: true, secretQ1: acc.secretQ1, secretQ2: acc.secretQ2 };
}

export async function recoverAccountLocal(
  username: string,
  answer1: string,
  answer2: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  await initDexie();
  const cleanUser = username.trim().toLowerCase();
  const acc = (await db.accounts.toArray()).find((a) => a.id !== ADMIN_PROFILE_ID && a.username.toLowerCase() === cleanUser);
  if (!acc) return { ok: false, error: 'Cuenta no encontrada en IndexedDB.' };
  const h1 = await hashSecret(normalizeAnswer(answer1));
  const h2 = await hashSecret(normalizeAnswer(answer2));
  if (acc.secretA1 !== h1 || acc.secretA2 !== h2) {
    return { ok: false, error: 'Las respuestas secretas no coinciden.' };
  }
  if (newPassword.length < 4) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres.' };
  }
  const passwordHash = await hashSecret(newPassword);
  await db.transaction('rw',db.accounts,db.kvMeta,async()=>{
    await db.accounts.put({...acc,passwordHash,updatedAt:Math.max(Date.now(),acc.updatedAt+1),isSynced:false});
    await db.kvMeta.put({key:'privateBackup:pending:' + acc.id,value:true});
  });
  return { ok: true };
}

export async function listCharactersByAccount(accountId: string): Promise<MuCharacter[]> {
  await initDexie();
  const list = await db.characters.where('accountId').equals(accountId).toArray();
  return list.map(normalizeCharacterRecord);
}

export async function createCharacterForAccount(
  accountId: string,
  name: string,
  classType: HeroClass,
  sex: 'male' | 'female',
  appearanceId?: string,
): Promise<MuCharacter> {
  await initDexie();
  const meta = MU_CLASSES.find((m) => m.id === classType) || MU_CLASSES[0];
  const charId = `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const flaris = getMapById('flaris');
  const starterItems = getStarterItemsForMuClass(charId, name.trim(), classType, sex);

  const created = normalizeCharacterRecord({
    id: charId,
    accountId,
    name: name.trim().slice(0, 16) || 'Héroe',
    classType,
    sex,
    appearanceId,
    level: 1,
    resets: 0,
    xp: 0,
    xpToNext: getXpRequiredForLevel(1),
    hp: meta.baseHp,
    maxHp: meta.baseHp,
    mp: meta.baseMp,
    maxMp: meta.baseMp,
    sd: 160,
    maxSd: 160,
    ag: 90,
    maxAg: 90,
    str: meta.baseStr,
    agi: meta.baseAgi,
    vit: meta.baseVit,
    ene: meta.baseEne,
    cmd: meta.baseCmd,
    unspentPoints: 7,
    skillPoints: 2,
    skillRanks: {},
    specialization: 'balanced',
    unlockedAchievements: [],
    duelWins: 0,
    duelLosses: 0,
    zen: 6500,
    bless: 2,
    soul: 2,
    chaos: 0,
    life: 1,
    harmony: 0,
    creation: 0,
    talisman: 0,
    kills: 0,
    currentMapId: 'flaris',
    lastX: flaris.spawn.x,
    lastZ: flaris.spawn.z,
    lastRotY: Math.PI,
    equipment: starterItems.filter((i) => i.isEquipped),
    inventory: starterItems.filter((i) => !i.isEquipped),
    updatedAt: Date.now(),
    isSynced: false,
  });

  await db.transaction('rw', db.characters, db.items, async () => {
    await db.characters.put(created);
    await db.items.bulkPut(starterItems);
  });
  return created;
}

export async function updateCharacter(charObj: MuCharacter): Promise<MuCharacter> {
  await initDexie();
  const next = normalizeCharacterRecord({
    ...charObj,
    updatedAt: Date.now(),
    isSynced: false,
  });
  await db.characters.put(next);
  return next;
}

async function touchCharacterWithItems(charId: string): Promise<MuCharacter | null> {
  const cur = await db.characters.get(charId);
  if (!cur) return null;
  const items = await db.items.where('charId').equals(charId).toArray();
  const updated = normalizeCharacterRecord({
    ...applyGearHealth(cur, items),
    equipment: items.filter((i) => i.isEquipped),
    inventory: items.filter((i) => !i.isEquipped),
    updatedAt: Math.max(Date.now(),cur.updatedAt+1),
    isSynced: false,
  });
  await db.characters.put(updated);
  return updated;
}

export async function getItemsForCharacter(charId: string): Promise<MuItem[]> {
  await initDexie();
  return (await db.items.where('charId').equals(charId).toArray()).map(item => ({ ...item, name: displayItemName(item.name) }));
}

export async function addItemToCharacter(charId: string, item: MuItem): Promise<MuItem[]> {
  await initDexie();
  await db.transaction('rw', db.items, () => storeStack({ ...item, charId }));
  await touchCharacterWithItems(charId);
  return getItemsForCharacter(charId);
}

export async function removeItemFromCharacter(charId: string, itemId: string): Promise<MuItem[]> {
  await initDexie();
  await db.items.delete(itemId);
  await touchCharacterWithItems(charId);
  return getItemsForCharacter(charId);
}

export async function equipItem(charId: string, itemId: string): Promise<MuItem[]> {
  await initDexie();
  await db.transaction('rw', db.items, db.characters, async () => {
    const target = await db.items.get(itemId);
    if (!target || target.charId !== charId) return;
    const equipping = !target.isEquipped;
    if (equipping) {
      if (target.slot === 'consumable') return;
      const character = await db.characters.get(charId);
      if (!character || !canEquip(character,target)) return;
      const all = await db.items.where('charId').equals(charId).toArray();
      for (const other of all) {
        if (other.id !== target.id && other.slot === target.slot && other.isEquipped) {
          await db.items.update(other.id, { isEquipped: false });
        }
      }
    }
    await db.items.update(target.id, { isEquipped: equipping });
    await touchCharacterWithItems(charId);
  });
  return getItemsForCharacter(charId);
}

export async function wearEquipment(
  charId: string,
  slot: ItemSlot,
  durability: number,
  itemId?: string,
): Promise<void> {
  await initDexie();
  const clamped = Math.max(0, Math.min(100, Math.round(durability)));
  const items = await db.items.where('charId').equals(charId).toArray();
  const target = items.find((i) => (itemId ? i.id === itemId : i.isEquipped && i.slot === slot));
  if (!target) return;
  if (target.durability === clamped) return;
  await db.transaction('rw',db.items,db.characters,async()=>{
    await db.items.update(target.id, { durability: clamped });
    await touchCharacterWithItems(charId);
  });
}

export async function repairEquipment(charId: string): Promise<MuCharacter> {
  await initDexie();
  const char = await db.characters.get(charId);
  if (!char) throw new Error('Personaje no encontrado.');
  const items = await db.items.where('charId').equals(charId).toArray();

  let missingPoints = 0;
  for (const it of items) {
    const dur = it.durability ?? 100;
    if (dur < 100) missingPoints += 100 - dur;
  }
  if (missingPoints === 0) {
    return normalizeCharacterRecord(char);
  }
  if (char.zen < missingPoints) {
    throw new Error(`Necesitas ${missingPoints} Zen para reparar todo tu equipo.`);
  }

  await db.transaction('rw', db.items, db.characters, async () => {
    for (const it of items) {
      if ((it.durability ?? 100) < 100) {
        await db.items.update(it.id, { durability: 100 });
      }
    }
  });

  const saved = await updateCharacter({
    ...char,
    zen: char.zen - missingPoints,
  });
  return saved;
}

export async function upgradeItemWithJewel(
  character: MuCharacter,
  itemId: string,
  jewel: 'bless' | 'soul' | 'life' | 'harmony',
): Promise<{ success: boolean; character: MuCharacter; items: MuItem[]; message: string }> {
  await initDexie();
  return db.transaction('rw', db.items, db.characters, async () => {
    const current = await db.characters.get(character.id);
    const item = await db.items.get(itemId);
    const result = current && item?.charId === current.id && forge(item, current, jewel);
    if (!result || !item || !current) return { success: false, character: current ?? character,
      items: await db.items.where('charId').equals(character.id).toArray(), message: 'Revisa el equipo, el nivel y las joyas de la receta.' };
    const { cost, level, options, success } = result;
    await db.characters.update(current.id, { bless: current.bless-cost.bless, soul: current.soul-cost.soul,
      life: current.life-cost.life, harmony: current.harmony-cost.harmony });
    const delta = level - item.enhanceLevel;
    const previousSteps = item.forgeSteps ?? 0;
    const steps = Math.max(0, previousSteps + delta);
    const stat = (value:number, per:number) => value > 0 ? value + (steps - previousSteps) * per : 0;
    await db.items.update(item.id, { enhanceLevel:level, forgeSteps:steps, lifeOptions:options, minDmg:stat(item.minDmg,4),
      maxDmg:stat(item.maxDmg,6), magicPower:stat(item.magicPower,5), defense:stat(item.defense,4) });
    const updated = await touchCharacterWithItems(current.id);
    return { success, character: updated!, items: await db.items.where('charId').equals(current.id).toArray(),
      message: jewel === 'life' ? `${item.name}: ${options.length} opciones Life.` :
        `${success ? 'Mejora conseguida' : 'Intento fallido'}: ${item.name} +${level}.` };
  });
}

function buildCatalogItem(character: MuCharacter, shopItem: ShopItemDef): MuItem {
  return {
    id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    charId: character.id,
    name: shopItem.name,
    slot: shopItem.slot,
    category: shopItem.category,
    setName: shopItem.setName,
    rarity: shopItem.rarity,
    enhanceLevel: shopItem.enhanceLevel,
    minDmg: shopItem.minDmg,
    maxDmg: shopItem.maxDmg,
    defense: shopItem.defense,
    magicPower: shopItem.magicPower,
    luck: shopItem.luck,
    excellentOpt: shopItem.excellentOpt,
    requiredLevel: shopItem.requiredLevel,
    sourceLevel: shopItem.sourceLevel,
    sexFilter: shopItem.sexFilter,
    classFilter: shopItem.classFilter,
    gearBonus: shopItem.gearBonus,
    setBonus: shopItem.setBonus,
    recovery: shopItem.recovery, quantity: shopItem.quantity,
    durability: 100,
    isEquipped: false,
    originalOwner: character.name,
    acquiredAt: new Date().toISOString(),
  };

}

function sameStack(a: MuItem, b: MuItem) {
  return a.slot === 'consumable' && b.slot === a.slot && a.name === b.name && !a.isEquipped &&
    JSON.stringify(a.recovery) === JSON.stringify(b.recovery);
}
async function storeStack(item: MuItem) {
  if (item.slot === 'consumable') {
    const matches = await db.items.where('charId').equals(item.charId).filter(i=>sameStack(i,item)).toArray();
    if (matches.length) {
      const [first,...rest] = matches;
      await db.items.update(first.id,{quantity: matches.reduce((n,i)=>n+(i.quantity ?? 1),item.quantity ?? 1)});
      await db.items.bulkDelete(rest.map(i=>i.id));
      return;
    }
  }
  await db.items.put(item);
}

export async function readVault(charId: string) {
  const c = await db.characters.get(charId);
  const a = c && await db.accounts.get(c.accountId);
  return {items:a?.vault ?? [], wallet:a?.vaultWallet ?? {}};
}

export async function transferVault(charId: string, selection: {item:string}|{currency:WalletKey}, deposit: boolean) {
  return db.transaction('rw', db.accounts,db.characters,db.items,async () => {
    const c = await db.characters.get(charId);
    const a = c && await db.accounts.get(c.accountId);
    if (!a || !c) return;
    const vault = [...(a.vault ?? [])], wallet = {...a.vaultWallet};
    if ('currency' in selection) {
      const key = selection.currency;
      const amount = deposit ? c[key] : wallet[key] ?? 0;
      if (amount <= 0) return;
      wallet[key] = (wallet[key] ?? 0) + (deposit ? amount : -amount);
      await db.characters.update(charId, row=>{row[key]=c[key]+(deposit ? -amount : amount)});
    } else if (deposit) {
      const item = await db.items.get(selection.item);
      if (!item || item.charId !== charId || item.isEquipped) return;
      const stack = vault.find(i=>sameStack(i,item));
      if (stack) stack.quantity=(stack.quantity ?? 1)+(item.quantity ?? 1);
      else vault.push(item);
      await db.items.delete(item.id);
    } else {
      const index=vault.findIndex(i=>i.id===selection.item);
      if (index<0 || await db.items.get(selection.item)) return;
      const [item]=vault.splice(index,1);
      await storeStack({...item,charId,isEquipped:false});
    }
    await db.accounts.update(a.id,{vault,vaultWallet:wallet,updatedAt:Math.max(Date.now(),a.updatedAt+1),isSynced:false});
    return touchCharacterWithItems(charId);
  });
}

export async function addCatalogItem(character: MuCharacter, shopItem: ShopItemDef): Promise<void> {
  await initDexie();
  await db.transaction('rw', db.items, db.characters, async () => {
    await storeStack(buildCatalogItem(character, shopItem));
    await touchCharacterWithItems(character.id);
  });
}

export async function consumeInventoryPotion(charId: string, itemId: string, live?: () => Pick<MuCharacter,'id'|'hp'|'mp'|'sd'|'ag'> | null): Promise<MuCharacter | null> {
  await initDexie();
  return db.transaction('rw', db.items, db.characters, async () => {
    const [item, character] = await Promise.all([db.items.get(itemId), db.characters.get(charId)]);
    if (!character || item?.charId !== charId || !item.recovery) return null;
    const vitals = live ? live() : character;
    if (vitals?.id !== charId) return null;
    const hp = Math.min(character.maxHp, vitals.hp + Math.round((item.recovery.hp ?? 0) * character.maxHp) + (item.recovery.hpFlat ?? 0));
    const mp = Math.min(character.maxMp, vitals.mp + Math.round((item.recovery.mp ?? 0) * character.maxMp));
    const sd = Math.min(character.maxSd, vitals.sd + Math.round((item.recovery.hp ?? 0) * .65 * character.maxSd));
    const ag = Math.min(character.maxAg, vitals.ag + Math.round((item.recovery.mp ?? 0) * .5 * character.maxAg));
    if (hp === vitals.hp && mp === vitals.mp && sd === vitals.sd && ag === vitals.ag) return null;
    if ((item.quantity ?? 1) > 1) await db.items.update(itemId, {quantity:item.quantity! - 1});
    else await db.items.delete(itemId);
    await db.characters.update(charId, { hp, mp, sd, ag });
    return touchCharacterWithItems(charId);
  });
}

export async function buyShopItem(
  character: MuCharacter,
  shopItem: ShopItemDef,
): Promise<{ ok: boolean; character: MuCharacter; items: MuItem[]; message: string }> {
  await initDexie();
  const updatedChar = await db.transaction('rw', db.items, db.characters, async () => {
    const current = await db.characters.get(character.id);
    if (!current || shopItem.dropExclusive || !Number.isSafeInteger(shopItem.zenCost) ||
        shopItem.zenCost < 0 || current.zen < shopItem.zenCost) return null;
    await storeStack(buildCatalogItem(current, shopItem));
    await db.characters.update(current.id, { zen: current.zen - shopItem.zenCost });
    return touchCharacterWithItems(current.id);
  });
  if (!updatedChar) return {
    ok: false,
    character: await db.characters.get(character.id) ?? character,
    items: await getItemsForCharacter(character.id),
    message: `No puedes comprar ${shopItem.name} por ${shopItem.zenCost.toLocaleString()} Zen.`,
  };

  const nextItems = await getItemsForCharacter(character.id);
  return {
    ok: true,
    character: updatedChar,
    items: nextItems,
    message: `Compraste ${shopItem.name} ${shopItem.quantity ? '×' + shopItem.quantity : '+' + shopItem.enhanceLevel} y se guardó en tu mochila.`,
  };
}

export async function buyJewelFromNpc(
  character: MuCharacter,
  jewel: 'bless' | 'soul' | 'chaos' | 'life' | 'harmony',
  cost: number,
): Promise<{ ok: boolean; character: MuCharacter; message: string }> {
  await initDexie();
  return db.transaction('rw', db.characters, async () => {
    const current = await db.characters.get(character.id);
    if (!current || !['bless', 'soul', 'life'].includes(jewel) ||
        !Number.isSafeInteger(cost) || cost <= 0 || current.zen < cost) {
      return { ok: false, character: current ?? character, message: 'Compra no disponible o Zen insuficiente.' };
    }
    const updated = { ...current, zen: current.zen - cost, [jewel]: current[jewel] + 1,
      updatedAt: Math.max(Date.now(), current.updatedAt + 1), isSynced: false };
    await db.characters.put(updated);
    return { ok: true, character: updated, message: `Adquiriste +1 Jewel of ${jewel.toUpperCase()} por ${cost.toLocaleString()} Zen.` };
  });
}

export async function sellInventoryItem(
  character: MuCharacter,
  selection: string | string[],
) {
  await initDexie();
  const ids = [...new Set(Array.isArray(selection) ? selection : [selection])];
  return db.transaction('rw', db.items,db.characters,async () => {
    const c = await db.characters.get(character.id);
    const rows = (await db.items.bulkGet(ids)).filter((i): i is MuItem => !!i && i.charId === character.id && !i.isEquipped);
    if (!c || !rows.length) return {ok:false,character:c ?? character,items:await getItemsForCharacter(character.id),message:'No hay objetos para vender.'};
    const value = rows.reduce((sum,i)=>sum+inventorySellValue(i),0);
    await db.items.bulkDelete(rows.map(i=>i.id));
    await db.characters.update(c.id,{zen:c.zen+value});
    const updated=(await touchCharacterWithItems(c.id))!;
    return {ok:true,character:updated,items:[...(updated.equipment ?? []),...(updated.inventory ?? [])],message:`Venta: ${rows.length} · +${value.toLocaleString()} Zen`};
  });
}

export async function executeChaosMixWing(
  character: MuCharacter,
  tier: 1 | 2 | 3 | 4,
): Promise<{ ok: boolean; character: MuCharacter; items: MuItem[]; message: string }> {
  await initDexie();
  const recipe = MU_CHAOS_WINGS_RECIPES.find((r) => r.tier === tier) || MU_CHAOS_WINGS_RECIPES[0];
  if (
    character.bless < recipe.blessCost ||
    character.soul < recipe.soulCost ||
    character.life < recipe.chaosCost ||
    character.zen < recipe.zenCost
  ) {
    return {
      ok: false,
      character,
      items: await getItemsForCharacter(character.id),
      message: `Faltan materiales para Forja Evo ${tier}: ${recipe.blessCost} Bless, ${recipe.soulCost} Soul, ${recipe.chaosCost} Life y ${recipe.zenCost.toLocaleString()} Zen.`,
    };
  }

  const wingName = recipe.wingNames[character.classType] || 'Alas de MuGro-up\'';
  const enhance = recipe.enhanceLevel;
  const wingItem: MuItem = {
    id: `wing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    charId: character.id,
    name: wingName,
    slot: 'wings',
    category: 'wings',
    setName: `Alas Evo Lv.${tier}`,
    rarity: tier >= 3 ? 'ancient' : tier === 2 ? 'excellent' : 'normal',
    enhanceLevel: enhance,
    minDmg: recipe.minDmg,
    maxDmg: recipe.maxDmg,
    defense: recipe.defense,
    magicPower: recipe.magicPower,
    luck: true,
    excellentOpt: recipe.excellentOpt,
    durability: 100,
    isEquipped: false,
    originalOwner: character.name,
    acquiredAt: new Date().toISOString(),
  };

  await db.items.put(wingItem);
  const updated = await updateCharacter({
    ...character,
    bless: character.bless - recipe.blessCost,
    soul: character.soul - recipe.soulCost,
    life: character.life - recipe.chaosCost,
    zen: character.zen - recipe.zenCost,
  });
  const nextItems = await getItemsForCharacter(character.id);
  return {
    ok: true,
    character: updated,
    items: nextItems,
    message: `¡Forja exitosa! Forjaste ${wingName} (+${enhance}).`,
  };
}

export async function allocateStatPoint(
  character: MuCharacter,
  stat: 'str' | 'agi' | 'vit' | 'ene' | 'cmd',
  amount = 1,
): Promise<{ ok: boolean; character: MuCharacter; message?: string }> {
  await initDexie();
  return db.transaction('rw', db.characters, async () => {
    const current = await db.characters.get(character.id);
    if (!current) return { ok: false, character, message: 'Personaje no disponible.' };
    const pts = Math.max(1, Math.min(current.unspentPoints, Number.isFinite(amount) ? Math.floor(amount) : 1));
    if (current.unspentPoints <= 0) {
      return { ok: false, character:current, message: 'No tienes puntos disponibles para repartir.' };
    }
    const currentVal = current[stat];
    if (currentVal >= MAX_STAT_POINTS) {
      return { ok: false, character:current, message: `${stat.toUpperCase()} ya está al máximo (${MAX_STAT_POINTS}).` };
    }
    const actualAdd = Math.min(pts, MAX_STAT_POINTS - currentVal);
    const nextVit = stat === 'vit' ? current.vit + actualAdd : current.vit;
    const nextEne = stat === 'ene' ? current.ene + actualAdd : current.ene;
    const nextMaxHp = current.maxHp + (stat === 'vit' ? actualAdd * 4 : 0);
    const nextMaxMp = current.maxMp + (stat === 'ene' ? actualAdd * 3 : 0);

    const saved = await updateCharacter({
      ...current,
      [stat]: currentVal + actualAdd,
      vit: nextVit,
      ene: nextEne,
      maxHp: nextMaxHp,
      hp: Math.min(nextMaxHp, current.hp + (stat === 'vit' ? actualAdd * 4 : 0)),
      maxMp: nextMaxMp,
      mp: Math.min(nextMaxMp, current.mp + (stat === 'ene' ? actualAdd * 3 : 0)),
      unspentPoints: current.unspentPoints - actualAdd,
    });
    return { ok: true, character: saved };
  });
}

export async function performHeroReset(
  character: MuCharacter,
): Promise<{ ok: boolean; character: MuCharacter; message: string }> {
  await initDexie();
  if (character.level < MAX_HERO_LEVEL) {
    return {
      ok: false,
      character,
      message: `Necesitas Nivel ${MAX_HERO_LEVEL} para hacer Reset (actual: Nv.${character.level}).`,
    };
  }
  const nextResets = character.resets + 1;
  const bonusPoints = 450;
  const saved = await updateCharacter({
    ...character,
    level: 1,
    resets: nextResets,
    xp: 0,
    xpToNext: getXpRequiredForLevel(1),
    unspentPoints: character.unspentPoints + bonusPoints,
    skillPoints: (character.skillPoints ?? 0) + 3,
    zen: character.zen + 10000,
    hp: character.maxHp,
    mp: character.maxMp,
    sd: character.maxSd,
    ag: character.maxAg,
  });
  return {
    ok: true,
    character: saved,
    message: `¡Reset #${nextResets} completado! +${bonusPoints} Puntos de Atributo, +3 SkillPt y +10,000 Zen.`,
  };
}

export async function upgradeSkillRank(
  character: MuCharacter,
  skillId: string,
): Promise<{ ok: boolean; character: MuCharacter; message: string }> {
  await initDexie();
  const currentRank = getSkillRank(character, skillId);
  if (currentRank >= 10) {
    return { ok: false, character, message: 'Este poder ya alcanzó el Rango máximo (R10).' };
  }
  const cost = getSkillUpgradeCost(currentRank);
  if ((character.skillPoints ?? 0) < cost.skillPoints) {
    return { ok: false, character, message: 'No tienes suficientes Puntos de Skill (sube de nivel).' };
  }
  if (character.zen < cost.zenCost) {
    return { ok: false, character, message: `Necesitas ${cost.zenCost.toLocaleString()} Zen para mejorar este poder.` };
  }

  const nextRank = currentRank + 1;
  const saved = await updateCharacter({
    ...character,
    skillPoints: (character.skillPoints ?? 0) - cost.skillPoints,
    zen: character.zen - cost.zenCost,
    skillRanks: {
      ...(character.skillRanks || {}),
      [skillId]: nextRank,
    },
  });
  return {
    ok: true,
    character: saved,
    message: `Poder mejorado a Rango ${nextRank} (-${cost.zenCost.toLocaleString()} Zen).`,
  };
}

export async function setCharacterSpecialization(
  character: MuCharacter,
  spec: NonNullable<MuCharacter['specialization']>,
): Promise<MuCharacter> {
  return updateCharacter({
    ...character,
    specialization: spec,
  });
}

export async function getSharedLedger(): Promise<SharedLedgerEntry[]> {
  await initDexie();
  const all = await db.sharedLedger.toArray();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function recordSharedLedger(entry: SharedLedgerEntry): Promise<void> {
  await initDexie();
  await db.sharedLedger.put(entry);
}

export async function getEventSessions(): Promise<EventSessionRecord[]> {
  await initDexie();
  const all = await db.eventSessions.toArray();
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function upsertEventSession(session: EventSessionRecord): Promise<void> {
  await initDexie();
  await db.eventSessions.put(session);
}

export async function getChatHistory(): Promise<ChatMessageRecord[]> {
  await initDexie();
  const all = await db.chatMessages.toArray();
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveChatMessage(msg: ChatMessageRecord): Promise<void> {
  await initDexie();
  await db.chatMessages.put(msg);
}

export async function getAsyncDuels(): Promise<AsyncDuelRecord[]> {
  await initDexie();
  const all = await db.asyncDuels.toArray();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function recordAsyncDuel(duel: AsyncDuelRecord): Promise<void> {
  await initDexie();
  await db.asyncDuels.put(duel);
}

export async function loadGameSettings(): Promise<GameSettings> {
  await initDexie();
  const rec = await db.kvMeta.get('gameSettings');
  const saved = (rec?.value as Partial<GameSettings> | undefined) || {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveGameSettings(next: GameSettings): Promise<void> {
  await initDexie();
  await db.kvMeta.put({ key: 'gameSettings', value: next });
}

export async function loadButtonLayouts(): Promise<Record<HudButtonId, ButtonLayoutItem>> {
  await initDexie();
  const rec = await db.kvMeta.get('buttonLayouts');
  const saved = (rec?.value as Partial<Record<HudButtonId, ButtonLayoutItem>> | undefined) || {};
  return { ...DEFAULT_BUTTON_LAYOUTS, ...saved };
}

export async function saveButtonLayouts(next: Record<HudButtonId, ButtonLayoutItem>): Promise<void> {
  await initDexie();
  await db.kvMeta.put({ key: 'buttonLayouts', value: next });
}

export async function loadComboConfig(charId: string, classType: HeroClass): Promise<CharacterComboConfig> {
  await initDexie();
  const rec = await db.kvMeta.get(`combo_${charId}`);
  if (rec?.value) {
    return rec.value as CharacterComboConfig;
  }
  return getDefaultComboConfig(classType, charId);
}

export async function saveComboConfig(charId: string, next: CharacterComboConfig): Promise<void> {
  await initDexie();
  await db.kvMeta.put({ key: `combo_${charId}`, value: next });
}

export async function loadLootFilters(): Promise<LootFilterSettings> {
  await initDexie();
  const rec = await db.kvMeta.get('lootFilters');
  const saved = (rec?.value as Partial<LootFilterSettings> | undefined) || {};
  return { ...DEFAULT_LOOT_FILTERS, ...saved };
}

export async function saveLootFilters(next: LootFilterSettings): Promise<void> {
  await initDexie();
  await db.kvMeta.put({ key: 'lootFilters', value: next });
}

export async function loadPotionConfig(): Promise<PotionConfig> {
  await initDexie();
  const rec = await db.kvMeta.get('potionConfig');
  const saved = (rec?.value as Partial<PotionConfig> | undefined) || {};
  return { ...DEFAULT_POTION_CONFIG, ...saved };
}

export async function savePotionConfig(next: PotionConfig): Promise<void> {
  await initDexie();
  await db.kvMeta.put({ key: 'potionConfig', value: next });
}

export async function getDatabaseStats(): Promise<{
  tables: Array<{ name: string; rows: number }>;
  byteSize: number;
}> {
  await initDexie();
  const [accounts, characters, items, sharedLedger, eventSessions, asyncDuels] = await Promise.all([
    db.accounts.toArray(),
    db.characters.toArray(),
    db.items.toArray(),
    db.sharedLedger.toArray(),
    db.eventSessions.toArray(),
    db.asyncDuels.toArray(),
  ]);
  const payload = JSON.stringify({ accounts, characters, items, sharedLedger, eventSessions, asyncDuels });
  return {
    tables: [
      { name: 'accounts', rows: accounts.length },
      { name: 'characters', rows: characters.length },
      { name: 'items', rows: items.length },
      { name: 'sharedLedger', rows: sharedLedger.length },
      { name: 'eventSessions', rows: eventSessions.length },
      { name: 'asyncDuels', rows: asyncDuels.length },
    ],
    byteSize: new TextEncoder().encode(payload).length,
  };
}

export async function exportDatabaseFile(): Promise<Blob> {
  await initDexie();
  const [accounts, characters, items, sharedLedger, eventSessions, chatMessages, asyncDuels, kvMeta] =
    await Promise.all([
      db.accounts.toArray(),
      db.characters.toArray(),
      db.items.toArray(),
      db.sharedLedger.toArray(),
      db.eventSessions.toArray(),
      db.chatMessages.toArray(),
      db.asyncDuels.toArray(),
      db.kvMeta.toArray(),
    ]);

  const json = JSON.stringify(
    {
      schema: 'MuLorenciaOfflineDB/v1',
      exportedAt: new Date().toISOString(),
      tables: { accounts, characters, items, sharedLedger, eventSessions, chatMessages, asyncDuels, kvMeta: kvMeta.filter(row => !row.key.startsWith('privateBackup:')) },
    },
    null,
    2,
  );
  return new Blob([json], { type: 'application/json' });
}

export async function importDatabaseFile(file: File): Promise<void> {
  await initDexie();
  const text = await file.text();
  const parsed = JSON.parse(text) as {
    tables?: {
      accounts?: MuAccount[];
      characters?: MuCharacter[];
      items?: MuItem[];
      sharedLedger?: SharedLedgerEntry[];
      eventSessions?: EventSessionRecord[];
      chatMessages?: ChatMessageRecord[];
      asyncDuels?: AsyncDuelRecord[];
      kvMeta?: KvMetaRecord[];
    };
  };

  const t = parsed.tables;
  if (!t) {
    throw new Error('Archivo de respaldo Dexie inválido.');
  }

  await db.transaction(
    'rw',
    [db.accounts, db.characters, db.items, db.sharedLedger, db.eventSessions, db.chatMessages, db.asyncDuels, db.kvMeta],
    async () => {
      if (Array.isArray(t.accounts)) await db.accounts.bulkPut(t.accounts);
      if (Array.isArray(t.characters)) await db.characters.bulkPut(t.characters.map(normalizeCharacterRecord));
      if (Array.isArray(t.items)) {
        const owners=new Map((await db.characters.toArray()).map(c=>[c.id,c]));
        await db.items.bulkPut(t.items.map(item=>{
          const owner=owners.get(item.charId);
          return owner ? restoreEquipment(item,owner.classType,owner.sex) : item;
        }));
      }
      if (Array.isArray(t.sharedLedger)) await db.sharedLedger.bulkPut(t.sharedLedger);
      if (Array.isArray(t.eventSessions)) await db.eventSessions.bulkPut(t.eventSessions);
      if (Array.isArray(t.chatMessages)) await db.chatMessages.bulkPut(t.chatMessages);
      if (Array.isArray(t.asyncDuels)) await db.asyncDuels.bulkPut(t.asyncDuels);
      if (Array.isArray(t.kvMeta)) await db.kvMeta.bulkPut(t.kvMeta.filter(row => !row.key.startsWith('privateBackup:')));
    },
  );
}
