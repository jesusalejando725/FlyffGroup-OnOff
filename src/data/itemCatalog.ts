import { FLYFF_ECONOMY_CATALOG } from './flyffEconomy';
import { ARTISAN_CATALOG } from './artisanEquipment';
import { MU_SHOP_CATALOG } from './muWorldData';
import { getAdminConfigSync } from '../services/adminConfigService';
import type { ShopItemDef } from '../types/game';

const options = getAdminConfigSync()['item-options'].byItem ?? {};
export const ITEM_CATALOG = [...MU_SHOP_CATALOG, ...ARTISAN_CATALOG, ...FLYFF_ECONOMY_CATALOG].map(item => {
  const rule = options[item.id];
  if (!rule || item.fixedPrice || item.dropExclusive) return item;
  const result: ShopItemDef = { ...item };
  for (const key of ['minDmg', 'maxDmg', 'defense', 'magicPower', 'zenCost'] as const) {
    if (Number.isSafeInteger(rule[key]) && rule[key] >= 0) result[key] = rule[key];
  }
  if (typeof rule.luck === 'boolean') result.luck = rule.luck;
  if (typeof rule.excellentOpt === 'string') result.excellentOpt = rule.excellentOpt;
  return result;
});
export const ITEM_BY_ID = new Map(ITEM_CATALOG.map(item => [item.id, item]));
