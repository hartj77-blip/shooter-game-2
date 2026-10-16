// The simulation of one mission: everything that decides what happens, and
// nothing that draws it.
//
// It builds a level's physics world, its targets, the enemies (if the level
// has any, with their nav grid and cover), and one soldier with health per
// player (1 to 4). Then tick() runs one fixed step, always in the same order
// (CLAUDE.md, "One tick, in order"):
//
//   players move → enemies move → targets → world.step() → players shoot (and ping) →
//   enemies think → enemies shoot → health → revives → the encounter / kill house
//
// Solo play, the co-op host (net/host.js) and the tests all run this same
// code. A co-op client runs a cut-down version of its own (net/client.js).
// Runs in Node: no screen, no keyboard, no sound.

import { createPhysicsWorld } from '../world/physics.js';
import { buildLevel } from '../world/level.js';
import { createSurfaceRegistry } from '../world/surfaces.js';
import { createTargets } from '../world/targets.js';
import { placePoint } from '../world/kit.js';
import { createSoldier } from '../player/soldier.js';
import { createHealth } from '../player/health.js';
import { buildNavGrid } from '../ai/nav-grid.js';
import { buildCover } from '../ai/cover.js';
import { createNoiseBoard } from '../ai/noise.js';
import { createEnemies } from '../ai/enemies.js';
import { createCourse, createRecords } from './course.js';
import { createEncounter } from './encounter.js';
import { createRevives } from './revive.js';
import { pingFrom } from './pings.js';
import { createEvents } from '../core/events.js';
import { idleCommand, heldOnly } from '../core/input.js';

export const MAX_PLAYERS = 4;

// Where players 2 to 4 start, around the level's spawn point (metres: right, back).
const SPAWN_OFFSETS = [[0, 0], [1.5, 0.9], [-1.5, 0.9], [0, 1.8]];

/** Where player `slot` starts on this level. */
export function spawnFor(level, slot) {
  if (level.spawns?.[slot]) return level.spawns[slot];
  const [dx, dz] = SPAWN_OFFSETS[slot % SPAWN_OFFSETS.length];
  const pos = placePoint([dx, 0, dz], level.spawn.pos, level.spawn.yaw);
  return { pos, yaw: level.spawn.yaw };
}

/**
 * What drawing code needs to know about a player: the same shape as an enemy's
 * view (ai/enemy.js viewOf), so one piece of drawing code shows both.
 */
export function playerView(p) {
  const s = p.soldier.state;
  const gun = p.soldier.arsenal.current;
  const h = p.health.state;
  return {
    id: p.id, owner: p.owner, callsign: p.callsign, weapon: gun.def.id,
    pos: s.pos, prev: p.soldier.body.prev, yaw: s.yaw, pitch: s.pitch,
    crouched: s.crouched, speed: s.speed, sprinting: s.sprinting, grounded: s.grounded,
    ready: !s.sprinting, reloading: gun.status === 'reloading',
    hp: h.hp, down: !!(h.down || h.bleeding), dead: !!h.dead,
    bleeding: !!h.bleeding, bleedLeft: h.bleedLeft ?? 0,
    reviving: p.reviving ?? 0, reviver: p.reviver ?? null, // a teammate is getting them up
  };
}

/**
 * @param {object} opts
 * @param {object} opts.def         a level definition (levels/*.js)
 * @param {string} [opts.id]        the map's name, for best times (e.g. 'compound')
 * @param {Array}  [opts.players]   [{ owner }]: player slots (0 to 3) to create at the start
 * @param {number} [opts.seed]
 * @param {string} [opts.difficulty]
 * @param {object} [opts.events]    this mission's event bus
 * @param {object} [opts.records]   best times (game/course.js)
 * @param {boolean} [opts.infiniteAmmo] spare magazines never run out
 * @param {Function} [opts.onMapping] called before the (slow-ish) nav grid is built, e.g. to update a loading bar
 * @param {boolean} [opts.coop] a co-op game (no solo-only extras like the kill house timer)
 */
export function createSim({
  def, id = 'map', players = [{ owner: 0 }], seed = 1, difficulty = 'regular', events = createEvents(),
  records = createRecords(null), infiniteAmmo = true, onMapping = null, coop = false,
}) {
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  const level = buildLevel(def, world, registry);
  const targets = createTargets(world, registry, level.expanded.targets);
  const trigger = (id) => level.expanded.triggers.find((t) => t.id === id) ?? null;
  // A mission can start with nobody in the level and have them all arrive later.
  const hasEnemies = level.expanded.enemies.length > 0 || !!def.mission;

  let nav = null, cover = null, noise = null, enemies = null;
  if (hasEnemies) {
    onMapping?.();
    nav = buildNavGrid(world, level.nav);
    cover = buildCover(world, nav);
    noise = createNoiseBoard();
  }

  const team = new Map(); // owner -> { owner, soldier, health }

  // Who gets hurt when a player's bullet hits something. Friendly fire is off:
  // bullets fly straight through teammates (passThrough below).
  const damage = (victim, amount, hit) => {
    if (victim.kind === 'enemy') return enemies.damage(victim, amount, hit);
    if (victim.kind === 'player') return { killed: false };
    return targets.damage(victim, amount);
  };
  const throughTeammates = (info) => info.target?.kind === 'player';

  function addPlayer(owner, { callsign = `Player ${owner + 1}` } = {}) {
    if (team.has(owner)) return team.get(owner);
    const start = spawnFor(level, owner);
    const health = createHealth({ events, owner, revivable: coop }); // co-op: bleed out, teammates revive
    const soldier = createSoldier({
      world, registry, targets, damage, noise, events, owner,
      seed: seed * 101 + owner * 7 + 1,
      flatZones: true, // enemies don't get headshot bonuses on players
      passThrough: throughTeammates,
      spawn: start,
      options: { infiniteAmmo },
    });
    const p = { id: `p${owner}`, owner, soldier, health, callsign, spawn: start, lastCmd: idleCommand(start.yaw) };
    Object.defineProperty(p, 'view', { get: () => playerView(p) });
    team.set(owner, p);
    enemies?.addPlayer(p);
    world.step(); // file the new body and hitboxes so rays can find them
    return p;
  }

  function removePlayer(owner) {
    const p = team.get(owner);
    if (!p) return;
    enemies?.removePlayer(owner);
    p.soldier.remove();
    team.delete(owner);
  }

  for (const p of players) addPlayer(p.owner, p);

  if (hasEnemies) {
    enemies = createEnemies({
      world, registry, nav, cover, noise, events, seed, difficulty,
      specs: level.expanded.enemies,
      players: [...team.values()],
    });
  }

  const encounter = enemies
    ? createEncounter({
      id: coop ? () => `${id}-${team.size}p` : id, // co-op best times are kept per squad size
      start: trigger('compound:start'),
      enemies, records, emit: events.emit,
      squad: () => [...team.values()].map((p) => p.health),
    })
    : null;
  // The kill house is a solo course.
  const course = trigger('killhouse:start') && team.size === 1 && !coop
    ? createCourse({ id: 'killhouse', start: trigger('killhouse:start'), finish: trigger('killhouse:finish'), targets, records, emit: events.emit })
    : null;
  world.step();

  const isPlayer = (owner) => typeof owner === 'number';
  const revives = createRevives();
  let time = 0;
  events.on('player:down', (e) => { if (isPlayer(e.owner)) encounter?.onDown(e.owner); });
  events.on('player:revive', (e) => { if (isPlayer(e.by)) encounter?.onRevive(e.by); });

  // Score-keeping: every player's shots and hits count towards the kill house
  // or the Compound's results card.
  events.on('weapon:fire', (e) => {
    if (!isPlayer(e.owner)) return;
    for (let i = 0; i < e.pulls; i++) {
      course?.onShot();
      encounter?.onShot(e.owner);
    }
  });
  events.on('target:hit', (e) => {
    if (!isPlayer(e.owner)) return;
    if (e.kind === 'enemy') encounter?.onHit({ owner: e.owner, headshot: e.headshot, killed: e.killed });
    else if (e.kind !== 'player') course?.onHit(e.target, { headshot: e.headshot });
  });

  /**
   * One fixed step.
   * @param {number} dt
   * @param {Map<number, object|object[]>|object} commands this tick's command per player (a single
   *        command is the first player's). A co-op client's entry is a list: usually one command,
   *        none while their first ones are on the way, two while the host catches up (net/jitter.js).
   *        A player with no entry repeats their last command, without its one-off presses.
   * @param {object} [opts]
   * @param {Set<number>} [opts.remote] players whose shots are traced by their own browsers (co-op clients)
   * @returns {Map<number, object>} each player's act() result (recoil to apply, shots fired)
   */
  function tick(dt, commands, { remote = null } = {}) {
    const cmds = commands instanceof Map ? commands : new Map([[[...team.keys()][0], commands]]);
    const listFor = (p) => {
      const given = cmds.get(p.owner);
      const list = given === undefined ? [heldOnly(p.lastCmd)] : Array.isArray(given) ? given : [given];
      if (!list.length) return [idleCommand(p.lastCmd.yaw, p.lastCmd.pitch)];
      p.lastCmd = list[list.length - 1];
      // Downed players can look around (and point things out), nothing else.
      const out = p.health.state.down || p.health.state.bleeding || p.health.state.dead;
      return out ? list.map((c) => ({ ...idleCommand(c.yaw, c.pitch), ping: c.ping })) : list;
    };
    const now = new Map();
    for (const p of team.values()) {
      const list = listFor(p);
      // Catching up on a co-op client's backlog: the extra commands run first, in order,
      // presses and all (a ping in one of them must not get lost).
      for (let i = 0; i < list.length - 1; i++) {
        p.soldier.move(list[i], dt);
        p.soldier.act(list[i], dt, { trace: false });
        if (list[i].ping) ping(p, list[i]);
      }
      now.set(p.owner, list[list.length - 1]);
    }
    for (const p of team.values()) p.soldier.move(now.get(p.owner), dt);
    enemies?.move(dt);
    targets.update(dt);
    world.step();
    const outs = new Map();
    for (const p of team.values()) {
      const out = p.soldier.act(now.get(p.owner), dt, { trace: !remote?.has(p.owner) });
      outs.set(p.owner, out);
      enemies?.playerShots(out.shots, p.owner);
      const cmd = now.get(p.owner);
      if (cmd.ping && time - (p.pingedAt ?? -Infinity) > 0.4) ping(p, cmd);
    }
    enemies?.think(dt);
    enemies?.act(dt);
    for (const p of team.values()) p.health.update(dt);
    revives.update(dt, team.values(), now);
    time += dt;
    const feet = [...team.values()].map((p) => p.soldier.state.pos);
    if (course && feet[0]) course.update(dt, feet[0]);
    encounter?.update(dt, feet);
    return outs;
  }

  /** Player `p` pointed at something: tell the squad what. */
  function ping(p, cmd) {
    const s = p.soldier.state;
    const eye = { x: s.pos.x, y: s.pos.y + p.soldier.body.eyeHeight(), z: s.pos.z };
    const mark = pingFrom(world, registry, eye, cmd.yaw, cmd.pitch, p.soldier.owns);
    if (!mark) return;
    p.pingedAt = time;
    events.emit('ping:mark', { owner: p.owner, ...mark });
  }

  /** Back to the start: enemies respawn, everyone's healed and back at their spawn. */
  function reset() {
    revives.reset();
    enemies?.reset();
    for (const p of team.values()) {
      p.soldier.teleport(p.spawn.pos, p.spawn.yaw);
      p.health.reset();
      p.lastCmd = idleCommand(p.spawn.yaw);
    }
    encounter?.reset();
    world.step();
  }

  return {
    def, level, world, registry, targets, nav, cover, noise, events,
    get enemies() { return enemies; },
    encounter, course, team, revives,
    damage, // who gets hurt by a player's bullet (the co-op host applies clients' hits through it)
    player: (owner) => team.get(owner) ?? null,
    addPlayer,
    removePlayer,
    tick,
    reset,
    /** Free the physics engine's memory (it lives outside JavaScript's garbage collector). */
    dispose() { world.free(); },
  };
}
