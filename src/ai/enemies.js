// Enemies: every enemy soldier in the level, and what they share.
//
// Shared between all of them: the navigation grid and cover points (built once
// per level), the noise board, squads, attack tokens, a queue of route
// requests, and what they currently know about the players (1 to 4 of them:
// each enemy picks one as its target, see ai/senses.js).
//
// Most enemies are in the level from the start (its `enemy` pieces). More can
// arrive later: spawn() adds one (reinforcements, sent by game/director.js),
// and retire() quietly takes one away (a checkpoint remembers who you'd
// already dealt with).
//
// One tick, in the order game/sim.js calls them:
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
import { DIFFICULTY, BARKS, PLAYER_SCALING } from './enemy-data.js';
import { sense } from './senses.js';
import { createSquads, joinSquad, createTokens, report, squadMates } from './squad.js';
import { route } from './astar.js';
import { createRandom } from '../core/random.js';
import { events as gameEvents } from '../core/events.js';
import { lightAt } from '../world/lighting.js';


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
 * @param {Array}  [opts.players] [{ soldier, health }]: the people they fight (up to 4)
 * @param {object} [opts.player]  one { soldier, health } (the same as players: [player])
 * @param {string} [opts.difficulty]
 * @param {object} [opts.lighting]  world/lighting.js createLighting(): how dark it is (null: daylight)
 */
export function createEnemies({ world, registry, nav, cover, noise, specs, players = null, player = null, events = gameEvents, seed = 1, difficulty = 'regular', lighting = null }) {
  const ai = {
    world, registry, nav, cover, noise, events, seed,
    lighting,     // world/lighting.js: how dark it is (null: daylight)
    time: 0,
    tick: 0,
    rng: createRandom(seed),
    difficulty: DIFFICULTY[difficulty] ?? DIFFICULTY.regular,
    players: [],  // everyone they could fight, as plain records (see playerRecord below)
    targets: [],  // the players still standing (not down): the ones worth shooting at
    alive: [],
    options: { freeze: false, noBarks: false },
  };
  const taken = new Map(); // cover point id -> enemy
  const queue = [];        // enemies waiting for a route
  let list = [];
  let squads = new Map();
  const tokens = createTokens(() => ai.difficulty.tokens);
  const recordOf = (owner) => ai.players.find((p) => p.owner === owner) ?? null;
  let lastBarkAt = -Infinity;

  // ---- what the brains and motors can ask for
  ai.report = (e, pos, seen, owner = e.target?.owner ?? null) => report(squads, e, pos, ai.time, seen, owner);
  ai.takeToken = (e) => (e.target ? tokens.take(e, ai.time, e.target.owner) : false);
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
  /** The standing player nearest `pos` (reinforcements are radioed where to look), or null. */
  ai.nearestTarget = (pos) => {
    let best = null, bestD = Infinity;
    for (const P of ai.targets) {
      const d = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
      if (d < bestD) { best = P; bestD = d; }
    }
    return best;
  };
  // An enemy's bullet hit something: only players get hurt (no friendly fire between
  // enemies), and the hostage, if a stray shot finds them (ai/hostage.js).
  ai.hurt = (shooter, victim, amount, hit) => {
    if (victim.kind === 'civilian') return victim.damage?.(amount * ai.difficulty.damage, hit.from) ?? { killed: false };
    if (victim.kind !== 'player') return { killed: false };
    const p = recordOf(victim.owner);
    return p ? p.health.damage(amount * ai.difficulty.damage, hit.from) : { killed: false };
  };

  // More players, a little more health each (PLAYER_SCALING in ai/enemy-data.js).
  const healthScale = () => PLAYER_SCALING.health[Math.min(PLAYER_SCALING.health.length, Math.max(1, ai.players.length)) - 1];

  function spawnAll() {
    list = specs.map((spec, i) => createEnemy(spec, i, ai));
    const scale = healthScale();
    for (const e of list) { e.health = e.maxHealth = Math.round(e.def.health * scale); }
    squads = createSquads(list);
    ai.alive = list.slice();
    for (const e of list) e.brain.start();
  }

  /**
   * A new enemy, now (reinforcements). It joins its squad without disturbing
   * anyone else's, and its number is the next one in the list.
   * @param {object} spec   like a level's enemy piece: { role, at, yaw, squad }
   * @param {object} [opts]
   * @param {Array}  [opts.route] [[x, z] or [x, z, y], ...]: walk in along these points first (the brain's
   *        "advance" state), then go looking for the players
   */
  function spawn(spec, { route = null } = {}) {
    const e = createEnemy(spec, list.length, ai);
    e.health = e.maxHealth = Math.round(e.def.health * healthScale());
    if (route?.length) e.advance = route.map(([x, z, y = e.spawn.pos.y]) => ({ x, y, z }));
    joinSquad(squads, e);
    list.push(e);
    ai.alive.push(e);
    e.brain.start();
    return e;
  }

  /**
   * Take an enemy away without a fuss: no "man down", no alarm, no event, no
   * ragdoll. For checkpoints: the guards you'd already dealt with stay gone.
   */
  function retire(e) {
    if (e.dead) return;
    e.dead = true;
    e.retired = true;
    e.health = 0;
    e.deadAt = -Infinity; // never in a snapshot (net/host.js)
    tokens.release(e);
    for (const [k, v] of taken) if (v === e) taken.delete(k);
    if (e.squad.flanker === e.id) e.squad.flanker = null;
    e.brain.kill();
    ai.alive = ai.alive.filter((o) => o !== e);
    if (!e.removed) {
      e.soldier.remove();
      e.removed = true;
    }
  }

  /** A player as the enemies see it: plain numbers, refreshed every tick. */
  function playerRecord({ soldier, health }) {
    return {
      owner: soldier.owner, soldier, health,
      pos: { x: 0, y: 0, z: 0 }, eye: null, chest: null, head: null,
      crouched: false, speed: 0, sprinting: false, down: false, firedAt: -Infinity, light: 1,
    };
  }

  function updatePlayers() {
    for (const P of ai.players) {
      const s = P.soldier.state;
      const body = P.soldier.body;
      const h = body.height();
      P.pos = { ...s.pos };
      P.eye = { x: s.pos.x, y: s.pos.y + body.eyeHeight(), z: s.pos.z };
      P.head = { x: s.pos.x, y: s.pos.y + h - 0.2, z: s.pos.z };
      P.chest = { x: s.pos.x, y: s.pos.y + h * 0.62, z: s.pos.z };
      P.crouched = s.crouched;
      P.speed = s.speed;
      P.sprinting = s.sprinting;
      P.down = P.health.state.down || !!P.health.state.bleeding || !!P.health.state.dead;
      // How lit they are (moon, lamps, their own muzzle flash): ai/senses.js.
      P.light = ai.lighting ? lightAt(P.pos, ai.lighting, ai.time - P.firedAt) : 1;
    }
    ai.targets = ai.players.filter((P) => !P.down);
    // Anyone whose target went down (or left) looks for someone else.
    for (const e of ai.alive) if (e.target && !ai.targets.includes(e.target)) { tokens.release(e); e.target = null; }
  }

  /** Someone joined: from now on they can be seen, heard and shot. */
  function addPlayer(p) {
    if (!recordOf(p.soldier.owner)) ai.players.push(playerRecord(p));
    updatePlayers();
  }

  /** Someone left: forget them. */
  function removePlayer(owner) {
    ai.players = ai.players.filter((p) => p.owner !== owner);
    updatePlayers();
  }

  for (const p of players ?? (player ? [player] : [])) ai.players.push(playerRecord(p));

  // ------------------------------------------------------------------ the tick

  function move(dt) {
    ai.time += dt;
    ai.tick++;
    noise.now = ai.time;
    updatePlayers();
    for (const e of ai.alive) {
      e.cmd = ai.options.freeze ? { ...e.cmd, moveX: 0, moveZ: 0, fire: false, firePressed: false, sprint: false } : command(e, ai, dt);
      e.soldier.move(e.cmd, dt);
    }
  }

  /**
   * A player's bullets this tick: anyone they hit or flew close past is now being shot at.
   * @param {Array} shots  [{ origin, end }]
   * @param {number} [owner] who fired (defaults to the first player, for solo play)
   */
  function playerShots(shots, owner = ai.players[0]?.owner) {
    if (!shots?.length) return;
    const shooter = recordOf(owner);
    if (shooter) shooter.firedAt = ai.time;
    const from = shooter?.eye ?? shots[0].origin;
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
      const dest = e.path.dest ?? e.intent.dest;
      if (e.dead || !dest) continue;
      e.path.dest = { ...dest };
      const points = route(nav, e.pos, dest, { avoid: e.intent.avoid ?? null });
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
    for (const e of ai.alive.slice()) {
      const out = e.soldier.act(e.cmd, dt);
      if (!out.shots.length) continue;
      const pulls = out.shots.length / out.shots[0].weapon.pellets;
      afterShots(e, ai, pulls);
      // Near misses: a bullet that didn't hit a player but passed close to their head.
      const hit = new Set([...(out.hitTargets?.keys() ?? [])].filter((t) => t.kind === 'player').map((t) => t.owner));
      for (const P of ai.targets) {
        if (hit.has(P.owner)) continue;
        for (const shot of out.shots) {
          const near = closestApproach(shot.origin, shot.end, P.eye);
          if (near.distance < NEAR_MISS && near.t > 0.02 && near.t < 0.999) {
            events.emit('bullet:nearmiss', { owner: e.owner, victim: P.owner, point: near.point, distance: near.distance, from: { ...shot.origin } });
            break;
          }
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
    const shooter = recordOf(hit.owner) ?? ai.players[0] ?? null;
    e.senses.shotFrom = hit.from ? { ...hit.from } : shooter ? { ...shooter.eye } : { ...e.pos };
    // Shot by someone you weren't watching? They're your problem now.
    if (shooter && !shooter.down && (!e.target || !e.senses.visible)) e.target = shooter;
    if (!e.inCombat) {
      ai.report(e, e.senses.shotFrom, false, shooter?.owner ?? null);
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
    // Their ragdoll takes over the drawing: switch off the hitboxes and the body
    // they moved with, or it would stand there as an invisible wall.
    e.soldier.hitboxes.setEnabled(false);
    e.soldier.body.collider.setEnabled(false);
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

  /**
   * Back to the start: everyone respawns, nobody knows anything. Reinforcements
   * are gone.
   * @param {object} [opts]
   * @param {number[]} [opts.retired] numbers of the level's enemies to leave out (a checkpoint's)
   */
  function reset({ retired = [] } = {}) {
    for (const e of list) if (!e.removed) e.soldier.remove();
    taken.clear();
    tokens.clear();
    queue.length = 0;
    noise.clear();
    spawnAll();
    for (const i of retired) if (list[i]) retire(list[i]);
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
    get players() { return ai.players; },
    addPlayer,
    removePlayer,
    move,
    playerShots,
    think,
    act,
    damage,
    spawn,
    retire,
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
