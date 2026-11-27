import { MU_CLASSES, MU_SKILLS } from '../data/muSkillsAndClasses';
import type {
  ActiveEffect,
  AsyncDuelChallenge,
  AsyncDuelRecord,
  CharacterVariantKey,
  HeroClass,
  MuCharacter,
  MuItem,
  SkillDef,
  TransportMode,
} from '../types/game';

export const MAX_HERO_LEVEL = 99;
export const MAX_STAT_POINTS = 65000;
export const POINTS_PER_LEVEL = 7;

export interface CharacterTableSkillEntry {
  skillId: string;
  name: string;
  roleTag: string;
  baseMultiplier: number;
  cooldownSec: number;
  critBonusPct: number;
  armorPenPct: number;
  competitiveDpsIndex: number;
}

export interface CharacterTableProfile {
  variantKey: CharacterVariantKey;
  classType: HeroClass;
  sex: 'male' | 'female';
  displayName: string;
  title: string;
  specialty: string;
  competitivePowerScore: number;
  atkSpeedRating: number;
  critBasePct: number;
  defenseBonusPct: number;
  starterStats: { str: number; agi: number; vit: number; ene: number; cmd: number };
  statFocus: string;
  basicAttackName: string;
  weapons: string[];
  armorPieces: {
    helm: string;
    armor: string;
    pants: string;
    gloves: string;
    boots: string;
    shield: string;
  };
  jewelry: {
    pendant: string;
    ring1: string;
    ring2: string;
    pet: string;
  };
  skills: CharacterTableSkillEntry[];
  atkWeight: { str: number; agi: number; vit: number; ene: number; cmd: number };
  defWeight: { agi: number; vit: number; str: number };
}

function buildTableSkills(classType: HeroClass, atkSpeedRating: number, critBonus: number): CharacterTableSkillEntry[] {
  const skills = MU_SKILLS[classType] || MU_SKILLS.DK;
  return skills.map((sk, idx) => ({
    skillId: sk.id,
    name: sk.name,
    roleTag: sk.isBuff ? 'Buff / Aura' : idx === 0 ? 'Básico' : idx >= 5 ? 'Definitiva' : 'Habilidad',
    baseMultiplier: sk.damageMultiplier,
    cooldownSec: sk.cooldownSec ?? 1.0,
    critBonusPct: critBonus + idx * 2,
    armorPenPct: idx >= 2 ? 12 + idx * 4 : 6,
    competitiveDpsIndex: Math.round((sk.damageMultiplier * 42 + atkSpeedRating * 14 + critBonus) * (sk.isBuff ? 0.85 : 1)),
  }));
}

export const TEN_CHARACTER_TABLES: CharacterTableProfile[] = [
  {
    variantKey: 'DK_male',
    classType: 'DK',
    sex: 'male',
    displayName: 'Blade Knight (Masculino)',
    title: 'Caballero de Vanguardia',
    specialty: 'ATK = STR×1.45 + AGI×0.35 · Combo pesado y aguante frontal.',
    competitivePowerScore: 102,
    atkSpeedRating: 1.05,
    critBasePct: 8,
    defenseBonusPct: 12,
    starterStats: { str: 28, agi: 20, vit: 25, ene: 10, cmd: 10 },
    statFocus: 'STR 60% · AGI 25% · VIT 15%',
    basicAttackName: 'Corte de Espada',
    weapons: ['Espada del Dragón', 'Espada Great Dragon', 'Bone Blade'],
    armorPieces: { helm: 'Yelmo Dragon', armor: 'Pechera Dragon', pants: 'Pantalón Dragon', gloves: 'Guantes Dragon', boots: 'Botas Dragon', shield: 'Escudo Dragón' },
    jewelry: { pendant: 'Colgante de Rayo', ring1: 'Anillo de Fuego', ring2: 'Anillo de Hielo', pet: 'Imp Demoníaco' },
    skills: buildTableSkills('DK', 1.05, 8),
    atkWeight: { str: 1.45, agi: 0.35, vit: 0.1, ene: 0.1, cmd: 0.05 },
    defWeight: { agi: 0.55, vit: 0.35, str: 0.1 },
  },
  {
    variantKey: 'DK_female',
    classType: 'DK',
    sex: 'female',
    displayName: 'Blade Knight (Femenino)',
    title: 'Caballera Carmesí',
    specialty: 'ATK = STR×1.40 + AGI×0.42 · Mayor cadencia crítica en combo.',
    competitivePowerScore: 101,
    atkSpeedRating: 1.12,
    critBasePct: 10,
    defenseBonusPct: 10,
    starterStats: { str: 26, agi: 24, vit: 23, ene: 10, cmd: 10 },
    statFocus: 'STR 55% · AGI 30% · VIT 15%',
    basicAttackName: 'Corte de Espada',
    weapons: ['Espada del Dragón', 'Espada Crystal', 'Daybreak'],
    armorPieces: { helm: 'Yelmo Brass', armor: 'Pechera Brass', pants: 'Pantalón Brass', gloves: 'Guantes Brass', boots: 'Botas Brass', shield: 'Escudo Dragón' },
    jewelry: { pendant: 'Colgante de Habilidad', ring1: 'Anillo de Viento', ring2: 'Anillo de Tierra', pet: 'Dinorant' },
    skills: buildTableSkills('DK', 1.12, 10),
    atkWeight: { str: 1.4, agi: 0.42, vit: 0.1, ene: 0.1, cmd: 0.05 },
    defWeight: { agi: 0.58, vit: 0.32, str: 0.1 },
  },
  {
    variantKey: 'DW_male',
    classType: 'DW',
    sex: 'male',
    displayName: 'Soul Master (Masculino)',
    title: 'Archimago Elemental',
    specialty: 'MAG = ENE×1.55 + AGI×0.25 · Meteoro y Soul Barrier a distancia.',
    competitivePowerScore: 100,
    atkSpeedRating: 1.08,
    critBasePct: 9,
    defenseBonusPct: 8,
    starterStats: { str: 18, agi: 18, vit: 18, ene: 35, cmd: 10 },
    statFocus: 'ENE 65% · AGI 25% · VIT 10%',
    basicAttackName: 'Bola de Energía',
    weapons: ['Báculo Legendario', 'Báculo Kundun', 'Grand Viper Staff'],
    armorPieces: { helm: 'Yelmo Legendary', armor: 'Pechera Legendary', pants: 'Pantalón Legendary', gloves: 'Guantes Legendary', boots: 'Botas Legendary', shield: 'Escudo Legendario' },
    jewelry: { pendant: 'Colgante de Magia', ring1: 'Anillo de Veneno', ring2: 'Anillo de Hielo', pet: 'Ángel Guardián' },
    skills: buildTableSkills('DW', 1.08, 9),
    atkWeight: { str: 0.2, agi: 0.25, vit: 0.05, ene: 1.55, cmd: 0.05 },
    defWeight: { agi: 0.5, vit: 0.28, str: 0.05 },
  },
  {
    variantKey: 'DW_female',
    classType: 'DW',
    sex: 'female',
    displayName: 'Soul Master (Femenino)',
    title: 'Hechicera Astral',
    specialty: 'MAG = ENE×1.58 + AGI×0.28 · Ventisca y regeneración veloz.',
    competitivePowerScore: 101,
    atkSpeedRating: 1.14,
    critBasePct: 10,
    defenseBonusPct: 8,
    starterStats: { str: 16, agi: 20, vit: 18, ene: 36, cmd: 10 },
    statFocus: 'ENE 65% · AGI 25% · VIT 10%',
    basicAttackName: 'Bola de Energía',
    weapons: ['Báculo Legendario', 'Báculo Platina', 'Báculo Dark Soul'],
    armorPieces: { helm: 'Yelmo Grand Soul', armor: 'Pechera Grand Soul', pants: 'Pantalón Grand Soul', gloves: 'Guantes Grand Soul', boots: 'Botas Grand Soul', shield: 'Escudo Legendario' },
    jewelry: { pendant: 'Colgante de Agua', ring1: 'Anillo de Hielo', ring2: 'Anillo de Magia', pet: 'Unicornio' },
    skills: buildTableSkills('DW', 1.14, 10),
    atkWeight: { str: 0.18, agi: 0.28, vit: 0.05, ene: 1.58, cmd: 0.05 },
    defWeight: { agi: 0.52, vit: 0.28, str: 0.05 },
  },
  {
    variantKey: 'ELF_male',
    classType: 'ELF',
    sex: 'male',
    displayName: 'Muse Elf (Masculino)',
    title: 'Cazador Silvano',
    specialty: 'ATK = AGI×1.38 + STR×0.38 · Alta evasión y flecha perforante.',
    competitivePowerScore: 99,
    atkSpeedRating: 1.18,
    critBasePct: 12,
    defenseBonusPct: 9,
    starterStats: { str: 20, agi: 32, vit: 20, ene: 22, cmd: 10 },
    statFocus: 'AGI 65% · ENE 20% · STR 15%',
    basicAttackName: 'Tiro Élfico',
    weapons: ['Arco Celestial', 'Ballesta Aquagold', 'Arco Viper'],
    armorPieces: { helm: 'Yelmo Guardian', armor: 'Pechera Guardian', pants: 'Pantalón Guardian', gloves: 'Guantes Guardian', boots: 'Botas Guardian', shield: 'Escudo Legendario' },
    jewelry: { pendant: 'Colgante de Viento', ring1: 'Anillo de Viento', ring2: 'Anillo de Fuego', pet: 'Demonio' },
    skills: buildTableSkills('ELF', 1.18, 12),
    atkWeight: { str: 0.38, agi: 1.38, vit: 0.08, ene: 0.3, cmd: 0.05 },
    defWeight: { agi: 0.62, vit: 0.24, str: 0.06 },
  },
  {
    variantKey: 'ELF_female',
    classType: 'ELF',
    sex: 'female',
    displayName: 'Muse Elf (Femenino)',
    title: 'Arquera de Noria',
    specialty: 'ATK = AGI×1.40 + ENE×0.36 · Lluvia de flechas y aura curativa.',
    competitivePowerScore: 100,
    atkSpeedRating: 1.2,
    critBasePct: 13,
    defenseBonusPct: 9,
    starterStats: { str: 18, agi: 34, vit: 20, ene: 24, cmd: 10 },
    statFocus: 'AGI 60% · ENE 25% · VIT 15%',
    basicAttackName: 'Tiro Élfico',
    weapons: ['Arco Celestial', 'Arco Saint', 'Sylph Wind Bow'],
    armorPieces: { helm: 'Yelmo Red Spirit', armor: 'Pechera Red Spirit', pants: 'Pantalón Red Spirit', gloves: 'Guantes Red Spirit', boots: 'Botas Red Spirit', shield: 'Escudo Legendario' },
    jewelry: { pendant: 'Colgante de Vida', ring1: 'Anillo de Hielo', ring2: 'Anillo de Viento', pet: 'Hada Guardiana' },
    skills: buildTableSkills('ELF', 1.2, 13),
    atkWeight: { str: 0.35, agi: 1.4, vit: 0.08, ene: 0.36, cmd: 0.05 },
    defWeight: { agi: 0.64, vit: 0.24, str: 0.06 },
  },
  {
    variantKey: 'DL_male',
    classType: 'DL',
    sex: 'male',
    displayName: 'Dark Lord (Masculino)',
    title: 'Emperador Oscuro',
    specialty: 'ATK = STR×1.05 + CMD×0.85 + ENE×0.45 · Crítico imperial.',
    competitivePowerScore: 104,
    atkSpeedRating: 1.06,
    critBasePct: 14,
    defenseBonusPct: 11,
    starterStats: { str: 26, agi: 20, vit: 22, ene: 20, cmd: 28 },
    statFocus: 'STR 40% · CMD 30% · ENE 15% · AGI 15%',
    basicAttackName: 'Golpe de Cetro',
    weapons: ['Cetro del Señor Oscuro', 'Cetro Great Lord', 'Soleil Scepter'],
    armorPieces: { helm: 'Yelmo Dark Steel', armor: 'Pechera Dark Steel', pants: 'Pantalón Dark Steel', gloves: 'Guantes Dark Steel', boots: 'Botas Dark Steel', shield: 'Escudo de Hierro Oscuro' },
    jewelry: { pendant: 'Colgante de Fuego', ring1: 'Anillo de Tierra', ring2: 'Anillo de Fuego', pet: 'Caballo Oscuro' },
    skills: buildTableSkills('DL', 1.06, 14),
    atkWeight: { str: 1.05, agi: 0.28, vit: 0.1, ene: 0.45, cmd: 0.85 },
    defWeight: { agi: 0.5, vit: 0.35, str: 0.12 },
  },
  {
    variantKey: 'DL_female',
    classType: 'DL',
    sex: 'female',
    displayName: 'Dark Lord (Femenino)',
    title: 'Soberana de Ceniza',
    specialty: 'ATK = STR×1.00 + CMD×0.90 + ENE×0.48 · Fénix de fuego oscuro.',
    competitivePowerScore: 103,
    atkSpeedRating: 1.09,
    critBasePct: 15,
    defenseBonusPct: 11,
    starterStats: { str: 24, agi: 22, vit: 22, ene: 22, cmd: 30 },
    statFocus: 'CMD 35% · STR 35% · ENE 15% · AGI 15%',
    basicAttackName: 'Golpe de Cetro',
    weapons: ['Cetro del Señor Oscuro', 'Cetro Lord', 'Sunlight Scepter'],
    armorPieces: { helm: 'Yelmo Dark Master', armor: 'Pechera Dark Master', pants: 'Pantalón Dark Master', gloves: 'Guantes Dark Master', boots: 'Botas Dark Master', shield: 'Escudo de Hierro Oscuro' },
    jewelry: { pendant: 'Colgante Oscuro', ring1: 'Anillo de Rayo', ring2: 'Anillo de Veneno', pet: 'Cuervo Oscuro' },
    skills: buildTableSkills('DL', 1.09, 15),
    atkWeight: { str: 1.0, agi: 0.3, vit: 0.1, ene: 0.48, cmd: 0.9 },
    defWeight: { agi: 0.52, vit: 0.33, str: 0.1 },
  },
  {
    variantKey: 'MG_male',
    classType: 'MG',
    sex: 'male',
    displayName: 'Magic Gladiator (Masculino)',
    title: 'Gladiador Rúnico',
    specialty: 'ATK = STR×1.10 + ENE×1.05 + AGI×0.30 · Híbrido dual letal.',
    competitivePowerScore: 103,
    atkSpeedRating: 1.13,
    critBasePct: 11,
    defenseBonusPct: 10,
    starterStats: { str: 26, agi: 24, vit: 22, ene: 26, cmd: 12 },
    statFocus: 'STR 40% · ENE 35% · AGI 25%',
    basicAttackName: 'Sword Wind',
    weapons: ['Espada Rúnica', 'Dark Reign Blade', 'Explosion Blade'],
    armorPieces: { helm: 'Yelmo Hurricane', armor: 'Pechera Hurricane', pants: 'Pantalón Hurricane', gloves: 'Guantes Hurricane', boots: 'Botas Hurricane', shield: 'Escudo de Hierro Oscuro' },
    jewelry: { pendant: 'Colgante de Rayo', ring1: 'Anillo de Fuego', ring2: 'Anillo de Hielo', pet: 'Rudolph' },
    skills: buildTableSkills('MG', 1.13, 11),
    atkWeight: { str: 1.1, agi: 0.3, vit: 0.08, ene: 1.05, cmd: 0.05 },
    defWeight: { agi: 0.52, vit: 0.3, str: 0.12 },
  },
  {
    variantKey: 'MG_female',
    classType: 'MG',
    sex: 'female',
    displayName: 'Magic Gladiator (Femenino)',
    title: 'Gladiadora Arcana',
    specialty: 'ATK = STR×1.05 + ENE×1.12 + AGI×0.32 · Relámpago y tajo rúnico.',
    competitivePowerScore: 102,
    atkSpeedRating: 1.16,
    critBasePct: 12,
    defenseBonusPct: 9,
    starterStats: { str: 24, agi: 26, vit: 21, ene: 28, cmd: 12 },
    statFocus: 'ENE 40% · STR 35% · AGI 25%',
    basicAttackName: 'Sword Wind',
    weapons: ['Espada Rúnica', 'Rune Bastard Sword', 'Imperial Blade'],
    armorPieces: { helm: 'Yelmo Volcano', armor: 'Pechera Volcano', pants: 'Pantalón Volcano', gloves: 'Guantes Volcano', boots: 'Botas Volcano', shield: 'Escudo de Hierro Oscuro' },
    jewelry: { pendant: 'Colgante Arcano', ring1: 'Anillo de Viento', ring2: 'Anillo de Magia', pet: 'Esqueleto Panda' },
    skills: buildTableSkills('MG', 1.16, 12),
    atkWeight: { str: 1.05, agi: 0.32, vit: 0.08, ene: 1.12, cmd: 0.05 },
    defWeight: { agi: 0.54, vit: 0.28, str: 0.1 },
  },
];

export function getVariantKey(classType: HeroClass, sex: 'male' | 'female' = 'male'): CharacterVariantKey {
  return `${classType}_${sex}` as CharacterVariantKey;
}

export function getXpRequiredForLevel(level: number): number {
  const safeLvl = Math.max(1, Math.floor(level));
  return Math.round(120 + safeLvl * safeLvl * 26 + safeLvl * 45);
}

export function getSkillRank(character: MuCharacter, skillId: string): number {
  return Math.max(1, Math.min(10, Number(character.skillRanks?.[skillId] ?? 1)));
}

export function getSkillCooldownSec(skill: SkillDef): number {
  if (typeof skill.cooldownSec === 'number') return skill.cooldownSec;
  if (skill.isBuff) return 4.0;
  return skill.mpCost <= 0 ? 0.2 : Number(Math.max(0.7, skill.damageMultiplier * 0.65).toFixed(2));
}

export function getSkillUpgradeCost(currentRank: number): { skillPoints: number; zenCost: number } {
  const r = Math.max(1, currentRank);
  return {
    skillPoints: 1,
    zenCost: r * 1200,
  };
}

export function getEffectiveSkillMultiplier(
  baseMultiplierOrSkill: number | SkillDef,
  rankOrCharacter: number | MuCharacter,
  _variantKey?: CharacterVariantKey,
  specialization?: MuCharacter['specialization'],
): number {
  const baseMult = typeof baseMultiplierOrSkill === 'number' ? baseMultiplierOrSkill : baseMultiplierOrSkill.damageMultiplier;
  const rank = typeof rankOrCharacter === 'number' ? rankOrCharacter : getSkillRank(rankOrCharacter, (baseMultiplierOrSkill as SkillDef).id);
  const spec = specialization ?? (typeof rankOrCharacter === 'object' ? rankOrCharacter.specialization : undefined) ?? 'balanced';
  const rankBonus = 1 + (Math.max(1, rank) - 1) * 0.085;
  const specBonus = spec === 'berserk' ? 1.08 : spec === 'arcane' ? 1.05 : 1.0;
  return Number((baseMult * rankBonus * specBonus).toFixed(2));
}

export function computeHeroDamageStats(
  character: MuCharacter,
  items: MuItem[],
): {
  physicalPower: number;
  magicPower: number;
  defense: number;
  avgAttack: number;
  critPct: number;
  powerScore: number;
} {
  const variant = getVariantKey(character.classType, character.sex ?? 'male');
  const profile = TEN_CHARACTER_TABLES.find((t) => t.variantKey === variant) || TEN_CHARACTER_TABLES[0];
  const equipped = items.filter((i) => i.isEquipped && (i.durability ?? 100) > 0);

  let eqMin = 0;
  let eqMax = 0;
  let eqMagic = 0;
  let eqDef = 0;
  let luckCount = 0;

  for (const it of equipped) {
    const enhScale = 1 + it.enhanceLevel * 0.06;
    const rarityScale = it.rarity === 'ancient' ? 1.25 : it.rarity === 'excellent' ? 1.15 : 1.0;
    eqMin += Math.round(it.minDmg * enhScale * rarityScale);
    eqMax += Math.round(it.maxDmg * enhScale * rarityScale);
    eqMagic += Math.round(it.magicPower * enhScale * rarityScale);
    eqDef += Math.round(it.defense * enhScale * rarityScale);
    if (it.luck) luckCount += 1;
  }

  const statPhysical = Math.round(
    character.str * profile.atkWeight.str +
      character.agi * profile.atkWeight.agi +
      character.cmd * profile.atkWeight.cmd +
      character.level * 2.2 +
      character.resets * 18,
  );
  const statMagic = Math.round(
    character.ene * profile.atkWeight.ene +
      character.cmd * 0.25 +
      character.level * 2.0 +
      character.resets * 16,
  );
  const statDefense = Math.round(
    character.agi * profile.defWeight.agi +
      character.vit * profile.defWeight.vit +
      character.str * profile.defWeight.str +
      character.level * 1.4 +
      character.resets * 12,
  );

  const physicalPower = Math.max(12, statPhysical + Math.round((eqMin + eqMax) * 0.5));
  const magicPower = Math.max(10, statMagic + eqMagic);
  const defense = Math.max(10, statDefense + eqDef);

  const primaryAtk =
    character.classType === 'DW'
      ? magicPower
      : character.classType === 'MG'
        ? Math.round((physicalPower + magicPower) * 0.62)
        : Math.round(physicalPower + magicPower * 0.25);

  const critPct = Math.min(
    65,
    Math.round(profile.critBasePct + character.agi * 0.04 + character.cmd * 0.03 + luckCount * 3),
  );
  const avgAttack = Math.max(14, primaryAtk);
  const powerScore = Math.round(avgAttack * 2.4 + defense * 1.8 + character.maxHp * 0.25 + character.resets * 220);

  return {
    physicalPower,
    magicPower,
    defense,
    avgAttack,
    critPct,
    powerScore,
  };
}

export function computeHeroDefenseMitigation(
  rawDamage: number,
  isCrit: boolean,
  character: MuCharacter,
  items: MuItem[],
): { finalDamage: number; mitigated: number } {
  const { defense } = computeHeroDamageStats(character, items);
  const specBonus = character.specialization === 'guardian' ? 1.18 : 1.0;
  const effectiveDef = defense * specBonus;
  const incoming = isCrit ? rawDamage * 1.35 : rawDamage;
  const mitigationRatio = Math.min(0.75, effectiveDef / (effectiveDef + 140));
  const finalDamage = Math.max(1, Math.round(incoming * (1 - mitigationRatio)));
  return {
    finalDamage,
    mitigated: Math.max(0, Math.round(incoming - finalDamage)),
  };
}

export function createSkillBuffEffect(skill: SkillDef, rank: number): ActiveEffect {
  const duration = 18 + (rank - 1) * 3;
  return {
    id: `buff-${skill.id}`,
    name: `${skill.shortName} Nv.${rank}`,
    kind: 'buff',
    statHint: `+${10 + rank * 3}% ATK / +${8 + rank * 2}% Vel`,
    color: skill.colorHex,
    remainingSec: duration,
    totalSec: duration,
  };
}

export function aggregateActiveEffects(effects: ActiveEffect[]): {
  atkBonusPct: number;
  speedBonusPct: number;
  critBonusPct: number;
} {
  let atkBonusPct = 0;
  let speedBonusPct = 0;
  let critBonusPct = 0;
  for (const eff of effects) {
    if (eff.kind === 'buff') {
      atkBonusPct += 14;
      speedBonusPct += 10;
      critBonusPct += 6;
    } else {
      atkBonusPct -= 5;
      speedBonusPct -= 8;
    }
  }
  return { atkBonusPct, speedBonusPct, critBonusPct };
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  targetValue: number;
  rewardZen: number;
  rewardBless: number;
  rewardSkillPoints: number;
  currentValue: (c: MuCharacter, items: MuItem[], ledgerCount: number, eventCount: number) => number;
}

export const MU_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach_first_kills',
    title: 'Guerrero de Madrigal',
    description: 'Derrota 10 monstruos en cualquier mapa',
    targetValue: 10,
    rewardZen: 2000,
    rewardBless: 1,
    rewardSkillPoints: 1,
    currentValue: (c) => Math.min(10, c.kills),
  },
  {
    id: 'ach_level_25',
    title: 'Veterano Nivel 25',
    description: 'Alcanza el nivel 25 con tu héroe',
    targetValue: 25,
    rewardZen: 5000,
    rewardBless: 2,
    rewardSkillPoints: 1,
    currentValue: (c) => (c.resets > 0 ? 25 : Math.min(25, c.level)),
  },
  {
    id: 'ach_forge_9',
    title: 'Maestro Herrero +9',
    description: 'Forja cualquier pieza de equipo hasta +9 o superior',
    targetValue: 9,
    rewardZen: 7000,
    rewardBless: 2,
    rewardSkillPoints: 1,
    currentValue: (_c, items) => Math.min(9, Math.max(0, ...items.map((i) => i.enhanceLevel))),
  },
  {
    id: 'ach_wings',
    title: 'Portador de Alas',
    description: 'Consigue y equipa unas Alas o Capa en el paper-doll',
    targetValue: 1,
    rewardZen: 6000,
    rewardBless: 1,
    rewardSkillPoints: 1,
    currentValue: (_c, items) => (items.some((i) => i.slot === 'wings') ? 1 : 0),
  },
  {
    id: 'ach_sync_social',
    title: 'Hermandad Local / Duelos',
    description: 'Completa 1 intercambio, evento cooperativo o duelo asíncrono',
    targetValue: 1,
    rewardZen: 4500,
    rewardBless: 1,
    rewardSkillPoints: 1,
    currentValue: (c, _items, ledgerCount, eventCount) =>
      Math.min(1, ledgerCount + eventCount + (c.duelWins ?? 0)),
  },
  {
    id: 'ach_first_reset',
    title: 'Renacimiento (1er Reset)',
    description: 'Completa un Reset al alcanzar el nivel 99',
    targetValue: 1,
    rewardZen: 15000,
    rewardBless: 4,
    rewardSkillPoints: 3,
    currentValue: (c) => Math.min(1, c.resets),
  },
];

export function evaluateAchievements(
  character: MuCharacter,
  items: MuItem[],
  ledgerCount: number,
  eventCount: number,
): {
  newlyUnlocked: AchievementDef[];
  progress: Array<{ def: AchievementDef; unlocked: boolean; current: number; pct: number }>;
} {
  const already = new Set(character.unlockedAchievements || []);
  const newlyUnlocked: AchievementDef[] = [];
  const progress: Array<{ def: AchievementDef; unlocked: boolean; current: number; pct: number }> = [];

  for (const def of MU_ACHIEVEMENTS) {
    const current = def.currentValue(character, items, ledgerCount, eventCount);
    const unlocked = already.has(def.id) || current >= def.targetValue;
    const pct = Math.min(100, Math.round(((unlocked ? def.targetValue : current) / Math.max(1, def.targetValue)) * 100));
    if (unlocked && !already.has(def.id)) {
      newlyUnlocked.push(def);
    }
    progress.push({ def, unlocked, current: unlocked ? def.targetValue : current, pct });
  }

  return { newlyUnlocked, progress };
}

export function buildAsyncDuelChallenge(
  character: MuCharacter,
  items: MuItem[],
  transport: TransportMode,
): AsyncDuelChallenge {
  const stats = computeHeroDamageStats(character, items);
  const wpn = items.find((i) => i.slot === 'weapon' && i.isEquipped);
  const arm = items.find((i) => i.slot === 'armor' && i.isEquipped);
  const clsName = MU_CLASSES.find((c) => c.id === character.classType)?.name || character.classType;
  const skillCount = (MU_SKILLS[character.classType] || []).length;

  return {
    id: `duel-${character.id}-${Date.now().toString(36)}`,
    challengerName: character.name,
    classType: character.classType,
    sex: character.sex ?? 'male',
    level: character.level,
    resets: character.resets,
    powerScore: stats.powerScore + skillCount * 10,
    attackPower: stats.avgAttack,
    defensePower: stats.defense,
    critPct: stats.critPct,
    maxHp: character.maxHp,
    transport,
    createdAt: new Date().toISOString(),
    equippedSummary: `${clsName} · ${wpn?.name || 'Arma'} +${wpn?.enhanceLevel ?? 0} · ${arm?.setName || 'Set'}`,
  };
}

export function encodeDuelToken(challenge: AsyncDuelChallenge): string {
  const json = JSON.stringify(challenge);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return `MUDUEL1:${btoa(bin)}`;
}

export function decodeDuelToken(token: string): AsyncDuelChallenge | null {
  try {
    const clean = token.trim();
    if (!clean.startsWith('MUDUEL1:')) return null;
    const b64 = clean.slice('MUDUEL1:'.length);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as AsyncDuelChallenge;
    if (!parsed?.challengerName || !parsed?.classType) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveAsyncDuel(
  mine: AsyncDuelChallenge,
  opponent: AsyncDuelChallenge,
  transport: TransportMode,
): AsyncDuelRecord {
  let myHp = Math.max(200, mine.maxHp);
  let oppHp = Math.max(200, opponent.maxHp);
  let rounds = 0;

  while (myHp > 0 && oppHp > 0 && rounds < 20) {
    rounds += 1;
    const myCrit = ((rounds * 17 + mine.critPct) % 100) < mine.critPct ? 1.5 : 1.0;
    const myDmg = Math.max(12, Math.round(mine.attackPower * myCrit - opponent.defensePower * 0.35));
    oppHp -= myDmg;
    if (oppHp <= 0) break;

    const oppCrit = ((rounds * 23 + opponent.critPct) % 100) < opponent.critPct ? 1.5 : 1.0;
    const oppDmg = Math.max(10, Math.round(opponent.attackPower * oppCrit - mine.defensePower * 0.35));
    myHp -= oppDmg;
  }

  const won = oppHp <= 0 || (myHp > 0 && mine.powerScore >= opponent.powerScore);
  const rewardZen = won ? 3500 + opponent.level * 80 : 1200 + opponent.level * 25;

  return {
    id: `drec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    challengerName: mine.challengerName,
    opponentName: opponent.challengerName,
    opponentClass: opponent.classType,
    opponentLevel: opponent.level,
    myPowerScore: mine.powerScore,
    opponentPowerScore: opponent.powerScore,
    won,
    rounds,
    rewardZen,
    transport,
    summary: won
      ? `Victoria contra ${opponent.challengerName} (${opponent.classType} Nv.${opponent.level}) en ${rounds} rondas`
      : `Derrota cerrada ante ${opponent.challengerName} (${opponent.classType} Nv.${opponent.level}) tras ${rounds} rondas`,
    createdAt: new Date().toISOString(),
  };
}
