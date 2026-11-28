import { ShopModel } from './ShopModel';
import { ItemPortrait } from './ItemPortrait';
import { itemAssets, previewModelFile } from '../data/itemVisualAssets';
import { ITEM_CATALOG } from '../data/itemCatalog';
import { inventorySellValue } from '../data/itemPricing';
import { getAdminConfigSync } from '../services/adminConfigService';
import React, { useState } from 'react';
import { Flame, Gem, ShoppingBag, Sparkles, X } from 'lucide-react';
import { MU_CHAOS_WINGS_RECIPES } from '../data/muWorldData';
import type { MuCharacter, MuItem, NpcDef, ShopItemDef } from '../types/game';

const SECTIONS = [
  ['all', 'Todo'], ['weapon', 'Armas'], ['armor', 'Sets y armaduras'], ['shield', 'Escudos'],
  ['wings', 'Alas'], ['pet', 'Mascotas'], ['jewelry', 'Joyería'], ['consumable', 'Consumibles'],
] as const;
type Section = typeof SECTIONS[number][0];
const sectionOf = (item: ShopItemDef) => item.slot === 'shield' ? 'shield' : item.category;

interface NpcShopModalProps {
  open: boolean;
  npc: NpcDef | null;
  character: MuCharacter;
  items: MuItem[];
  statusMessage: string | null;
  onClose: () => void;
  onBuyItem: (shopItem: ShopItemDef) => void;
  onBuyJewel: (jewel: 'bless' | 'soul' | 'chaos' | 'life' | 'harmony', cost: number) => void;
  onSellItem: (itemId: string) => void;
  onChaosMixWing: (tier: 1 | 2 | 3 | 4) => void;
}

export const NpcShopModal: React.FC<NpcShopModalProps> = ({
  open,
  npc,
  character,
  items,
  statusMessage,
  onClose,
  onBuyItem,
  onBuyJewel,
  onSellItem,
  onChaosMixWing,
}) => {
  const [section, setSection] = useState<Section>('all');
  const [preview,setPreview]=useState<string|null>(null);
  const [tab, setTab] = useState<'buy' | 'jewels' | 'sell' | 'chaos'>(
    npc?.role === 'chaos_goblin' ? 'chaos' : 'buy',
  );

  if (!open || !npc) return null;

  const isChaosNpc = npc.role === 'chaos_goblin';
  const priceMultiplier = Number(getAdminConfigSync().items.priceMultiplier);
  const customStock = npc.stock;
  const catalogForNpc = ITEM_CATALOG
    .filter(item => {
      if (item.id === 'flyff_heal_pack') return true;
      if (item.dropExclusive) return false;
      if (item.sexFilter && item.sexFilter !== character.sex) return false;
      if (item.classFilter && !item.classFilter.includes(character.classType)) return false;
      if (item.vendorIds?.length) return item.vendorIds.includes(npc.id) &&
        (!customStock || Object.hasOwn(customStock, item.id));
      if (item.sourceLevel !== undefined && !item.vendorRoles.length) return false;
      if (item.fixedPrice) return item.vendorRoles.includes(npc.role) &&
        (!customStock || Object.hasOwn(customStock, item.id));
      if (customStock) return Object.hasOwn(customStock, item.id) &&
        Number.isSafeInteger(customStock[item.id]) && customStock[item.id] >= 0;
      return item.vendorRoles.includes(npc.role) || npc.role === 'guard';
    })
    .map(item => ({ ...item, zenCost: item.fixedPrice ? item.zenCost : customStock?.[item.id] ??
      Math.round(item.zenCost * (Number.isFinite(priceMultiplier) && priceMultiplier >= 0 ? priceMultiplier : 1)) }));
  const availableSections = SECTIONS.filter(([id]) => id === 'all' || catalogForNpc.some(item => sectionOf(item) === id));
  const selectedSection = availableSections.some(([id]) => id === section) ? section : 'all';
  const visibleStock = catalogForNpc.filter(item => selectedSection === 'all' || sectionOf(item) === selectedSection);
  const sellableItems = items.filter((i) => !i.isEquipped);

  const jewelOffers: Array<{
    key: 'bless' | 'soul' | 'chaos' | 'life' | 'harmony';
    name: string;
    cost: number;
    desc: string;
    color: string;
  }> = [
    { key: 'bless', name: 'Jewel of Bless', cost: 2500, desc: 'Mejora hasta +6', color: 'text-rose-300' },
    { key: 'soul', name: 'Jewel of Soul', cost: 3500, desc: 'Hasta +9; combinar joyas para +10 a +13', color: 'text-sky-300' },
    { key: 'chaos', name: 'Jewel of Chaos', cost: 4500, desc: 'Necesaria en Chaos Mix', color: 'text-amber-300' },
    { key: 'life', name: 'Jewel of Life', cost: 5500, desc: 'Añade opciones o pierde una al azar', color: 'text-purple-300' },
    { key: 'harmony', name: 'Jewel of Harmony', cost: 9000, desc: 'Refina +13 a +15', color: 'text-emerald-300' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-[#0d121d] border-2 border-amber-700/80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#171d2c] border-b border-amber-700/50">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-amber-300">
              {npc.name} · {npc.title}
            </h2>
            <p className="text-[11px] font-mono-tabular text-slate-300">
              <img src="./mugroup/ui/items/zen.webp" width={20} height={16} className="inline-block mr-1 rounded-sm" alt="" />Zen: {character.zen.toLocaleString()} · Bless {character.bless} · Soul {character.soul} · Chaos {character.chaos}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar NPC"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-[#1e2639] hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-[#0a0e17] text-xs font-semibold">
          <button
            onClick={() => setTab('buy')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'buy' ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-500' : 'text-slate-400'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Comprar
          </button>
          <button
            onClick={() => setTab('jewels')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'jewels' ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-500' : 'text-slate-400'
            }`}
          >
            <Gem className="w-3.5 h-3.5" />
            Joyas
          </button>
          <button
            onClick={() => setTab('sell')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'sell' ? 'bg-amber-600/20 text-amber-300 border-b-2 border-amber-500' : 'text-slate-400'
            }`}
          >
            Vender ({sellableItems.length})
          </button>
          <button
            onClick={() => setTab('chaos')}
            className={`min-h-[42px] inline-flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'chaos' ? 'bg-rose-600/20 text-amber-300 border-b-2 border-rose-500' : 'text-slate-400'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            {isChaosNpc ? 'Chaos Mix' : 'Forja Alas'}
          </button>
        </div>

        {statusMessage && (
          <div className="px-4 py-2 bg-amber-950/75 border-b border-amber-500/40 text-xs text-amber-200">
            {statusMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mu-scroll p-3 sm:p-4 space-y-2.5">
          {tab === 'buy' && (
            <>
            <nav aria-label="Categorías de tienda" className="flex flex-wrap gap-1.5">
              {availableSections.map(([id, label]) => <button key={id} onClick={() => { setSection(id); setPreview(null); }}
                aria-pressed={selectedSection === id}
                className={`rounded border border-amber-700/60 px-2 py-1.5 text-xs ${selectedSection === id ? 'bg-amber-700 text-white' : 'text-slate-300'}`}
              >{label}</button>)}
            </nav>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visibleStock.map((s) => (
                <div
                  key={s.id}
                  className={`p-3 rounded-lg border flex flex-col justify-between gap-2 ${
                    s.rarity === 'ancient'
                      ? 'bg-sky-950/35 border-sky-500/60'
                      : s.rarity === 'excellent'
                        ? 'bg-emerald-950/30 border-emerald-500/50'
                        : 'bg-[#141a28] border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-20 shrink-0 grid place-items-center rounded-md bg-slate-950/70 border border-slate-700">
                      <ItemPortrait item={s} sex={character.sex} large />
                    </div>
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-amber-200">
                        {s.name.replace(/ \+\d+$/, '')} {s.quantity ? '×' + s.quantity : '+' + s.enhanceLevel}
                      </span>
                      <span className="text-[10px] font-mono-tabular uppercase text-slate-300">
                        {s.rarity}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-slate-300 mt-1">
                      {s.minDmg > 0 && `Daño ${s.minDmg}~${s.maxDmg} · `}
                      {s.magicPower > 0 && `Magia +${s.magicPower} · `}
                      {s.defense > 0 && `Def +${s.defense}`}
                    </div>
                    {itemAssets(s.name)?.appearance && <div className="text-[11px] text-slate-300">Apariencia: {itemAssets(s.name)?.appearance}</div>}
                    {s.requiredLevel && <div className="text-[11px] text-slate-300">Nivel requerido: {s.requiredLevel}</div>}
                    {s.setName && <div className="mt-1 text-[11px] text-slate-300">Conjunto: {s.setName}</div>}
                    {s.classFilter?.length ? <div className="mt-1 text-[11px] text-slate-300">Clases: {s.classFilter.join(', ')}</div> : null}
                    {s.luck && <div className="text-[11px] text-amber-300">Suerte</div>}
                    <div className="text-[11px] text-emerald-300 mt-0.5">{s.excellentOpt}</div>
                    </div>
                  </div>
                  {previewModelFile(s, character.sex) && <>
                    <button className="text-xs text-sky-300 text-left py-1" aria-expanded={preview===s.id}
                      onClick={()=>setPreview(preview===s.id ? null : s.id)}>{preview===s.id ? 'Cerrar vista 3D' : 'Ver modelo 3D'}</button>
                    {preview===s.id && <ShopModel item={s} file={previewModelFile(s, character.sex)} />}
                  </>}
                  <button
                    onClick={() => onBuyItem(s)}
                    disabled={character.zen < s.zenCost}
                    className="min-h-[38px] px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Comprar ({s.zenCost.toLocaleString()} Zen)
                  </button>
                </div>
              ))}
            </div>
            </>
          )}

          {tab === 'jewels' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {jewelOffers.map((j) => (
                <div
                  key={j.key}
                  className="p-3 rounded-lg bg-[#141a28] border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className={`flex items-center gap-2 text-xs font-bold ${j.color}`}><img alt="" width={32} height={32} src={`./mugroup/ui/items/jewel-${j.key}.webp`} />{j.name}</div>
                    <div className="text-[11px] text-slate-400">{j.desc}</div>
                  </div>
                  <button
                    onClick={() => onBuyJewel(j.key, j.cost)}
                    disabled={character.zen < j.cost}
                    className="min-h-[38px] px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
                  >
                    {j.cost.toLocaleString()} Zen
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'sell' && (
            <div className="space-y-2">
              {sellableItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No tienes ítems sin equipar en la mochila para vender.
                </div>
              ) : (
                sellableItems.map((it) => {
                  const val = inventorySellValue(it);
                  return (
                    <div
                      key={it.id}
                      className="p-3 rounded-lg bg-[#141a28] border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <ItemPortrait item={it} sex={character.sex} />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-100">
                          {it.name} +{it.enhanceLevel}
                        </div>
                        <div className="text-[11px] text-slate-400">{it.setName}</div>
                      </div>
                      <button
                        onClick={() => onSellItem(it.id)}
                        className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                      >
                        Vender (+{val.toLocaleString()} Zen)
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'chaos' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#14111d] border border-rose-500/40 text-xs text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Máquina del Chaos Goblin: combina Joyas y Zen para forjar Alas Evo 1, Evo 2, Evo 3 y Evo 4 para tu clase ({character.classType}).
                </span>
              </div>

              {MU_CHAOS_WINGS_RECIPES.map((rec) => (
                <div
                  key={rec.tier}
                  className="p-4 rounded-xl bg-[#141a28] border border-amber-600/50 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ItemPortrait item={{slot:'wings',name:rec.wingNames[character.classType],enhanceLevel:rec.enhanceLevel}} sex={character.sex}/>
                    <span className="text-sm font-bold text-amber-300">{rec.title}</span>
                    <span className="text-xs font-mono-tabular text-emerald-300">
                      {rec.wingNames[character.classType]} (+{rec.enhanceLevel})
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-tabular text-sky-300">
                    Stats: ATK +{rec.minDmg}~{rec.maxDmg} · DEF +{rec.defense} · Magia +{rec.magicPower} · {rec.scaleLabel}
                  </div>
                  <div className="text-[11px] text-emerald-300">{rec.excellentOpt}</div>
                  <div className="text-xs font-mono-tabular text-slate-300">
                    Costo: {rec.blessCost} Bless · {rec.soulCost} Soul · {rec.chaosCost} Chaos ·{' '}
                    {rec.zenCost.toLocaleString()} Zen
                  </div>
                  <button
                    onClick={() => onChaosMixWing(rec.tier)}
                    className="w-full min-h-[42px] rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs cursor-pointer"
                  >
                    Combinar Alas Evo {rec.tier} (100% Seguro)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
