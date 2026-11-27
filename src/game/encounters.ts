export const CAMP_SIZE = 10;
const CELL = 64;
const MARGIN = 40;
const CAMP_RADIUS = 12;

export interface SpawnSite { x: number; z: number; model: string; level: number; name: string; bounds?: number[] }

export interface CampMember {
  site?: SpawnSite;
  camp: number;
  x: number;
  z: number;
  heading: number;
}

export function scatterCamps(seed: string, size: number, count: number, allowed: (x: number, z: number) => boolean, sites: SpawnSite[] = []): CampMember[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };

  const members: CampMember[] = [];
  // Native respawn7 entries describe rectangles in the same coordinate space as the terrain.
  if (sites.length) {
    for (const site of sites) {
      if (members.length >= count * CAMP_SIZE) break;
      const [x0,z0,x1,z1] = site.bounds ?? [site.x-12,site.z-12,site.x+12,site.z+12];
      const group: CampMember[] = [];
      for (let attempt=0; attempt<100 && group.length<CAMP_SIZE; attempt++) {
        const x = attempt ? x0 + random()*(x1-x0) : site.x;
        const z = attempt ? z0 + random()*(z1-z0) : site.z;
        if (x<0 || z<0 || x>=size || z>=size || !allowed(x,z)) continue;
        group.push({camp:members.length/CAMP_SIZE,x,z,heading:random()*Math.PI*2,site});
      }
      if (group.length===CAMP_SIZE) members.push(...group);
    }
    return members;
  }
  const pitch = 128; // 100 m clear between the outer members, including jitter.
  const columns = Math.floor((size - 2 * (MARGIN + CAMP_RADIUS)) / pitch);
  const strata = Array.from({ length: columns * columns }, (_, i) => i);
  for (let i = strata.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [strata[i], strata[j]] = [strata[j], strata[i]];
  }
  const edge = MARGIN + CAMP_RADIUS;
  const centers = new SpawnGrid<{x:number; z:number}>();
  const place = (x:number, z:number, site?: SpawnSite) => {
    if (members.length >= count * CAMP_SIZE || x < edge || z < edge || x > size-edge || z > size-edge || !allowed(x,z)) return;
    for (const other of centers.near(x,z,124)) if (Math.hypot(other.x-x,other.z-z) < 124) return;
    const heading = random() * Math.PI * 2;
    const camp = members.length / CAMP_SIZE;
    const group: CampMember[] = [];
    for (let n = 0; n < CAMP_SIZE; n++) {
      const angle = heading + n * 2.399963;
      const radius = Math.sqrt(n / (CAMP_SIZE - 1)) * CAMP_RADIUS;
      const mx = x + Math.cos(angle)*radius, mz = z + Math.sin(angle)*radius;
      if (!allowed(mx,mz)) return;
      group.push({ camp, x:mx, z:mz, heading:angle, site });
    }
    centers.add(x,z,{x,z});
    members.push(...group);
  };
  for (const cell of strata) {
    if (members.length >= count * CAMP_SIZE) break;
    place(edge + ((cell % columns)+.5)*pitch + random()*4, edge + (Math.floor(cell/columns)+.5)*pitch + random()*4);
  }
  return members;
}

// Fill gaps between the imported spawn rectangles without removing their camps.
// A camp is admitted only when every member is on hunting land.
export function populateCamps(seed: string, size: number, count: number, allowed: (x: number, z: number) => boolean, sites: SpawnSite[]): CampMember[] {
  const native = scatterCamps(seed, size, count, allowed, sites);
  if (native.length >= count * CAMP_SIZE) return native;
  const occupied = new SpawnGrid<CampMember>();
  for (const member of native) occupied.add(member.x, member.z, member);
  const result = native.slice();
  const candidates = scatterCamps(seed + ':coverage', size, count, allowed);
  for (let i = 0; i < candidates.length && result.length < count * CAMP_SIZE; i += CAMP_SIZE) {
    const group = candidates.slice(i, i + CAMP_SIZE);
    if (group.some(member => [...occupied.near(member.x, member.z, 72)]
      .some(other => Math.hypot(other.x - member.x, other.z - member.z) < 72))) continue;
    const camp = result.length / CAMP_SIZE;
    for (const member of group) {
      const placed = { ...member, camp };
      result.push(placed);
      occupied.add(placed.x, placed.z, placed);
    }
  }
  return result;
}

// Select existing monster definitions along a low-to-high path away from a capital.
export function regionalTemplate<T extends { level: number }>(templates: readonly T[], camp: number, distance: number, safeRadius: number, minLevel: number, maxLevel: number): T {
  const progress = Math.max(0, Math.min(1, (distance - safeRadius) / 750));
  const target = minLevel + progress * (maxLevel - minLevel);
  const ranked = templates.map((item, index) => ({ item, index, delta: Math.abs(item.level - target) }))
    .sort((a, b) => a.delta - b.delta || a.index - b.index);
  const nearest = ranked.filter(row => row.delta <= ranked[0].delta + 1);
  return nearest[camp % nearest.length].item;
}

export class SpawnGrid<T> {
  private cells = new Map<number, T[]>();
  private key(x: number, z: number): number { return x + z * 1024; }

  add(x: number, z: number, entity: T): void {
    const key = this.key(Math.floor(x / CELL), Math.floor(z / CELL));
    const cell = this.cells.get(key);
    if (cell) cell.push(entity);
    else this.cells.set(key, [entity]);
  }

  *near(x: number, z: number, radius: number): Iterable<T> {
    for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
      for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
        const cell = this.cells.get(this.key(ix, iz));
        if (cell) yield* cell;
      }
    }
  }

  clear(): void { this.cells.clear(); }
}

export const CAMP_MIN_SPACING = 40;
export const MONSTER_WANDER_RADIUS = 6;

export interface HuntingRegion {
  id: string;
  count: number;
  contains(x: number, z: number): boolean;
  allows(x: number, z: number): boolean;
}

// Preserve imported sites and fill each region independently on a staggered grid.
// Rejected sites (shore, city, or regional borders) never yield a partial camp.
export function populateRegionalCamps(size: number, regions: readonly HuntingRegion[], sites: SpawnSite[]): Map<string, CampMember[]> {
  const result = new Map(regions.map(region => [region.id, [] as CampMember[]]));
  const centers = new SpawnGrid<{ x: number; z: number }>();
  const add = (region: HuntingRegion, x: number, z: number, heading: number, site?: SpawnSite) => {
    const members = result.get(region.id)!;
    if (members.length >= region.count * CAMP_SIZE) return;
    for (const other of centers.near(x, z, CAMP_MIN_SPACING)) {
      if (Math.hypot(other.x - x, other.z - z) < CAMP_MIN_SPACING) return;
    }
    const camp = members.length / CAMP_SIZE;
    const group: CampMember[] = [];
    for (let i = 0; i < CAMP_SIZE; i++) {
      const angle = heading + i * 2.399963;
      const radius = Math.sqrt(i) * 2.7;
      const mx = x + Math.cos(angle) * radius;
      const mz = z + Math.sin(angle) * radius;
      if (mx < MARGIN || mz < MARGIN || mx > size - MARGIN || mz > size - MARGIN ||
          !region.contains(mx, mz) || !region.allows(mx, mz)) return;
      group.push({ camp, x: mx, z: mz, heading: angle, site });
    }
    centers.add(x, z, { x, z });
    members.push(...group);
  };

  for (const site of sites) {
    const region = regions.find(candidate => candidate.contains(site.x, site.z));
    if (region) add(region, site.x, site.z, site.x + site.z, site);
  }

  const pitch = 40.5;
  const rowSpacing = pitch * Math.sqrt(3) / 2;
  const candidates: { x: number; z: number; heading: number }[] = [];
  for (let row = 0, z = MARGIN + 9; z <= size - MARGIN - 9; row++, z += rowSpacing) {
    for (let x = MARGIN + 9 + (row % 2) * pitch / 2; x <= size - MARGIN - 9; x += pitch) {
      candidates.push({ x, z, heading: x + z });
    }
  }
  let seed = 12582917;
  for (let i = candidates.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const { x, z, heading } of candidates) {
    const region = regions.find(candidate => candidate.contains(x, z));
    if (region) add(region, x, z, heading);
  }
  return result;
}
