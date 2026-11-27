// Open the dev preview with ?headless=1&autostart=1, then run:
// coderabbit-agent-browser eval --stdin < scripts/world-wings-browser-check.js
(async () => {
  const engine = window.__muEngine;
  if (!engine?.flyff.actor) throw Error('Engine unavailable');
  const { getStarterItemsForMuClass } = await import('/src/data/muSkillsAndClasses.ts');
  const library = await (await fetch('/mugroup/equipo.json')).json();
  const config = await (await fetch('/ADMIN/items.json')).json();
  const assets = [...new Map([...Object.entries(library.wings).map(([name, file]) => [file, name]),
    ...config.wingCatalog.map(({glb, name}) => [glb, name])]).entries()];
  const original = engine.flyff.actor.config;
  const originalItems = engine.flyff.getLastEquippedItems();
  const originalMode = engine.mode;
  engine.setMode('character_select');
  const failed = new Map();
  let checked = 0;
  let lowest = Infinity;
  try {
    for (const cls of ['DK', 'DW', 'DL', 'MG', 'ELF']) {
      for (const sex of ['male', 'female']) {
        const equipment = getStarterItemsForMuClass('fixture', 'Fixture', cls).filter(i => i.slot !== 'wings');
        for (const [file, name] of assets) for (const level of [0, 13]) {
          // The map is in selection mode, so these frames test actual rest poses
          // and the wing's own animated mesh without ground movement masking it.
          const wing = { id: 'fixture-wing', name, slot: 'wings', category: 'wings', isEquipped: true, enhanceLevel: level };
          await engine.syncHeroAppearance(cls, [...equipment, wing], sex);
          const actor = engine.flyff.actor;
          const mount = actor.wingSocket;
          const meshes = actor.gear.wings.meshes;
          if (!mount || mount.parent !== actor.root || !meshes.length) throw Error('Missing equipment: ' + file);
          const spine = actor.outfit.nodes.find(node => node.name === 'Bip02 Spine2');
          for (let frame = 0; frame < 3; frame++) {
            actor.wingRig.update(frame / 3, false);
            const at = mount.computeWorldMatrix(true).getTranslation();
            const top = spine.computeWorldMatrix(true).getTranslation();
            if (at.subtract(top).length() > 0.15) throw Error('Detached spine: ' + cls + '/' + sex);
            const rootY = actor.root.computeWorldMatrix(true).getTranslation().y;
            for (const mesh of meshes) {
              mesh.skeleton?.prepare(true);
              const m = mesh.computeWorldMatrix(true).m;
              const verts = mesh.getPositionData(true, true);
              if (!verts?.length) throw Error('No vertices: ' + file);
              for (let i = 0; i < verts.length; i += 3) {
                const y = verts[i] * m[1] + verts[i + 1] * m[5] + verts[i + 2] * m[9] + m[13] - rootY;
                lowest = Math.min(lowest, y);
                if (y < 0.08) {
                  const id = `${cls}/${sex}/${file}/+${level}`;
                  failed.set(id, Math.min(y, failed.get(id) ?? Infinity));
                }
              }
            }
          }
          checked++;
        }
        await engine.syncHeroAppearance(cls, equipment, sex);
        if (engine.flyff.actor.wingSocket || engine.flyff.actor.gear.wings.equipped) throw Error('Wings remain equipped');
      }
    }
    if (failed.size) throw Error(JSON.stringify([...failed]));
    return { meshesChecked: checked, minimumGroundClearance: lowest };
  } finally {
    await engine.syncHeroAppearance(original.classId, originalItems, original.sex);
    engine.setMode(originalMode);
  }
})()
