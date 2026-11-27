// With the DEV Preview open at ?headless=1:
// coderabbit-agent-browser eval --stdin < scripts/bestiary-browser-check.js
(async () => {
  const e = window.__muEngine;
  const assert = (value, label) => { if (!value) throw new Error(label); };
  const { MU_MAPS, MU_SHOP_CATALOG } = await import('/src/data/muWorldData.ts');
  const { BESTIARY } = await import('/src/data/bestiary.ts');
  const { getStarterItemsForMuClass, MU_SKILLS } = await import('/src/data/muSkillsAndClasses.ts');
  e.setMode('character_select');
  let monsters = 0, npcs = 0, attacks = 0, pieces = 0, weapons = 0;
  for (const map of MU_MAPS) {
    await e.loadMap(map.id);
    const species = BESTIARY.filter(s => s.map === map.id);
    assert(e.activeNpcs.length === map.npcs.length, 'NPCs missing from ' + map.id);
    for (const npc of e.activeNpcs) assert(npc.root.getChildMeshes().some(m => m.getTotalVertices() > 0), npc.def.name);
    npcs += e.activeNpcs.length;
    for (const kind of species) {
      const entry = e.thinMasterMeshes.get(kind.id);
      assert(entry?.mesh.getTotalVertices() && entry.mesh.getVerticesData('color'), 'Missing mesh/color for ' + kind.id);
      const placement = map.monsters.findIndex(def => def.speciesId === kind.id);
      assert(placement >= 0 && e.monDefIdx.includes(placement), 'Missing spawn for ' + kind.id);
      const idx = e.monDefIdx.indexOf(placement);
      e.spawnMonsterPowerFx(e.monX[idx], e.monZ[idx], kind.power);
      const fx = e.transientFx.at(-1).node;
      assert(fx.name === `creatureFx_${kind.power.style}_${kind.power.element}` && fx.getChildMeshes().length, 'Power did not render ' + kind.id);
      fx.dispose();
      e.transientFx.pop();
      monsters++;
      attacks++;
    }
  }
  await e.loadMap('flaris');
  const npc = e.activeNpcs.find(n => n.def.id === 'flaris-artisan');
  e.heroX = npc.def.x;
  e.heroZ = npc.def.z;
  e.greetNpc(npc.def.id);
  assert(e.transientFx.at(-1).node.name.includes('greeting'), 'NPC interaction missing');

  for (const heroClass of Object.keys(MU_SKILLS)) {
    for (const sex of ['male','female']) {
      const starter = getStarterItemsForMuClass('fixture','Fixture', heroClass);
      const choose = items => items.map(it => ({ ...it, isEquipped: true }));
      const catalog = MU_SHOP_CATALOG.filter(it => it.id.startsWith('artisan-') && it.classFilter?.includes(heroClass));
      const sets = new Set(catalog.filter(it => it.category === 'armor').map(it => it.setName));
      for (const setName of sets) {
        const armor = catalog.filter(i => i.setName === setName);
        await e.syncHeroAppearance(heroClass, choose(armor), sex);
        for (const slot of ['helmet','torso','pants','hands','feet']) {
          const visible = e.flyff.actor.outfit.meshes.filter(m => m.name.startsWith('equip_' + slot) && m.isEnabled());
          assert(visible.length > 0 && visible.every(m => m.metadata?.equipmentFile), `${heroClass}/${sex}/${setName}/${slot}`);
          pieces++;
        }
      }
      const choices = catalog.filter(i => i.slot === 'weapon');
      const sample = sex === 'male' ? choices : [choices[0], choices.at(-1)];
      const snapshots = new Set();
      for (const weapon of sample) {
        await e.syncHeroAppearance(heroClass, choose([weapon]), sex);
        const meshes = e.flyff.actor.outfit.meshes.filter(m => m.name.startsWith('equip_weapon_') && m.isEnabled());
        assert(meshes.length === 1 && meshes[0].name.includes(weapon.id), 'Wrong weapon ' + weapon.id);
        assert(meshes[0].parent.name === (heroClass === 'ELF' ? 'socket_leftHand' : 'socket_rightHand'), 'Wrong socket ' + weapon.id);
        snapshots.add(JSON.stringify(Array.from(meshes[0].getVerticesData('position'))));
        weapons++;
      }
      assert(snapshots.size === sample.length, 'Weapon silhouettes repeat exactly for ' + heroClass);
      await e.syncHeroAppearance(heroClass, starter, sex);
    }
  }
  const wing = MU_SHOP_CATALOG.find(i => i.id === 'artisan-wings-aurora');
  await e.syncHeroAppearance('ELF',[{ ...wing, isEquipped: true }],'female');
  const a = e.flyff.actor;
  assert(a.wingFlex && a.outfit.meshes.some(m => m.name.includes('artisan-aurora') && m.isEnabled()), 'Aurora model/flap missing');
  return { monsters, attacks, npcs, pieces, weapons, aurora: true };
})()
