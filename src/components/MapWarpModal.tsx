import React from 'react';
import { Compass, MapPin, Shield, Skull, Sparkles, X } from 'lucide-react';
import { MU_MAPS } from '../data/muWorldData';
import type { MapId, MuCharacter } from '../types/game';

interface MapWarpModalProps {
  open: boolean;
  character: MuCharacter;
  currentMapId: MapId;
  onClose: () => void;
  onWarpToMap: (mapId: MapId) => void;
}

export const MapWarpModal: React.FC<MapWarpModalProps> = ({
  open,
  character,
  currentMapId,
  onClose,
  onWarpToMap,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-[#0c111b] border-2 border-amber-700/80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#151c2c] border-b border-amber-700/50">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-amber-300">
                Teletransporte · 4 capitales de Madrigal (9,44 km²)
              </h2>
              <p className="text-[11px] text-slate-400 font-mono-tabular">
                Nivel actual: {character.level}/99 (Resets: {character.resets}) · Zen disponible: {character.zen.toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar Mapa"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-[#1d2538] hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mu-scroll p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MU_MAPS.map((m) => {
            const isCurrent = m.id === currentMapId;
            const boss = m.monsters.find((mob) => mob.isBoss);
            const canAfford = character.zen >= m.warpZen;

            return (
              <button
                key={m.id}
                onClick={() => onWarpToMap(m.id)}
                disabled={!canAfford}
                className={`p-3.5 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2.5 ${
                  isCurrent
                    ? 'bg-amber-950/40 border-amber-500 text-amber-200 cursor-pointer'
                    : canAfford
                      ? 'bg-[#121826] border-slate-700 hover:border-amber-500/80 text-slate-100 cursor-pointer'
                      : 'bg-[#10141f] border-rose-900/50 text-slate-400 cursor-pointer'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-display text-sm font-bold">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{m.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{m.subtitle}</div>
                  </div>
                  <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 shrink-0">
                    Nv.{m.minLevel}–{m.maxLevel}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-300 bg-[#0b1019] rounded-lg px-2.5 py-1.5 border border-slate-800/80">
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Shield className="w-3 h-3" />
                    Radio seguro {m.cityRadius} m
                  </span>
                  <span className="text-amber-200">
                    Caza fuera de la capital
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono-tabular pt-1 border-t border-slate-800/80">
                  <span className="text-sky-300 inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {m.npcs.length} NPCs · Nv.{m.minLevel}–{m.maxLevel}
                  </span>
                  {boss && (
                    <span className="text-rose-300 inline-flex items-center gap-1 truncate max-w-[150px]">
                      <Skull className="w-3 h-3 shrink-0" />
                      {boss.name}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className={canAfford ? 'text-amber-300' : 'text-rose-400'}>
                    {m.warpZen === 0 ? 'Gratis' : `${m.warpZen.toLocaleString()} Zen`}
                  </span>
                  <span className="font-bold text-emerald-300">
                    {isCurrent ? 'Volver a la capital' : 'Viajar →'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
