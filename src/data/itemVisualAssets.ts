import market from '../../public/mugroup/market-assets.json' with { type: 'json' };
import library from '../../public/mugroup/equipo.json' with { type: 'json' };
import { setArmament, artisanArmor, AURORA_WING_NAME } from './artisanEquipment';
import { getAdminConfigSync } from '../services/adminConfigService';
import type { ItemSlot } from '../types/game';

type Sex = 'male' | 'female';
type Item = { name: string; slot: ItemSlot; setName?: string };
type ItemAssets = { icon: string; model?: string; appearance?: string };
const assets = market.items as Record<string, ItemAssets>;
const sets = market.sets as Record<string, Partial<Record<Sex, string>>>;

export function itemAssets(name: string): ItemAssets | undefined {
  if (name === 'Pociones duales HP/MP') return {icon:'ui/hp_potion.png'};
  if (name === 'Balas de cañón') return {icon:'ui/items/cannonball.svg'};
  return assets[name];
}

export function itemModelFile(item: Item): string | undefined {
  const direct = itemAssets(item.name)?.model;
  if (direct) return direct;
  if (item.slot === 'pet') return 'equipo/pet_angel_white.glb';
  if (item.slot === 'pendant' || item.slot === 'ring1' || item.slot === 'ring2') {
    return item.slot === 'pendant' ? 'equipo/jewelry_pendant.glb' : 'equipo/jewelry_ring.glb';
  }
  return setArmament(item.name) ?? (library.weapons as Record<string, string>)[item.name] ??
    (library.wings as Record<string, string>)[item.name] ??
    (item.slot === 'wings' ? getAdminConfigSync().items.wingCatalog.find((w: { name: string }) => w.name === item.name)?.glb ??
      (item.name === AURORA_WING_NAME ? 'equipo/wing_mugroup_feather.glb' : undefined) : undefined);
}

export function armorModelFile(item: Pick<Item, 'slot' | 'setName'>, sex: Sex): string | undefined {
  const name = artisanArmor(item.setName)?.base ?? item.setName;
  if (!name || !['armor', 'pants', 'helm', 'gloves', 'boots'].includes(item.slot)) return;
  return sets[name]?.[sex] ?? (library.sets as Record<string, Record<Sex, string>>)[name]?.[sex];
}

export function isFullSuit(item: Item | undefined): boolean {
  return item?.slot === 'armor' && Boolean(itemAssets(item.name) && item.setName && sets[item.setName]);
}

export function previewModelFile(item: Item, sex: Sex): string | undefined {
  return itemModelFile(item) ?? armorModelFile(item, sex);
}
