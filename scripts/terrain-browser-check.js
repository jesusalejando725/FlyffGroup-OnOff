// Open the DEV Preview with ?headless=1, then run:
// coderabbit-agent-browser eval --stdin < scripts/terrain-browser-check.js
(async () => {
  const e = window.__muEngine;
  if (!e) throw Error('Engine unavailable');
  const assert = (value, message) => { if (!value) throw Error(message); };
  e.setMode('character_select');
  await e.loadMap('flaris');
  const w = e.flyff.world;
  let coverage;
  e.flyff.loadingWorld = true; // Keep the render loop from retargeting scripted movement.
  try {
    const shared = (...tiles) => tiles.map(t => new Set(w.tiles.get(t).root.getChildMeshes().map(m => m.material)));
    const [west, east] = shared('2_2', '3_2');
    const water = w.waterMaterial, common = [...west].filter(m => m && m !== water && east.has(m));
    assert(common.length > 0, 'Fixture must have props shared between sectors');
    let disposed = 0;
    for (const m of [...common, water]) m.onDisposeObservable.add(() => disposed++);
    await w.stream(1792, 1280, 0);
    assert(!w.tiles.has('2_2') && w.tiles.has('3_2'), 'Sector did not unload');
    assert(disposed === 0, 'Releasing a sector disposed shared materials or water');
    assert(w.scene.textures.includes(water.diffuseTexture) && water.diffuseTexture.getInternalTexture(), 'Shared water texture disappeared');

    let loaded = 0, waterCells = 0;
    for (const t of w.manifest.tiles) {
      await w.stream(t.x + 256, t.z + 256);
      const tile = w.tiles.get(t.id), terrain = tile.root.getChildMeshes().find(m => m.name === 'terrain_' + t.id);
      assert(terrain && terrain.isEnabled() && terrain.material.albedoTexture.getInternalTexture(), 'Missing terrain ' + t.id);
      const sample = terrain.getVerticesData('position'), indices = terrain.getIndices(), k = 3 * (Math.floor(indices.length / 6) + 133);
      const corners = [indices[k], indices[k+1], indices[k+2]].map(i => Array.from(sample.slice(i*3,i*3+3)));
      const [x, y, z] = [0, 1, 2].map(axis => (corners[0][axis] + corners[1][axis] + corners[2][axis]) / 3);
      assert(Math.abs(w.heightAt(t.x + x, t.z - z) - y) < 1e-4, 'Ground differs from visible triangle ' + t.id);
      if (t.water.length) {
        const waterMesh = tile.root.getChildMeshes().find(m => m.name === 'water_' + t.id);
        assert(waterMesh?.material === water && waterMesh.getVerticesData('position')[1] > t.water[0].height, 'Water missing or flush with ground ' + t.id);
        waterCells += t.water.length;
      }
      const batches = tile.root.getChildMeshes().filter(m => m.name.startsWith('batch_'));
      assert(batches.every(m => m.isEnabled() && m.thinInstanceCount > 0 && m.material), 'Invalid prop batch ' + t.id);
      assert([...new Set(t.objects.map(o => o.model))].every(model => batches.some(m => m.name.startsWith(`batch_${t.id}_${model}_`))), 'Missing binned model ' + t.id);
      loaded++;
    }
    await Promise.all([w.stream(1280, 1280), w.stream(2304, 2304)]);
    assert(w.tiles.size === 1 && w.tiles.has('4_4'), 'The earlier request replaced a newer sector request');
    const activeModels = new Set(w.manifest.tiles.find(tile => tile.id === '4_4').objects.map(o => o.model));
    assert([...w.containers.keys()].every(key => activeModels.has(key)), 'Materials from the superseded sector were retained');
    coverage = { sectors: loaded, waterCells, sharedProps: common.length };
  } finally {
    e.flyff.loadingWorld = false;
  }
  e.flyff.clearWorld();
  assert(!e.flyff.world && w.disposed, 'Old world not released');
  await e.loadMap('flaris');
  return { ...coverage, latestSectorWins: true, returnToFlaris: Boolean(e.flyff.world) };
})()
