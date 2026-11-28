import { liveQuery } from 'dexie';
import { readVault } from '../db/dexieStore';
import { canEquip, equipmentRequirements } from '../data/equipmentRules';
import type { WalletKey } from '../types/game';
const walletKeys: WalletKey[] = ['zen','bless','soul','life'];
import { forgeSlots, lifeOptions, recipe } from '../data/jewelForge';
import { previewModelFile, itemAssets } from '../data/itemVisualAssets';
import { ShopModel } from './ShopModel';
import { ItemPortrait } from './ItemPortrait';
import React, { useEffect, useState } from 'react';
import { Gem, Hammer, Sparkles, X } from 'lucide-react';
import { getItemVisualSpec } from '../data/muWorldData';
import type { ItemSlot, MuCharacter, MuItem } from '../types/game';

interface MuInventoryModalProps {
  open: boolean;
  character: MuCharacter;
  items: MuItem[];
  onClose: () => void;
  onVault: (selection: {item:string}|{currency:WalletKey}, deposit:boolean)=>Promise<void>;
  onOpenStats: () => void;
  onRepair: () => void;
  onEquip: (itemId: string) => void;
  onUse: (itemId: string) => void;
  onUpgrade: (itemId: string, jewel: 'bless' | 'soul' | 'life' | 'harmony') => void;
  forgeMessage: string | null;
}

const PAPER_DOLL_SLOTS: Array<{ slot: ItemSlot; label: string; gridArea: string }> = [
  { slot: 'pendant', label: 'Colgante', gridArea: 'col-start-1 row-start-1' },
  { slot: 'helm', label: 'Yelmo', gridArea: 'col-start-2 row-start-1' },
  { slot: 'wings', label: 'Alas / Capa', gridArea: 'col-start-3 row-start-1' },
  { slot: 'weapon', label: 'Arma Der.', gridArea: 'col-start-1 row-start-2' },
  { slot: 'armor', label: 'Armadura', gridArea: 'col-start-2 row-start-2' },
  { slot: 'shield', label: 'Escudo / Izq', gridArea: 'col-start-3 row-start-2' },
  { slot: 'gloves', label: 'Guantes', gridArea: 'col-start-1 row-start-3' },
  { slot: 'pants', label: 'Pantalón', gridArea: 'col-start-2 row-start-3' },
  { slot: 'boots', label: 'Botas', gridArea: 'col-start-3 row-start-3' },
  { slot: 'ring1', label: 'Anillo Izq.', gridArea: 'col-start-1 row-start-4' },
  { slot: 'pet', label: 'Mascota', gridArea: 'col-start-2 row-start-4' },
  { slot: 'ring2', label: 'Anillo Der.', gridArea: 'col-start-3 row-start-4' },
];

export const MuInventoryModal: React.FC<MuInventoryModalProps> = ({
  open,
  character,
  items,
  onClose,
  onOpenStats, onVault,
  onEquip,
  onUse,
  onRepair,
  onUpgrade,
  forgeMessage,
}) => {
  const [page,setPage] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [tab,setTab] = useState<'Recolección'|'Baúl'|'Personaje'>('Recolección');
  const [vault,setVault] = useState<Awaited<ReturnType<typeof readVault>>>({items:[],wallet:{}});
  useEffect(()=>{
    if (!open) return;
    const sub = liveQuery(()=>readVault(character.id)).subscribe(setVault);
    return ()=>sub.unsubscribe();
  },[open,character.id]);
  if (!open) return null;

  const equippedBySlot = new Map<ItemSlot, MuItem>();
  const backpackItems: MuItem[] = [];
  for (const it of items) {
    if (it.isEquipped && !equippedBySlot.has(it.slot)) {
      equippedBySlot.set(it.slot, it);
    } else {
      backpackItems.push(it);
    }
  }

  const visible = tab === 'Personaje' ? [...equippedBySlot.values()] : tab === 'Baúl' ? vault.items : backpackItems;
  const lastPage = Math.max(0,Math.ceil(visible.length/48)-1);
  const activePage = Math.min(page,lastPage);
  const pageItems = visible.slice(activePage*48,(activePage+1)*48);
  const selectedItem = pageItems.find(i=>i.id === selectedId) ?? pageItems[0];
  const req = selectedItem && equipmentRequirements(selectedItem);
  const totalSlots = Math.max(24, Math.ceil(pageItems.length / 8) * 8);

  const getRarityStyle = (it: MuItem) => {
    if (it.rarity === 'ancient') return 'border-sky-400/90 bg-sky-950/60 text-sky-200';
    if (it.rarity === 'excellent') return 'border-emerald-400/85 bg-emerald-950/55 text-emerald-200';
    if (it.enhanceLevel >= 11) return 'border-amber-400/90 bg-amber-950/45 text-amber-200';
    return 'border-amber-700/60 bg-[#181e2c] text-slate-100';
  };

  const renderSlotIcon = (it: MuItem) => <ItemPortrait item={it} sex={character.sex}/>;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="kingdom-inventory w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-[#0d111a] border-2 border-amber-700/80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#231912] via-[#191d2b] to-[#121622] border-b border-amber-700/60">
          <div>
            <h2 className="font-display text-sm sm:text-base font-bold text-amber-300">
              Inventario (V) · {character.name} ({character.classType} Nv.{character.level})
            </h2>
          </div>
          <button type="button" onClick={onOpenStats} className="ml-auto text-xs text-amber-200 p-2">
            Atributos ({character.unspentPoints} pts)
          </button>
          <button
            onClick={onClose}
            aria-label="Cerrar Inventario"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#1d2434] hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {forgeMessage && (
          <div className="px-4 py-2 bg-amber-950/80 border-b border-amber-500/40 text-xs text-amber-200 font-medium">
            {forgeMessage}
          </div>
        )}

        <nav aria-label="Inventarios" className="pack-tabs">
          {(['Recolección','Baúl','Personaje'] as const).map(t=><button key={t} aria-pressed={t===tab} onClick={()=>{setTab(t);setPage(0);setSelectedId(null);setPreviewId(null)}}>{t}</button>)}
        </nav>
        <div className="flex-1 overflow-y-auto mu-scroll p-3 grid grid-cols-1 md:grid-cols-12 gap-3">
          {tab === 'Personaje' && <div className="md:col-span-5 inventory-tray native-doll rounded-lg p-3">
            <div>
              <div className="text-[11px] font-semibold text-amber-300/90 mb-2 text-center">
                Equipo + Joyería + Mascota ({character.classType})
              </div>
              <div className="grid grid-cols-3 grid-rows-4 gap-1.5">
                {PAPER_DOLL_SLOTS.map(({ slot, label, gridArea }) => {
                  const eq = equippedBySlot.get(slot);
                  const active = eq && selectedItem?.id === eq.id;
                  return (
                    <button
                      key={slot}
                      onClick={() => eq && setSelectedId(eq.id)}
                      className={`${gridArea} min-h-[58px] p-1 rounded-lg border text-center flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                        eq ? getRarityStyle(eq) : 'border-slate-800 bg-[#0d121d] text-slate-600'
                      } ${active ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {eq ? (
                        <>
                          {renderSlotIcon(eq)}
                          <span className="text-[9px] font-semibold leading-tight line-clamp-2">
                            {eq.name}
                          </span>
                          <span className="text-[9px] font-mono-tabular text-amber-300">
                            +{eq.enhanceLevel}
                          </span>
                        </>
                      ) : (
                        <span className="text-[9px]">{label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>}
          <div className={tab==='Personaje' ? "md:col-span-7" : "md:col-span-12"}>
            {tab !== 'Personaje' && <div className="inventory-tray native-bag rounded-lg p-3">
              <h3 className="text-sm mb-2">{tab === 'Baúl' ? 'Baúl compartido de la cuenta' : 'Mochila de recolección'} · {visible.length} lotes</h3>
              <div className="flex flex-wrap gap-2 mb-2">{walletKeys.map(key=>{
                const qty = tab==='Baúl' ? vault.wallet[key] ?? 0 : character[key];
                return <button key={key} disabled={!qty} title={tab==='Baúl' ? 'Retirar pila' : 'Depositar pila'} onClick={()=>onVault({currency:key},tab!=='Baúl')} className="realm-button px-2 py-1 text-xs">
                  <img className="inline-block w-6 h-6" src={'./mugroup/ui/items/'+(key==='zen'?'zen':'jewel-'+key)+'.webp'} alt=""/> {key} +{qty}
                </button>})}</div>
              {lastPage>0 && <div className="flex gap-3 text-xs pb-2">
                <button disabled={!activePage} onClick={()=>setPage(activePage-1)}>← Anterior</button>
                {activePage+1} / {lastPage+1}
                <button disabled={activePage===lastPage} onClick={()=>setPage(activePage+1)}>Siguiente →</button>
              </div>}
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                {Array.from({ length: totalSlots }).map((_, idx) => {
                  const it = pageItems[idx];
                  const active = it && selectedItem?.id === it.id;
                  return (
                    <button
                      key={idx}
                      onClick={() => it && setSelectedId(it.id)}
                      className={`min-h-[54px] p-1 rounded border flex flex-col items-center justify-center text-center transition-colors ${
                        it
                          ? `${getRarityStyle(it)} cursor-pointer`
                          : 'border-slate-800/80 bg-[#0d111a] cursor-default'
                      } ${active ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {it && (
                        <>
                          {renderSlotIcon(it)}
                          <span className="text-[9px] font-semibold leading-tight truncate w-full mt-0.5">
                            {it.name}{it.slot === 'consumable' && ` +${it.quantity ?? 1}`}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>}

            {selectedItem && (
              <div className="p-3.5 rounded-lg bg-[#080d18] border border-amber-500/50 space-y-2">
                <ItemPortrait item={selectedItem} sex={character.sex} large />
                {itemAssets(selectedItem.name)?.appearance && <p className="text-xs text-slate-300">
                  Apariencia: {itemAssets(selectedItem.name)?.appearance}
                </p>}
                {previewModelFile(selectedItem, character.sex) && <button type="button"
                  onClick={() => setPreviewId(id => id === selectedItem.id ? null : selectedItem.id)}
                  aria-expanded={previewId === selectedItem.id} className="text-xs text-sky-300">
                  {previewId === selectedItem.id ? 'Cerrar vista 3D' : 'Ver modelo 3D'}
                </button>}
                {previewId === selectedItem.id && previewModelFile(selectedItem, character.sex) &&
                  <ShopModel key={selectedItem.id} item={selectedItem} file={previewModelFile(selectedItem, character.sex)} />}
                <div className="flex items-center justify-between gap-2">
                  <div
                    style={{ color: getItemVisualSpec(selectedItem).labelColor }}
                    className="text-sm font-bold"
                  >
                    {selectedItem.name} +{selectedItem.slot==='consumable' ? selectedItem.quantity ?? 1 : selectedItem.enhanceLevel}
                  </div>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    {selectedItem.isEquipped ? 'Equipado' : tab === 'Baúl' ? 'En baúl' : 'En mochila'} · {selectedItem.rarity.toUpperCase()}
                  </span>
                </div>

                <div className="text-xs text-slate-200 font-mono-tabular">
                  {selectedItem.minDmg > 0 && <span>Daño: {selectedItem.minDmg}~{selectedItem.maxDmg} · </span>}
                  {selectedItem.magicPower > 0 && <span>Magia: +{selectedItem.magicPower} · </span>}
                  {selectedItem.defense > 0 && <span>Defensa: {selectedItem.defense} · </span>}
                  <span>Set: {selectedItem.setName} · Estado: {selectedItem.durability ?? 100}%</span>
                </div>

                {req && selectedItem.slot !== 'consumable' && <div className="text-xs text-amber-200">Requiere: Nv. {req.level} · FUE {req.str} · AGI {req.agi} · VIT {req.vit} · ENE {req.ene} · CMD {req.cmd}
                  {selectedItem.classFilter && ' · '+selectedItem.classFilter.join('/')} {selectedItem.sexFilter && (selectedItem.sexFilter==='male'?' · Masculino':' · Femenino')}</div>}
                <div className="text-xs text-emerald-300">
                  {selectedItem.luck ? 'Suerte (crítico)' : 'Sin Suerte'}
                  {(selectedItem.lifeOptions ?? []).map(key => ' · ' + lifeOptions[key][0]).join('')}{selectedItem.excellentOpt ? ` · ${selectedItem.excellentOpt}` : ''}
                </div>

                <div className="text-[11px] text-slate-400">
                  Propietario original: {selectedItem.originalOwner}
                  {selectedItem.sharedFromSession ? ` · Compartido en sala ${selectedItem.sharedFromSession}` : ''}
                </div>

                {tab !== 'Personaje' && <button className="realm-button p-2 text-sm" onClick={()=>onVault({item:selectedItem.id},tab==='Recolección')}>{tab==='Baúl' ? 'Retirar a recolección' : 'Guardar en el baúl'}</button>}
                {tab !== 'Baúl' && <><button onClick={onRepair} className="min-h-[40px] rounded bg-emerald-900 px-3 text-sm">Reparar equipo · 1 Zen por punto</button>
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  {selectedItem.recovery && <button onClick={() => onUse(selectedItem.id)}
                    className="min-h-[40px] rounded bg-emerald-800 px-3 text-sm">Usar poción</button>}
                  {selectedItem.slot !== 'consumable' && (
                    <button
                      disabled={!selectedItem.isEquipped && !canEquip(character,selectedItem)}
                      onClick={() => onEquip(selectedItem.id)}
                      className="min-h-[40px] px-3.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      {selectedItem.isEquipped ? 'Retirar' : 'Equipar'}
                    </button>
                  )}
                  <button
                    onClick={() => onUpgrade(selectedItem.id, 'bless')}
                    disabled={!forgeSlots.has(selectedItem.slot) || character.bless <= 0 || selectedItem.enhanceLevel >= 6}
                    className="min-h-[40px] px-3 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    +Bless
                  </button>
                  <button
                    onClick={() => onUpgrade(selectedItem.id, 'soul')}
                    disabled={!forgeSlots.has(selectedItem.slot) || Object.entries(recipe(selectedItem.enhanceLevel,'soul')).some(([k,v]) => character[k as 'soul'|'bless'|'life'|'harmony'] < v) || selectedItem.enhanceLevel >= 13}
                    className="min-h-[40px] px-3 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    {selectedItem.enhanceLevel >= 9 && selectedItem.enhanceLevel < 13 ? `+${selectedItem.enhanceLevel+1}: ${selectedItem.enhanceLevel-7} Soul + ${selectedItem.enhanceLevel-7} Bless + ${selectedItem.enhanceLevel-8} Life` : '+Soul'}
                  </button>
                  <button
                    onClick={() => onUpgrade(selectedItem.id, 'life')}
                    disabled={!forgeSlots.has(selectedItem.slot) || character.life <= 0}
                    className="min-h-[40px] px-3 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Gem className="w-3.5 h-3.5" />
                    +Life
                  </button>

                </div></>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
