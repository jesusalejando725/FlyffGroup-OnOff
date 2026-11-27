// CodeRabbit-generated regression checks for the native equipment and streaming adapter.
// Use a synthetic account and the DEV ?headless=1 entry; this changes the current preview actor/map.
// coderabbit-agent-browser eval --stdin < scripts/world-browser-check.js
(async()=>{
 if(!window.__muEngine)throw Error('Open the DEV headless entry before running this check.');
 const result={};
 result.nativeAttachment=await (async()=>{const e=window.__muEngine,{getStarterItemsForMuClass}=await import('/src/data/muSkillsAndClasses.ts');let checked=0;for(const cls of ['DW','ELF','DL'])for(const sex of ['male','female']){
await e.syncHeroAppearance(cls,getStarterItemsForMuClass('test','Test',cls),sex);const a=e.flyff.actor,old=a.outfit.meshes.find(m=>m.name==='equip_weapon_0'),next=a.outfit.meshes.find(m=>m.name.startsWith('equip_weapon_weapon:')&&m.isEnabled());
const transform=(mesh)=>{mesh.computeWorldMatrix(true);const m=mesh.getWorldMatrix().asArray(),p=mesh.getVerticesData('position'),out=[];for(let i=0;i<p.length;i+=3)out.push([p[i]*m[0]+p[i+1]*m[4]+p[i+2]*m[8]+m[12],p[i]*m[1]+p[i+1]*m[5]+p[i+2]*m[9]+m[13],p[i]*m[2]+p[i+1]*m[6]+p[i+2]*m[10]+m[14]]);return out};
const x=transform(old),y=transform(next);if(x.length!==y.length)throw Error('vertex count');const max=Math.max(...x.map((p,i)=>Math.hypot(...p.map((v,k)=>v-y[i][k]))));if(max>1e-5)throw Error(`${cls}/${sex} attachment offset ${max}`);checked++;}return {nativeAttachmentParity:checked}})();
 result.equipment=await (async()=>{
const e=window.__muEngine,f=e.flyff,assert=(v,m)=>{if(!v)throw Error(m)};e.setMode('character_select');
const {getStarterItemsForMuClass}=await import('/src/data/muSkillsAndClasses.ts');
const lib=await (await fetch('/mugroup/equipo.json')).json(),report={sets:0,weapons:0,cloth:false};
for(const sex of ['male','female']){
 let items=getStarterItemsForMuClass('fixture','Fixture','DK');await e.syncHeroAppearance('DK',items,sex);
 for(const setName of Object.keys(lib.sets)){
  items=items.map(i=>({...i,setName:['armor','helm','pants','gloves','boots'].includes(i.slot)?setName:i.setName}));
  await e.syncHeroAppearance('DK',items,sex);const a=f.actor;
  for(const slot of ['torso','helmet','pants','hands','feet']){
   const meshes=a.outfit.meshes.filter(m=>m.name.startsWith(`equip_${slot}_`)&&m.isEnabled());assert(meshes.length>0,`missing ${setName}/${sex}/${slot}`);
   assert(meshes.every(m=>m.metadata.equipmentFile===lib.sets[setName][sex]),'wrong selected set');
   assert(meshes.filter(m=>m.skeleton).every(m=>m.skeleton===a.outfit.skeletons[0]),'rig mismatch');
  }
  report.sets++;
 }
 for(const [name,file] of Object.entries(lib.weapons)){
  const offhand=/Escudo|Izq/.test(name);items=items.map(i=>i.slot===(offhand?'shield':'weapon')?{...i,name}:i);
  await e.syncHeroAppearance('DK',items,sex);const slot=offhand?'offhand':'weapon',meshes=f.actor.outfit.meshes.filter(m=>m.name.startsWith(`equip_${slot}_`)&&m.isEnabled());
  assert(meshes.length&&meshes.every(m=>m.metadata.equipmentFile===`${slot}:${file}`),'wrong item '+name);report.weapons++;
 }
 const a=f.actor,mesh=a.outfit.meshes.find(m=>m.name.startsWith('equip_torso_')&&m.isEnabled()),before=Array.from(mesh.getVerticesData('position'));
 a.detach('torso');a.equip('torso',false);assert(a.fragments.some(fr=>fr.cloth),'cloth fragment missing');const fragment=a.fragments.find(fr=>fr.cloth),start=Array.from(fragment.current);
 for(let i=0;i<60;i++)a.update(1/60,{height:0});assert(fragment.current.every(Number.isFinite),'invalid cloth positions');assert(fragment.current.some((v,i)=>Math.abs(v-start[i])>.01),'cloth did not move');
 assert(before.every((v,i)=>v===mesh.getVerticesData('position')[i]),'source mesh mutated');assert(a.body.meshes.some(m=>m.name.startsWith('body_torso')&&m.isEnabled()),'body hidden');
 for(let i=0;i<190;i++)a.update(1/60,{height:0});assert(a.fragments.length===0,'debris not cleaned');report.cloth=true;
}
return report;
})();
 result.streamingAndRaces=await (async()=>{
const e=window.__muEngine,assert=(v,m)=>{if(!v)throw Error(m)}, {getStarterItemsForMuClass}=await import('/src/data/muSkillsAndClasses.ts');
e.setMode('character_select');
await e.syncHeroAppearance('DK',getStarterItemsForMuClass('test','Test','DK'),'male');
const before=getStarterItemsForMuClass('test','Test','DK'),last=before.map(i=>({...i,isEquipped:i.slot==='weapon',setName:'Great Dragon'}));
await Promise.all([e.flyff.equipment(before.map(i=>({...i,setName:'Volcano'}))),e.flyff.equipment(last)]);
assert(!e.flyff.actor.gear.torso.equipped,'stale async gear update');
await Promise.all([e.syncHeroAppearance('DW',getStarterItemsForMuClass('test','Test','DW'),'female'),e.syncHeroAppearance('ELF',getStarterItemsForMuClass('test','Test','ELF'),'male')]);
assert(e.flyff.actor.config.id==='ELF_male','stale async actor');
await e.loadMap('flaris');e.flyff.worldClock=-1e9;const w=e.flyff.world;
const disposed=new WeakSet(),watched=new WeakSet();
const watch=()=>{for(const mesh of e.scene.meshes){const m=mesh.material;if(m&&!watched.has(m)){watched.add(m);m.onDisposeObservable.add(()=>disposed.add(m));}}};watch();
const points=[[1336,1281],[2300,2390],[520,2440],[1336,1281]];const passes=[];
for(let pass=0;pass<3;pass++){
 for(const [x,z]of points){await w.stream(x,z,0,100);watch();assert(w.tiles.size>0,'no sector');
  const used=new Set(w.manifest.tiles.filter(t=>w.tiles.has(t.id)).flatMap(t=>t.objects.map(o=>o.model)));
  assert([...w.containers.keys()].every(k=>used.has(k)),'unused model retained');
  assert([...w.tiles.values()].every(t=>t.root.getChildMeshes().filter(m=>m.material).every(m=>!disposed.has(m.material))),'disposed live material');
 }
 passes.push({materials:e.scene.materials.length,textures:e.scene.textures.length,meshes:e.scene.meshes.length,models:w.containers.size});
}
assert(passes[1].materials===passes[2].materials,'material leak');assert(passes[1].textures===passes[2].textures,'texture leak');assert(passes[1].meshes===passes[2].meshes,'mesh leak');
await e.loadMap('flaris');e.flyff.worldClock=0;e.setMode('character_select');return {latestAppearanceWins:true,streamRevisits:12,resources:passes};
})();
 return result;
})()
