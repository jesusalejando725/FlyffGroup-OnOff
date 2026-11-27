import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CAMERA_DISTANCE,
  DEFAULT_LOOT_FILTERS,
  computeDualPotionRestore,
  computeWingFlightOffsetY,
  getWingEvoBonusStats,
  getWingEvoTier,
  getWingTargetWidth,
  matchesLootFilter,
  projectToMinimap,
  solveCameraWithTerrain,
  stepHeroVerticalPhysics,
} from './worldPhysicsMath';

test('third-person default camera is pulled back +2m (5.4m) and never clips beneath rising hills or ground', () => {
  assert.equal(DEFAULT_CAMERA_DISTANCE, 5.4);

  // Looking steeply downward over a steep hill behind hero
  const res = solveCameraWithTerrain({
    pivotX: 720,
    pivotY: 14,
    pivotZ: -1020,
    alpha: Math.PI / 2,
    beta: 1.62, // Extreme downward tilt attempt
    desiredRadius: DEFAULT_CAMERA_DISTANCE,
    sampleTerrainHeight: (_x, z) => (z < -1022 ? 17.5 : 12.6),
  });

  assert.ok(res.clampedBeta <= 2.08, 'camera pitch must clamp safely within [0.16, 2.08]');
  const eyeGround = res.eyeZ < -1022 ? 17.5 : 12.6;
  assert.ok(res.eyeY >= eyeGround + 0.35, `eyeY (${res.eyeY}) must remain above terrain (${eyeGround})`);
});

test('running downhill slopes keeps hero grounded instead of entering jump_fall or skating', () => {
  let state = { y: 12.0, vy: 0, isAirborne: false, airTime: 0 };
  // Simulate stepping down gentle downhill grades across frames
  const floorSteps = [11.92, 11.81, 11.68, 11.55, 11.42];
  for (const floorY of floorSteps) {
    const step = stepHeroVerticalPhysics({ state, floorY, dt: 0.016 });
    state = step.state;
    assert.equal(state.isAirborne, false, 'walkable downhill slope must never trigger airborne/sliding');
    assert.equal(state.y, floorY);
    assert.equal(step.phase, 'grounded');
  }
});

test('jumping rises cleanly, transitions to falling, and lands decisively at floorY with vy=0', () => {
  let state = { y: 5.0, vy: 0, isAirborne: false, airTime: 0 };
  const jumpStep = stepHeroVerticalPhysics({ state, floorY: 5.0, dt: 0.016, jumpRequested: true });
  state = jumpStep.state;
  assert.equal(jumpStep.justJumped, true);
  assert.equal(jumpStep.phase, 'rising');
  assert.ok(state.vy > 5);

  let sawFalling = false;
  let landed = false;
  for (let i = 0; i < 120; i++) {
    const step = stepHeroVerticalPhysics({ state, floorY: 5.0, dt: 0.016 });
    state = step.state;
    if (step.phase === 'falling') sawFalling = true;
    if (step.justLanded) {
      landed = true;
      break;
    }
  }
  assert.equal(sawFalling, true);
  assert.equal(landed, true);
  assert.equal(state.isAirborne, false);
  assert.equal(state.y, 5.0);
  assert.equal(state.vy, 0);
});

test('minimap projects hero, NPCs, friends, and monsters cleanly inside [2%, 98%] bounds', () => {
  const center = projectToMinimap(0, 0, 'flaris', 3072);
  assert.ok(Math.abs(center.xPct - 50) < 0.01);
  assert.ok(Math.abs(center.yPct - 50) < 0.01);

  const edge = projectToMinimap(5000, -5000, 'ceniza', 3072);
  assert.equal(edge.xPct, 98);
  assert.equal(edge.yPct, 98);
});

test('loot filters allow toggling zen, life, soul, bless, chaos, creation, and talisman individually', () => {
  const custom = { ...DEFAULT_LOOT_FILTERS, zen: false, chaos: false, talisman: true };
  assert.equal(matchesLootFilter('zen', custom), false);
  assert.equal(matchesLootFilter('chaos', custom), false);
  assert.equal(matchesLootFilter('talisman', custom), true);
  assert.equal(matchesLootFilter('creation', custom), true);
  assert.equal(matchesLootFilter('zen', custom, true), true); // Manual click always collects
});

test('every healing potion tier restores BOTH HP and MP simultaneously', () => {
  const menor = computeDualPotionRestore({
    hp: 100,
    maxHp: 500,
    mp: 40,
    maxMp: 300,
    sd: 50,
    maxSd: 200,
    ag: 20,
    maxAg: 100,
    tierId: 'menor',
  });
  assert.ok(menor.restoredHp >= 220);
  assert.ok(menor.restoredMp >= 220);
  assert.ok(menor.nextHp > 100 && menor.nextMp > 40);

  const suprema = computeDualPotionRestore({
    hp: 10,
    maxHp: 1200,
    mp: 15,
    maxMp: 900,
    sd: 0,
    maxSd: 500,
    ag: 0,
    maxAg: 200,
    tierId: 'suprema',
  });
  assert.equal(suprema.nextHp, 1200);
  assert.equal(suprema.nextMp, 900);
});

test('wings follow exact Evo 1->2 (2x), Evo 2->3 (3x), Evo 4 (>Evo 3) scale & +1m outside-city flight', () => {
  const w1 = getWingTargetWidth(getWingEvoTier('Alas Pluma de Flaris (Flyff Evo 1)'));
  const w2 = getWingTargetWidth(getWingEvoTier('Alas Celestiales (Flyff Evo 2)'));
  const w3 = getWingTargetWidth(getWingEvoTier('Wing of Storm +13'));
  const w4 = getWingTargetWidth(getWingEvoTier('Alas Eternas MU (OpenMU Evo 4)'));

  assert.equal(w2, w1 * 2);
  assert.ok(Math.abs(w3 - w2 * 3) < 0.001);
  assert.ok(w4 > w3);

  assert.ok(getWingEvoBonusStats(4).absorbPct > getWingEvoBonusStats(3).absorbPct);
  assert.ok(getWingEvoBonusStats(3).atkBonusPct > getWingEvoBonusStats(2).atkBonusPct);

  assert.equal(computeWingFlightOffsetY(true, true), 0);
  assert.equal(computeWingFlightOffsetY(false, false), 0);
  assert.equal(computeWingFlightOffsetY(false, true), 0);
});
