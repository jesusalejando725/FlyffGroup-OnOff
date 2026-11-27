// Open the DEV Preview with ?headless=1, then run:
// coderabbit-agent-browser eval --stdin < scripts/world-shores-browser-check.js
(async()=>{
  const engine=window.__muEngine;
  if (!engine.monsters.length) await engine.loadMap('flaris');
  const monsters=engine.monsters;
  const groups=monsters.filter(m=>m.camp!==undefined);
  const anchors=groups.filter((m,i)=>i===0 || groups[i-1].camp!==m.camp);
  const reference=(await import('/src/data/madrigalSpawns.json')).default;
  const exact=anchors.filter(m=>reference.some(s=>s.x===m.homeX && s.z===m.homeZ &&
    s.level===m.scaledLevel && s.name===m.def.name && m.glbFile.endsWith('/'+s.model+'.glb')));
  if (!exact.length || groups.length!==anchors.length*10) throw Error('Faltan campamentos de referencia o grupos incompletos.');
  if (monsters.some(m=>!engine.flyff.world.isHuntingLand(m.homeX,m.homeZ)) || engine.flyff.world.isHuntingLand(50,50))
    throw Error('Hay monstruos en el mar.');
  for (let i=0;i<groups.length;i+=10) {
    const camp=groups.slice(i,i+10), first=camp[0];
    if (camp.some(m=>m.camp!==first.camp || m.glbFile!==first.glbFile || m.scaledLevel!==first.scaledLevel || engine.isSafePoint(m.homeX,m.homeZ,12)))
      throw Error('Grupo incompleto o inseguro: '+first.id);
  }
  const regions=['flaris','robledal','puerto_bruma','crater_ceniza'];
  const coverage=Object.fromEntries(regions.map(id=>[id,anchors.filter(m=>m.id.startsWith('mob-'+id+'-')).length]));
  if (Object.values(coverage).some(count=>!count)) throw Error('Región sin campamentos');
  return {monsters:monsters.length, camps:anchors.length, referenceCamps:exact.length, coverage};
})()
