import type { MuItem } from '../types/game';

export function inventorySellValue(item: Pick<MuItem, 'enhanceLevel' | 'rarity'> & Partial<Pick<MuItem,'slot'|'quantity'|'recovery'>>): number {
  if (item.slot === 'consumable') return Math.max(1,item.quantity ?? 1) * 7;
  return Math.max(450, 350 + item.enhanceLevel * 220 +
    (item.rarity === 'ancient' ? 1800 : item.rarity === 'excellent' ? 950 : 200));
}
