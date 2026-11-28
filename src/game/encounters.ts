export const CAMP_SIZE = 5;
export const CAMP_MIN_SPACING = 100;
export const CAMP_RESPAWN_SECONDS = 4;
const CELL = 64;
const MARGIN = 40;
const CAMP_MEMBER_STEP = 2.7;

export interface SpawnSite { x: number; z: number; model: string; level: number; name: string; bounds?: number[] }

export interface CampMember {
  site?: SpawnSite;
  camp: number;
  x: number;
  z: number;
  heading: number;
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

export const MONSTER_WANDER_RADIUS = 6;

export interface HuntingRegion {
  id: string;
  count: number;
  contains(x: number, z: number): boolean;
  allows(x: number, z: number): boolean;
}

// A staggered grid covers the shared terrain. A single index enforces spacing
// even at the borders between regions. Native sites can supply the local species.
export function populateRegionalCamps(size: number, regions: readonly HuntingRegion[], sites: SpawnSite[]): Map<string, CampMember[]> {
  const result = new Map(regions.map(region => [region.id, [] as CampMember[]]));
  const centers = new SpawnGrid<CampMember>();
  const native = new SpawnGrid<SpawnSite>();
  for (const site of sites) native.add(site.x, site.z, site);
  const pitch = CAMP_MIN_SPACING;
  const rowSpacing = pitch * Math.sqrt(3) / 2;
  const edge = MARGIN + CAMP_MEMBER_STEP * Math.sqrt(CAMP_SIZE - 1);
  const place = (x: number, z: number) => {
    const region = regions.find(candidate => candidate.contains(x, z));
    if (!region) return;
    const members = result.get(region.id)!;
    if (members.length >= region.count * CAMP_SIZE) return;
    for (const other of centers.near(x, z, pitch)) {
      if ((other.x - x) ** 2 + (other.z - z) ** 2 < (pitch - 1e-8) ** 2) return;
    }
    const camp = members.length / CAMP_SIZE;
    const group: CampMember[] = [];
    let site: SpawnSite | undefined;
    let closest = (pitch / 2) ** 2;
    for (const candidate of native.near(x, z, pitch / 2)) {
      const dist = (candidate.x - x) ** 2 + (candidate.z - z) ** 2;
      if (dist < closest && region.contains(candidate.x, candidate.z) && region.allows(candidate.x, candidate.z)) {
        closest = dist;
        site = candidate;
      }
    }
    for (let i = 0; i < CAMP_SIZE; i++) {
      const heading = (x + z) % (Math.PI * 2) + i * 2.399963;
      const radius = Math.sqrt(i) * CAMP_MEMBER_STEP;
      const mx = x + Math.cos(heading) * radius, mz = z + Math.sin(heading) * radius;
      if (!region.contains(mx, mz) || !region.allows(mx, mz)) return;
      group.push({ camp, x: mx, z: mz, heading, site });
    }
    centers.add(x, z, group[0]);
    members.push(...group);
  };

  // A shifted pass fills holes near shores and capital borders without crowding.
  for (const offset of [0, 0.5]) {
    for (let row = 0, z = edge + offset * rowSpacing; z <= size - edge; row++, z += rowSpacing) {
      for (let x = edge + ((row % 2) + offset) * pitch / 2; x <= size - edge; x += pitch) place(x, z);
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
