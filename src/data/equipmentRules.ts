import type {MuCharacter, MuItem} from '../types/game.ts';

type Gear = Pick<MuItem,'slot'|'requiredLevel'|'sourceLevel'|'enhanceLevel'|'name'|'classFilter'|'sexFilter'>;
export function equipmentRequirements(item: Gear) {
  const level = Math.max(1, Math.min(99,item.requiredLevel ?? item.sourceLevel ?? (1 + item.enhanceLevel * 4)));
  const weapon = item.slot === 'weapon', wings = item.slot === 'wings';
  const magic = weapon && /wand|staff|stick|báculo/i.test(item.name);
  return {level, str: Math.ceil(level*(weapon && !magic ? 1 : .35)), agi: Math.ceil(level*(wings ? .95 : .35)),
    vit: Math.ceil(level*(weapon ? .3 : .65)), ene: Math.ceil(level*(magic ? 1 : .28)), cmd: Math.ceil(level*(wings ? .8 : .25))};
}
export function canEquip(c: MuCharacter, item: Gear) {
  const req = equipmentRequirements(item);
  return item.slot !== 'consumable' && (!item.classFilter || item.classFilter.includes(c.classType)) &&
    (!item.sexFilter || item.sexFilter === c.sex) &&
    (Object.keys(req) as (keyof typeof req)[]).every(key => c[key] >= req[key]);
}
