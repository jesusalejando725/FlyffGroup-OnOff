import type { MuItem, MuCharacter, ItemSlot } from '../types/game.ts';

export type Jewel = 'bless' | 'soul' | 'life' | 'harmony';
export const forgeSlots = new Set<ItemSlot>(['weapon','shield','helm','armor','gloves','pants','boots','wings']);
export const lifeOptions = {
  str: ['Fuerza +5', 5], defensePct: ['Defensa +4%', 4], critPct: ['Crítico +3%', 3],
  reflectPct: ['Reflejo +3%', 3], hpPct: ['Vida +4%', 4], blockPct: ['Bloqueo +3%', 3],
} as const;
export type LifeOption = keyof typeof lifeOptions;
export function recipe(level: number, jewel: Jewel) {
  const mix = jewel === 'soul' && level >= 9 && level < 13 ? level - 7 : 0;
  return { bless: mix || Number(jewel === 'bless'), soul: mix || Number(jewel === 'soul'),
    life: mix ? mix - 1 : Number(jewel === 'life'), harmony: Number(jewel === 'harmony') };
}
export function forge(item: MuItem, wallet: Pick<MuCharacter,Jewel>, jewel: Jewel, random = Math.random) {
  const n = item.enhanceLevel, cost = recipe(n,jewel);
  if ((jewel === 'harmony' ? item.slot === 'consumable' : !forgeSlots.has(item.slot)) ||
      jewel === 'bless' && n >= 6 || jewel === 'soul' && n >= 13 ||
      jewel === 'harmony' && (n < 13 || n >= 15) ||
      (Object.keys(cost) as Jewel[]).some(key => wallet[key] < cost[key])) return null;
  const success = random() < (jewel === 'harmony' ? item.luck ? .75 : .55 : .3);
  const options = [...(item.lifeOptions ?? [])];
  let level = n;
  if (jewel === 'life') {
    if (success) {
      const pool = (Object.keys(lifeOptions) as LifeOption[]).filter(key => !options.includes(key));
      const count = Math.min(pool.length, 1 + Math.floor(random()*3));
      for (let i=0;i<count;i++) options.push(pool.splice(Math.floor(random()*pool.length),1)[0]);
    } else if (options.length) options.splice(Math.floor(random()*options.length),1);
  } else if (success) level++;
  else if (jewel !== 'harmony') level = Math.max(0,n-1);
  return { success, level, options, cost };
}
