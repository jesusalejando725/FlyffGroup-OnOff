import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Sword,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { MU_SKILLS } from '../data/muSkillsAndClasses';
import {
  MAX_HERO_LEVEL,
  MAX_STAT_POINTS,
  TEN_CHARACTER_TABLES,
  computeHeroDamageStats,
  evaluateAchievements,
  getEffectiveSkillMultiplier,
  getSkillCooldownSec,
  getSkillRank,
  getSkillUpgradeCost,
  getVariantKey,
} from '../game/combatAndProgression';
import type { CharacterVariantKey, MuCharacter, MuItem } from '../types/game';

interface CharacterStatsModalProps {
  open: boolean;
  character: MuCharacter;
  items: MuItem[];
  ledgerCount: number;
  eventCount: number;
  skillNotice: string | null;
  onClose: () => void;
  onAllocateStat: (stat: 'str' | 'agi' | 'vit' | 'ene' | 'cmd', amount: number) => void;
  onPerformReset: () => void;
  onUpgradeSkill: (skillId: string) => void;
  onSelectSpecialization: (spec: NonNullable<MuCharacter['specialization']>) => void;
}

const SPECIALIZATION_INFO: Array<{
  id: NonNullable<MuCharacter['specialization']>;
  label: string;
  bonus: string;
}> = [
  { id: 'balanced', label: 'Equilibrado', bonus: 'Control táctico estándar y combo estable' },
  { id: 'berserk', label: 'Berserker', bonus: '+8% multiplicador de daño en todas las skills' },
  { id: 'guardian', label: 'Guardián', bonus: 'Resistencia frontal y mitigación en combate' },
  { id: 'arcane', label: 'Arcano', bonus: '+5% potencia elemental y sinergia mágica' },
];

export const CharacterStatsModal: React.FC<CharacterStatsModalProps> = ({
  open,
  character,
  items,
  ledgerCount,
  eventCount,
  skillNotice,
  onClose,
  onAllocateStat,
  onPerformReset,
  onUpgradeSkill,
  onSelectSpecialization,
}) => {
  const [tab, setTab] = useState<'stats' | 'skills' | 'tables' | 'achievements'>('stats');
  const currentVariant = getVariantKey(character.classType, character.sex ?? 'male');
  const [selectedTableKey, setSelectedTableKey] = useState<CharacterVariantKey>(currentVariant);

  if (!open) return null;

  const equipped = items.filter((i) => i.isEquipped && (i.durability ?? 100) > 0);
  const heroStats = computeHeroDamageStats(character, equipped);

  const minDmg = Math.round(heroStats.physicalPower * 0.85);
  const maxDmg = Math.round(heroStats.physicalPower * 1.15);
  const totalDef = heroStats.defense;
  const totalMagic = heroStats.magicPower;

  const statRows: Array<{
    key: 'str' | 'agi' | 'vit' | 'ene' | 'cmd';
    label: string;
    value: number;
    hint: string;
  }> = [
    { key: 'str', label: 'Fuerza (STR)', value: character.str, hint: 'Aumenta daño físico (máx 65,000)' },
    { key: 'agi', label: 'Agilidad (AGI)', value: character.agi, hint: 'Aumenta defensa, crítico y cadencia (máx 65,000)' },
    { key: 'vit', label: 'Vitalidad (VIT)', value: character.vit, hint: 'Aumenta HP (+8) y aguante frontal (máx 65,000)' },
    { key: 'ene', label: 'Energía (ENE)', value: character.ene, hint: 'Aumenta poder mágico y MP (+6) (máx 65,000)' },
    { key: 'cmd', label: 'Comando (CMD)', value: character.cmd, hint: 'Potencia ataque táctico, crítico y mascotas (máx 65,000)' },
  ];

  const classSkills = MU_SKILLS[character.classType] || MU_SKILLS.DK;
  const activeProfile =
    TEN_CHARACTER_TABLES.find((t) => t.variantKey === selectedTableKey) || TEN_CHARACTER_TABLES[0];
  const achievementEval = evaluateAchievements(character, items, ledgerCount, eventCount);
  const unlockedCount = achievementEval.progress.filter((p) => p.unlocked).length;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl bg-[#0d121d] border-2 border-amber-700/80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-[#161d2e] border-b border-amber-700/50">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-amber-400" />
            <h2 className="font-display text-sm sm:text-base font-bold text-amber-300">
              Héroe & Progresión (C) · {character.name} ({character.classType}{' '}
              {(character.sex ?? 'male') === 'female' ? 'F' : 'M'})
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar Atributos"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-[#1d2538] hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0a0e17] border-b border-slate-800 overflow-x-auto">
          <button
            onClick={() => setTab('stats')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'stats' ? 'bg-amber-600 text-slate-950' : 'bg-[#171e2e] text-slate-300 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Atributos ({character.unspentPoints})
          </button>
          <button
            onClick={() => setTab('skills')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'skills' ? 'bg-amber-600 text-slate-950' : 'bg-[#171e2e] text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Habilidades ({character.skillPoints ?? 0} pts)
          </button>
          <button
            onClick={() => setTab('tables')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'tables' ? 'bg-amber-600 text-slate-950' : 'bg-[#171e2e] text-slate-300 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Tabla 10 Héroes
          </button>
          <button
            onClick={() => setTab('achievements')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'achievements' ? 'bg-amber-600 text-slate-950' : 'bg-[#171e2e] text-slate-300 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Logros ({unlockedCount}/{achievementEval.progress.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mu-scroll p-4 space-y-3">
          {tab === 'stats' && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[#131928] border border-amber-500/40">
                <div>
                  <div className="text-xs text-slate-300 font-mono-tabular">
                    {character.classType} · Nivel {character.level}/{MAX_HERO_LEVEL} · Resets: {character.resets} · Kills {character.kills}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    XP: {character.xp} / {character.xpToNext} (+5 pts/nivel · Full a 65,000 c/u)
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onPerformReset}
                    disabled={character.level < MAX_HERO_LEVEL}
                    className={`min-h-[38px] px-3 rounded-lg font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      character.level >= MAX_HERO_LEVEL
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {character.level >= MAX_HERO_LEVEL ? 'Hacer Reset (Nv.1)' : `Reset a Nv.${MAX_HERO_LEVEL}`}
                  </button>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Puntos Libres</div>
                    <div className="text-lg font-bold font-mono-tabular text-amber-300">
                      {character.unspentPoints}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {statRows.map((row) => {
                  const pct = Math.min(100, (row.value / MAX_STAT_POINTS) * 100);
                  const isFull = row.value >= MAX_STAT_POINTS;
                  return (
                    <div
                      key={row.key}
                      className="p-2.5 rounded-lg bg-[#111624] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-100">
                          <span>{row.label}</span>
                          <span className={`font-mono-tabular ${isFull ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {row.value.toLocaleString()} / {MAX_STAT_POINTS.toLocaleString()} {isFull ? 'FULL' : ''}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded bg-slate-900 overflow-hidden">
                          <div
                            className={`h-full ${isFull ? 'bg-emerald-400' : 'bg-amber-500'}`}
                            style={{ width: `${Math.max(1, pct)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{row.hint}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {[1, 5, 50, 500].map((amt) => (
                          <button
                            key={amt}
                            onClick={() => onAllocateStat(row.key, amt)}
                            disabled={character.unspentPoints <= 0 || isFull}
                            className="min-h-[34px] px-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-35 text-slate-950 font-bold text-[11px] inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            {amt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono-tabular">
                <div className="p-2 rounded-lg bg-[#141a28] border border-slate-800">
                  <div className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                    <Sword className="w-3 h-3 text-rose-400" />
                    Ataque
                  </div>
                  <div className="text-xs font-bold text-slate-100">
                    {minDmg}~{maxDmg}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-[#141a28] border border-slate-800">
                  <div className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                    <Shield className="w-3 h-3 text-emerald-400" />
                    Defensa
                  </div>
                  <div className="text-xs font-bold text-slate-100">{totalDef}</div>
                </div>
                <div className="p-2 rounded-lg bg-[#141a28] border border-slate-800">
                  <div className="text-[10px] text-slate-400">Magia</div>
                  <div className="text-xs font-bold text-sky-300">+{totalMagic}</div>
                </div>
              </div>
            </>
          )}

          {tab === 'skills' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-[#131928] border border-amber-500/40">
                <div>
                  <div className="text-xs font-bold text-amber-300">
                    Progresión Profunda de Habilidades y Especialización
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Sube cada skill hasta Rango 10 (+8.5% daño por rango) usando Puntos de Habilidad y Zen.
                  </div>
                </div>
                <div className="text-right font-mono-tabular shrink-0">
                  <div className="text-xs text-sky-300 font-bold">
                    {character.skillPoints ?? 0} Pts Skill
                  </div>
                  <div className="text-[11px] text-amber-300">
                    {character.zen.toLocaleString()} Zen
                  </div>
                </div>
              </div>

              {skillNotice && (
                <div className="p-2.5 rounded-lg bg-sky-950/70 border border-sky-500/40 text-xs text-sky-200">
                  {skillNotice}
                </div>
              )}

              {/* Specialization selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SPECIALIZATION_INFO.map((sp) => {
                  const active = (character.specialization ?? 'balanced') === sp.id;
                  return (
                    <button
                      key={sp.id}
                      onClick={() => onSelectSpecialization(sp.id)}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                        active
                          ? 'bg-amber-600/20 border-amber-400 text-amber-200'
                          : 'bg-[#121826] border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-xs font-bold">{sp.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{sp.bonus}</div>
                    </button>
                  );
                })}
              </div>

              {/* 6 Class Skills */}
              <div className="space-y-2">
                {classSkills.map((sk) => {
                  const rank = getSkillRank(character, sk.id);
                  const effMult = getEffectiveSkillMultiplier(
                    sk.damageMultiplier,
                    rank,
                    currentVariant,
                    character.specialization,
                  );
                  const cost = getSkillUpgradeCost(rank);
                  const cd = getSkillCooldownSec(sk);
                  const canUpgrade =
                    rank < 10 && (character.skillPoints ?? 0) >= cost.skillPoints && character.zen >= cost.zenCost;
                  return (
                    <div
                      key={sk.id}
                      className="p-3 rounded-lg bg-[#111624] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-100">{sk.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono-tabular text-amber-300">
                            Rango {rank}/10
                          </span>
                          <span className="text-[10px] font-mono-tabular text-sky-300">
                            Mult x{effMult} · CD {cd}s · MP {sk.mpCost}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">{sk.description}</div>
                      </div>
                      <button
                        onClick={() => onUpgradeSkill(sk.id)}
                        disabled={!canUpgrade}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {rank >= 10
                          ? 'Rango Máximo'
                          : `Subir (${cost.skillPoints}pt · ${cost.zenCost.toLocaleString()} Zen)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'tables' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#131928] border border-amber-500/40 text-xs text-slate-300">
                Comparativa competitiva equilibrada de los <strong>10 Personajes</strong> (5 Clases × Masculino/Femenino). Todos mantienen un Índice Competitivo entre 95 y 105 con estilos tácticos propios.
              </div>

              {/* 10 Character Variant Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {TEN_CHARACTER_TABLES.map((prof) => {
                  const selected = prof.variantKey === activeProfile.variantKey;
                  const isMine = prof.variantKey === currentVariant;
                  return (
                    <button
                      key={prof.variantKey}
                      onClick={() => setSelectedTableKey(prof.variantKey)}
                      className={`p-2 rounded-lg border text-left cursor-pointer ${
                        selected
                          ? 'bg-amber-600 text-slate-950 border-amber-400 font-bold'
                          : 'bg-[#121826] border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-[11px] truncate">
                        {prof.classType} · {prof.sex === 'female' ? 'Fem' : 'Masc'} {isMine ? '★' : ''}
                      </div>
                      <div className={`text-[10px] font-mono-tabular ${selected ? 'text-slate-900' : 'text-amber-300'}`}>
                        Score {prof.competitivePowerScore}/105
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Variant Profile */}
              <div className="p-3 rounded-lg bg-[#111624] border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-amber-300">
                      {activeProfile.displayName} — {activeProfile.title}
                    </div>
                    <div className="text-[11px] text-slate-400">{activeProfile.specialty}</div>
                  </div>
                  <div className="flex items-center gap-2 font-mono-tabular text-[11px]">
                    <span className="px-2 py-1 rounded bg-slate-900 text-emerald-300">
                      Vel x{activeProfile.atkSpeedRating}
                    </span>
                    <span className="px-2 py-1 rounded bg-slate-900 text-rose-300">
                      Crit {activeProfile.critBasePct}%
                    </span>
                    <span className="px-2 py-1 rounded bg-slate-900 text-sky-300">
                      Def +{activeProfile.defenseBonusPct}%
                    </span>
                  </div>
                </div>

                {/* Beginner Stats + Basic Attack */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono-tabular">
                  <div className="p-2 rounded bg-[#0b1019] border border-slate-800 space-y-1">
                    <div className="text-amber-300 font-bold">Estadísticas Principiante (Tope 65,000 c/u)</div>
                    <div className="text-slate-200">
                      STR {activeProfile.starterStats.str} · AGI {activeProfile.starterStats.agi} · VIT{' '}
                      {activeProfile.starterStats.vit} · ENE {activeProfile.starterStats.ene} · CMD{' '}
                      {activeProfile.starterStats.cmd}
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans">Foco: {activeProfile.statFocus}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0b1019] border border-slate-800 space-y-1">
                    <div className="text-rose-300 font-bold">Ataque Principal y Armas</div>
                    <div className="text-slate-200 font-sans">{activeProfile.basicAttackName}</div>
                    <div className="text-[10px] text-sky-300 font-sans">
                      Armas: {activeProfile.weapons.join(' → ')}
                    </div>
                  </div>
                </div>

                {/* Full Clothing / Armor Pieces + Jewelry */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-[#0b1019] border border-slate-800 space-y-0.5">
                    <div className="text-emerald-300 font-bold mb-1">Ropa y Piezas de Armadura</div>
                    <div className="text-slate-300">Yelmo: <span className="text-slate-100">{activeProfile.armorPieces.helm}</span></div>
                    <div className="text-slate-300">Pechera: <span className="text-slate-100">{activeProfile.armorPieces.armor}</span></div>
                    <div className="text-slate-300">Pantalón: <span className="text-slate-100">{activeProfile.armorPieces.pants}</span></div>
                    <div className="text-slate-300">Guantes: <span className="text-slate-100">{activeProfile.armorPieces.gloves}</span></div>
                    <div className="text-slate-300">Botas: <span className="text-slate-100">{activeProfile.armorPieces.boots}</span></div>
                    <div className="text-slate-300">Escudo: <span className="text-slate-100">{activeProfile.armorPieces.shield}</span></div>
                  </div>
                  <div className="p-2 rounded bg-[#0b1019] border border-slate-800 space-y-0.5">
                    <div className="text-purple-300 font-bold mb-1">Joyería y Mascotas</div>
                    <div className="text-slate-300">Colgante: <span className="text-slate-100">{activeProfile.jewelry.pendant}</span></div>
                    <div className="text-slate-300">Anillo Izq.: <span className="text-slate-100">{activeProfile.jewelry.ring1}</span></div>
                    <div className="text-slate-300">Anillo Der.: <span className="text-slate-100">{activeProfile.jewelry.ring2}</span></div>
                    <div className="text-slate-300">Mascota: <span className="text-slate-100">{activeProfile.jewelry.pet}</span></div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono-tabular">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-1.5 pr-2">Habilidad / Poder</th>
                        <th className="py-1.5 px-2">Rol</th>
                        <th className="py-1.5 px-2">Mult</th>
                        <th className="py-1.5 px-2">CD</th>
                        <th className="py-1.5 px-2">Crit</th>
                        <th className="py-1.5 px-2">Pen.Arm</th>
                        <th className="py-1.5 pl-2 text-right">DPS Index</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeProfile.skills.map((row) => (
                        <tr key={row.skillId} className="border-b border-slate-900/80 text-slate-200">
                          <td className="py-1.5 pr-2 font-sans font-semibold">{row.name}</td>
                          <td className="py-1.5 px-2 text-slate-400 font-sans">{row.roleTag}</td>
                          <td className="py-1.5 px-2 text-amber-300">x{row.baseMultiplier}</td>
                          <td className="py-1.5 px-2">{row.cooldownSec}s</td>
                          <td className="py-1.5 px-2 text-rose-300">{row.critBonusPct}%</td>
                          <td className="py-1.5 px-2 text-sky-300">{row.armorPenPct}%</td>
                          <td className="py-1.5 pl-2 text-right text-emerald-300">{row.competitiveDpsIndex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'achievements' && (
            <div className="space-y-2.5">
              <div className="p-3 rounded-lg bg-[#131928] border border-amber-500/40 flex items-center justify-between">
                <div className="text-xs text-slate-200">
                  Logros y Maestría de {character.name}: cada hito otorga Zen, Jewel of Bless y Puntos de Habilidad automáticamente.
                </div>
                <Award className="w-5 h-5 text-amber-400 shrink-0" />
              </div>

              {achievementEval.progress.map((item) => (
                <div
                  key={item.def.id}
                  className={`p-3 rounded-lg border ${
                    item.unlocked
                      ? 'bg-emerald-950/25 border-emerald-500/40'
                      : 'bg-[#111624] border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-100 inline-flex items-center gap-1.5">
                        {item.unlocked ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        {item.def.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{item.def.description}</div>
                    </div>
                    <div className="text-right font-mono-tabular text-[10px] shrink-0">
                      <div className={item.unlocked ? 'text-emerald-300 font-bold' : 'text-amber-300'}>
                        {item.current} / {item.def.targetValue}
                      </div>
                      <div className="text-slate-400">
                        +{item.def.rewardZen.toLocaleString()} Zen · +{item.def.rewardBless} Bless · +{item.def.rewardSkillPoints} SkillPt
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded bg-slate-900 overflow-hidden">
                    <div
                      className={`h-full transition-all ${item.unlocked ? 'bg-emerald-400' : 'bg-amber-500'}`}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

