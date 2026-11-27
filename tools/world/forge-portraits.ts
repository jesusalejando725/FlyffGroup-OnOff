// Run from the repository root with bun tools/world/forge-portraits.ts (Python/Pillow).
import { NullEngine, Scene } from '@babylonjs/core';
import { execFileSync } from 'node:child_process';
import { ARTISAN_CATALOG, artisanWeapon, setArmament } from '../../src/data/artisanEquipment';
import { buildArtisanWeapon } from '../../src/game/content/ArtisanWeapon';
const engine = new NullEngine(), scene = new Scene(engine);
const models = [];
for (const item of ARTISAN_CATALOG) {
  const spec = artisanWeapon(item.name);
  if (!spec || setArmament(item.name)) continue;
  const mesh = buildArtisanWeapon(scene,spec);
  models.push({ id:spec.key, p:Array.from(mesh.getVerticesData('position')!), c:Array.from(mesh.getVerticesData('color')!), i:Array.from(mesh.getIndices()!) });
  mesh.dispose(false,true);
}
execFileSync('python',['tools/world/paint-forge.py'],{input:JSON.stringify(models)});
engine.dispose();
