import type { MuItem } from '../types/game';

export function inventorySellValue(item: Pick<MuItem, 'enhanceLevel' | 'rarity'>): number {
  return Math.max(450, 350 + item.enhanceLevel * 220 +
    (item.rarity === 'ancient' ? 1800 : item.rarity === 'excellent' ? 950 : 200));
}
