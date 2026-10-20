// Mission modifiers (game/modifiers.js): house rules that make a mission harder, for more XP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../../src/world/physics.js';
import { createSim } from '../../src/game/sim.js';
import { MODIFIERS, cleanModifiers, modifierXp } from '../../src/game/modifiers.js';
import { CALLINS } from '../../src/game/callins.js';
import harbour from '../../levels/harbour.js';
import { MISSIONS } from '../../levels/missions.js';

const def = { ...harbour, mission: MISSIONS.find((m) => m.id === 'harbour-eliminate') };

test('modifiers are checked, and each adds its XP bonus', () => {
  assert.deepEqual(cleanModifiers(['lethal', 'lethal', 'god', 3]), ['lethal']);
  assert.deepEqual(cleanModifiers('nope'), []);
  assert.equal(modifierXp([]), 1);
  assert.ok(Math.abs(modifierXp(['ironman', 'lethal']) - (1 + MODIFIERS.ironman.xp + MODIFIERS.lethal.xp)) < 1e-9);
});

test('Scarce halves the crates and the call-in charge; Lethal doubles damage both ways; Iron man saves no checkpoints', async () => {
  await initPhysics();
  const plain = createSim({ def, seed: 3 });
  const hard = createSim({ def, seed: 3, modifiers: ['scarce', 'lethal', 'ironman'] });
  assert.deepEqual(hard.modifiers, ['scarce', 'lethal', 'ironman']);
  plain.supply.list.forEach((c, i) => assert.equal(hard.supply.list[i].full, Math.max(1, Math.round(c.full / 2))));
  for (const s of [plain, hard]) s.events.emit('enemy:down', { owner: 0, pos: { x: 0, y: 0, z: 0 } });
  assert.ok(Math.abs(hard.callins.player(0).charge - CALLINS.charge.kill / 2) < 1e-9);
  // Damage: the same hit on the same guard, and the same enemy shot at a player.
  const hit = { owner: 0, zone: 'body', point: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 }, weapon: 'carbine' };
  const [a, b] = [plain, hard].map((s) => s.enemies.list[0]);
  plain.enemies.damage(a, 10, hit);
  hard.enemies.damage(b, 10, hit);
  assert.equal(a.maxHealth - a.health, 10);
  assert.equal(b.maxHealth - b.health, 20);
  assert.equal(hard.enemies.options.lethal, MODIFIERS.lethal.damage);
  // The officer goes down: on to extraction, but with no checkpoint.
  for (const s of [plain, hard]) {
    const officer = s.enemies.list.find((e) => e.hvt);
    s.enemies.damage(officer, 1e5, hit);
    s.tick(1 / 60, new Map());
  }
  assert.equal(plain.operation.view.checkpoint, 1);
  assert.equal(hard.operation.view.checkpoint, 0, 'iron man: none');
  assert.equal(hard.operation.view.kind, 'extract');
  plain.dispose();
  hard.dispose();
  const practice = createSim({ def: harbour, seed: 3, modifiers: ['lethal'] });
  assert.deepEqual(practice.modifiers, [], 'modifiers are for missions only');
  practice.dispose();
});
