// The simulation of one mission: everything that decides what happens, and
// nothing that draws it.
//
// It builds a level's physics world, its targets, the enemies (if the level
// has any, with their nav grid and cover), and one soldier with health per
// player (1 to 4). Then tick() runs one fixed step, always in the same order
// (CLAUDE.md, "One tick, in order"):
//
//   players move → enemies move → targets → world.step() → players shoot →
//   enemies think → enemies shoot → health → the encounter / kill house
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
import { createEvents } from '../core/events.js';
import { idleCommand } from '../core/input.js';

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
 */
export function createSim({
  def, id = 'map', players = [{ owner: 0 }], seed = 1, difficulty = 'regular', events = createEvents(),
  records = createRecords(null), infiniteAmmo = true, onMapping = null,
}) {
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  const level = buildLevel(def, world, registry);
  const targets = createTargets(world, registry, level.expanded.targets);
  const trigger = (id) => level.expanded.triggers.find((t) => t.id === id) ?? null;
  const hasEnemies = level.expanded.enemies.length > 0;

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
    const health = createHealth({ events, owner });
    const soldier = createSoldier({
      world, registry, targets, damage, noise, events, owner,
      seed: seed * 101 + owner * 7 + 1,
      flatZones: true, // enemies don't get headshot bonuses on players
      passThrough: throughTeammates,
      spawn: start,
      options: { infiniteAmmo },
    });
    const p = { owner, soldier, health, callsign, spawn: start, lastCmd: idleCommand(start.yaw) };
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
      id: team.size > 1 ? `${id}-${team.size}p` : id, // co-op best times are kept per squad size
      start: trigger('compound:start'),
      enemies, records, emit: events.emit,
      squad: () => [...team.values()].map((p) => p.health),
    })
    : null;
  // The kill house is a solo course.
  const course = trigger('killhouse:start') && team.size === 1
    ? createCourse({ id: 'killhouse', start: trigger('killhouse:start'), finish: trigger('killhouse:finish'), targets, records, emit: events.emit })
    : null;
  world.step();

  /**
   * One fixed step.
   * @param {number} dt
   * @param {Map<number, object>|object} commands this tick's command per player (a single command is player 0's)
   * @param {object} [opts]
   * @param {Set<number>} [opts.remote] players whose shots are traced by their own browsers (co-op clients)
   * @returns {Map<number, object>} each player's act() result (recoil to apply, shots fired)
   */
  function tick(dt, commands, { remote = null } = {}) {
    const cmds = commands instanceof Map ? commands : new Map([[[...team.keys()][0], commands]]);
    const cmdOf = (p) => {
      // Downed players can look around, nothing else.
      const c = cmds.get(p.owner) ?? p.lastCmd;
      p.lastCmd = c;
      return p.health.state.down || p.health.state.bleeding || p.health.state.dead ? idleCommand(c.yaw, c.pitch) : c;
    };
    const now = new Map();
    for (const p of team.values()) now.set(p.owner, cmdOf(p));
    for (const p of team.values()) p.soldier.move(now.get(p.owner), dt);
    enemies?.move(dt);
    targets.update(dt);
    world.step();
    const outs = new Map();
    for (const p of team.values()) {
      const out = p.soldier.act(now.get(p.owner), dt, { trace: !remote?.has(p.owner) });
      outs.set(p.owner, out);
      enemies?.playerShots(out.shots, p.owner);
    }
    enemies?.think(dt);
    enemies?.act(dt);
    for (const p of team.values()) p.health.update(dt);
    const feet = [...team.values()].map((p) => p.soldier.state.pos);
    if (course && feet[0]) course.update(dt, feet[0]);
    encounter?.update(dt, feet);
    return outs;
  }

  /** Back to the start: enemies respawn, everyone's healed and back at their spawn. */
  function reset() {
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
    encounter, course, team,
    player: (owner) => team.get(owner) ?? null,
    addPlayer,
    removePlayer,
    tick,
    reset,
    /** Free the physics engine's memory (it lives outside JavaScript's garbage collector). */
    dispose() { world.free(); },
  };
}
