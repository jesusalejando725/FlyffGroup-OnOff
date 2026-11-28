import { MU_MAPS } from '../data/muWorldData';
import { MU_CLASSES, MU_SKILLS } from '../data/muSkillsAndClasses';
import type { BuildAnalysisResult, HeroClass, MuCharacter, MuItem } from '../types/game';

interface OfflineChatContext {
  name: string;
  classType: HeroClass;
  level: number;
  zen: number;
  bless: number;
  soul: number;
  equippedItems: string[];
  sharedCount: number;
}

const CLASS_TIPS: Record<HeroClass, { role: string; primaryStat: string; keySkill: string }> = {
  DK: {
    role: 'Guerrero Blade / Slayer + Ranger Crackshooter',
    primaryStat: 'STR y AGI (con VIT para resistir jefes)',
    keySkill: 'Blade Twisting + Estocada Perforante + Lluvia de Flechas',
  },
  DW: {
    role: 'Mago Psykeeper / Mentalist Arcano',
    primaryStat: 'ENE al máximo (y AGI para velocidad de conjuro)',
    keySkill: 'Psionic Bomb, Demonología Oscura y Crisis Máxima',
  },
  MG: {
    role: 'Magic Gladiador Híbrido (Blade Slayer + Elementor Arcanist)',
    primaryStat: 'Equilibrio STR + ENE + AGI',
    keySkill: 'Power Slash Eléctrico, Tormenta de Rayos y Espiral Ígnea',
  },
  DL: {
    role: 'Dark Lord Imperial (Jester / Harlequin)',
    primaryStat: 'STR + CMD (Comando para invocaciones) + AGI',
    keySkill: 'Yoyo Crítico del Arlequín, Caos Oscuro y Temblor Real',
  },
  ELF: {
    role: 'Elfa Guardiana (Knight Templar + Ringmaster Seraph)',
    primaryStat: 'AGI (daño y evasión) + ENE (curas y auras)',
    keySkill: 'Guardia Templaria, Bendición Seraph y Tajo Sagrado',
  },
};

export function generateOfflineBuildAnalysis(
  character: MuCharacter,
  items: MuItem[],
  ledgerCount: number,
): BuildAnalysisResult {
  const equipped = items.filter((i) => i.isEquipped);
  const weapon = equipped.find((i) => i.slot === 'weapon');
  const wings = equipped.find((i) => i.slot === 'wings');
  const avgEnh =
    equipped.length > 0
      ? Math.round((equipped.reduce((acc, it) => acc + (it.enhanceLevel || 0), 0) / equipped.length) * 10) / 10
      : 0;
  const tip = CLASS_TIPS[character.classType];
  const recommendedMap =
    MU_MAPS.find((m) => character.level >= m.minLevel && character.level <= m.maxLevel) ?? MU_MAPS[0];

  const rating =
    avgEnh >= 13
      ? 'Leyenda (+13~+15 Radiante)'
      : avgEnh >= 9
        ? 'Élite Dorada (+9~+12)'
        : avgEnh >= 6
          ? 'Veterano (+6~+8)'
          : 'Aprendiz de MuGro-up\'';

  const upgradePriority = !weapon
    ? 'Equipa un arma de tu clase primero en la Herrería de la capital.'
    : weapon.enhanceLevel < 6
      ? `Usa Jewel of Bless en ${weapon.name} (actual +${weapon.enhanceLevel}) hasta alcanzar +6.`
      : weapon.enhanceLevel < 13
        ? `Aplica Jewel of Soul sobre ${weapon.name} (+${weapon.enhanceLevel}) hasta +9; después combina Bless, Soul y Life hasta +13.`
        : `${weapon.name} está en +${weapon.enhanceLevel}. Prioriza subir armadura, alas y anillos a +${Math.min(15, weapon.enhanceLevel)}.`;

  const statAdvice = `Prioriza ${tip.primaryStat}. Tienes ${character.unspentPoints} pts libres · STR:${character.str} AGI:${character.agi} VIT:${character.vit} ENE:${character.ene} CMD:${character.cmd}.`;

  const eventReadiness =
    character.level >= 75 && wings
      ? `Listo para Cráter de Ceniza y Jefes Supremos (Mapa ideal ahora: ${recommendedMap.name}).`
      : `Zona recomendada: ${recommendedMap.name} (Nv.${recommendedMap.minLevel}-${recommendedMap.maxLevel}). Su zona segura se extiende ${recommendedMap.cityRadius} m desde el centro.`;

  const recommendations = [
    `Raza ${MU_CLASSES.find((c) => c.id === character.classType)?.name ?? character.classType}: combina ${tip.keySkill}.`,
    `Joyas disponibles: ${character.bless} Bless · ${character.soul} Soul · ${character.life} Life.`,
    wings
      ? `Alas equipadas (${wings.name}): mantienes velocidad 1.0x estable con aura y luz dinámica.`
      : 'Forja tus Alas en el Duende del Caos para ganar absorción de daño y aura visual.',
    `Intercambios P2P registrados: ${ledgerCount}. Al reconectar internet se sincronizan automáticamente con la nube.`,
  ];

  return {
    combatRating: rating,
    upgradePriority,
    statAdvice,
    eventReadiness,
    recommendations,
  };
}

export function generateOfflineOracleReply(
  message: string,
  playerContext: OfflineChatContext,
): string {
  const q = message.toLowerCase();
  const tip = CLASS_TIPS[playerContext.classType] || CLASS_TIPS.DK;
  const classSkills = MU_SKILLS[playerContext.classType] || [];
  const recommendedMap =
    MU_MAPS.find((m) => playerContext.level >= m.minLevel && playerContext.level <= m.maxLevel) ??
    MU_MAPS[0];

  if (q.includes('bless') || q.includes('soul') || q.includes('forja') || q.includes('sub') || q.includes('joya') || q.includes('13') || q.includes('15')) {
    return [
      `[Oráculo Offline · MuGro-up'] Consejo de Forja para ${playerContext.name} (${playerContext.classType} Nv.${playerContext.level}):`,
      `• Tienes ${playerContext.bless} Jewel of Bless y ${playerContext.soul} Jewel of Soul.`,
      `• +0 a +6: usa Jewel of Bless.`,
      `• +7 a +9: usa Jewel of Soul (añade brillo de aura por nivel).`,
      `• +10 a +13: combina Bless, Soul y Life en tu mochila. Para +14/+15 usa Harmony.`,
      `• Prioriza tu arma equipada antes que guantes o botas.`,
    ].join('\n');
  }

  if (q.includes('stat') || q.includes('punto') || q.includes('str') || q.includes('agi') || q.includes('ene') || q.includes('vit')) {
    return [
      `[Oráculo Offline · MuGro-up'] Distribución recomendada para ${tip.role}:`,
      `• Atributos clave: ${tip.primaryStat}.`,
      `• Poderes exclusivos de tu raza: ${classSkills.slice(0, 5).map((s) => s.name).join(', ')}.`,
      `• Tu clase nunca usa hechizos de otras razas para maximizar daño elemental propio.`,
    ].join('\n');
  }

  if (q.includes('mapa') || q.includes('subir') || q.includes('nivel') || q.includes('monstruo') || q.includes('ciudad') || q.includes('500')) {
    return [
      `[Oráculo Offline · MuGro-up'] Guía de Mundo Abierto:`,
      `• Tu nivel (${playerContext.level}) encaja mejor en: ${recommendedMap.name} (Nv.${recommendedMap.minLevel}–${recommendedMap.maxLevel}).`,
      `• Dentro de las capitales estás a salvo: ningún monstruo entra y no hay combate adentro.`,
      `• En ${recommendedMap.name}, sal de su radio seguro de ${recommendedMap.cityRadius} m para cazar y recoger joyas.`,
    ].join('\n');
  }

  if (q.includes('ala') || q.includes('wing') || q.includes('velo') || q.includes('correr')) {
    return [
      `[Oráculo Offline · MuGro-up'] Guía de Alas y Movimiento:`,
      `• Las alas cuentan con esqueleto animado, luz propia y partículas de aura.`,
      `• Al correr con alas equipadas tu velocidad base es 1.0x (estable y precisa para esquivar y combatir).`,
      `• Sube tus alas de Evo 1 a Evo 4 con Jewel of Chaos en el Duende del Caos.`,
    ].join('\n');
  }

  if (q.includes('wifi') || q.includes('blue') || q.includes('sync') || q.includes('trade') || q.includes('intercamb')) {
    return [
      `[Oráculo Offline · MuGro-up'] Modo Offline y Sincronización Bidireccional:`,
      `• Tu partida se guarda en el navegador. Instala la aplicación y espera a que termine la descarga para usarla sin internet.`,
      `• Las salas Wi-Fi usan el servidor local. Activa la copia privada en el panel Web/APK-WEB para guardar el progreso al volver la conexión.`,
      `• Intercambios locales acumulados: ${playerContext.sharedCount}.`,
    ].join('\n');
  }

  return [
    `[Oráculo Offline · MuGro-up'] Saludos, ${playerContext.name} (${playerContext.classType} Nv.${playerContext.level}).`,
    `• Equipo activo: ${playerContext.equippedItems.slice(0, 4).join(', ') || 'Equipo inicial'}.`,
    `• Zona recomendada ahora: ${recommendedMap.name} · Rol: ${tip.role}.`,
    `• Habilidad recomendada: ${tip.keySkill}.`,
    `Pregúntame sobre forja (+0 a +15), estadísticas, alas, zonas de caza o sincronización offline.`,
  ].join('\n');
}
