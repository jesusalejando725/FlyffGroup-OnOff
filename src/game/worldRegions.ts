interface Site { id: string; spawn: {x:number;z:number} }

export function nearestRegion<T extends Site>(regions: readonly T[], x:number,z:number): T {
  return regions.reduce((best, next) =>
    (x-next.spawn.x)**2 + (z-next.spawn.z)**2 < (x-best.spawn.x)**2 + (z-best.spawn.z)**2 ? next : best);
}

export function capitalPortals<T extends Site>(regions: readonly T[]) {
  return regions.flatMap(from=>regions.map((target, i)=>({
    id:'portal-' + from.id + '-' + target.id,
    from, target,
    x:from.spawn.x + Math.cos(i*Math.PI/2)*24,
    z:from.spawn.z + Math.sin(i*Math.PI/2)*24,
  })));
}

export const CRATER_NPC_SAFE_RADIUS = 20;

export function inProtectedArea(
  x: number, z: number, margin: number,
  zones: readonly { x: number; z: number; radius: number }[],
): boolean {
  return zones.some(zone => (x - zone.x) ** 2 + (z - zone.z) ** 2 <= (zone.radius + margin) ** 2);
}
