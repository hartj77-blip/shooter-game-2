// Enemies against a squad of players (docs/lessons/11-how-co-op-works.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFight, enemy } from '../support/ai.js';
import { DIFFICULTY, ROLES, PLAYER_SCALING } from '../../src/ai/enemy-data.js';

const SOUTH = Math.PI;

test('an enemy targets the player it can see, and only that player gets hurt', async () => {
  const f = await makeFight({
    players: 2,
    pieces: [
      enemy('rifleman', [0, 0, -15], { yaw: SOUTH }),
      // A wall to hide player 2 behind (they are moved there below).
      { type: 'wall', from: [6, -2], to: [14, -2], height: 3 },
    ],
  });
  f.teleport([10, 0, 2], 0, 1); // player 2, behind the wall
  const e = f.e();
  const targeted = new Set();
  f.run(12, {}, () => { if (e.target) targeted.add(e.target.owner); });
  assert.deepEqual([...targeted], [0], 'only ever targets the visible player');
  assert.ok(f.health.state.taken > 0, 'player 1 got shot');
  assert.equal(f.players[1].health.state.taken, 0, 'player 2 (out of sight) did not');
  assert.ok(f.log.some((x) => x.name === 'player:hurt' && x.owner === 0));
});

test('each player has their own attack tokens', async () => {
  const pieces = [-12, -6, 0, 6, 12].map((x) => enemy('rifleman', [x, 0, -18], { yaw: SOUTH, squad: 'a' }));
  const f = await makeFight({ pieces, players: 2, god: true });
  f.teleport([-6, 0, 0], 0, 0);
  f.teleport([6, 0, 0], 0, 1);
  let mostPerPlayer = 0, mostTotal = 0;
  f.run(15, {}, () => {
    const per = new Map();
    let total = 0;
    for (const h of f.enemies.tokens.holders.values()) {
      if (h.pool !== 'general') continue;
      per.set(h.target, (per.get(h.target) ?? 0) + 1);
      total++;
    }
    mostPerPlayer = Math.max(mostPerPlayer, ...per.values(), 0);
    mostTotal = Math.max(mostTotal, total);
  });
  assert.ok(mostPerPlayer <= DIFFICULTY.regular.tokens, `${mostPerPlayer} on one player at once`);
  assert.ok(mostTotal > DIFFICULTY.regular.tokens, `two players draw more fire in total (${mostTotal})`);
});

test('a downed player is ignored: enemies switch to someone still standing', async () => {
  const f = await makeFight({ players: 2, pieces: [enemy('rifleman', [0, 0, -15], { yaw: SOUTH })] });
  f.run(4);
  const e = f.e();
  assert.ok(e.target, 'has a target');
  const first = e.target.owner;
  f.players[first].health.damage(1000);
  assert.equal(f.players[first].health.state.down, true);
  f.run(3);
  assert.notEqual(e.target?.owner, first, 'moved on to the other player');
  assert.ok(f.enemies.ai.targets.every((t) => t.owner !== first), 'the downed player is off the list');
});

test('being shot by a player you were not watching makes them your target', async () => {
  const f = await makeFight({ players: 2, pieces: [enemy('rifleman', [0, 0, -15], { yaw: SOUTH })] });
  const e = f.e();
  f.enemies.damage(e, 10, { owner: 1, from: f.players[1].soldier.state.pos, zone: 'body' });
  assert.equal(e.target.owner, 1);
  assert.equal(e.inCombat, true);
});

test('enemies get tougher with more players', async () => {
  for (const players of [1, 3]) {
    const f = await makeFight({ players, pieces: [enemy('rifleman', [0, 0, -15], { yaw: SOUTH })] });
    assert.equal(f.e().maxHealth, Math.round(ROLES.rifleman.health * PLAYER_SCALING.health[players - 1]));
  }
});

test('a player leaving is forgotten; enemies stop targeting them', async () => {
  const f = await makeFight({ players: 2, pieces: [enemy('rifleman', [0, 0, -15], { yaw: SOUTH })] });
  f.run(3);
  f.sim.removePlayer(1);
  f.run(1);
  assert.equal(f.enemies.players.length, 1);
  assert.ok(f.list.every((e) => e.target === null || e.target.owner === 0));
});
