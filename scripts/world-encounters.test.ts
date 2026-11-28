import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMP_SIZE, populateRegionalCamps, regionalTemplate, reachableHuntingLand, SpawnGrid } from '../src/game/encounters.ts';
import { CRATER_NPC_SAFE_RADIUS, inProtectedArea } from '../src/game/worldRegions.ts';
import { damageAgainstMonster, MONSTER_POWER_ENERGY, monsterCombatStats } from '../src/game/monsterCombat.ts';
import { flightHeight } from '../src/game/content/WingRig.ts';
import { waterGeometry } from '../src/game/content/WaterSurface.ts';

test('all four regions have repeatable camps of five, with global separation and coverage', () => {
  const ids = ['flaris', 'robledal', 'puerto_bruma', 'crater_ceniza'];
  const sites = [{ x: 80, z: 140, model: 'aibatt', name: 'Aibatt', level: 1 }];
  const regions = ids.map((id, i) => ({
    id, count: 100, contains: (x: number, z: number) => (x >= 480 ? 1 : 0) + (z >= 480 ? 2 : 0) === i,
    allows: (x: number, z: number) => z >= 120 && (x < 290 || x > 390),
  }));
  const create = () => populateRegionalCamps(960, regions, sites);
  const camps = create();
  assert.deepEqual(camps, create());
  const centers: { x: number; z: number }[] = [];
  for (const region of regions) {
    const members = camps.get(region.id)!;
    assert.ok(members.length > 40);
    assert.equal(members.length % 5, 0);
    members.forEach((member, i) => {
      assert.equal(member.camp, Math.floor(i / 5));
      assert.ok(region.contains(member.x, member.z) && region.allows(member.x, member.z));
      if (i % 5 === 0) centers.push(member);
    });
  }
  assert.ok(camps.get('flaris')!.some(member => member.site?.model === 'aibatt'));
  for (const [i, a] of centers.entries()) for (const b of centers.slice(i + 1)) {
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 100 - 1e-8);
  }
  const grid = new SpawnGrid<{ x: number; z: number }>();
  for (const center of centers) grid.add(center.x, center.z, center);
  const { x, z } = centers[0];
  assert.deepEqual(new Set([...grid.near(x, z, 110)].filter(m => Math.hypot(m.x - x, m.z - z) <= 110)),
    new Set(centers.filter(m => Math.hypot(m.x - x, m.z - z) <= 110)));
});

test('flight covers 2 meters without a discontinuity at the next wingbeat', () => {
  assert.equal(flightHeight(0), flightHeight(1));
  assert.equal(flightHeight(0.5) - flightHeight(0), 2);
  assert.ok(flightHeight(0.75) < flightHeight(0.5));
});

test('regional monster levels rise with distance from the protected capital', () => {
  const choices = [{ level: 1 }, { level: 10 }, { level: 20 }, { level: 25 }];
  assert.equal(regionalTemplate(choices, 0, 90, 90, 1, 25).level, 1);
  assert.equal(regionalTemplate(choices, 0, 840, 90, 1, 25).level, 25);
  assert.ok(regionalTemplate(choices, 0, 465, 90, 1, 25).level > 1);
});

test('water cells share edges and invalid or duplicate cells emit no extra faces', () => {
  const cell = { x: 16, z: 16, height: 80, size: 32, textureId: 1 };
  const data = waterGeometry([cell, cell, { ...cell, x: 48 }, { ...cell, height: 0 }]);
  assert.equal(data.indices?.length, 12);
  const positions = Array.from(data.positions!);
  assert.deepEqual(positions.slice(9, 12), positions.slice(12, 15));
  assert.deepEqual(positions.slice(6, 9), positions.slice(15, 18));
});

test('Madrigal has one regional coordinate space and four distinct routes at every capital', async () => {
  const {nearestRegion,capitalPortals} = await import('../src/game/worldRegions.ts');
  const maps = ['flaris','robledal','puerto_bruma','crater_ceniza'].map((id,i)=>({
    id,spawn:[{x:1336,z:1281},{x:520,z:2440},{x:2300,z:2390},{x:2540,z:490}][i],
  }));
  const portals = capitalPortals(maps);
  assert.equal(new Set(portals.map(p=>p.id)).size,16);
  for (const map of maps) {
    const local = portals.filter(p=>p.from.id === map.id);
    assert.equal(local.length,4);
    assert.deepEqual(local.map(p=>p.target.id),maps.map(m=>m.id));
    for (const p of local) {
      assert.equal(nearestRegion(maps,p.x,p.z).id,map.id);
      assert.equal(Math.round(Math.hypot(p.x-map.spawn.x,p.z-map.spawn.z)),24);
    }
  }
  const visits = new Set();
  for (let i=0;i<=100;i++) visits.add(nearestRegion(maps,1336+1204*i/100,1281-791*i/100).id);
  assert.deepEqual([...visits],['flaris','crater_ceniza']);
});

test('Puerto camps avoid land disconnected from arrival and reach both sides of the port', () => {
  const spawn = { x: 500, z: 600 };
  const land = (x: number, _z: number) => x < 800 || x >= 875;
  const ground = reachableHuntingLand(1200, spawn, land, (x, z) => x > 690 && z < 300 ? 100 : 10);
  assert.equal(ground(950, 600), false, 'a dry island is not reachable');
  assert.equal(ground(730, 250), false, 'a sheer rise is not reachable');
  assert.equal(ground(660, 250), true, 'connected land is reachable');
  const allowed = (x: number, z: number) => ground(x, z) && Math.hypot(x - spawn.x, z - spawn.z) > 262;
  const region = { id: 'puerto', count: 100, contains: () => true, allows: allowed };
  const camps = populateRegionalCamps(1200, [region], []).get('puerto')!;
  assert.ok(camps.every(camp => allowed(camp.x, camp.z)));
  assert.ok(camps.some(camp => camp.z < 250) && camps.some(camp => camp.z > 950));
  assert.ok(camps.some(camp => Math.hypot(camp.x - spawn.x, camp.z - spawn.z) < 330));
  assert.ok(camps.length % CAMP_SIZE === 0);
});

test('Cráter protects 100 m from arrival and 20 m from each NPC', () => {
  const zones = [{ x: 2540, z: 490, radius: 100 }, { x: 2420, z: 918, radius: CRATER_NPC_SAFE_RADIUS }];
  assert.ok(inProtectedArea(2640, 490, 0, zones));
  assert.ok(!inProtectedArea(2640.1, 490, 0, zones));
  assert.ok(inProtectedArea(2420, 938, 0, zones));
  assert.ok(!inProtectedArea(2420, 938.1, 0, zones));
  assert.ok(inProtectedArea(2420, 940, 2, zones));
});

test('regional stats advance and a starter cannot do comparable damage to late monsters', () => {
  for (const [low, high] of [[1, 27], [28, 48], [49, 76], [77, 99]]) {
    const early = monsterCombatStats(low), late = monsterCombatStats(high);
    assert.ok(late.maxHp > early.maxHp && late.maxEnergy > early.maxEnergy && late.strength > early.strength);
    assert.ok(early.maxEnergy >= MONSTER_POWER_ENERGY);
  }
  const late = monsterCombatStats(99), boss = monsterCombatStats(99, true);
  assert.ok(boss.maxHp > late.maxHp && boss.strength > late.strength);
  assert.ok(damageAgainstMonster(250, late.defense, 1, 0, 99) < damageAgainstMonster(250, late.defense, 99, 0, 99) / 20);
  assert.ok(damageAgainstMonster(250, late.defense, 30, 2, 99) > damageAgainstMonster(250, late.defense, 30, 0, 99));
});
