import { InvasionBoard } from './InvasionBoard';
import React, { useEffect, useRef, useState } from 'react';
import {
  Backpack,
  Bot,
  Check,
  Cloud,
  CloudOff,
  Compass,
  Flame,
  Hand,
  Heart,
  MessageSquare,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,

  Sword,
  Swords,
  User,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DEFAULT_BUTTON_LAYOUTS, MU_SKILLS, skillPresentation } from '../data/muSkillsAndClasses';
import { getMapById } from '../data/muWorldData';
import type {
  ActiveEffect,
  ButtonLayoutItem,
  CharacterComboConfig,
  FloatingDamageNumber,
  HudButtonId,
  MinimapEntitySnapshot,
  MuCharacter,
  MuItem,
  NpcDef,
  SkillDef,
  SyncStatusInfo,
} from '../types/game';
import type { TargetMonsterInfo } from '../game/MuWorldEngine';
import { getSkillRank } from '../game/combatAndProgression';
import {

  projectToMinimap,
  type LootFilterKey,
  type LootFilterSettings,
  type PotionConfig,
} from '../game/worldPhysicsMath';
import { PubgJoystick } from './PubgJoystick';

export interface WorldTelemetryInfo {
  flightMode?: string;
  altitude?: number;
  x: number;
  z: number;
  inSafeCity: boolean;
  totalMonsters: number;
  nearbyMonsters: number;
  mapName: string;
  areaKm2: number;
}

interface MuHudOverlayProps {
  room: React.ReactNode;
  banners: React.ReactNode;
  character: MuCharacter;
  comboConfig: CharacterComboConfig;
  comboArmed: boolean;
  helperEnabled: boolean;
  onToggleHelper: () => void;
  buttonLayouts: Record<HudButtonId, ButtonLayoutItem>;
  editMode: boolean;
  measuredFps: number;
  free3dCamera: boolean;
  autoAimAssist: boolean;
  activeEffects: ActiveEffect[];
  targetMonster: TargetMonsterInfo | null;
  skillCooldowns: Record<string, number>;
  nearbyNpc: NpcDef | null;
  worldTelemetry: WorldTelemetryInfo;
  damageNumbers: FloatingDamageNumber[];
  syncStatus: SyncStatusInfo;
  minimapData: MinimapEntitySnapshot | null;
  lootFilters: LootFilterSettings;
  potionConfig: PotionConfig;
  onUpdateLootFilters: (next: LootFilterSettings) => void;
  onUpdatePotionConfig: (next: PotionConfig) => void;
  onJoystickVector: (x: number, y: number) => void;
  onPressAttack: () => void;
  potions: MuItem[];
  onFlight: () => void;
  onJump: () => void;
  onToggleComboArmed: () => void;
  onCastSkill: (skill: SkillDef) => void;
  onUpdateComboConfig: (next: CharacterComboConfig) => void;
  onHealPotion: () => void;
  onPickupLoot: () => void;
  onTalkNpc: (npc: NpcDef) => void;
  onOpenInventory: () => void;
  onOpenMapWarp: () => void;
  onOpenStats: () => void;
  onOpenSync: () => void;
  onOpenOracle: () => void;
  updateState: string;
  onOpenSettings: () => void;
  onUpdateButtonLayouts: (next: Record<HudButtonId, ButtonLayoutItem>) => void;
  onExitEditMode: () => void;
}

const LOOT_FILTER_OPTIONS: Array<{ key: LootFilterKey; label: string; colorClass: string }> = [
  { key: 'equipment', label: 'Equipo', colorClass: 'text-sky-300' },
  { key: 'zen', label: 'Zen', colorClass: 'text-amber-300' },
  { key: 'life', label: 'Life', colorClass: 'text-purple-300' },
  { key: 'soul', label: 'Soul', colorClass: 'text-sky-300' },
  { key: 'bless', label: 'Bless', colorClass: 'text-rose-300' },
  { key: 'chaos', label: 'Chaos', colorClass: 'text-amber-200' },
  { key: 'creation', label: 'Creation', colorClass: 'text-emerald-300' },
  { key: 'talisman', label: 'Talismán', colorClass: 'text-yellow-300' },
];

export const MuHudOverlay: React.FC<MuHudOverlayProps> = ({
  character, room, banners,
  comboConfig,
  comboArmed,
  helperEnabled,
  onToggleHelper,
  buttonLayouts,
  editMode,
  measuredFps,
  free3dCamera,
  autoAimAssist,
  activeEffects,
  targetMonster,
  skillCooldowns,
  nearbyNpc,
  worldTelemetry,
  damageNumbers,
  syncStatus,
  minimapData,
  lootFilters,
  potionConfig,
  onUpdateLootFilters,
  onUpdatePotionConfig,
  onJoystickVector,
  onPressAttack,
  potions, onFlight, onJump,
  onToggleComboArmed,
  onCastSkill,
  onUpdateComboConfig,
  onHealPotion,
  onPickupLoot,
  onTalkNpc,
  onOpenInventory,
  onOpenMapWarp,
  onOpenStats,
  onOpenSync,
  onOpenOracle,
  updateState,
  onOpenSettings,
  onUpdateButtonLayouts,
  onExitEditMode,
}) => {
  const [selectedEditId, setSelectedEditId] = useState<HudButtonId | null>('attack');
  const [showComboPicker, setShowComboPicker] = useState(false);
  const [powersOpen, setPowersOpen] = useState(true);
  const [assignComboMode, setAssignComboMode] = useState(false);
  const [showLootMenu, setShowLootMenu] = useState(false);
  const [showPotionMenu, setShowPotionMenu] = useState(false);
  const attackTimeout = useRef<number | null>(null);
  const attackRef = useRef(onPressAttack);
  attackRef.current = onPressAttack;
  const stopHeldAttack = () => {
    if (attackTimeout.current !== null) window.clearInterval(attackTimeout.current);
    attackTimeout.current = null;
  };
  useEffect(() => {
    if (editMode) stopHeldAttack();
  }, [editMode]);
  useEffect(() => {
    window.addEventListener('blur', stopHeldAttack);
    return () => {
      window.removeEventListener('blur', stopHeldAttack);
      stopHeldAttack();
    };
  }, []);

  const lastActionFireRef = useRef<Record<string, number>>({});
  const dragState = useRef<{
    id: HudButtonId;
    pointerId: number;
    startX: number;
    startY: number;
    resize: boolean;
    scale: number;
    radius: number;
    origXPct: number;
    origYPct: number;
    minX: number;
    minY: number;
  } | null>(null);

  const fireImmediateAction = (actionKey: string, cb: () => void) => {
    if (editMode) return;
    const now = performance.now();
    const prev = lastActionFireRef.current[actionKey] ?? -Infinity;
    if (now - prev < 240) return;
    lastActionFireRef.current[actionKey] = now;
    cb();
  };

  const classSkills = MU_SKILLS[character.classType] || MU_SKILLS.DK;
  const defaultSkill =
    classSkills.find((s) => s.id === comboConfig.defaultSkillId) || classSkills[0];
  const mapCfg = getMapById(character.currentMapId);

  const hpPct = Math.max(0, Math.min(100, Math.round((character.hp / character.maxHp) * 100)));
  const mpPct = Math.max(0, Math.min(100, Math.round((character.mp / character.maxMp) * 100)));
  const sdPct = Math.max(0, Math.min(100, Math.round((character.sd / character.maxSd) * 100)));
  const agPct = Math.max(0, Math.min(100, Math.round((character.ag / character.maxAg) * 100)));
  const xpPct = Math.max(0, Math.min(100, Math.round((character.xp / character.xpToNext) * 100)));

  const startDragButton = (id: HudButtonId, e: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode) return;
    if (id === 'editToolbar' && (e.target as HTMLElement | null)?.closest('button, input, select')) {
      return;
    }
    e.stopPropagation();
    if (id !== 'editToolbar') setSelectedEditId(id);
    const current = buttonLayouts[id] || DEFAULT_BUTTON_LAYOUTS[id];
    const box = e.currentTarget.getBoundingClientRect();
    dragState.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      resize: !!(e.target as Element).closest('[data-resize]'),
      scale: current.scale,
      radius: Math.max(20, Math.hypot(box.width,box.height)/2),
      origXPct: current.xPct,
      origYPct: current.yPct,
      minX: Math.min(50, box.width / window.innerWidth * 50),
      minY: Math.min(50, box.height / window.innerHeight * 50),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDragButton = (id: HudButtonId, e: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode || !dragState.current || dragState.current.id !== id) return;
    if (dragState.current.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const drag = dragState.current;
    if (drag.resize) {
      const delta = ((e.clientX-drag.startX)+(e.clientY-drag.startY))/Math.SQRT2;
      const scale = Math.max(.35, Math.min(2, drag.scale*(1+delta/drag.radius)));
      onUpdateButtonLayouts({...buttonLayouts,[id]:{...buttonLayouts[id],scale}});
      return;
    }
    const dxPct = ((e.clientX - dragState.current.startX) / window.innerWidth) * 100;
    const dyPct = ((e.clientY - dragState.current.startY) / window.innerHeight) * 100;
    const { minX, minY, origXPct, origYPct } = dragState.current;
    const nextX = Math.max(minX, Math.min(100 - minX, origXPct + dxPct));
    const nextY = Math.max(minY, Math.min(100 - minY, origYPct + dyPct));

    onUpdateButtonLayouts({
      ...buttonLayouts,
      [id]: { ...(buttonLayouts[id] || DEFAULT_BUTTON_LAYOUTS[id]), xPct: nextX, yPct: nextY },
    });
  };

  const endDragButton = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current && dragState.current.pointerId === e.pointerId) {
      dragState.current = null;
    }
  };

  const adjustSelectedScale = (delta: number) => {
    if (!selectedEditId) return;
    const cur = buttonLayouts[selectedEditId] || DEFAULT_BUTTON_LAYOUTS[selectedEditId];
    const nextScale = Math.max(0.35, Math.min(2, Number((cur.scale + delta).toFixed(2))));
    onUpdateButtonLayouts({
      ...buttonLayouts,
      [selectedEditId]: { ...cur, scale: nextScale },
    });
  };

  const wrapButton = (id: HudButtonId, children: React.ReactNode) => {
    const layout = buttonLayouts[id] || DEFAULT_BUTTON_LAYOUTS[id];
    const isSelected = editMode && selectedEditId === id;
    const isPassiveDisplay = !editMode && (id === 'room' || id === 'banners' || id === 'minimap' || id === 'targetMonster' || id === 'damageBox' || id === 'status' || id === 'vitals');
    const zClass = id === 'editToolbar' ? 'z-40' : id === 'damageBox' ? 'z-15' : 'z-20';
    return (
      <div
        key={id}
        data-hud-layout={id}
        onPointerDownCapture={(e) => startDragButton(id, e)}
        onClickCapture={e => { if (editMode && id !== 'editToolbar') { e.preventDefault(); e.stopPropagation(); } }}
        onPointerMove={(e) => moveDragButton(id, e)}
        onPointerUp={endDragButton}
        onPointerCancel={endDragButton}
        style={{
          width: id === 'editToolbar' ? 'min(96vw, 52rem)' : 'max-content',
          maxWidth: '100vw',
          left: `${layout.xPct}%`,
          top: `${layout.yPct}%`,
          transform: `translate(-50%, -50%) scale(${layout.scale})`,
        }}
        className={`fixed ${zClass} touch-none select-none ${
          isPassiveDisplay ? 'pointer-events-none' : 'pointer-events-auto'
        } ${
          editMode
            ? `cursor-move rounded-xl p-1 ${
                isSelected
                  ? 'ring-2 ring-amber-400 bg-amber-500/20'
                  : 'ring-1 ring-slate-500/60 bg-slate-900/30'
              }`
            : ''
        }`}
      >
        {children}
        {isSelected && id !== 'editToolbar' && <span data-resize title="Arrastra para cambiar el tamaño" className="absolute -right-2 -bottom-2 z-[51] grid h-8 w-8 touch-none place-items-center rounded-full bg-amber-400 text-black cursor-nwse-resize">↘</span>}
        {editMode && id !== 'editToolbar' && <div aria-hidden="true" className="absolute inset-0 z-50 touch-none" />}
      </div>
    );
  };

  const cycleComboSlot = (slotIdx: number, skillId: string) => {
    const next = [...comboConfig.comboSkillIds];
    while (next.length < 5) {
      const extra = classSkills.find((s) => !next.includes(s.id)) || classSkills[0];
      next.push(extra.id);
    }
    next[slotIdx] = skillId;
    onUpdateComboConfig({ ...comboConfig, comboSkillIds: next.slice(0, 5) });
  };

  const toggleSkillInCombo = (skillId: string) => {
    const current = [...comboConfig.comboSkillIds].slice(0, 5);
    const existingIdx = current.indexOf(skillId);
    let next: string[];
    if (existingIdx >= 0) {
      if (current.length <= 1) return;
      next = current.filter((id) => id !== skillId);
    } else if (current.length < 5) {
      next = [...current, skillId];
    } else {
      next = [...current.slice(1), skillId];
    }
    onUpdateComboConfig({ ...comboConfig, comboSkillIds: next });
  };

  return (
    <>
      {(room || editMode) && wrapButton('room', room || 'Sala y jefe')}
      {(banners || editMode) && wrapButton('banners', banners || 'Avisos de combate')}
      {/* DRAGGABLE & SCALABLE FLOATING COMBAT DAMAGE BOX */}
      {(damageNumbers.length > 0 || editMode) &&
        wrapButton(
          'damageBox',
          <div
            data-testid="hud-damage-box"
            className={`relative w-[220px] h-[96px] overflow-visible ${
              editMode
                ? 'rounded-lg border border-dashed border-amber-400/80 bg-[#0d121d]/70 flex items-center justify-center'
                : 'pointer-events-none'
            }`}
          >
            {editMode && (
              <span className="text-[11px] font-bold text-amber-200 pointer-events-none">
                Cuadro de Daño (Arrastrar / Escalar)
              </span>
            )}
            {!editMode &&
              damageNumbers.map((d) => (
                <div
                  key={d.id}
                  style={{
                    left: `${50 + (d.xPct - 50) * 2.2}%`,
                    top: `${50 + (d.yPct - 35) * 2.2}%`,
                    color: d.color,
                    transform: 'translate(-50%, -100%)',
                  }}
                  className={`absolute font-mono-tabular font-extrabold drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] transition-transform duration-700 -translate-y-4 whitespace-nowrap ${
                    d.isCritical ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
                  }`}
                >
                  {d.text}
                </div>
              ))}
          </div>,
        )}

      {/* TOP-LEFT: Compact Character, Safe Zone / Hunting Zone, Coords & FPS */}
      {wrapButton('status', <div className="pointer-events-none rounded-lg bg-[#0d121c]/92 border border-amber-700/50 px-2 lg:px-3 py-1 lg:py-1.5 shadow-lg space-y-0.5 max-w-[38vw] lg:max-w-[43vw]">
        <div className="flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-xs flex-wrap">
          <span className="font-display font-bold text-amber-300 truncate max-w-[110px] lg:max-w-none">{character.name}</span>
          <span className="font-mono-tabular text-slate-300">
            {character.classType} Nv.{character.level}
          </span>
          <span className="font-mono-tabular text-sky-300">
            · {worldTelemetry.mapName || mapCfg.name} <span className="hidden lg:inline">({(worldTelemetry.areaKm2 || mapCfg.areaKm2).toFixed(2)} km²)</span>
          </span>
          <span className="font-mono-tabular text-emerald-300">{measuredFps} FPS</span>
          {autoAimAssist && (
            <span className="hidden xl:inline font-mono-tabular text-amber-300">· Auto-Aim 60%</span>
          )}
          {free3dCamera && (
            <span className="hidden xl:inline font-mono-tabular text-purple-300">· 3D Libre</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-[11px] font-mono-tabular">
          {worldTelemetry.inSafeCity ? (
            <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold truncate">
              <Shield className="w-3 h-3 shrink-0" />
              <span>Capital Segura<span className="hidden lg:inline"> (Sin ataques ni monstruos)</span></span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-300 font-semibold truncate">
              <Swords className="w-3 h-3 shrink-0" />
              <span>Zona Exterior<span className="hidden lg:inline"> ({worldTelemetry.nearbyMonsters} cerca / {worldTelemetry.totalMonsters.toLocaleString()} mapa)</span></span>
            </span>
          )}
          <span className="text-slate-400 shrink-0">
            ({worldTelemetry.x}, {worldTelemetry.z})
          </span>
        </div>
      </div>)}

      {/* TOP-LEFT SECONDARY: Quick Oracle, APK / Cloud Sync Buttons + Active Effects */}
      {wrapButton('actions',
        <div className=" flex flex-col gap-1.5 max-w-[44vw] lg:max-w-[56vw]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <InvasionBoard />
            <button
              onClick={onOpenOracle}
              className="min-h-[34px] px-2.5 rounded-lg bg-[#0e1420]/92 border border-slate-700 hover:border-emerald-500/60 text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              Oráculo
            </button>
            <span role="status" aria-label={updateState || (syncStatus.isOnline ? 'Conectado' : 'Sin conexión')}
              title={updateState || syncStatus.lastMessage || undefined} className="text-amber-200">
              {syncStatus.isOnline ? <Cloud className={updateState ? 'w-5 h-5 animate-pulse' : 'w-5 h-5'} /> : <CloudOff className="w-5 h-5" />}
              {updateState && <small>{updateState === 'Lista' ? '✓' : '↓'}</small>}
            </span>
          </div>

          {activeEffects.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap max-w-[30vw] pointer-events-none">
              {activeEffects.map((eff) => (
                <div
                  key={eff.id}
                  style={{ borderColor: eff.color }}
                  className="px-2 py-1 rounded-md bg-[#0b1019]/92 border text-[10px] font-mono-tabular flex items-center gap-1.5 shadow"
                >
                  <span style={{ color: eff.color }} className="font-bold">
                    {eff.kind === 'buff' ? '▲' : '▼'} {eff.name}
                  </span>
                  <span className="text-slate-300">{eff.statHint}</span>
                  <span className="text-amber-300 font-bold">{Math.ceil(eff.remainingSec)}s</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TOP-LEFT CORNER MINI-MAP (Gold=Hero, Blue=NPC, Green=Friends, Red=Monsters) */}
      {minimapData && wrapButton('minimap',
        <div
          data-testid="hud-minimap"
          style={{ backgroundImage: "url('./mugroup/ui/relief.webp')", backgroundSize: 'cover' }}
          className="pointer-events-none relative w-[112px] h-[112px] sm:w-[132px] sm:h-[132px] rounded-lg bg-[#090e17]/88 border border-amber-600/60 shadow-xl overflow-hidden select-none"
        >
          {/* Subtle coordinate crosshairs */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700/45" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700/45" />
          <div className="absolute top-0.5 left-1 right-1 flex items-center justify-between text-[8px] font-mono-tabular text-slate-300/90">
            <span className="truncate font-semibold text-amber-200">{getMapById(minimapData.mapId).name}</span>
            <span>N ↑</span>
          </div>

          <svg aria-label="Campamentos de monstruos" className="absolute inset-0 w-full h-full" viewBox={`0 0 ${minimapData.sizeMeters} ${minimapData.sizeMeters}`}>
            {minimapData.camps.map((camp,i)=><circle key={i} cx={camp.x} cy={camp.z} r="17" fill="#ffbb69"/>)}
          </svg>
          {/* Red dots = Monsters */}
          {minimapData.monsters.map((m) => {
            const p = projectToMinimap(m.x, m.z, minimapData.mapId, minimapData.sizeMeters);
            return (
              <span
                key={m.id}
                style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  m.isBoss ? 'w-2 h-2 bg-red-500 ring-1 ring-amber-300' : 'w-1.5 h-1.5 bg-red-400/90'
                }`}
              />
            );
          })}

          {/* Blue dots = NPCs */}
          {minimapData.npcs.map((n) => {
            const p = projectToMinimap(n.x, n.z, minimapData.mapId, minimapData.sizeMeters);
            return (
              <span
                key={n.id}
                style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-sky-400 border border-sky-100/70"
              />
            );
          })}

          {/* Green dots = Wi-Fi / Bluetooth Friends */}
          {minimapData.friends.map((f) => {
            const p = projectToMinimap(f.x, f.z, minimapData.mapId, minimapData.sizeMeters);
            return (
              <span
                key={f.id}
                style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-1 ring-emerald-100"
              />
            );
          })}

          {/* Gold dot = Player Hero */}
          {(() => {
            const hp = projectToMinimap(minimapData.hero.x, minimapData.hero.z, minimapData.mapId, minimapData.sizeMeters);
            return (
              <span
                data-testid="minimap-hero-dot"
                style={{ left: `${hp.xPct}%`, top: `${hp.yPct}%`, transform: `rotate(${180-(minimapData.hero.heading ?? 0)*180/Math.PI}deg)`, clipPath: "polygon(50% 0%, 100% 100%, 50% 77%, 0% 100%)" }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-4 bg-amber-300 shadow-[0_0_6px_#fbbf24]"
              />
            );
          })()}

          <div className="absolute bottom-0 inset-x-0 bg-black/65 px-1 py-0.5 flex items-center justify-between text-[7px] font-mono-tabular">
            <span className="text-amber-300">●Tú</span>
            <span className="text-sky-300">●NPC</span>
            <span className="text-emerald-300">●Amg</span>
            <span className="text-rose-400">●Mob</span>
          </div>
        </div>
      )}

      {/* TARGET LOCKED MONSTER + DAMAGE TABLE (Draggable & Scalable in Edit Mode) */}
      {(targetMonster || editMode) &&
        wrapButton(
          'targetMonster',
          targetMonster ? (
            <div
              data-testid="hud-target-monster"
              className={`w-[min(270px,44vw)] rounded-lg bg-[#0d121d]/94 border border-rose-500/60 p-2.5 shadow-xl space-y-1.5 ${
                editMode ? '' : 'pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="text-xs font-bold text-amber-300 truncate">
                  Nv.{targetMonster.stats.scaledLevel} {targetMonster.stats.name}
                </div>
                <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 shrink-0">
                  Aim {targetMonster.autoAimPct}% · {targetMonster.dist}m
                </span>
              </div>
              <div className="h-2 w-full rounded bg-slate-900 overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-rose-600 to-amber-500 transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, Math.round((targetMonster.currentHp / Math.max(1, targetMonster.stats.maxHp)) * 100)))}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-300">
                <span>HP {targetMonster.currentHp}/{targetMonster.stats.maxHp}</span>
                <span>DEF {targetMonster.stats.defense} · FUE {targetMonster.stats.strength}</span>
                <span>ENE {targetMonster.currentEnergy}/{targetMonster.stats.maxEnergy}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono-tabular pt-1 border-t border-slate-800">
                <div className="text-emerald-300">
                  Tu golpe base: {targetMonster.stats.damageTable.playerEstNormal} ({targetMonster.stats.damageTable.playerEstCrit}c)
                </div>
                <div className="text-rose-300 text-right">
                  Golpe: {targetMonster.stats.damageTable.basicAttack} · Crit: {targetMonster.stats.damageTable.criticalHit} ({targetMonster.stats.damageTable.critChancePct}%)
                </div>
              </div>
              {targetMonster.stats.powers[0] && (
                <div className="text-[10px] text-amber-200/90 truncate">
                  Poder: {targetMonster.stats.powers[0].name} ({targetMonster.stats.damageTable.specialPower} dmg)
                  {targetMonster.stats.powers[0].effectDebuff ? ` · ${targetMonster.stats.powers[0].effectDebuff}` : ''}
                </div>
              )}
            </div>
          ) : (
            <div
              data-testid="hud-target-monster"
              className="w-[230px] rounded-lg bg-[#0d121d]/85 border border-dashed border-rose-400/80 p-2.5 shadow-xl space-y-1 text-center"
            >
              <div className="text-xs font-bold text-rose-300">Objetivo Monstruo (Ejemplo)</div>
              <div className="h-1.5 w-full rounded bg-rose-700/70" />
              <div className="text-[10px] text-slate-300">Arrastra o escala esta tarjeta</div>
            </div>
          ),
        )}

      {/* NEARBY NPC INTERACT BUTTON */}
      {(nearbyNpc || editMode) && wrapButton('talk',
        <div>
          <button
            onClick={() => nearbyNpc && onTalkNpc(nearbyNpc)}
            className="min-h-[42px] px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-2xl border border-amber-200 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            {nearbyNpc?.warpTarget ? 'Viajar a' : 'Hablar con'} {nearbyNpc?.name ?? 'NPC'}
          </button>
        </div>
      )}

      {/* BUTTON EDITOR FLOATING CONTROL BAR (Draggable & Scalable) */}
      {editMode &&
        wrapButton(
          'editToolbar',
          <div
            data-testid="hud-edit-toolbar"
            className="flex items-center gap-1 flex-wrap justify-center rounded-xl bg-[#0e1420] border-2 border-amber-500 px-3.5 py-2 shadow-2xl max-h-[42dvh] overflow-y-auto"
          >
            <span className="text-xs font-bold text-amber-300 cursor-move" data-testid="hud-editor-drag">⠿ Mover</span>
            <select
              aria-label="Elemento a cambiar de tamaño"
              value={selectedEditId || 'attack'}
              onChange={event => setSelectedEditId(event.currentTarget.value as HudButtonId)}
              className="max-w-[160px] rounded bg-slate-900 text-slate-100 text-xs p-2"
            >
              {Object.values(DEFAULT_BUTTON_LAYOUTS).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {selectedEditId && (['xPct','yPct'] as const).map(axis => <label key={axis} className="flex items-center gap-1 text-xs">
              {axis === 'xPct' ? 'X' : 'Y'}
              <input type="range" min="1" max="99" step="1" aria-label={axis === 'xPct' ? 'Posición horizontal' : 'Posición vertical'}
                className="w-16" value={buttonLayouts[selectedEditId][axis]}
                onChange={e=>onUpdateButtonLayouts({...buttonLayouts,[selectedEditId]:{
                  ...buttonLayouts[selectedEditId],[axis]:Number(e.currentTarget.value)}})} />
            </label>)}
            {selectedEditId && <input aria-label="Tamaño del elemento" type="range" min="0.35" max="2" step="0.05"
              className="w-20" value={buttonLayouts[selectedEditId].scale}
              onChange={e => onUpdateButtonLayouts({...buttonLayouts,[selectedEditId]:{
                ...buttonLayouts[selectedEditId],scale:Number(e.currentTarget.value)}})} />}
            <span className="text-xs text-amber-300">{Math.round((buttonLayouts[selectedEditId || 'attack']?.scale ?? 1) * 100)}%</span>
            <button
              onClick={() => adjustSelectedScale(-0.1)}
              disabled={!selectedEditId}
              className="min-h-[36px] px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
              Encoger
            </button>
            <button
              onClick={() => adjustSelectedScale(0.1)}
              disabled={!selectedEditId}
              className="min-h-[36px] px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              Agrandar
            </button>
            <button
              onClick={() => onUpdateButtonLayouts(DEFAULT_BUTTON_LAYOUTS)}
              className="min-h-[36px] px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={onExitEditMode}
              className="min-h-[36px] px-3 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>,
        )}

      {/* DRAGGABLE & SCALABLE HUD BUTTONS */}
      {wrapButton(
        'mapWarp',
        <button
          onClick={() => !editMode && onOpenMapWarp()}
          className="min-h-[38px] lg:min-h-[42px] px-2 lg:px-2.5 rounded-lg bg-[#0f1522]/92 border border-emerald-600/50 hover:border-emerald-400 text-emerald-200 text-[11px] lg:text-xs font-semibold inline-flex items-center gap-1 lg:gap-1.5 shadow-lg cursor-pointer whitespace-nowrap"
        >
          <Compass className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-400" />
          <span>Mapas<span className="hidden lg:inline"> / Madrigal</span></span>
        </button>,
      )}

      {wrapButton(
        'stats',
        <button
          onClick={() => !editMode && onOpenStats()}
          className="relative min-h-[38px] lg:min-h-[42px] px-2 lg:px-2.5 rounded-lg bg-[#0f1522]/92 border border-purple-500/50 hover:border-purple-400 text-purple-200 text-[11px] lg:text-xs font-semibold inline-flex items-center gap-1 lg:gap-1.5 shadow-lg cursor-pointer whitespace-nowrap"
        >
          <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-purple-300" />
          <span>Héroe<span className="hidden lg:inline"> / Logros</span></span>
          {character.level >= 99 && (
            <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white text-[10px] font-bold">
              RESET
            </span>
          )}
          {(character.unspentPoints + (character.skillPoints ?? 0)) > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
              +{character.unspentPoints + (character.skillPoints ?? 0)}
            </span>
          )}
        </button>,
      )}

      {wrapButton(
        'sync',
        <button
          onClick={() => !editMode && onOpenSync()}
          className="min-h-[38px] lg:min-h-[42px] px-2 lg:px-2.5 rounded-lg bg-[#0f1522]/92 border border-sky-600/50 hover:border-sky-400 text-sky-200 text-[11px] lg:text-xs font-semibold inline-flex items-center gap-1 lg:gap-1.5 shadow-lg cursor-pointer whitespace-nowrap"
        >
          <Wifi className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-sky-400" />
          Wi-Fi / BT
        </button>,
      )}

      {wrapButton(
        'inventory',
        <button
          onClick={() => !editMode && onOpenInventory()}
          className="min-h-[38px] lg:min-h-[42px] px-2 lg:px-2.5 rounded-lg bg-[#0f1522]/92 border border-amber-600/60 hover:border-amber-400 text-amber-200 text-[11px] lg:text-xs font-semibold inline-flex items-center gap-1 lg:gap-1.5 shadow-lg cursor-pointer whitespace-nowrap"
        >
          <Backpack className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400" />
          Inventario
        </button>,
      )}

      {wrapButton(
        'settings',
        <button
          onClick={() => !editMode && onOpenSettings()}
          aria-label="Ajustes"
          className="min-h-[44px] min-w-[44px] rounded-lg bg-[#0f1522]/92 border border-slate-600 hover:border-amber-400 text-slate-100 flex items-center justify-center shadow-lg cursor-pointer"
        >
          <Settings className="w-5 h-5 text-amber-300" />
        </button>,
      )}

      {wrapButton(
        'joystick',
        <PubgJoystick
          scale={1}
          disabled={editMode}
          onVectorChange={onJoystickVector}
        />,
      )}

      {wrapButton(
        'potion',
        <div className="relative">
          <button
            data-testid="hud-potion-btn"
            onPointerDown={(e) => {
              if (editMode) return;
              e.stopPropagation();
              fireImmediateAction('potion', onHealPotion);
            }}
            onClick={(e) => {
              e.stopPropagation();
              fireImmediateAction('potion', onHealPotion);
            }}
            className="w-12 h-12 rounded-full bg-[#1a0f14]/92 border-2 border-rose-500/70 text-rose-200 flex flex-col items-center justify-center shadow-lg active:scale-95 cursor-pointer touch-none select-none"
          >
            <span className="flex"><img alt="" width="16" src="./mugroup/ui/hp_potion.png"/><img alt="" width="16" src="./mugroup/ui/mp_potion.png"/></span>
            <span className="text-[9px] font-bold pointer-events-none">HP/MP · {potions.reduce((sum,p) => sum + (p.quantity ?? 1),0)}</span>
          </button>

          <button
            type="button"
            data-testid="hud-potion-config-btn"
            aria-label="Configurar poción HP/MP"
            onPointerDown={(e) => {
              if (editMode) return;
              e.stopPropagation();
            }}
            onClick={(e) => {
              if (editMode) return;
              e.stopPropagation();
              setShowLootMenu(false);
              setShowPotionMenu((v) => !v);
            }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#0f1624] border border-rose-400/70 text-rose-200 flex items-center justify-center shadow cursor-pointer"
          >
            <SlidersHorizontal className="w-2.5 h-2.5 pointer-events-none" />
          </button>

          {showPotionMenu && !editMode && (
            <div
              data-testid="hud-potion-menu"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-14 top-0 w-56 rounded-xl bg-[#0d121d]/96 border border-rose-500/60 p-2.5 shadow-2xl space-y-2 z-30"
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-rose-300">
                <span>Poción Dual HP + MP</span>
                <button
                  type="button"
                  onClick={() => setShowPotionMenu(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                <label>Cura preferida
                  <select value={potionConfig.preferredPotion ?? ''} className="w-full bg-slate-900"
                    onChange={e => onUpdatePotionConfig({...potionConfig, preferredPotion:e.target.value})}>
                    <option value="">Automática</option>
                    {[...new Set(potions.map(i => i.name))].map(name => <option key={name}>{name}</option>)}
                  </select>
                </label>
              </div>
              <div className="pt-1 border-t border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-300 font-semibold">
                  Auto-curar en COMBO (&lt; {potionConfig.autoHealThresholdPct}% HP/MP)
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[35, 55, 75].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onUpdatePotionConfig({ ...potionConfig, autoHealThresholdPct: pct })}
                      className={`py-1 rounded text-[10px] font-mono-tabular border cursor-pointer ${
                        potionConfig.autoHealThresholdPct === pct
                          ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 font-bold'
                          : 'bg-[#141b2b] border-slate-700 text-slate-400'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>,
      )}

      {wrapButton(
        'loot',
        <div className="relative">
          <button
            data-testid="hud-loot-btn"
            onPointerDown={(e) => {
              if (editMode) return;
              e.stopPropagation();
              fireImmediateAction('loot', onPickupLoot);
            }}
            onClick={(e) => {
              e.stopPropagation();
              fireImmediateAction('loot', onPickupLoot);
            }}
            className={`w-12 h-12 rounded-full bg-[#141a28]/92 border-2 text-amber-200 flex flex-col items-center justify-center shadow-lg active:scale-95 cursor-pointer touch-none select-none ${
              lootFilters.autoLootEnabled ? 'border-emerald-400/80' : 'border-amber-500/60'
            }`}
          >
            <Hand className="w-4 h-4 text-amber-300 pointer-events-none" />
            <span className="text-[9px] font-bold pointer-events-none">Recoger</span>
          </button>

          <button
            type="button"
            data-testid="hud-loot-config-btn"
            aria-label="Filtros de recolección"
            onPointerDown={(e) => {
              if (editMode) return;
              e.stopPropagation();
            }}
            onClick={(e) => {
              if (editMode) return;
              e.stopPropagation();
              setShowPotionMenu(false);
              setShowLootMenu((v) => !v);
            }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#0f1624] border border-amber-400/75 text-amber-200 flex items-center justify-center shadow cursor-pointer"
          >
            <SlidersHorizontal className="w-2.5 h-2.5 pointer-events-none" />
          </button>

          {showLootMenu && !editMode && (
            <div
              data-testid="hud-loot-menu"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-14 bottom-0 w-52 rounded-xl bg-[#0d121d]/96 border border-amber-500/60 p-2.5 shadow-2xl space-y-2 z-30"
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                <span>Filtros de Recoger</span>
                <button
                  type="button"
                  onClick={() => setShowLootMenu(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateLootFilters({ ...lootFilters, autoLootEnabled: !lootFilters.autoLootEnabled })
                }
                className={`w-full px-2 py-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-between cursor-pointer ${
                  lootFilters.autoLootEnabled
                    ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200'
                    : 'bg-[#141b2b] border-slate-700 text-slate-400'
                }`}
              >
                <span>Auto-Recoger</span>
                <span>{lootFilters.autoLootEnabled ? 'ACTIVO' : 'MANUAL'}</span>
              </button>
              <div className="grid grid-cols-2 gap-1">
                {LOOT_FILTER_OPTIONS.map((opt) => {
                  const active = lootFilters[opt.key];
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => onUpdateLootFilters({ ...lootFilters, [opt.key]: !active })}
                      className={`px-2 py-1 rounded border text-[10px] flex items-center justify-between cursor-pointer ${
                        active
                          ? 'bg-[#172136] border-amber-500/60 font-semibold'
                          : 'bg-[#111622] border-slate-800 opacity-55'
                      }`}
                    >
                      <span className={opt.colorClass}>{opt.label}</span>
                      <span className="text-[9px] text-slate-200">{active ? '✓' : '—'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>,
      )}

      {wrapButton(
        'jump',
        <button
          onPointerDown={(e) => {
            if (editMode) return;
            e.stopPropagation();
            fireImmediateAction('jump', onJump);
          }}
          onClick={(e) => {
            e.stopPropagation();
            fireImmediateAction('jump', onJump);
          }}
          aria-label="Saltar (J)"
          className="w-14 h-14 rounded-full bg-[#131b2b]/95 border-2 border-amber-400/80 hover:border-amber-300 text-amber-200 flex flex-col items-center justify-center shadow-xl active:scale-95 cursor-pointer touch-none select-none"
        >
          <span className="text-[11px] font-extrabold leading-none pointer-events-none">SALTAR</span>
          <span className="text-[9px] font-mono-tabular text-amber-400 mt-0.5 pointer-events-none">J</span>
        </button>,
      )}

      {wrapButton('flight', <button type="button" title="Equipa alas. Avanza mirando hacia arriba o abajo para cambiar de altura. Vuelve a pulsar para aterrizar." onClick={() => !editMode && onFlight()} className="rounded-full border-2 border-amber-300 bg-slate-900/95 px-2 py-2 text-[10px] font-bold text-amber-100">
        {worldTelemetry.flightMode === 'flight' ? 'Aterrizar' : worldTelemetry.flightMode === 'landing' ? 'Descenso' : 'Volar'} · {worldTelemetry.altitude ?? 0} m
      </button>)}

      {/* SEPARATED PODERES BUTTON + 10 SMALL SKILL/MAGIC SQUARES (5x2) */}
      {wrapButton(
        'skillTray',
        <div data-testid="hud-skill-tray" className="flex flex-col items-end gap-1 touch-none select-none">
          <div className="flex items-center gap-1">
            <button
              onPointerDown={(e) => {
                if (editMode) return;
                e.stopPropagation();
                fireImmediateAction('toggle_powers_grid', () => setPowersOpen((v) => !v));
              }}
              onClick={(e) => {
                e.stopPropagation();
                fireImmediateAction('toggle_powers_grid', () => setPowersOpen((v) => !v));
              }}
              className={`min-h-[30px] px-2.5 rounded-lg border text-[10px] font-bold inline-flex items-center gap-1 shadow-lg cursor-pointer touch-none select-none ${
                powersOpen
                  ? 'bg-amber-600/95 border-amber-300 text-slate-950'
                  : 'bg-[#0b1019]/92 border-amber-700/70 text-amber-200'
              }`}
            >
              <Flame className="w-3 h-3 pointer-events-none" />
              <span className="pointer-events-none">Poderes ({classSkills.length})</span>
            </button>

            <button
              onPointerDown={(e) => {
                if (editMode) return;
                e.stopPropagation();
                fireImmediateAction('assign_combo_mode', () => {
                  setPowersOpen(true);
                  setAssignComboMode((v) => !v);
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
                fireImmediateAction('assign_combo_mode', () => {
                  setPowersOpen(true);
                  setAssignComboMode((v) => !v);
                });
              }}
              title="Elige hasta 5 poderes para el botón COMBO"
              className={`min-h-[30px] px-2 rounded-lg border text-[10px] font-bold cursor-pointer touch-none select-none ${
                assignComboMode
                  ? 'bg-rose-600 border-rose-300 text-white'
                  : 'bg-[#121826]/92 border-slate-600 text-slate-200'
              }`}
            >
              {assignComboMode
                ? `Editando Combo (${comboConfig.comboSkillIds.length}/5)`
                : `+Combo (${comboConfig.comboSkillIds.length}/5)`}
            </button>

            <button
              onPointerDown={(e) => {
                if (editMode) return;
                e.stopPropagation();
                fireImmediateAction('open_combo_picker', () => setShowComboPicker((v) => !v));
              }}
              onClick={(e) => {
                e.stopPropagation();
                fireImmediateAction('open_combo_picker', () => setShowComboPicker((v) => !v));
              }}
              title="Configurar ataque por defecto y Combo x5"
              className="w-8 h-[30px] rounded-lg bg-[#1b2234]/95 hover:bg-slate-700 border border-slate-600 text-amber-300 flex items-center justify-center cursor-pointer touch-none select-none"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 pointer-events-none" />
            </button>
          </div>

          {powersOpen && (
            <div style={{backgroundImage:'url("./mugroup/ui/WndTaskBar.png")'}} className="flyff-action-slots grid grid-cols-6 gap-1 rounded-lg bg-[#0b1019]/92 border border-amber-700/60 p-1 shadow-xl">
              {classSkills.slice(0, 10).map((sk) => {
                const media = skillPresentation(character.classType, sk);
                const isDefault = sk.id === defaultSkill.id;
                const comboIdx = comboConfig.comboSkillIds.indexOf(sk.id);
                const rank = getSkillRank(character, sk.id);
                const cdRemaining = skillCooldowns[sk.id] ?? 0;
                return (
                  <button
                    key={sk.id}
                    onPointerDown={(e) => {
                      if (editMode) return;
                      e.stopPropagation();
                      if (assignComboMode) {
                        fireImmediateAction(`slot_${sk.id}`, () => toggleSkillInCombo(sk.id));
                      } else {
                        fireImmediateAction(`skill_${sk.id}`, () => onCastSkill(sk));
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (assignComboMode) {
                        fireImmediateAction(`slot_${sk.id}`, () => toggleSkillInCombo(sk.id));
                      } else {
                        fireImmediateAction(`skill_${sk.id}`, () => onCastSkill(sk));
                      }
                    }}
                    title={`${sk.name} Nv.${rank} · ${media.label} · MP ${sk.mpCost} · AG ${sk.agCost}`}
                    style={{
                      borderColor:
                        assignComboMode && comboIdx >= 0
                          ? '#f43f5e'
                          : isDefault
                            ? '#f59e0b'
                            : 'rgba(71, 85, 105, 0.75)',
                    }}
                    className="relative w-9 h-9 rounded bg-[#151c2c] hover:bg-[#1f2940] border flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 overflow-hidden touch-none select-none"
                  >
                    <img src={media.icon} alt="" className="w-6 h-6 rounded-sm pointer-events-none" />
                    <span className="text-[7.5px] font-bold text-slate-100 leading-none truncate max-w-[32px] pointer-events-none">
                      {sk.shortName}
                    </span>
                    <span className="text-[6.5px] font-mono-tabular text-amber-300/90 leading-none mt-0.5 pointer-events-none">
                      R{rank}
                    </span>
                    {comboIdx >= 0 && (
                      <span className="absolute -top-0.5 -right-0.5 px-1 rounded bg-rose-600 text-[7px] font-bold text-white pointer-events-none">
                        C{comboIdx + 1}
                      </span>
                    )}
                    {cdRemaining > 0.05 && (
                      <div className="absolute inset-0 bg-slate-950/78 flex items-center justify-center text-[9px] font-mono-tabular font-bold text-amber-300 pointer-events-none">
                        {cdRemaining.toFixed(1)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>,
      )}

      {wrapButton('helper', <button type="button" data-testid="hud-helper-btn" aria-pressed={helperEnabled}
        onClick={() => !editMode && onToggleHelper()}
        className={`px-3 py-2 rounded-xl border text-xs font-bold ${helperEnabled ? 'border-amber-200 bg-amber-800' : 'border-slate-500 bg-slate-900'}`}>
        Hellpe · {helperEnabled ? 'ON' : 'OFF'}
      </button>)}
      {/* COMBO x5 TOGGLE BUTTON (Tap once to arm/disarm 5-power combo for Attack button) */}
      {wrapButton(
        'combo',
        <button
          data-testid="hud-combo-btn"
          onPointerDown={(e) => {
            if (editMode) return;
            e.stopPropagation();
            fireImmediateAction('combo', onToggleComboArmed);
          }}
          onClick={(e) => {
            e.stopPropagation();
            fireImmediateAction('combo', onToggleComboArmed);
          }}
          className={`w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center shadow-xl active:scale-95 cursor-pointer transition-colors touch-none select-none ${
            comboArmed
              ? 'bg-gradient-to-b from-rose-600 to-amber-600 border-amber-200 text-white'
              : 'bg-[#121826]/92 border-slate-500 text-slate-200'
          }`}
        >
          <Flame className={`w-5 h-5 pointer-events-none ${comboArmed ? 'text-amber-200' : 'text-slate-400'}`} />
          <span className="text-[9.5px] font-bold leading-tight pointer-events-none">
            {comboArmed ? 'COMBO ON' : 'COMBO'}
          </span>
          <span className="text-[8px] font-mono-tabular text-amber-200/90 pointer-events-none">
            {comboArmed ? 'x5 + Cura' : `${comboConfig.comboSkillIds.slice(0, 5).length}/5`}
          </span>
        </button>,
      )}

      {/* DEDICATED MAIN ATTACK BUTTON */}
      {wrapButton(
        'attack',
        <button
          data-testid="hud-attack-btn"
          aria-label="Atacar"
          onPointerDown={(e) => {
            if (editMode || e.button !== 0 || attackTimeout.current !== null) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            fireImmediateAction('attack', onPressAttack);
            attackTimeout.current = window.setInterval(() => attackRef.current(), 520);
          }}
          onPointerUp={stopHeldAttack}
          onPointerCancel={stopHeldAttack}
          onLostPointerCapture={stopHeldAttack}
          onClick={(e) => {
            e.stopPropagation();
            if (e.detail === 0) fireImmediateAction('attack', onPressAttack);
          }}
          className={`w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center shadow-2xl active:scale-95 cursor-pointer touch-none select-none ${
            comboArmed
              ? 'bg-gradient-to-b from-amber-500 to-rose-700 border-amber-200 text-white'
              : 'bg-gradient-to-b from-amber-500 to-amber-700 border-amber-200 text-slate-950'
          }`}
        >
          <img alt="" className="w-8 h-8 rounded-sm pointer-events-none" src={skillPresentation(character.classType,defaultSkill).icon} />
          <span className="text-[10px] font-extrabold leading-tight mt-0.5 max-w-[68px] truncate pointer-events-none">
            {comboArmed ? 'Atacar x5' : defaultSkill.shortName}
          </span>
        </button>,
      )}

      {wrapButton('vitals', <div className="flyff-vitals" style={{backgroundImage:'url("./mugroup/ui/WndStatus.png")'}}>
        <strong>{character.name} · Nv. {character.level}</strong><aside>{character.classType}<small>Zen {character.zen.toLocaleString()}<br/>B:{character.bless} · S:{character.soul}</small></aside>
        {([['HP',hpPct,character.hp,character.maxHp,'#e93949'],['MP',mpPct,character.mp,character.maxMp,'#3578db'],
          ['AG',agPct,character.ag,character.maxAg,'#58a74b'],['SD',sdPct,character.sd,character.maxSd,'#d6ae46'],
          ['EXP',xpPct,Math.floor(xpPct),100,'#a28bc6']] as const).map(([label,pct,current,max,color]) =>
            <div className="flyff-gauge" key={label}><b>{label}</b><span><i style={{width:pct+'%',backgroundColor:color}}/><em>{current}/{max}</em></span></div>)}

      </div>)}

      {/* SMALL MU ONLINE SKILL & 5-POWER COMBO CONFIGURATOR POPOVER */}
      {showComboPicker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-3">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto mu-scroll rounded-xl bg-[#0e131f] border-2 border-amber-700/80 p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-display text-sm font-bold text-amber-300">
                {classSkills.length} Poderes y Combo x5 ({character.classType})
              </h3>
              <button
                onClick={() => setShowComboPicker(false)}
                className="min-h-[36px] min-w-[36px] rounded bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-200">
                1. Ataque por Defecto (cuando COMBO está apagado)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {classSkills.slice(0, 10).map((sk, index) => (
                  <button
                    key={sk.id}
                    onClick={() =>
                      onUpdateComboConfig({ ...comboConfig, defaultSkillId: sk.id })
                    }
                    className={`p-2 rounded-lg border text-left text-xs cursor-pointer ${
                      comboConfig.defaultSkillId === sk.id
                        ? 'bg-amber-600/25 border-amber-500 text-amber-200 font-bold'
                        : 'bg-[#141b2b] border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2"><img alt="" className="w-7 h-7" src={`./mugroup/ui/skill-${character.classType}-${index}.webp`}/>{sk.name}</div>
                    <div className="text-[10px] text-slate-400">
                      Daño x{sk.damageMultiplier} · MP {sk.mpCost}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="text-xs font-semibold text-rose-300">
                2. Cadena de Combo (5 poderes al activar el botón COMBO)
              </div>
              {([0, 1, 2, 3, 4] as const).map((stepIdx) => (
                <div key={stepIdx} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono-tabular text-amber-300 shrink-0">
                    Paso {stepIdx + 1}:
                  </span>
                  <select
                    value={comboConfig.comboSkillIds[stepIdx] || classSkills[stepIdx + 1]?.id || classSkills[0].id}
                    onChange={(e) => cycleComboSlot(stepIdx, e.target.value)}
                    className="flex-1 min-h-[38px] rounded-lg bg-[#090d16] border border-slate-700 px-2.5 text-xs text-slate-100"
                  >
                    {classSkills.slice(0, 10).map((sk) => (
                      <option key={sk.id} value={sk.id}>
                        {sk.name} (x{sk.damageMultiplier})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowComboPicker(false)}
              className="w-full min-h-[42px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Confirmar 5 Poderes de Combo
            </button>
          </div>
        </div>
      )}
    </>
  );
};
