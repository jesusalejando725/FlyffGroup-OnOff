import type { GearBonuses } from '../data/flyffEconomy';

export type HeroClass = 'DK' | 'DW' | 'ELF' | 'DL' | 'MG';

export type CharacterVariantKey =
  | 'DK_male'
  | 'DK_female'
  | 'DW_male'
  | 'DW_female'
  | 'ELF_male'
  | 'ELF_female'
  | 'DL_male'
  | 'DL_female'
  | 'MG_male'
  | 'MG_female';

export type MapId =
  | 'flaris'
  | 'robledal'
  | 'puerto_bruma'
  | 'crater_ceniza'
  | 'lorencia'
  | 'noria'
  | 'devias'
  | 'atlans'
  | 'losttower'
  | 'icarus';

export type ItemSlot =
  | 'weapon'
  | 'shield'
  | 'helm'
  | 'armor'
  | 'pants'
  | 'gloves'
  | 'boots'
  | 'wings'
  | 'pendant'
  | 'ring1'
  | 'ring2'
  | 'pet'
  | 'consumable';

export type ItemCategory = 'weapon' | 'armor' | 'wings' | 'jewelry' | 'pet' | 'consumable';

export type ItemRarity = 'normal' | 'excellent' | 'ancient';

export type TransportMode = 'wifi' | 'bluetooth';

export type EventType = 'blood_castle' | 'chaos_castle' | 'kundun_boss' | 'free_trade';

export type HudButtonId =
  | 'status' | 'actions' | 'vitals' | 'talk'
  | 'helper'
  | 'joystick'
  | 'attack'
  | 'jump'
  | 'flight'
  | 'combo'
  | 'potion'
  | 'loot'
  | 'skillTray'
  | 'inventory'
  | 'mapWarp'
  | 'stats'
  | 'sync'
  | 'settings'
  | 'minimap'
  | 'targetMonster'
  | 'room'
  | 'banners'
  | 'damageBox'
  | 'editToolbar';

export interface MuAccount {
  id: string;
  username: string;
  passwordHash: string;
  secretQ1: string;
  secretA1: string;
  secretQ2: string;
  secretA2: string;
  createdAt: string;
  updatedAt: number;
  isSynced: boolean;
}

interface FlyffItemRules {
  sourceLevel?: number;
  requiredLevel?: number;
  gearBonus?: GearBonuses;
  setBonus?: GearBonuses;
  sexFilter?: 'male' | 'female';
  classFilter?: HeroClass[];
  quantity?: number;
  lifeOptions?: import("../data/jewelForge").LifeOption[];
  recovery?: { hp?: number; mp?: number; hpFlat?: number };
}

export interface MuItem extends FlyffItemRules {
  forgeSteps?: number;
  id: string;
  charId: string;
  name: string;
  slot: ItemSlot;
  category: ItemCategory;
  setName: string;
  rarity: ItemRarity;
  enhanceLevel: number;
  minDmg: number;
  maxDmg: number;
  defense: number;
  magicPower: number;
  luck: boolean;
  excellentOpt: string;
  durability?: number;
  isEquipped: boolean;
  originalOwner: string;
  sharedFromSession?: string;
  acquiredAt: string;
}

export interface MuCharacter {
  id: string;
  accountId: string;
  name: string;
  classType: HeroClass;
  appearanceId?: string;
  sex: 'male' | 'female';
  level: number;
  resets: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  gearHpBonus?: number;
  mp: number;
  maxMp: number;
  sd: number;
  maxSd: number;
  ag: number;
  maxAg: number;
  str: number;
  agi: number;
  vit: number;
  ene: number;
  cmd: number;
  unspentPoints: number;
  skillPoints?: number;
  skillRanks?: Record<string, number>;
  specialization?: 'balanced' | 'berserk' | 'guardian' | 'arcane';
  unlockedAchievements?: string[];
  duelWins?: number;
  duelLosses?: number;
  zen: number;
  bless: number;
  soul: number;
  chaos: number;
  life: number;
  harmony: number;
  creation?: number;
  talisman?: number;
  kills: number;
  currentMapId: MapId;
  lastX?: number;
  lastZ?: number;
  lastRotY?: number;
  equipment?: MuItem[];
  inventory?: MuItem[];
  updatedAt: number;
  isSynced: boolean;
}

export interface SkillDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  mpCost: number;
  agCost: number;
  damageMultiplier: number;
  range: number;
  colorHex: string;
  badgeColor: string;
  keyHint: string;
  isBuff?: boolean;
  cooldownSec?: number;
  flyffEffect?: string;
  flyffSound?: string;
}

export interface MonsterPower {
  id: string;
  name: string;
  damageMult: number;
  colorHex: string;
  effectDebuff?: string;
  telegraphSec?: number;
}

export interface MonsterSpawnDef {
  id: string;
  name: string;
  type: 'spider' | 'bull' | 'lich' | 'skeleton' | 'yeti' | 'gorgon' | 'balrog' | 'drake' | 'boss';
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  zenMin: number;
  zenMax: number;
  scale: number;
  colorHex: string;
  isBoss?: boolean;
  powers?: MonsterPower[];
  roamRadius?: number;
  evasionPct?: number;
  moveSpeed?: number;
  respawnSeconds?: number;
  drops?: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  role: 'potion' | 'blacksmith' | 'magic' | 'chaos_goblin' | 'guard';
  mapId: MapId;
  x: number;
  z: number;
  colorHex: string;
  stock?: Record<string, number>;
  warpTarget?: MapId;
}

export interface MapDef {
  id: MapId;
  name: string;
  subtitle: string;
  minLevel: number;
  maxLevel: number;
  warpZen: number;
  areaKm2: number;
  worldSize: number;
  cityRadius: number;
  spawn: { x: number; z: number };
  skyColor: string;
  groundTint: string;
  npcs: NpcDef[];
  monsters: MonsterSpawnDef[];
}

export interface ShopItemDef extends FlyffItemRules {
  id: string;
  name: string;
  slot: ItemSlot;
  category: ItemCategory;
  setName: string;
  rarity: ItemRarity;
  enhanceLevel: number;
  minDmg: number;
  maxDmg: number;
  defense: number;
  magicPower: number;
  luck: boolean;
  excellentOpt: string;
  zenCost: number;
  vendorRoles: Array<NpcDef['role']>;
  vendorIds?: string[];
  fixedPrice?: boolean;
  dropExclusive?: boolean;
}

export interface ButtonLayoutItem {
  id: HudButtonId;
  label: string;
  xPct: number;
  yPct: number;
  scale: number;
}

export interface CharacterComboConfig {
  charId: string;
  defaultSkillId: string;
  comboSkillIds: string[];
}

export interface GameSettings {
  brightness: number;
  volume: number;
  muted: boolean;
  musicEnabled: boolean;
  musicVolume: number;
  free3dCamera: boolean;
  cameraDistance?: number;
  cameraDistanceMigratedV2?: boolean;
  cameraDistanceMigratedV3?: boolean;
  autoAimAssist?: boolean;
  targetFps: 30 | 45 | 60;
}

export interface ActiveEffect {
  id: string;
  name: string;
  kind: 'buff' | 'debuff';
  statHint: string;
  color: string;
  remainingSec: number;
  totalSec: number;
}

export interface FloatingDamageNumber {
  id: number;
  xPct: number;
  yPct: number;
  text: string;
  color: string;
  isCritical?: boolean;
}

export interface MinimapEntitySnapshot {
  camps: ReadonlyArray<{x:number;z:number}>;
  mapId: MapId;
  sizeMeters: number;
  hero: { x: number; z: number; heading?: number };
  monsters: Array<{ id: string; x: number; z: number; isBoss?: boolean }>;
  npcs: Array<{ id: string; name: string; x: number; z: number }>;
  friends: Array<{ id: string; name?: string; x: number; z: number }>;
}

export interface SharedLedgerEntry {
  id: string;
  sessionId: string;
  transportMode: TransportMode;
  partnerName: string;
  role: 'host' | 'guest';
  direction: 'sent' | 'received' | 'event_reward' | 'duel_reward';
  itemId: string;
  itemName: string;
  itemSnapshotJson: string;
  status: 'committed';
  createdAt: string;
}

export interface EventSessionRecord {
  id: string;
  sessionCode: string;
  eventType: EventType;
  hostName: string;
  transportMode: TransportMode;
  startedAt: string;
  endedAt: string | null;
  wavesCleared: number;
  bossDefeated: boolean;
  lootSummary: string;
}

export interface ChatMessageRecord {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
}

export interface BuildAnalysisResult {
  combatRating: string;
  upgradePriority: string;
  statAdvice: string;
  eventReadiness: string;
  recommendations: string[];
}

export interface RoomPeer {
  peerId: string;
  name: string;
  classType: HeroClass;
  sex?: 'male' | 'female';
  currentMapId: MapId;
  equipment?: MuItem[];
  level: number;
  role: 'host' | 'guest';
  transport: TransportMode;
  x: number;
  z: number;
  rotY: number;
  action: string;
  equippedSet: string;
  equippedWeapon: string;
  enhanceLevel: number;
}

export interface RoomState {
  code: string;
  eventType: EventType;
  hostPeerId: string;
  hostName: string;
  transport: TransportMode;
  activeEvent: boolean;
  eventWave: number;
  bossHp: number;
  bossMaxHp: number;
  peers: RoomPeer[];
  sharedFeed: SharedLedgerEntry[];
}

export interface SyncStatusInfo {
  isOnline: boolean;
  isOfflineMode: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastMessage: string | null;
  cloudUrl: string;
  error: string | null;
}

export interface AsyncDuelChallenge {
  id: string;
  challengerName: string;
  classType: HeroClass;
  sex: 'male' | 'female';
  level: number;
  resets: number;
  powerScore: number;
  attackPower: number;
  defensePower: number;
  critPct: number;
  maxHp: number;
  transport: TransportMode;
  createdAt: string;
  equippedSummary: string;
}

export interface AsyncDuelRecord {
  id: string;
  challengerName: string;
  opponentName: string;
  opponentClass: HeroClass;
  opponentLevel: number;
  myPowerScore: number;
  opponentPowerScore: number;
  won: boolean;
  rounds: number;
  rewardZen: number;
  transport: TransportMode;
  summary: string;
  createdAt: string;
}

export interface LootDropInfo {
  id: string;
  kind: 'zen' | 'bless' | 'soul' | 'chaos' | 'life' | 'creation' | 'talisman' | 'equipment';
  catalogId?: string;
  label: string;
  amount: number;
  x: number;
  y: number;
  z: number;
}
