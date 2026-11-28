// Multipliers are cumulative relative to the level 99 creature in ADMIN/monsters.json.
// The viewer does not ship these five bosses. Visual paths are local adaptations.
import type { MapId } from '../types/game.ts';
export interface Invasion {
  id: string; name: string; map: MapId; count: number; hp: number; attack: number;
  zen: number; levels: number; points: number; pieces: number; model: string; color: string;
}
export const INVASIONS: Invasion[] = [
  {id:'red', name:'Meteonyker Carmesí', map:'flaris', count:10, hp:21, attack:6, zen:100000, levels:10, points:2000, pieces:2, model:'monstruos/meteonyker.glb', color:'#eb624c'},
  {id:'gold', name:'Meteonyker Dorado', map:'robledal', count:10, hp:42, attack:12, zen:100000, levels:10, points:1000, pieces:4, model:'monstruos/meteonyker.glb', color:'#ffc849'},
  {id:'kundum', name:'Glaphan de Bruma', map:'puerto_bruma', count:6, hp:126, attack:36, zen:130000, levels:15, points:1500, pieces:6, model:'monstruos/glaphan.glb', color:'#8fa2f4'},
  {id:'selupan', name:'Clockworks', map:'crater_ceniza', count:1, hp:1260, attack:180, zen:250000, levels:25, points:2500, pieces:10, model:'monstruos/clockwork.glb', color:'#72e5ff'},
  {id:'medusa', name:'Kern de Ceniza', map:'crater_ceniza', count:5, hp:630, attack:72, zen:150000, levels:23, points:1500, pieces:7, model:'monstruos/kern.glb', color:'#9bf686'},
];
const PERIOD = 6 * 3600000;
export const INVASION_DURATION = 80 * 60000;
export function randomStream(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; };
}
export function invasionWindow(event: Invasion, now: number) {
  const cycle = Math.floor(now / PERIOD);
  const startOf = (i: number) => i * PERIOD + Math.floor(randomStream(event.id + ':' + i)() * (PERIOD - INVASION_DURATION));
  const start = startOf(cycle), end = start + INVASION_DURATION;
  return { start, end, active: now >= start && now < end, next: now >= end ? startOf(cycle + 1) : start };
}
export function invasionSites(event: Invasion, start: number, size: number, safe: (x:number,z:number)=>boolean) {
  const random = randomStream(event.id + '/' + start);
  const sites: {x:number;z:number}[] = [];
  for (let i = 0; sites.length < event.count && i < 4096; i++) {
    const x = 50 + random() * (size - 100), z = 50 + random() * (size - 100);
    if (!safe(x,z)) sites.push({x,z});
  }
  return sites;
}
