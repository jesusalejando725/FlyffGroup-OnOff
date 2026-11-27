export interface CollisionGeometryData {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface CollisionObjectPlacement {
  x?: number;
  y?: number;
  z?: number;
  rotationY?: number;
  scale?: [number, number, number] | number[];
  geometry: CollisionGeometryData;
}

interface WorldTriangle {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  nx: number;
  ny: number;
  nz: number;
  walkable: boolean;
}

const CAPSULE_RADIUS = 0.35;
const STEP_HEIGHT = 0.45;
const HEAD_HEIGHT = 1.8;
const WALKABLE_NY = 0.55;
const CELL_SIZE = 8;

function pointToSegDistSqXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq <= 1e-10) {
    return wx * wx + wz * wz;
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq));
  const dx = px - (ax + t * vx);
  const dz = pz - (az + t * vz);
  return dx * dx + dz * dz;
}

function pointInTriXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const v0x = cx - ax;
  const v0z = cz - az;
  const v1x = bx - ax;
  const v1z = bz - az;
  const v2x = px - ax;
  const v2z = pz - az;

  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return false;
  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= -1e-4 && v >= -1e-4 && u + v <= 1 + 1e-4;
}

function pointToTriDistSqXZ(
  px: number,
  pz: number,
  t: WorldTriangle,
): number {
  if (pointInTriXZ(px, pz, t.ax, t.az, t.bx, t.bz, t.cx, t.cz)) return 0;
  const d1 = pointToSegDistSqXZ(px, pz, t.ax, t.az, t.bx, t.bz);
  const d2 = pointToSegDistSqXZ(px, pz, t.bx, t.bz, t.cx, t.cz);
  const d3 = pointToSegDistSqXZ(px, pz, t.cx, t.cz, t.ax, t.az);
  return Math.min(d1, d2, d3);
}

function interpolateTriHeight(
  px: number,
  pz: number,
  t: WorldTriangle,
): number | null {
  if (!pointInTriXZ(px, pz, t.ax, t.az, t.bx, t.bz, t.cx, t.cz)) {
    return null;
  }
  const det = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz);
  if (Math.abs(det) < 1e-9) {
    return (t.ay + t.by + t.cy) / 3;
  }
  const l1 = ((t.bz - t.cz) * (px - t.cx) + (t.cx - t.bx) * (pz - t.cz)) / det;
  const l2 = ((t.cz - t.az) * (px - t.cx) + (t.ax - t.cx) * (pz - t.cz)) / det;
  const l3 = 1 - l1 - l2;
  return l1 * t.ay + l2 * t.by + l3 * t.cy;
}

function closestHeightOnTriXZ(px: number, pz: number, t: WorldTriangle): number {
  const inside = interpolateTriHeight(px, pz, t);
  if (inside !== null) return inside;

  const edges: Array<[number, number, number, number, number, number]> = [
    [t.ax, t.ay, t.az, t.bx, t.by, t.bz],
    [t.bx, t.by, t.bz, t.cx, t.cy, t.cz],
    [t.cx, t.cy, t.cz, t.ax, t.ay, t.az],
  ];
  let bestDistSq = Infinity;
  let bestY = t.ay;
  for (const [ax, ay, az, bx, by, bz] of edges) {
    const vx = bx - ax;
    const vz = bz - az;
    const wx = px - ax;
    const wz = pz - az;
    const lenSq = vx * vx + vz * vz;
    const frac = lenSq > 1e-10 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
    const dx = px - (ax + frac * vx);
    const dz = pz - (az + frac * vz);
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestY = ay + frac * (by - ay);
    }
  }
  return bestY;
}

export class SurfaceCollision {
  private triangles: WorldTriangle[] = [];
  private grid = new Map<string, number[]>();

  public rebuild(objects: CollisionObjectPlacement[]): void {
    this.triangles = [];
    this.grid.clear();

    for (const obj of objects) {
      const geom = obj?.geometry;
      if (!geom?.positions || !geom?.indices) continue;

      const ox = obj.x ?? 0;
      const oy = obj.y ?? 0;
      const oz = obj.z ?? 0;
      const rad = ((obj.rotationY ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const sx = obj.scale?.[0] ?? 1;
      const sy = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;

      const pos = geom.positions;
      const idx = geom.indices;

      const xform = (vIndex: number): [number, number, number] => {
        const base = vIndex * 3;
        const lx = Number(pos[base] ?? 0) * sx;
        const ly = Number(pos[base + 1] ?? 0) * sy;
        const lz = Number(pos[base + 2] ?? 0) * sz;
        return [
          ox + lx * cosR + lz * sinR,
          oy + ly,
          oz - lx * sinR + lz * cosR,
        ];
      };

      for (let i = 0; i + 2 < idx.length; i += 3) {
        const [ax, ay, az] = xform(Number(idx[i]));
        const [bx, by, bz] = xform(Number(idx[i + 1]));
        const [cx, cy, cz] = xform(Number(idx[i + 2]));

        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const acx = cx - ax;
        const acy = cy - ay;
        const acz = cz - az;

        let nx = aby * acz - abz * acy;
        let ny = abz * acx - abx * acz;
        let nz = abx * acy - aby * acx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-8) continue;
        nx /= len;
        ny /= len;
        nz /= len;

        const tri: WorldTriangle = {
          ax,
          ay,
          az,
          bx,
          by,
          bz,
          cx,
          cy,
          cz,
          minX: Math.min(ax, bx, cx),
          maxX: Math.max(ax, bx, cx),
          minY: Math.min(ay, by, cy),
          maxY: Math.max(ay, by, cy),
          minZ: Math.min(az, bz, cz),
          maxZ: Math.max(az, bz, cz),
          nx,
          ny,
          nz,
          walkable: Math.abs(ny) >= WALKABLE_NY,
        };

        const triIndex = this.triangles.length;
        this.triangles.push(tri);

        const cMinX = Math.floor((tri.minX - CAPSULE_RADIUS) / CELL_SIZE);
        const cMaxX = Math.floor((tri.maxX + CAPSULE_RADIUS) / CELL_SIZE);
        const cMinZ = Math.floor((tri.minZ - CAPSULE_RADIUS) / CELL_SIZE);
        const cMaxZ = Math.floor((tri.maxZ + CAPSULE_RADIUS) / CELL_SIZE);
        for (let gx = cMinX; gx <= cMaxX; gx++) {
          for (let gz = cMinZ; gz <= cMaxZ; gz++) {
            const key = `${gx}_${gz}`;
            let list = this.grid.get(key);
            if (!list) {
              list = [];
              this.grid.set(key, list);
            }
            list.push(triIndex);
          }
        }
      }
    }
  }

  private queryPointCandidates(x: number, z: number): number[] {
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    return this.grid.get(`${gx}_${gz}`) ?? [];
  }

  private queryRadiusCandidates(x: number, z: number, radius: number): Set<number> {
    const out = new Set<number>();
    const minGx = Math.floor((x - radius) / CELL_SIZE);
    const maxGx = Math.floor((x + radius) / CELL_SIZE);
    const minGz = Math.floor((z - radius) / CELL_SIZE);
    const maxGz = Math.floor((z + radius) / CELL_SIZE);
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gz = minGz; gz <= maxGz; gz++) {
        const list = this.grid.get(`${gx}_${gz}`);
        if (list) {
          for (const idx of list) out.add(idx);
        }
      }
    }
    return out;
  }

  public floor(x: number, z: number, y: number, minY = 0): number {
    let best = minY;
    const candidates = this.queryPointCandidates(x, z);
    for (const idx of candidates) {
      const t = this.triangles[idx];
      if (!t.walkable) continue;
      if (x < t.minX - 1e-4 || x > t.maxX + 1e-4 || z < t.minZ - 1e-4 || z > t.maxZ + 1e-4) {
        continue;
      }
      const h = interpolateTriHeight(x, z, t);
      if (h !== null && h <= y + 0.15 && h > best) {
        best = h;
      }
    }
    return best;
  }

  public canMove(
    x0: number,
    z0: number,
    x: number,
    z: number,
    feet: number,
    getGround: (px: number, pz: number) => number,
    isLoaded: (px: number, pz: number) => boolean,
  ): boolean {
    if (!isLoaded(x, z)) return false;

    const dx = x - x0;
    const dz = z - z0;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    let currFeet = Math.max(feet, this.floor(x0, z0, feet + STEP_HEIGHT, getGround(x0, z0)));
    const rSq = CAPSULE_RADIUS * CAPSULE_RADIUS;

    for (let s = 1; s <= steps; s++) {
      const ratio = s / steps;
      const px = x0 + dx * ratio;
      const pz = z0 + dz * ratio;
      if (!isLoaded(px, pz)) return false;

      const ground = getGround(px, pz);
      const nextFloor = this.floor(px, pz, currFeet + STEP_HEIGHT, ground);
      currFeet = Math.max(ground, nextFloor);

      const candidates = this.queryRadiusCandidates(px, pz, CAPSULE_RADIUS);
      for (const idx of candidates) {
        const t = this.triangles[idx];
        if (t.maxY <= currFeet + STEP_HEIGHT || t.minY >= currFeet + HEAD_HEIGHT) {
          continue;
        }
        const dSq = pointToTriDistSqXZ(px, pz, t);
        if (dSq >= rSq) continue;

        if (!t.walkable) {
          return false;
        }

        // Walkable surface: only block if its closest height is inside head clearance (unsteppable roof/overhang)
        const sampleH = closestHeightOnTriXZ(px, pz, t);
        if (sampleH > currFeet + STEP_HEIGHT && sampleH < currFeet + HEAD_HEIGHT) {
          return false;
        }
      }
    }

    return true;
  }
}
