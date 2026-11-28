import { lifeOptions } from './jewelForge.ts';
import type { ItemSlot, MonsterSpawnDef, MuItem, ShopItemDef } from '../types/game.ts';

export interface GearBonuses {
  defensePct?: number; blockPct?: number; hpPct?: number; hp?: number; hpRecoveryPct?: number;
  str?: number; critPct?: number; critDamagePct?: number; accuracyPct?: number; evasionPct?: number;
  ignoreDefensePct?: number; reflectPct?: number;
}

type ArmSlot = Extract<ItemSlot, 'helm' | 'armor' | 'gloves' | 'boots'>;
const armorSlots: [ArmSlot, string][] = [['helm', 'Helmet'], ['armor', 'Suit'], ['gloves', 'Gauntlets'], ['boots', 'Boots']];

const base = (id: string, name: string, level: number, slot: ItemSlot, category: ShopItemDef['category'],
  options: Partial<ShopItemDef> = {}): ShopItemDef => ({
  id: 'flyff_' + id, name, sourceLevel: level, requiredLevel: Math.min(99, level), slot, category,
  setName: '', rarity: 'normal', enhanceLevel: 0, minDmg: 0, maxDmg: 0, defense: 0, magicPower: 0,
  luck: false, excellentOpt: '', zenCost: 0, vendorRoles: [], ...options,
});

function weapon(id: string, name: string, level: number, minDmg: number, maxDmg: number, options: Partial<ShopItemDef> = {}) {
  return base(id, name, level, 'weapon', 'weapon', { minDmg, maxDmg, ...options });
}

function armor(id: string, name: string, level: number, defense: readonly number[], sex: 'male' | 'female',
  options: Partial<ShopItemDef> = {}) {
  return armorSlots.map(([slot, part], i) => base(id + '_' + slot, name + ' ' + part, level, slot, 'armor',
    { setName: name, defense: defense[i], sexFilter: sex, ...options }));
}

const vendor = (zenCost: number, vendorRole: 'blacksmith' | 'magic', rarity: ShopItemDef['rarity'] = 'normal') => ({
  zenCost, vendorRoles: [vendorRole], rarity, fixedPrice: true,
});

// Original propItem data supplies base damage where the brief lists a Penya price in the ATK column.
const wood = weapon('wooden', 'Wooden Sword', 1, 3, 4);
const long = weapon('long', 'Long Sword', 1, 12, 14);
const wand = weapon('seal', 'Seal Wand', 15, 40, 42, { magicPower: 41 });
const bastard = weapon('bastard', 'Bastard Sword', 60, 244, 247);
const darkonizer = weapon('darkonizer', 'Darkonizer', 70, 291, 294);
const kaleonizer = weapon('kaleonizer', 'Kaleonizer', 85, 320, 323);
const commonLow = [wood, long, wand,
  ...armor('parmil', 'Parmil', 5, [19, 48, 31, 24], 'male'),
  ...armor('leaf', 'Leaf', 5, [19, 48, 31, 24], 'female'),
  ...armor('warpon', 'Warpon', 30, [266, 666, 433, 333], 'male'),
  ...armor('warspon', 'Warspon', 30, [266, 666, 433, 333], 'female'),
];
const commonHigh = [bastard, darkonizer, kaleonizer,
  ...armor('huedom', 'Huedom', 95, [329, 814, 528, 408], 'male'),
  ...armor('huaris', 'Huaris', 95, [329, 814, 528, 408], 'female'),
];

const blacksmith = (price: number) => vendor(price, 'blacksmith', 'excellent');
const blainBonus: GearBonuses = { defensePct: 15, blockPct: 15, hpPct: 15 };
const noxBonus: GearBonuses = { str: 10, critPct: 20, defensePct: 25, hpPct: 15 };
const heraudBonus: GearBonuses = { accuracyPct: 20, evasionPct: 20, critPct: 20 };
const armorOffer = (price: number, bonus: GearBonuses, excellentOpt: string) => ({
  ...blacksmith(price), setBonus: bonus, excellentOpt,
});
const blain = armorOffer(50_000_000, blainBonus, '4/4: DEF +15%, Bloqueo +15%, HP máx. +15%');
const nox = armorOffer(150_000_000, noxBonus, '4/4: STR +10, Crítico +20%, DEF +25%, HP máx. +15%');
const heraud = armorOffer(300_000_000, heraudBonus, '4/4: Precisión +20%, Evasión +20%, Crítico +20%');
const blainSets = [...armor('blain', 'Blain', 105, [344, 843, 549, 425], 'male', blain),
  ...armor('virain', 'Virain', 105, [344, 843, 549, 425], 'female', blain)];
const noxSets = [...armor('nox_m', 'Nox (M)', 120, [609, 943, 609, 475], 'male', nox),
  ...armor('nox_f', 'Nox (F)', 120, [609, 943, 609, 475], 'female', nox)];
const guardian = weapon('guardian', 'Ultimate Guardian Sword', 60, 282, 313, blacksmith(250_000_000));
const historic = weapon('historic', 'Ultimate Historic Big Sword', 75, 405, 451, blacksmith(475_000_000));
const legendary = weapon('legendary', 'Ultimate Legendary Golden Sword', 105, 354, 394, blacksmith(1_150_000_000));
const ancient = weapon('ancient', 'Ultimate Ancient Two-hand Sword', 120, 725, 805, blacksmith(2_500_000_000));
const wing = (id: string, name: string, lv: number, price: number, options: Partial<ShopItemDef>) =>
  base(id, name, lv, 'wings', 'wings', { ...vendor(price, 'magic', 'excellent'), ...options });

const shop = [
  weapon('zeroth', 'Zeroth Sword', 85, 262, 264, vendor(29_700_000, 'blacksmith')),
  weapon('shakyfin', 'Shakyfin Axe', 85, 237, 245, vendor(31_920_000, 'blacksmith')),
  weapon('emeryl', 'Emeryl Sword', 85, 266, 268, vendor(33_400_000, 'blacksmith')),
  guardian, historic, legendary, ancient, ...blainSets, ...noxSets,
  ...armor('heraud', 'Heraud', 125, [913, 1394, 913, 721], 'male', heraud),
  ...armor('herainn', 'Herainn', 125, [913, 1394, 913, 721], 'female', heraud),
  wing('spint', 'Wing of Spint', 60, 500_000_000, {
    gearBonus: { hp: 50, hpRecoveryPct: 2 }, excellentOpt: 'HP máx. +50 · Recuperación HP +2%',
  }),
  wing('storm', 'Wing of Storm', 80, 1_000_000_000, {
    defense: 60, minDmg: 42, maxDmg: 42, excellentOpt: 'Daño +42',
  }),
  wing('vortex', 'Wing of Vortex', 100, 2_000_000_000, {
    gearBonus: { critPct: 10, critDamagePct: 20 }, excellentOpt: 'Crítico +10% · Daño crítico +20%',
  }),
  wing('doom', 'Wing of Doom', 120, 5_000_000_000, {
    minDmg: 100, maxDmg: 100, gearBonus: { ignoreDefensePct: 5 }, excellentOpt: 'Ignora 5% DEF · Daño +100',
  }),
];

const exclusive = { dropExclusive: true, rarity: 'excellent' } as const;
const spike = base('spike', 'Guan Yu Spike Shield', 127, 'shield', 'armor', {
  ...exclusive, gearBonus: { blockPct: 20, reflectPct: 10 }, excellentOpt: 'Bloqueo +20% · Refleja 10% del daño',
});
const crystal = weapon('crystal', "Lusaka's Crystal Sword", 75, 421, 468, {
  ...exclusive, classFilter: ['DK'], gearBonus: { critPct: 20, critDamagePct: 30 }, excellentOpt: 'Crítico +20% · Daño crítico +30%',
});
const vampire = weapon('vampire', 'Ultimate Vampire Blade', 120, 421, 468, exclusive);
const rimyth = armor('rimyth', 'Rimyth', 100, [287, 287, 470, 360], 'male', {
  ...exclusive, setBonus: { hpPct: 15 }, excellentOpt: '4/4: HP máx. +15%',
});
const jewelry = [
  base('mighteer', 'Mighteer+1', 60, 'ring1', 'jewelry', { minDmg: 100, maxDmg: 100 }),
  base('penzeru', 'Penzeru+1', 60, 'ring2', 'jewelry', { defense: 100 }),
];
const supplies = (id: string, name: string, recovery?: ShopItemDef['recovery']) =>
  base(id, name, 1, 'consumable', 'consumable', { recovery });
const low = [
  supplies('hp_small', 'Poción HP pequeña', { hp: .28 }),
  supplies('mp_small', 'Poción MP pequeña', { mp: .25 }),
  supplies('hp_medium', 'Poción HP mediana', { hp: .5 }),
  supplies('mp_medium', 'Poción MP mediana', { mp: .45 }),
  supplies('arrow', 'Flechas'), supplies('cannonball', 'Balas de cañón'),
  supplies('topaz', 'Topacio'), supplies('ruby', 'Rubí en bruto'),
];
const high = [
  supplies('hp_large', 'Poción HP grande', { hp: .78 }),
  supplies('mp_large', 'Poción MP grande', { mp: .72 }),
  supplies('pet_food', 'Comida para mascotas'),
];
const card = supplies('element_card', 'Tarjeta de elemento');

export const FLYFF_ECONOMY_CATALOG = [...commonLow, ...commonHigh, ...shop, spike, crystal, vampire, ...rimyth,
  ...jewelry, ...low, ...high, card, base('heal_pack', 'Pociones duales HP/MP', 1, 'consumable', 'consumable',
    { recovery:{ hp:.28, mp:.25 }, quantity:100, vendorRoles:['potion','guard','blacksmith','magic','chaos_goblin'], fixedPrice:true, zenCost:1400 })];

const legacyJewels = new Set(['bless', 'soul', 'chaos', 'life', 'creation', 'talisman']);

export function rollFlyffDrops(monster: Pick<MonsterSpawnDef, 'id' | 'name' | 'level' | 'isBoss' | 'drops'>,
  random = Math.random): string[] {
  const drops: string[] = [];
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  if (monster.drops?.length === 0) return drops;
  const common = [...commonLow, ...(monster.level > 60 ? commonHigh : [])].filter(
    item => (item.requiredLevel ?? 1) <= monster.level + 5 &&
      (monster.level <= 60 || (item.requiredLevel ?? 1) >= 60),
  );
  const jewels = ['soul','bless','life'].filter(id => !monster.drops || monster.drops.includes(id));
  const withJewels = () => {
    if (jewels.length && random() < .20) drops.push(pick(jewels));
    return drops;
  };
  if (!monster.isBoss) {
    const resources = (monster.level <= 60 ? low : high).map(item => item.id);
    const configured = monster.drops?.filter(id => resources.includes(id) || legacyJewels.has(id) ||
      common.some(item => item.id === id));
    const eligible = (configured?.length ? configured : resources).filter(id => !jewels.includes(id));
    if (eligible.length && random() < .72) drops.push(pick(eligible));
    if (common.length && random() < .04) drops.push(pick(common).id);
    if (monster.level > 60 && random() < .006) drops.push(card.id);
    return withJewels();
  }

  const gear = common.length ? common : commonLow;
  drops.push(pick(gear).id);
  if (random() < .78) {
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) drops.push(pick(jewelry).id);
  }
  const rarePool = monster.level >= 90 ? [...blainSets, ...noxSets, ancient, legendary] :
    monster.level >= 70 ? [guardian, historic] : [guardian];
  if (random() < .003) drops.push(pick(rarePool).id);

  const name = monster.name.toLowerCase();
  if ((monster.id === 'beast_overlord_khan' || name === 'beast overlord khan') && random() < .0005) drops.push(crystal.id);
  if ((monster.id === 'guan_yu_heavyblade' || name === 'guan yu heavyblade') && random() < .0002) drops.push(spike.id);
  if (monster.level >= 95 && random() < .0005) drops.push(vampire.id);
  if (monster.level >= 99) {
    if (random() < .0005) drops.push(rimyth[1].id);
    if (random() < .0005) drops.push(pick(rimyth.filter(item => item.slot !== 'armor')).id);
  }
  return withJewels();
}

const bonusSources = Object.keys({ hp:0, hpPct:0, hpRecoveryPct:0, defensePct:0, blockPct:0, str:0, critPct:0,
  critDamagePct:0, accuracyPct:0, evasionPct:0, ignoreDefensePct:0, reflectPct:0 } satisfies Record<keyof GearBonuses, number>) as (keyof GearBonuses)[];

export function equippedGearBonuses(items: readonly MuItem[]): GearBonuses {
  const total: GearBonuses = {};
  const sets = new Map<string, { slots: Set<ItemSlot>; bonus: GearBonuses }>();
  const add = (bonus: GearBonuses) => {
    for (const key of bonusSources) if (bonus[key]) total[key] = (total[key] ?? 0) + bonus[key]!;
  };
  for (const item of items) {
    if (!item.isEquipped || (item.durability ?? 100) <= 0) continue;
    for (const key of item.lifeOptions ?? []) add({ [key]: lifeOptions[key][1] });
    if (item.gearBonus) add(item.gearBonus);
    if (item.setBonus && armorSlots.some(([slot]) => slot === item.slot)) {
      const set = sets.get(item.setName) ?? { slots: new Set(), bonus: item.setBonus };
      set.slots.add(item.slot);
      sets.set(item.setName, set);
    }
  }
  for (const { slots, bonus } of sets.values()) if (slots.size === 4) add(bonus);
  return total;
}
