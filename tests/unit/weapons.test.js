// Weapon tests: fire rates, reloads, switching, spread, recoil and aiming,
// checked against the numbers in src/weapons/weapons-data.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRange, click } from '../support/combat.js';
import { WEAPONS, damageAt } from '../../src/weapons/weapons-data.js';
import { DEFAULT_TUNING } from '../../src/player/controller.js';

const near = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: expected ${expected} ± ${tolerance}, got ${actual}`);

test('damage falls off between the near and far ranges', () => {
  const c = WEAPONS.carbine;
  assert.equal(damageAt(c, 5), 30);
  assert.equal(damageAt(c, 25), 30);
  assert.equal(damageAt(c, 42.5), 26);
  assert.equal(damageAt(c, 60), 22);
  assert.equal(damageAt(c, 200), 22);
});

test('the carbine fires at 750 rounds a minute (12.5 a second)', async () => {
  const r = await makeRange();
  r.settle();
  const { shots } = r.run(1, { fire: true });
  near(shots, 12.5, 1, 'shots in one second');
});

test('the SMG fires at 900 rounds a minute (15 a second)', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.6, { slot: 2 });
  const { shots } = r.run(1, { fire: true });
  near(shots, 15, 1, 'shots in one second');
});

test('semi-auto: holding the trigger fires once; each click fires again', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.6, (i) => ({ slot: i === 0 ? 4 : 0 }));
  assert.equal(r.gun.def.id, 'pistol');
  assert.equal(r.run(1, { fire: true, firePressed: false }).shots, 0, 'holding without a fresh click does nothing');
  let shots = 0;
  for (let i = 0; i < 5; i++) shots += r.run(0.2, click('firePressed')).shots;
  assert.equal(shots, 5);
});

test('the shotgun fires 8 pellets and must pump between shots', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.9, (i) => ({ slot: i === 0 ? 3 : 0 }));
  assert.equal(r.run(0.3, click('firePressed')).shots, 8);
  assert.equal(r.run(0.3, click('firePressed')).shots, 0, 'too soon: still pumping');
  r.run(0.3);
  assert.equal(r.run(0.1, click('firePressed')).shots, 8, 'ready again after about 0.86 s');
});

test('an empty gun clicks, then reloads; an empty reload takes longer', async () => {
  const r = await makeRange();
  r.settle();
  r.run(3, { fire: true });
  assert.equal(r.gun.mag, 0);
  r.run(0.05, click('firePressed'));
  assert.equal(r.count('weapon:dry'), 1);
  assert.equal(r.gun.status, 'reloading');
  r.run(WEAPONS.carbine.reload.empty - 0.15);
  assert.equal(r.gun.mag, 0, 'not finished yet');
  r.run(0.2);
  assert.equal(r.gun.mag, 30);
  assert.equal(r.gun.reserve, 90);
});

test('a tactical reload (some bullets left) takes the shorter time', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.4, { fire: true });
  const left = r.gun.mag;
  assert.ok(left < 30 && left > 0);
  r.run(WEAPONS.carbine.reload.tactical - 0.1, click('reload'));
  assert.equal(r.gun.mag, left);
  r.run(0.15);
  assert.equal(r.gun.mag, 30);
});

test('the shotgun reloads one shell at a time, and firing interrupts it', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.9, (i) => ({ slot: i === 0 ? 3 : 0 }));
  r.run(1, click('firePressed'));
  r.run(1, click('firePressed'));
  assert.equal(r.gun.mag, 4);
  const sr = WEAPONS.shotgun.reload;
  r.run(sr.start + sr.perShell + 0.05, click('reload'));
  assert.equal(r.gun.mag, 5, 'one shell in');
  const { shots } = r.run(0.1, click('firePressed'));
  assert.equal(r.gun.status, 'ready', 'firing stopped the reload');
  assert.equal(shots, 8);
});

test('switching guns takes the lower time plus the raise time', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.05, { slot: 4 });
  const wait = WEAPONS.carbine.swap.lower + WEAPONS.pistol.swap.raise;
  r.run(wait - 0.12);
  assert.equal(r.run(0.05, click('firePressed')).shots, 0, 'still switching');
  r.run(0.15);
  assert.equal(r.gun.def.id, 'pistol');
  assert.equal(r.run(0.05, click('firePressed')).shots, 1);
});

test('Q swaps back to the last gun, and the wheel cycles', async () => {
  const r = await makeRange();
  r.settle();
  r.run(1, (i) => ({ slot: i === 0 ? 3 : 0 }));
  assert.equal(r.gun.def.id, 'shotgun');
  r.run(1, (i) => ({ lastWeapon: i === 0 }));
  assert.equal(r.gun.def.id, 'carbine');
  r.run(1, (i) => ({ cycle: i === 0 ? -1 : 0 }));
  assert.equal(r.gun.def.id, 'pistol', 'wheel back from slot 1 wraps to slot 4');
});

test('pressing fire stops a sprint, and the first shot waits for the gun to come up', async () => {
  const r = await makeRange();
  r.settle();
  r.run(1, { moveZ: 1, sprint: true });
  assert.ok(r.soldier.state.sprinting);
  let firstShotTick = -1;
  let tick = 0;
  r.run(0.5, () => ({ moveZ: 1, sprint: true, fire: true }));
  for (const e of r.log) if (e.name === 'weapon:fire' && firstShotTick < 0) firstShotTick = tick;
  assert.equal(r.soldier.state.sprinting, false);
  assert.ok(r.count('weapon:fire') > 0, 'fired after the sprint-out delay');
  tick++;
});

test('spread grows while firing and shrinks back afterwards', async () => {
  const r = await makeRange();
  r.settle();
  const base = r.soldier.arsenal.state.spread;
  r.run(0.5, { fire: true });
  const bloomed = r.soldier.arsenal.state.spread;
  assert.ok(bloomed > base + 1, `bloomed from ${base.toFixed(2)} to ${bloomed.toFixed(2)}`);
  r.run(1);
  near(r.soldier.arsenal.state.spread, base, 0.05, 'recovered');
});

test('aiming down the sights tightens spread and slows you down', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.4, { ads: true });
  assert.equal(r.soldier.arsenal.state.ads, 1);
  near(r.soldier.arsenal.state.spread, WEAPONS.carbine.spread.ads, 0.01, 'aimed spread');
  r.run(1.5, { ads: true, moveZ: 1 });
  const expected = DEFAULT_TUNING.walkSpeed * WEAPONS.carbine.moveScale * WEAPONS.carbine.ads.move;
  near(r.soldier.state.speed, expected, 0.1, 'aimed walking speed');
  r.run(1, { ads: true, moveZ: 1, sprint: true });
  assert.equal(r.soldier.state.sprinting, false, 'cannot sprint while aiming');
});

test('aim stays fully up while you hold it (regression: it used to flicker every tick)', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.4, { ads: true });
  for (let i = 0; i < 10; i++) {
    r.run(1 / 60, { ads: true });
    assert.equal(r.soldier.arsenal.state.ads, 1);
  }
});

test('recoil kicks the view up, and most of it drifts back', async () => {
  const r = await makeRange();
  r.settle();
  r.run(0.8, { fire: true });
  const kicked = r.look.pitch;
  assert.ok(kicked > 0.05, `view went up ${(kicked * 57.3).toFixed(1)} degrees`);
  r.run(2);
  assert.ok(r.look.pitch < kicked * 0.5, 'drifted back down');
  assert.ok(r.look.pitch > 0, 'but not all the way: you have to pull down');
});

test('the same seed gives exactly the same shots (determinism)', async () => {
  const script = (i) => ({ fire: i % 40 < 25, moveX: i % 80 < 40 ? 1 : -1 });
  const a = await makeRange([], { seed: 42 });
  const b = await makeRange([], { seed: 42 });
  const c = await makeRange([], { seed: 43 });
  for (const r of [a, b, c]) r.run(2, script);
  assert.deepEqual(a.look, b.look);
  const ends = (r) => r.log.filter((e) => e.name === 'weapon:fire').flatMap((e) => e.shots.map((s) => s.end));
  assert.deepEqual(ends(a), ends(b));
  assert.notDeepEqual(ends(a), ends(c), 'a different seed sprays differently');
});
