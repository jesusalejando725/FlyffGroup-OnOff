/** World surface collision triangles, shared by nature placements and indexed in horizontal cells. */
type Point = [number, number, number];
interface Geometry { positions: number[]; indices: number[] }
interface Placement { x: number; y: number; z: number; rotationY: number; scale: number[]; geometry: Geometry }
interface Instance extends Placement { cos: number; sin: number }
const CELL = 32;
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function closest(p: Point, a: Point, b: Point, c: Point): Point {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return a.map((x, i) => x + v * ab[i]) as Point;
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return a.map((x, i) => x + w * ac[i]) as Point;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    return b.map((x, i) => x + w * (c[i] - b[i])) as Point;
  }
  const total = va + vb + vc;
  if (Math.abs(total) < 1e-12) return a;
  const v = vb / total, w = vc / total;
  return a.map((x, i) => x + ab[i] * v + ac[i] * w) as Point;
}
export class SurfaceCollision {
  private cells = new Map<string, Instance[]>();
  rebuild(placements: Placement[]) {
    this.cells.clear();
    for (const object of placements) {
      const angle = -object.rotationY * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
      const instance = { ...object, cos, sin };
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < object.geometry.positions.length; i += 3) {
        const p = this.vertex(instance, i / 3);
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
      }
      for (let x = Math.floor((minX - .35) / CELL); x <= Math.floor((maxX + .35) / CELL); x++) {
        for (let z = Math.floor((minZ - .35) / CELL); z <= Math.floor((maxZ + .35) / CELL); z++) {
          const key = `${x}_${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key)!.push(instance);
        }
      }
    }
  }
  private vertex(o: Instance, index: number): Point {
    const p = o.geometry.positions, i = index * 3, x = p[i] * o.scale[0], y = p[i + 1] * o.scale[1], z = p[i + 2] * o.scale[2];
    return [o.x + x * o.cos + z * o.sin, o.y + y, o.z - x * o.sin + z * o.cos];
  }
  private *triangles(x: number, z: number): Generator<[Point, Point, Point]> {
    for (const o of this.cells.get(`${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`) ?? []) {
      const indices = o.geometry.indices;
      for (let i = 0; i < indices.length; i += 3) yield [this.vertex(o, indices[i]), this.vertex(o, indices[i + 1]), this.vertex(o, indices[i + 2])];
    }
  }
  floor(x: number, z: number, ceiling: number, fallback: number): number {
    let floor = fallback;
    for (const [a, b, c] of this.triangles(x, z)) {
      const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(det) < 1e-8) continue;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det, w = 1 - u - v;
      if (u < -.0001 || v < -.0001 || w < -.0001) continue;
      const ab = sub(b, a), ac = sub(c, a), ny = ab[2] * ac[0] - ab[0] * ac[2];
      const nx = ab[1] * ac[2] - ab[2] * ac[1], nz = ab[0] * ac[1] - ab[1] * ac[0];
      if (Math.abs(ny) / Math.hypot(nx, ny, nz) < .64) continue;
      const y = u * a[1] + v * b[1] + w * c[1];
      if (y <= ceiling + .001 && y > floor) floor = y;
    }
    return floor;
  }
  blocked(x: number, z: number, feet: number): boolean {
    const radius = .26;
    for (const [a, b, c] of this.triangles(x, z)) {
      if (Math.max(a[1], b[1], c[1]) < feet + .78 || Math.min(a[1], b[1], c[1]) > feet + 1.72) continue;
      for (const y of [.92, 1.22, 1.48]) {
        const point: Point = [x, feet + y, z], delta = sub(point, closest(point, a, b, c));
        if (dot(delta, delta) < radius * radius) return true;
      }
    }
    return false;
  }
  canMove(fromX: number, fromZ: number, x: number, z: number, feet: number, terrain: (x: number, z: number) => number, ready: (x: number, z: number) => boolean): boolean {
    if (Math.abs(x) > 1520 || Math.abs(z) > 1520) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / .18));
    if (steps > 128) return false;
    const startBlocked = this.blocked(fromX, fromZ, feet);
    let current = feet;
    for (let i = 1; i <= steps; i++) {
      const px = fromX + (x - fromX) * i / steps, pz = fromZ + (z - fromZ) * i / steps;
      if (!ready(px, pz)) return false;
      const ground = this.floor(px, pz, current + .65, terrain(px, pz));
      if (ground - current > .72) return false;
      if (this.blocked(px, pz, Math.max(ground, current)) && (!startBlocked || this.blocked(x, z, current))) return false;
      current = Math.max(ground, current - .3);
    }
    return true;
  }
}
