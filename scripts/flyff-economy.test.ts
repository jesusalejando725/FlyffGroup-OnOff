import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLYFF_ECONOMY_CATALOG, equippedGearBonuses, rollFlyffDrops } from '../src/data/flyffEconomy.ts';
import type { MuItem } from '../src/types/game.ts';

const items = new Map(FLYFF_ECONOMY_CATALOG.map(item => [item.id, item]));
const samples = (...values: number[]) => () => values.shift() ?? .99;

test('regional level cap and multi-billion Penya prices survive the Flyff catalog', () => {
  const doom = items.get('flyff_doom')!;
  assert.equal(doom.zenCost, 5_000_000_000);
  assert.equal(doom.sourceLevel, 120);
  assert.equal(doom.requiredLevel, 99);
  assert.equal(items.get('flyff_historic')?.zenCost, 475_000_000);
  assert.equal(items.get('flyff_zeroth')?.maxDmg, 264);
  assert.equal(items.get('flyff_nox_f_armor')?.zenCost, 150_000_000);
  for (const item of items.values()) {
    assert.ok(item.requiredLevel! >= 1 && item.requiredLevel! <= 99);
    if (item.dropExclusive) assert.deepEqual(item.vendorRoles, []);
  }
});

test('normal enemies cannot drop competitive or exclusive gear even with a configured pool', () => {
  const normal = { id: 'aibatt', name: 'Aibatt', level: 1, drops: ['flyff_doom', 'flyff_crystal'] };
  const forcedRolls = rollFlyffDrops(normal, () => 0);
  assert.deepEqual(forcedRolls, ['flyff_hp_small', 'flyff_wooden']);
  assert.deepEqual(rollFlyffDrops({ ...normal, level: 61 }, () => 0),
    ['flyff_hp_large', 'flyff_bastard', 'flyff_element_card']);
});

test('giants guarantee a piece, and unique drops are boss specific with an independent rate', () => {
  const khan = { id: 'beast_overlord_khan', name: 'Beast Overlord Khan', level: 80, isBoss: true };
  assert.deepEqual(rollFlyffDrops(khan, () => .99), ['flyff_kaleonizer']);
  assert.deepEqual(rollFlyffDrops(khan, samples(0, .99, .99, .00049)), ['flyff_bastard', 'flyff_crystal']);
  assert.deepEqual(rollFlyffDrops(khan, samples(0, .99, .99, .0005)), ['flyff_bastard']);
  assert.deepEqual(rollFlyffDrops({ ...khan, id: 'other', name: 'Otro' }, () => .99), ['flyff_kaleonizer']);
  assert.deepEqual(rollFlyffDrops({ ...khan, isBoss: false }, () => .99), []);
});

test('set bonuses require four distinct, equipped, intact pieces from the same set', () => {
  const pieces = [...items.values()].filter(item => item.setName === 'Blain').map(item => ({
    ...item, isEquipped: true, durability: 100, charId: 'hero', acquiredAt: '', originalOwner: 'Hero',
  } satisfies MuItem));
  assert.deepEqual(equippedGearBonuses(pieces), { hpPct: 15, defensePct: 15, blockPct: 15 });
  assert.deepEqual(equippedGearBonuses([...pieces.slice(0, 3), pieces[0]]), {});
  assert.deepEqual(equippedGearBonuses(pieces.map((item, i) => ({ ...item, durability: i === 0 ? 0 : 100 }))), {});
});
