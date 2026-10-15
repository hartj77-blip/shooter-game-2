// Enemies: every enemy soldier in the level, and what they share.
//
// Shared between all of them: the navigation grid and cover points (built once
// per level), the noise board, squads, attack tokens, a queue of route
// requests, and what they currently know about the player.
//
// One tick, in the order main.js calls them:
//   enemies.move(dt)          each enemy's motor makes a command; its soldier moves
//   ... targets.update, world.step(), your soldier.act ...
//   enemies.playerShots(shots) your bullets: who did they fly past? (that's being shot at)
//   enemies.think(dt)         senses and brains (each enemy every 0.1 s, taking turns),
//                             then a couple of A* route searches from the queue
//   enemies.act(dt)           enemies fire; near misses on you are noted
//
// Simulation only, deterministic from the seed: the same commands from you
// give the same fight, which is what co-op (milestone 4) will rely on.

import { createEnemy, command, afterShots } from './enemy.js';
import { DIFFICULTY, BARKS } from './enemy-data.js';
import { sense } from './senses.js';
import { createSquads, createTokens, report, squadMates } from './squad.js';
import { route } from './astar.js';
import { createRandom } from '../core/random.js';
import { events as gameEvents } from '../core/events.js';

const THINK_EVERY = 6;        // ticks between one enemy's thoughts (6 ticks = 0.1 s)
const ROUTES_PER_TICK = 2;    // A* searches allowed per tick
const NEAR_MISS = 1.3;        // metres: a bullet passing this close to your head is a near miss

/**
 * @param {object} opts
 * @param {object} opts.world, opts.registry
 * @param {object} opts.nav     ai/nav-grid.js
 * @param {object} opts.cover   ai/cover.js
 * @param {object} opts.noise   ai/noise.js
 * @param {Array}  opts.specs   enemy pieces from the level
 * @param {object} opts.player  { soldier, health }
 * @param {string} [opts.difficulty]
 */
export function createEnemies({ world, registry, nav, cover, noise, specs, player, events = gameEvents, seed = 1, difficulty = 'regular' }) {
  const ai = {
    world, registry, nav, cover, noise, events, seed,
    time: 0,
    tick: 0,
    rng: createRandom(seed),
    difficulty: DIFFICULTY[difficulty] ?? DIFFICULTY.regular,
    player: { owner: player.soldier.owner, pos: { x: 0, y: 0, z: 0 }, eye: null, chest: null, head: null, crouched: false, speed: 0, sprinting: false, down: false, firedAt: -Infinity },
    alive: [],
    options: { freeze: false, noBarks: false },
  };
  const taken = new Map(); // cover point id -> enemy
  const queue = [];        // enemies waiting for a route
  let list = [];
  let squads = new Map();
  const tokens = createTokens(() => ai.difficulty.tokens);
  let lastBarkAt = -Infinity;

  // ---- what the brains and motors can ask for
  ai.report = (e, pos, seen) => report(squads, e, pos, ai.time, seen);
  ai.takeToken = (e) => tokens.take(e, ai.time);
  ai.release = (e) => tokens.release(e);
  ai.claim = (e, id) => {
    for (const [k, v] of taken) if (v === e) taken.delete(k);
    taken.set(id, e);
  };
  ai.taken = (e) => new Set([...taken].filter(([, v]) => v !== e && !v.dead).map(([k]) => k));
  ai.cellPos = (c) => nav.pos(c);
  ai.nearestWalkable = (p) => {
    const c = nav.nearest(p, { radius: 2 });
    return c >= 0 ? nav.pos(c) : { ...p };
  };
  ai.requestPath = (e) => {
    if (!e.path.pending) {
      e.path.pending = true;
      queue.push(e);
    }
  };
  ai.bark = (e, kind) => {
    if (ai.options.noBarks || e.dead) return;
    const sq = e.squad;
    // Not too chatty: one line per squad every 2 s, one in the whole level every 0.8 s.
    const urgent = kind === 'spotted' || kind === 'manDown';
    if (!urgent && (ai.time - sq.lastBark < 2 || ai.time - lastBarkAt < 0.8)) return;
    sq.lastBark = ai.time;
    lastBarkAt = ai.time;
    const text = e.rng.pick(BARKS[kind]);
    events.emit('enemy:bark', { id: e.id, owner: e.owner, role: e.role, kind, text, pos: { ...e.pos } });
  };
  // An enemy's bullet hit something: only you get hurt (no friendly fire between enemies).
  ai.hurt = (shooter, victim, amount, hit) => {
    if (victim.kind !== 'player') return { killed: false };
    return player.health.damage(amount * ai.difficulty.damage, hit.from);
  };

  function spawnAll() {
    list = specs.map((spec, i) => createEnemy(spec, i, ai));
    squads = createSquads(list);
    ai.alive = list.slice();
    for (const e of list) e.brain.start();
  }

  function updatePlayer() {
    const s = player.soldier.state;
    const body = player.soldier.body;
    const h = body.height();
    const P = ai.player;
    P.pos = { ...s.pos };
    P.eye = { x: s.pos.x, y: s.pos.y + body.eyeHeight(), z: s.pos.z };
    P.head = { x: s.pos.x, y: s.pos.y + h - 0.2, z: s.pos.z };
    P.chest = { x: s.pos.x, y: s.pos.y + h * 0.62, z: s.pos.z };
    P.crouched = s.crouched;
    P.speed = s.speed;
    P.sprinting = s.sprinting;
    P.down = player.health.state.down;
  }

  // ------------------------------------------------------------------ the tick

  function move(dt) {
    ai.time += dt;
    ai.tick++;
    noise.now = ai.time;
    updatePlayer();
    for (const e of ai.alive) {
      e.cmd = ai.options.freeze ? { ...e.cmd, moveX: 0, moveZ: 0, fire: false, firePressed: false, sprint: false } : command(e, ai, dt);
      e.soldier.move(e.cmd, dt);
    }
  }

  /** Your bullets this tick: anyone they hit or flew close past is now being shot at. */
  function playerShots(shots) {
    if (!shots?.length) return;
    ai.player.firedAt = ai.time;
    const from = ai.player.eye;
    for (const e of ai.alive) {
      const c = { x: e.pos.x, y: e.pos.y + 1.1, z: e.pos.z };
      for (const shot of shots) {
        if (closestApproach(shot.origin, shot.end, c).distance < 2.5) {
          e.senses.underFire = ai.time;
          e.senses.shotFrom = { ...from };
          break;
        }
      }
    }
  }

  function think(dt) {
    if (ai.options.freeze) return;
    for (const e of ai.alive) {
      e.pain *= Math.exp(-dt / 2);
      if ((ai.tick + e.index) % THINK_EVERY !== 0) continue;
      const step = dt * THINK_EVERY;
      sense(e, ai, step);
      e.brain.think(step);
    }
    // Routes, a couple per tick so a dozen requests at once don't cause a hitch.
    for (let i = 0; i < ROUTES_PER_TICK && queue.length; i++) {
      const e = queue.shift();
      e.path.pending = false;
      if (e.dead || !e.intent.dest) continue;
      const points = route(nav, e.pos, e.path.dest, { avoid: e.intent.avoid ?? null });
      if (points) {
        e.path.points = points;
        e.path.index = Math.min(1, points.length - 1);
        e.path.failed = false;
        e.pathFailed = false;
      } else {
        e.path.points = [];
        e.path.index = 0;
        e.path.failed = true;
        e.pathFailed = true;
      }
    }
    noise.prune();
    // Take bodies out of the physics world now that every bullet this tick has been traced.
    for (const e of list) {
      if (e.dead && !e.removed) {
        e.soldier.remove();
        e.removed = true;
      }
    }
  }

  function act(dt) {
    if (ai.options.freeze) return;
    const head = ai.player.eye;
    for (const e of ai.alive.slice()) {
      const out = e.soldier.act(e.cmd, dt);
      if (!out.shots.length) continue;
      const pulls = out.shots.length / out.shots[0].weapon.pellets;
      afterShots(e, ai, pulls);
      // Near misses: a bullet that didn't hit you but passed close to your head.
      const hitYou = [...(out.hitTargets?.keys() ?? [])].some((t) => t.kind === 'player');
      if (hitYou || ai.player.down) continue;
      for (const shot of out.shots) {
        const near = closestApproach(shot.origin, shot.end, head);
        if (near.distance < NEAR_MISS && near.t > 0.02 && near.t < 0.999) {
          events.emit('bullet:nearmiss', { owner: e.owner, point: near.point, distance: near.distance, from: { ...shot.origin } });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ damage

  /** One of your bullets hit enemy `e`. */
  function damage(e, amount, hit) {
    if (e.dead) return { killed: false };
    e.health -= amount;
    e.pain += amount;
    e.senses.underFire = ai.time;
    e.senses.shotFrom = hit.from ? { ...hit.from } : { ...ai.player.eye };
    if (!e.inCombat) {
      ai.report(e, e.senses.shotFrom, false);
      e.brain.alarm();
    } else if (e.rng.next() < 0.3) {
      ai.bark(e, 'hit');
    }
    if (e.health > 0) return { killed: false };
    kill(e, hit);
    return { killed: true };
  }

  function kill(e, hit) {
    e.health = 0;
    e.dead = true;
    e.deadAt = ai.time;
    const s = e.soldier.state;
    e.death = {
      pos: { ...s.pos }, yaw: e.motor.yaw, crouched: s.crouched, vel: { ...s.vel },
      point: hit.point ? { ...hit.point } : null, dir: hit.dir ? { ...hit.dir } : null,
      weapon: hit.weapon ?? null, zone: hit.zone ?? null, time: ai.time,
    };
    e.soldier.hitboxes.setEnabled(false);
    tokens.release(e);
    for (const [k, v] of taken) if (v === e) taken.delete(k);
    if (e.squad.flanker === e.id) e.squad.flanker = null;
    e.brain.kill();
    ai.alive = ai.alive.filter((o) => o !== e);
    // A squad-mate nearby shouts about it, and the whole squad is now fighting.
    const mate = squadMates(e).find((m) => Math.hypot(m.pos.x - e.pos.x, m.pos.z - e.pos.z) < 30);
    if (mate) {
      ai.bark(mate, 'manDown');
      ai.report(mate, e.senses.shotFrom ?? e.pos, false);
      mate.brain.alarm();
    }
    events.emit('enemy:down', { id: e.id, enemy: e, role: e.role, headshot: hit.zone === 'head', owner: hit.owner ?? 0, ...e.death });
  }

  /** Back to the start: everyone respawns, nobody knows anything. */
  function reset() {
    for (const e of list) if (!e.removed) e.soldier.remove();
    taken.clear();
    tokens.clear();
    queue.length = 0;
    noise.clear();
    spawnAll();
  }

  spawnAll();

  return {
    ai,
    get list() { return list; },
    get alive() { return ai.alive; },
    get squads() { return squads; },
    tokens,
    taken,
    options: ai.options,
    move,
    playerShots,
    think,
    act,
    damage,
    reset,
    setDifficulty(name) { ai.difficulty = DIFFICULTY[name] ?? DIFFICULTY.regular; },
  };
}

/** The closest point on the segment a→b to point p, how far it is, and how far along (0..1). */
export function closestApproach(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2));
  const point = { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t };
  return { point, t, distance: Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z) };
}
