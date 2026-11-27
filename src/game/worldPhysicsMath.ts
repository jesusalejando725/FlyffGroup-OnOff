import { getMapById } from '../data/muWorldData';
import type { MapId } from '../types/game';

export const DEFAULT_CAMERA_DISTANCE = 15.5;

export type LootFilterKey =
  | 'equipment'
  | 'zen'
  | 'life'
  | 'soul'
  | 'bless'
  | 'chaos'
  | 'creation'
  | 'talisman';

export interface LootFilterSettings {
  autoLootEnabled: boolean;
  equipment: boolean;
  zen: boolean;
  life: boolean;
  soul: boolean;
  bless: boolean;
  chaos: boolean;
  creation: boolean;
  talisman: boolean;
}

export const DEFAULT_LOOT_FILTERS: LootFilterSettings = {
  autoLootEnabled: true,
  equipment: true,
  zen: true,
  life: true,
  soul: true,
  bless: true,
  chaos: true,
  creation: true,
  talisman: true,
};

export interface PotionTierDef {
  id: 'menor' | 'media' | 'mayor' | 'elixir';
  shortName: string;
  label: string;
  hpRestorePct: number;
  mpRestorePct: number;
  zenCost: number;
}

export const POTION_TIERS: PotionTierDef[] = [
  { id: 'menor', shortName: 'Poción Menor (+28%)', label: 'Poción Menor (Gratis)', hpRestorePct: 28, mpRestorePct: 25, zenCost: 0 },
  { id: 'media', shortName: 'Poción Media (+50%)', label: 'Poción Media (45 Zen)', hpRestorePct: 50, mpRestorePct: 45, zenCost: 45 },
  { id: 'mayor', shortName: 'Poción Mayor (+78%)', label: 'Poción Mayor (120 Zen)', hpRestorePct: 78, mpRestorePct: 72, zenCost: 120 },
  { id: 'elixir', shortName: 'Elixir Supremo (100%)', label: 'Elixir Supremo (280 Zen)', hpRestorePct: 100, mpRestorePct: 100, zenCost: 280 },
];

export interface PotionConfig {
  tierId: PotionTierDef['id'];
  autoHealThresholdPct: number;
}

export const DEFAULT_POTION_CONFIG: PotionConfig = {
  tierId: 'media',
  autoHealThresholdPct: 55,
};

export function computeDualPotionRestore(input: {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  sd: number;
  maxSd: number;
  ag: number;
  maxAg: number;
  tierId: PotionTierDef['id'];
}): {
  tier: PotionTierDef;
  nextHp: number;
  nextMp: number;
  nextSd: number;
  nextAg: number;
  restoredHp: number;
  restoredMp: number;
} {
  const tier = POTION_TIERS.find((t) => t.id === input.tierId) || POTION_TIERS[0];
  const addHp = Math.max(18, Math.round((input.maxHp * tier.hpRestorePct) / 100));
  const addMp = Math.max(14, Math.round((input.maxMp * tier.mpRestorePct) / 100));
  const addSd = Math.max(12, Math.round((input.maxSd * tier.hpRestorePct * 0.65) / 100));
  const addAg = Math.max(8, Math.round((input.maxAg * tier.mpRestorePct * 0.5) / 100));

  const nextHp = Math.min(input.maxHp, input.hp + addHp);
  const nextMp = Math.min(input.maxMp, input.mp + addMp);
  const nextSd = Math.min(input.maxSd, input.sd + addSd);
  const nextAg = Math.min(input.maxAg, input.ag + addAg);

  return {
    tier,
    nextHp,
    nextMp,
    nextSd,
    nextAg,
    restoredHp: Math.max(0, nextHp - input.hp),
    restoredMp: Math.max(0, nextMp - input.mp),
  };
}

export function projectToMinimap(
  x: number,
  z: number,
  mapId: MapId,
  sizeMeters = 3072,
): { xPct: number; yPct: number } {
  const safeSize = Math.max(200, sizeMeters || getMapById(mapId).worldSize || 3072);
  const clamp = (v: number) => Math.max(4, Math.min(96, v));
  const xPct = clamp((x / safeSize) * 100);
  const yPct = clamp((z / safeSize) * 100);
  return { xPct, yPct };
}
