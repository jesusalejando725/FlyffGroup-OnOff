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
  clusteredAt?: { x: number; z: number };
  contains(x: number, z: number): boolean;
  allows(x: number, z: number): boolean;
}

// Preserve imported sites and fill each region independently on a staggered grid.
// Rejected sites (shore, city, or regional borders) never yield a partial camp.
export function populateRegionalCamps(size: number, regions: readonly HuntingRegion[], sites: SpawnSite[]): Map<string, CampMember[]> {
  const result = new Map(regions.map(region => [region.id, [] as CampMember[]]));
  const centers = new SpawnGrid<{ x: number; z: number }>();
  const makeCamp = (region: HuntingRegion, x: number, z: number, heading: number, site?: SpawnSite) => {
    if (result.get(region.id)!.length >= region.count * CAMP_SIZE) return;
    for (const other of centers.near(x, z, CAMP_MIN_SPACING)) {
      if (Math.hypot(other.x - x, other.z - z) < CAMP_MIN_SPACING) return;
    }
    const group: CampMember[] = [];
    for (let i = 0; i < CAMP_SIZE; i++) {
      const angle = heading + i * 2.399963;
      const radius = Math.sqrt(i) * 2.7;
      const mx = x + Math.cos(angle) * radius;
      const mz = z + Math.sin(angle) * radius;
      if (mx < MARGIN || mz < MARGIN || mx > size - MARGIN || mz > size - MARGIN ||
          !region.contains(mx, mz) || !region.allows(mx, mz)) return;
      group.push({ camp: -1, x: mx, z: mz, heading: angle, site });
    }
    return group;
  };
  const add = (region: HuntingRegion, group: CampMember[]) => {
    const members = result.get(region.id)!;
    const camp = members.length / CAMP_SIZE;
    centers.add(group[0].x, group[0].z, group[0]);
    members.push(...group.map(member => ({ ...member, camp })));
  };

  // Fill whole hunting grounds near the capital first. Within a ground each
  // camp has room to patrol; between grounds there is at least 100 m.
  for (const region of regions) {
    if (!region.clusteredAt) continue;
    const { x: sx, z: sz } = region.clusteredAt;
    const anchors: { x: number; z: number; distance: number }[] = [];
    for (let z = 60; z < size - 60; z += 20) for (let x = 60; x < size - 60; x += 20) {
      if (!region.contains(x, z) || !region.allows(x, z)) continue;
      anchors.push({ x, z, distance: Math.hypot(x - sx, z - sz) });
    }
    anchors.sort((a, b) => a.distance - b.distance);
    const accepted: CampMember[] = [];
    for (const { x, z } of anchors) {
      if (result.get(region.id)!.length + 100 > region.count * CAMP_SIZE) break;
      if (accepted.some(member => Math.hypot(member.x - x, member.z - z) < 100)) continue;
      for (const direction of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
        const groups: CampMember[][] = [];
        const cos = Math.cos(direction), sin = Math.sin(direction);
        // Compact staggered pattern (3 + 4 + 3), with at least 24 m between camps.
        for (const [row, columns] of [3, 4, 3].entries()) for (let col = 0; col < columns; col++) {
          const dx = (col - (columns - 1) / 2) * 24, dz = (row - 1) * 21;
          const px = x + dx * cos - dz * sin, pz = z + dx * sin + dz * cos;
          if (accepted.some(member => Math.hypot(member.x - px, member.z - pz) < 100)) continue;
          const group = makeCamp(region, px, pz, direction);
          if (group) groups.push(group);
        }
        if (groups.length !== 10) continue;
        for (const group of groups) {
          accepted.push(group[0]);
          add(region, group);
        }
        break;
      }
    }
  }
  for (const site of sites) {
    const region = regions.find(candidate => candidate.contains(site.x, site.z));
    if (region && !region.clusteredAt) {
      const group = makeCamp(region, site.x, site.z, site.x + site.z, site);
      if (group) add(region, group);
    }
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
    if (region && !region.clusteredAt) {
      const group = makeCamp(region, x, z, heading);
      if (group) add(region, group);
    }
  }
  return result;
}

/** Restrict Puerto camps to land connected to the arrival point along gentle ground. */
export function reachableHuntingLand(size: number, spawn: { x: number; z: number },
  land: (x: number, z: number) => boolean, height: (x: number, z: number) => number,
): (x: number, z: number) => boolean {
  const step = 8, side = Math.ceil(size / step);
  const point = (i: number) => ({ x: (i % side + .5) * step, z: (Math.floor(i / side) + .5) * step });
  const index = (x: number, z: number) => Math.floor(z / step) * side + Math.floor(x / step);
  const seen = new Uint8Array(side * side);
  const start = index(spawn.x, spawn.z);
  const queue = [start];
  seen[start] = 1;
  for (let read = 0; read < queue.length; read++) {
    const i = queue[read], from = point(i), y = height(from.x, from.z);
    for (const [dx, dz] of [[-step, 0], [step, 0], [0, -step], [0, step]]) {
      const x = from.x + dx, z = from.z + dz;
      if (x < 20 || z < 20 || x >= size - 20 || z >= size - 20) continue;
      const next = index(x, z);
      if (seen[next] || !land(x, z) || !land(from.x + dx/2, from.z + dz/2) ||
          Math.abs(height(x, z) - y) > step * .65) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return (x, z) => x >= 20 && z >= 20 && x < size - 20 && z < size - 20 &&
    land(x, z) && seen[index(x, z)] === 1 &&
    Math.abs(height(x, z) - height(point(index(x, z)).x, point(index(x, z)).z)) <= step * .65;
}
