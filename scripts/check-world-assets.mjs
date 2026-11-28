// Cross-file integration checks; no GPU or external services required.
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../src/game/content/recipes.ts';
import { BESTIARY } from '../src/data/bestiary.ts';
import { MU_SKILLS } from '../src/data/muSkillsAndClasses.ts';
import { HERO_APPEARANCES, heroAppearancePath } from '../src/data/heroAppearances.ts';

const publicRoot = new URL('../public/', import.meta.url);
const root = new URL('../public/mugroup/', import.meta.url);
const readJSON = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const required = new Set();

function resolveRel(rel) {
  return rel;
}

async function asset(path) {
  const rel = resolveRel(path);
  const url = new URL(rel, root);
  assert(url.href.startsWith(publicRoot.href), `Asset outside public: ${path}`);
  const info = await stat(fileURLToPath(url));
  assert(info.isFile() && info.size > 0, `Empty asset: ${path}`);
  assert(info.size < 25 * 1024 * 1024, `Asset exceeds offline cache limit: ${path}`);
  required.add(rel);
}

async function glb(path) {
  await asset(path);
  const bytes = await readFile(new URL(resolveRel(path), root));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, path);
  assert.equal(bytes.readUInt32LE(4), 2, path);
  assert.equal(bytes.readUInt32LE(8), bytes.length, path);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
}

const characters = await readJSON('personajes.json');
assert.equal(characters.length, 10);
assert.equal(new Set(characters.map((c) => c.id)).size, 10);
for (const cls of Object.keys(RECIPES)) {
  for (const sex of ['male', 'female']) {
    const c = characters.find((ch) => ch.classId === cls && ch.sex === sex);
    assert(c, `Missing ${cls}/${sex}`);
    const outfit = await glb(c.model);
    const body = await glb(c.body);
    assert.equal(outfit.skins[0].joints.length, 30, c.id);
    assert.equal(body.skins[0].joints.length, 30, c.id);
    assert(outfit.animations.length >= 13, `${c.id} animations >= 13`);
    for (const clip of ['idle', 'run', 'attack', 'hit', 'death', 'jump_land', 'cast_release']) {
      assert(outfit.animations.some((a) => a.name === clip), `${c.id}/${clip}`);
    }
    assert(outfit.nodes.some((n) => n.name === 'socket_rightHand'), `Weapon socket: ${c.id}`);
    await asset(c.model.replace('.glb', '.animaciones.json'));
  }
}

assert.equal(new Set(HERO_APPEARANCES.map(appearance => appearance.id)).size, HERO_APPEARANCES.length);
let customCharacters = 0;
for (const appearance of HERO_APPEARANCES) {
  assert(RECIPES[appearance.classId], appearance.id);
  const variantBytes = [];
  for (const sex of ['male', 'female']) {
    const path = heroAppearancePath(appearance.id, sex);
    const doc = await glb(`${path}.glb`);
    const file = new URL(`${path}.glb`, root);
    const bytes = await readFile(file);
    const info = await stat(file);
    assert(info.size < 2 * 1024 * 1024, `Mobile budget: ${path}`);
    variantBytes.push(bytes);
    await asset(`${path}.png`);
    assert.equal(doc.skins[0].joints.length, 30, path);
    assert.equal(doc.extras.sex, sex, path);
    assert(doc.nodes.some(node => node.name.startsWith('costume_') && node.skin === 0), path);
    for (const clip of ['idle', 'run', 'attack', 'cast_release', 'hit', 'death']) {
      assert(doc.animations.some(anim => anim.name === clip), `${path}/${clip}`);
    }
    const jsonLength = bytes.readUInt32LE(12);
    const buffer = bytes.subarray(28 + jsonLength);
    for (const node of doc.nodes.filter(node => node.name.startsWith('costume_'))) {
      for (const primitive of doc.meshes[node.mesh].primitives) {
        const weights = doc.accessors[primitive.attributes.WEIGHTS_0];
        const start = doc.bufferViews[weights.bufferView].byteOffset;
        for (let i = 0; i < weights.count; i++) {
          const sum = Array.from({length: 4}, (_, j) => buffer.readFloatLE(start + 16 * i + 4 * j)).reduce((a, b) => a + b);
          assert(Math.abs(sum - 1) < 1e-4, `${path}: invalid skinned vertex`);
        }
      }
    }
    customCharacters++;
  }
  assert(!variantBytes[0].equals(variantBytes[1]), appearance.id);
}

for (const frame of ['WndInventory','WndInventory3D']) await asset('ui/'+frame+'.png');
assert.deepEqual((await readdir(new URL('openmu/models/',publicRoot))).sort(), ['drop_bless.glb','drop_life.glb','drop_soul.glb']);
for (const jewel of ['bless','soul','life']) await glb('../openmu/models/drop_'+jewel+'.glb');
const equipment = await readJSON('equipo.json');
await asset('equipo.json');
for (const file of new Set(Object.values(equipment.weapons))) await glb(file);
for (const file of new Set(Object.values(equipment.wings))) await glb(file);
for (const family of Object.values(equipment.sets)) {
  for (const sex of ['male', 'female']) {
    const outfit = await glb(family[sex]);
    assert.equal(outfit.skins[0].joints.length, 30);
  }
}

const {wingCatalog} = JSON.parse(await readFile(new URL('../ADMIN/items.json',import.meta.url),'utf8'));
assert.equal(new Set(wingCatalog.map(w=>w.glb)).size,wingCatalog.length);
for (const w of wingCatalog) {
  const doc=await glb(w.glb);
  assert(doc.images.length && doc.skins.length && ['stand','walk'].every(clip=>doc.animations.some(a=>a.name===clip)),w.id);
  await asset(w.auraTexture);
  await asset('ui/items/'+w.glb.split('/').pop().replace('.glb','.webp'));
}
const pet=await glb('equipo/pet_angel_white.glb');
assert(pet.images.length && pet.animations.some(a=>a.name==='stand'));
for (const id of ['pet_angel_white','ring1','ring2','pendant','jewel-bless','jewel-soul','jewel-chaos','jewel-life','jewel-harmony']) await asset('ui/items/'+id+'.webp');

const media = await readJSON('efectos-audio.json');
for (const path of Object.values(media.sounds)) await asset(path);

const uniqueEffects = new Set();
const uniqueSounds = new Set();
let skills = 0;
for (const [cls, recipes] of Object.entries(RECIPES)) {
  assert.equal(recipes.length, MU_SKILLS[cls].length);
  for (let i = 0; i < recipes.length; i++) {
    const [effect, sound] = recipes[i];
    assert.equal(MU_SKILLS[cls][i].flyffEffect, effect, `Mismatch effect for ${cls}[${i}]`);
    assert.equal(MU_SKILLS[cls][i].flyffSound, sound, `Mismatch sound for ${cls}[${i}]`);
    assert(!uniqueEffects.has(effect), `Duplicate skill effect: ${effect}`);
    assert(!uniqueSounds.has(sound), `Duplicate skill sound: ${sound}`);
    uniqueEffects.add(effect);
    uniqueSounds.add(sound);

    const path = `efectos/${effect}.json`;
    const def = await readJSON(path);
    await asset(path);
    assert.equal(def.missing?.length ?? 0, 0, `Incomplete selected effect: ${effect}`);
    assert(media.sounds[sound], `Missing sound: ${sound}`);
    for (const part of def.parts) {
      for (const texture of part.textures ?? []) await asset(texture);
      if (part.mesh) await asset(part.mesh);
    }
    await asset(`ui/skill-${cls}-${i}.webp`);
    skills++;
  }
}
assert.equal(skills, 35, 'Expected seven distinct skills for each of five classes');

// Verify water & weather & sparkle textures + NPC GLBs + >= 40 Monster GLBs
for (const tex of [
  'efectos/texturas/water.png',
  'efectos/texturas/obj_mamaprtree.png',
  'efectos/texturas/sfx_genlight01-1.png',
]) {
  await asset(tex);
}

const npcFiles = (await readdir(fileURLToPath(new URL('npcs/', root)))).filter((f) => f.endsWith('.glb'));
assert(npcFiles.length >= 6, `Expected >= 6 NPC GLBs, got ${npcFiles.length}`);
for (const f of npcFiles) await glb(`npcs/${f}`);

const monsterFiles = (await readdir(fileURLToPath(new URL('monstruos/', root)))).filter((f) => f.endsWith('.glb'));
assert(new Set(BESTIARY.map(species => species.id)).size >= 40, 'Expected at least 40 original species');
assert(monsterFiles.length >= 60, 'Missing integrated monster GLBs');

const world = await readJSON('mundo/mundo.json');
assert.equal(world.sizeMeters, 3072);
assert.equal(world.tiles.length, 36);
const height = await readFile(new URL('mundo/heightmap.f32', root));
assert.equal(height.length, world.heightResolution ** 2 * 4);
for (let i = 0; i < height.length; i += 4) assert(Number.isFinite(height.readFloatLE(i)));
await asset('mundo/heightmap.f32');
for (const tile of world.tiles) {
  await glb(tile.terrain);
  await asset(tile.height);
  await asset(tile.surface);
  for (const object of tile.objects) assert(world.models[object.model], `Unknown model: ${object.model}`);
}
for (const model of Object.values(world.models)) {
  await glb(model.file);
  if (model.collision) {
    await asset(model.collision);
    assert(model.collisionBounds?.min.every(Number.isFinite));
    assert(model.collisionBounds?.max.every(Number.isFinite));
  }
}

// Validate renderable animation data and the artwork required by the inventory and HUD.
for (const file of monsterFiles) {
  const doc = await glb('monstruos/' + file);
  const bones = new Set(doc.skins?.flatMap(skin=>skin.joints.flatMap(i=>doc.nodes[i].children || [])));
  assert(doc.skins?.length && doc.nodes.some((n,i)=>n.mesh !== undefined && (n.skin !== undefined || bones.has(i))),file);
  for (const clip of ['stand','walk','atk1']) assert(doc.animations.some(a=>a.name===clip && a.channels.length),file+': '+clip);
}
for (const c of characters) {
  const doc=await glb(c.model);
  for (const clip of [...Array.from({length:7},(_,i)=>'power_'+i),'flight']) assert(doc.animations.some(a=>a.name===clip && a.channels.length),c.id+': '+clip);
}
const loadData = async name => JSON.parse(await readFile(new URL('../src/data/'+name+'.json',import.meta.url),'utf8'));
const families=await loadData('setFamilies'), arms=await loadData('setArmaments');
for (const [cls,sets] of Object.entries(families)) {
  assert.equal(new Set(sets).size,10);
  for (const family of sets) for (const sex of ['male','female']) {
    await asset('equipo/'+family+'_'+sex+'.glb');
    for (const slot of ['armor','pants','helm','boots','gloves']) await asset('ui/items/'+family+'_'+sex+'-'+slot+'.webp');
  }
  for (let i=0;i<6;i++) await asset('ui/skill-'+cls+'-'+i+'.webp');
}
for (const files of Object.values(arms)) {
  assert.equal(new Set(files).size,10);
  for (const file of files) { await asset(file);await asset('ui/items/'+file.split('/').pop().replace('.glb','.webp')); }
}
for (const key of await loadData('creatureVoices')) await asset('audio/voces/'+key+'.ogg');
for (const id of ['red','gold','medusa','selupan','kundum']) await asset('ui/event-'+id+'.webp');

const khan = await glb('monstruos/besibigfoot.glb');
assert.ok(khan.skins[0].joints.length > 1 && khan.images.length > 0);
for (const clip of ['stand', 'walk', 'atk1', 'atk2', 'atk3', 'dmg1', 'die1']) {
  assert.ok(khan.animations.some(ani => ani.name === clip), `Beast Overlord Khan: ${clip}`);
}
for (const clip of ['atk1', 'dmg1', 'die1']) await asset(`audio/npc_besibigfoot_${clip}.wav`);

const market = await readJSON('market-assets.json');
const stockIds = new Set();
for (const row of market.stock) {
  assert.ok(!stockIds.has(row.id), row.id);
  stockIds.add(row.id);
  assert.ok(Object.hasOwn(market.items, row.name) && row.npcs.length && row.cost > 0, row.name);
  if (row.slot === 'consumable') assert.ok(row.heal > 0, row.name);
  if (['weapon', 'shield'].includes(row.slot)) assert.ok(market.items[row.name].model, row.name);
  if (row.setName) assert.ok(market.sets[row.setName]?.[row.sex], row.name);
}
for (const { icon, model } of Object.values(market.items)) {
  await asset(icon);
  if (model) await glb(model);
}
for (const set of Object.values(market.sets)) {
  for (const file of Object.values(set)) {
    const doc = await glb(file);
    assert.ok(doc.images?.length && doc.skins?.[0]?.joints.length === 30, file);
  }
}
for (const sex of ['male', 'female']) {
  const elf = await glb(`personajes/ELF/ELF_${sex}.glb`);
  const clips = elf.animations.filter(ani => /^power_/.test(ani.name));
  assert.equal(clips.length, 7);
  assert.equal(clips.find(clip => clip.name === 'power_3').extras.motion, 'SklRagIceArr');
  assert.equal(clips.find(clip => clip.name === 'power_5').extras.motion, 'SklAcrRain');
}

console.log(
  JSON.stringify(
    {
      characters: characters.length + customCharacters,
      skills,
      npcs: npcFiles.length,
      monsters: monsterFiles.length,
      sounds: Object.keys(media.sounds).length,
      sectors: world.tiles.length,
      objects: world.tiles.reduce((n, t) => n + t.objects.length, 0),
      models: Object.keys(world.models).length,
      equipmentModels: new Set([
        ...Object.values(equipment.weapons),
        ...Object.values(equipment.wings),
        ...wingCatalog.map(w=>w.glb),
        'equipo/pet_angel_white.glb',
        ...Object.values(equipment.sets).flatMap(Object.values),
      ]).size,
      referencedFiles: required.size,
    },
    null,
    2,
  ),
);
