import source from '../../public/mugroup/market-assets.json' with { type: 'json' };
import type { HeroClass, ItemSlot, ShopItemDef } from '../types/game';

const rows = source.stock as Array<{
  id: string; name: string; npcs: string[]; level: number; cost: number; kind: string;
  min: number; max: number; defense: number; classes: HeroClass[] | null; heal: number;
  slot: ItemSlot; setName: string; sex: 'male' | 'female' | null;
}>;

export const NATIVE_NPC_CATALOG: ShopItemDef[] = rows.map(row => ({
  id: row.id, name: row.name, vendorRoles: [], vendorIds: row.npcs, fixedPrice: true,
  requiredLevel: row.heal ? 1 : Math.min(99, row.level), sourceLevel: row.level,
  slot: row.slot, category: row.slot === 'consumable' || row.slot === 'weapon' ? row.slot : 'armor',
  setName: row.setName, sexFilter: row.sex ?? undefined, rarity: 'normal', enhanceLevel: 0, luck: false, excellentOpt: '',
  minDmg: row.min, maxDmg: row.max, defense: row.defense,
  magicPower: ['IK3_STAFF', 'IK3_WAND', 'IK3_CHEERSTICK'].includes(row.kind) ? Math.round((row.min + row.max) / 2) : 0,
  zenCost: row.cost, classFilter: row.classes ?? undefined,
  recovery: row.heal ? { hpFlat: row.heal } : undefined,
}));
