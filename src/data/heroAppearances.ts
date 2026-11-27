import catalog from './heroAppearances.json' with { type: 'json' };
import type { HeroClass } from '../types/game';

export interface HeroAppearance {
  id: string;
  name: string;
  maleName?: string;
  classId: HeroClass;
  color: string;
}

export const HERO_APPEARANCES = catalog as HeroAppearance[];

export function findHeroAppearance(id?: string, classId?: HeroClass): HeroAppearance | undefined {
  return HERO_APPEARANCES.find(appearance => appearance.id === id && (!classId || appearance.classId === classId));
}

export function heroAppearanceName(appearance: HeroAppearance, sex: 'male' | 'female'): string {
  return sex === 'male' ? (appearance.maleName ?? appearance.name) : appearance.name;
}

export function heroAppearancePath(id: string, sex: 'male' | 'female'): string {
  return `personajes/mobilee/${id}_${sex}`;
}
