export const MONSTER_POWER_ENERGY = 24;

export function monsterCombatStats(level: number, isBoss = false) {
  return {
    maxHp: Math.round((103 + 16 * level + 1.05 * level ** 2) * (isBoss ? 3.5 : 1)),
    strength: Math.round((7 + 1.1 * level + .03 * level ** 2) * (isBoss ? 1.55 : 1)),
    maxEnergy: Math.round((24 + level * .9) * (isBoss ? 1.4 : 1)),
    defense: Math.round((3 + .8 * level + .019 * level ** 2) * (isBoss ? 1.35 : 1)),
  };
}

// A large level gap protects later regions; resets help bridge that gap.
export function damageAgainstMonster(raw: number, defense: number, heroLevel: number, resets: number, monsterLevel: number) {
  const gap = Math.max(0, monsterLevel - heroLevel - 8 - Math.max(0, resets) * 8);
  const progressionCap = gap > 25 ? Math.max(1, Math.round((heroLevel + 2 + resets*8) * 3 / (1+gap/24))) : Infinity;
  return Math.min(progressionCap,Math.max(1, Math.round(raw * (120 / (120 + Math.max(0, defense))) / (1 + (gap / 16) ** 2))));
}
