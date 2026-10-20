// The simulation of one mission: everything that decides what happens, and
// nothing that draws it.
//
// It builds a level's physics world, its targets, the enemies (if the level
// has any, with their nav grid and cover), and one soldier with health per
// player (1 to 4). Then tick() runs one fixed step, always in the same order
// (CLAUDE.md, "One tick, in order"):
//
//   players move → enemies move → the hostage moves → targets → world.step() →
//   players shoot (and ping, throw, call in support) → grenades fly (and explode) →
//   call-ins (drops, drones, shells, smoke) → enemies think → enemies shoot → health → revives → hold-F (crates, objectives) →
//   the encounter / kill house / mission → the director (last: who it sends is
//   filed by the next tick's world.step())
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
import { createInteractions } from './interact.js';
import { createSupply } from './supply.js';
import { createGrenades, blast, GRENADE } from '../weapons/grenades.js';
import { createDirector } from './director.js';
import { createOperation } from './operation.js';
import { createHostage } from '../ai/hostage.js';
import { createRandom } from '../core/random.js';
import { PERSON_ZONES, targetPoint } from '../world/targets.js';
import { pingFrom } from './pings.js';
import { createEvents } from '../core/events.js';
import { idleCommand, heldOnly } from '../core/input.js';
import { createLighting } from '../world/lighting.js';
import { createCallins } from './callins.js';
import { cleanModifiers, MODIFIERS } from './modifiers.js';


export const MAX_PLAYERS = 4;

// Where players 2 to 4 start, around the level's spawn point (metres: right, back).
const SPAWN_OFFSETS = [[0, 0], [1.5, 0.9], [-1.5, 0.9], [0, 1.8]];

// A demolition charge (sabotage): a much bigger bang than a grenade.
const CHARGE = { ...GRENADE, radius: 11, inner: 3.5, damage: 420, noise: 160 };

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
    using: p.using ?? null, useProgress: p.useProgress ?? 0,  // holding F at a crate, a laptop... (game/interact.js)
    callin: p.callin?.charge ?? 0, // how charged their call-in is, 0..1 (game/callins.js)
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
 * @param {boolean} [opts.infiniteAmmo] spare magazines never run out (default: on practice maps, not in missions)
 * @param {Function} [opts.onMapping] called before the (slow-ish) nav grid is built, e.g. to update a loading bar
 * @param {boolean} [opts.coop] a co-op game (no solo-only extras like the kill house timer)
 */
export function createSim({
  def, id = 'map', players = [{ owner: 0 }], seed = 1, difficulty = 'regular', events = createEvents(),
  records = createRecords(null), infiniteAmmo = null, onMapping = null, coop = false, modifiers = [],
}) {
  // Mission modifiers (game/modifiers.js): house rules picked before the mission.
  const mods = def.mission ? cleanModifiers(modifiers) : [];
  // Practice maps: shoot all you like. Missions: your spare ammo runs out (game/supply.js).
  const unlimited = infiniteAmmo ?? !def.mission;
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

  // Call-ins (game/callins.js): support each player calls on the radio. The host
  // decides them all. (On a practice map they're always ready, to try them out.)
  const callins = createCallins({
    world, events, rng: createRandom(seed * 31 + 7), practice: !!def.armory,
    chargeScale: mods.includes('scarce') ? MODIFIERS.scarce.charge : 1,
    explode: (g, tuning) => explode(g, tuning), // the grenade's blast, which never hurts the squad
    enemies: () => enemies?.alive ?? [],
  });

  // Who gets hurt when a player's bullet hits something. Friendly fire is off:
  // bullets fly straight through teammates (passThrough below).
  const damage = (victim, amount, hit) => {
    if (victim.kind === 'enemy') return enemies.damage(victim, amount, hit);
    if (victim.kind === 'player') return { killed: false };
    return targets.damage(victim, amount);
  };
  // (The hostage too: they're on your side.)
  const throughTeammates = (info) => info.target?.kind === 'player' || info.target?.kind === 'civilian';

  function addPlayer(owner, { callsign = `Player ${owner + 1}`, loadout, callin } = {}) {
    if (team.has(owner)) return team.get(owner);
    const start = spawnFor(level, owner);
    const health = createHealth({ events, owner, revivable: coop }); // co-op: bleed out, teammates revive
    const soldier = createSoldier({
      world, registry, targets, damage, noise, events, owner,
      seed: seed * 101 + owner * 7 + 1,
      flatZones: true, // enemies don't get headshot bonuses on players
      passThrough: throughTeammates,
      spawn: start,
      loadout, // their guns and attachments (weapons/attachments.js `loadoutDefs`); missing = the default
      options: { infiniteAmmo: unlimited },
    });
    callins.addPlayer(owner, callin);
    const p = { id: `p${owner}`, owner, soldier, health, callsign, spawn: start, lastCmd: idleCommand(start.yaw), callin: callins.player(owner) };
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
    callins.removePlayer(owner);
    p.soldier.remove();
    team.delete(owner);
  }

  for (const p of players) addPlayer(p.owner, p);

  if (hasEnemies) {
    enemies = createEnemies({
      world, registry, nav, cover, noise, events, seed, difficulty,
      lighting: createLighting(def, level.expanded),
      specs: level.expanded.enemies,
      players: [...team.values()],
    });
    if (mods.includes('lethal')) enemies.options.lethal = MODIFIERS.lethal.damage;
  }

  // ---- a mission (levels/missions.js): the director paces the reinforcements,
  // the operation runs the objectives, and maybe there's a hostage to bring home.
  const mission = def.mission ?? null;
  const director = mission && enemies
    ? createDirector({ world, enemies, players: () => [...team.values()], entries: level.expanded.entries, events, seed, difficulty, mission })
    : null;
  let hostage = null;
  function makeHostage(spawn) {
    hostage = createHostage({ world, registry, nav, events, spawn: { pos: [...spawn.pos], yaw: spawn.yaw } });
    world.step();
    return hostage;
  }

  const encounter = enemies && !mission
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
  const interactions = createInteractions();
  const refills = mods.includes('scarce') ? MODIFIERS.scarce.refills : 1;
  const supply = createSupply({
    crates: level.expanded.crates.map((c) => ({ ...c, refills: Math.max(1, Math.round((c.refills ?? 4) * refills)) })),
    emit: events.emit,
  });
  let charges = 0;
  const operation = mission
    ? createOperation({
      mission, level, team, emit: events.emit, supply, records, checkpoints: !mods.includes('ironman'),
      rng: createRandom(seed * 17 + 5),
      recordId: coop ? () => `${mission.id}-${team.size}p` : () => mission.id,
      enemies: () => enemies, director: () => director, hostage: () => hostage, makeHostage,
      explode: (pos, { owner = null, kind = 'charge' } = {}) => explode({ id: `${kind}:${++charges}`, owner, pos, kind }, CHARGE),
    })
    : null;
  // The rules keeping score: the Compound's encounter, or a mission's operation.
  const rules = encounter ?? operation;
  // A crate refill: the host's copy of that player's guns fills up too (their
  // own browser does the same for its copy, net/client.js).
  events.on('ammo:resupply', (e) => team.get(e.owner)?.soldier.arsenal.resupply());
  // ---- grenades: thrown by players, flown here, and the blast decided here.
  const grenades = createGrenades({ world, emit: events.emit, onExplode: explode });
  const thrown = new Map(); // owner -> grenades thrown so far (for their names)

  /** A grenade leaves player `owner`'s hand. `id` comes from a co-op client (it named its own). */
  function throwGrenade(owner, { origin, vel, id = null }) {
    const n = (thrown.get(owner) ?? 0) + 1;
    thrown.set(owner, n);
    const g = grenades.spawn({ id: id ?? `${owner}:${n}`, owner, origin, vel });
    if (g) events.emit('grenade:throw', { id: g.id, owner, origin: { ...origin }, vel: { ...vel }, fuse: g.fuse });
    return g;
  }

  /**
   * Bang. Enemies and practice targets within reach are hurt, less the further
   * away, walls protecting them; players never (friendly fire is off). Every
   * enemy who can hear it knows roughly where it was.
   */
  function explode(g, tuning = GRENADE) {
    const victims = [];
    for (const e of enemies?.alive ?? []) {
      const s = e.soldier.state;
      const h = e.soldier.body.height();
      victims.push({ thing: e, points: [{ x: s.pos.x, y: s.pos.y + h * 0.62, z: s.pos.z }, { x: s.pos.x, y: s.pos.y + h - 0.2, z: s.pos.z }] });
    }
    for (const t of targets.list) {
      if (t.state !== 'up' && t.kind !== 'steel') continue;
      victims.push({ thing: t, points: [targetPoint(t, [0, PERSON_ZONES[1].y, 0])], ignore: t.colliders });
    }
    for (const hit of blast(world, g.pos, victims, tuning)) {
      const v = hit.thing;
      const d = Math.max(hit.distance, 0.01);
      const dir = { x: (hit.point.x - g.pos.x) / d, y: (hit.point.y - g.pos.y) / d, z: (hit.point.z - g.pos.z) / d };
      const result = damage(v, hit.amount, { owner: g.owner, from: { ...g.pos }, point: hit.point, dir, zone: 'body', weapon: 'grenade', distance: d });
      events.emit('target:hit', {
        owner: g.owner, target: v, id: v.id, kind: v.kind, hostage: v.hostage, zone: 'body', point: hit.point,
        damage: hit.amount, headshot: false, killed: result.killed, area: true,
      });
    }
    noise?.post({ pos: g.pos, radius: tuning.noise, kind: 'explosion', owner: typeof g.owner === 'number' ? g.owner : 0 });
    events.emit('explosion', { id: g.id, owner: g.owner, pos: { ...g.pos }, kind: g.kind ?? 'grenade', radius: tuning.radius });
  }

  /** Everything that can be used with F right now. */
  const spots = () => [...supply.spots(), ...callins.spots(), ...(operation ? operation.spots() : [])];
  /** Is `p` busy reviving someone? (That comes before any other F.) */
  const reviving = (p) => { for (const r of revives.progress.values()) if (r.by === p.owner) return true; return false; };
  let time = 0;
  events.on('player:down', (e) => { if (isPlayer(e.owner)) rules?.onDown(e.owner); });
  events.on('player:revive', (e) => { if (isPlayer(e.by)) rules?.onRevive(e.by); });
  events.on('hostage:revive', (e) => { if (isPlayer(e.by)) rules?.onRevive(e.by); });

  // Score-keeping: every player's shots and hits count towards the kill house
  // or the Compound's results card.
  events.on('weapon:fire', (e) => {
    if (!isPlayer(e.owner)) return;
    for (let i = 0; i < e.pulls; i++) {
      course?.onShot();
      rules?.onShot(e.owner);
    }
  });
  events.on('target:hit', (e) => {
    if (!isPlayer(e.owner)) return;
    if (e.kind === 'enemy') rules?.onHit({ owner: e.owner, headshot: e.headshot, killed: e.killed, area: e.area });
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
        const out = p.soldier.act(list[i], dt, { trace: false });
        if (list[i].ping) ping(p, list[i]);
        if (list[i].callin) callins.call(p, list[i]);
        if (out.thrown && !remote?.has(p.owner)) throwGrenade(p.owner, out.thrown);
      }
      now.set(p.owner, list[list.length - 1]);
    }
    for (const p of team.values()) p.soldier.move(now.get(p.owner), dt);
    enemies?.move(dt);
    hostage?.move(dt, [...team.values()], enemies?.alive ?? []);
    targets.update(dt);
    world.step();
    const outs = new Map();
    for (const p of team.values()) {
      const local = !remote?.has(p.owner);
      const out = p.soldier.act(now.get(p.owner), dt, { trace: local });
      outs.set(p.owner, out);
      enemies?.playerShots(out.shots, p.owner);
      // (A co-op client's grenades are thrown by its own browser and sent in: net/host.js.)
      if (out.thrown && local) throwGrenade(p.owner, out.thrown);
      const cmd = now.get(p.owner);
      if (cmd.ping && time - (p.pingedAt ?? -Infinity) > 0.4) ping(p, cmd);
      if (cmd.callin) callins.call(p, cmd);
    }
    grenades.update(dt);
    callins.update(dt); // (new smoke is found by rays after the next world.step)
    if (enemies) enemies.ai.hazards = [...grenades.list, ...callins.hazards()];
    enemies?.think(dt);
    enemies?.act(dt);
    for (const p of team.values()) p.health.update(dt);
    hostage?.health.update(dt);
    revives.update(dt, team.values(), now, hostage ? [hostage] : []);
    interactions.update(dt, team.values(), now, spots(), reviving);
    time += dt;
    const feet = [...team.values()].map((p) => p.soldier.state.pos);
    if (course && feet[0]) course.update(dt, feet[0]);
    encounter?.update(dt, feet);
    operation?.update(dt);
    // Last: anyone the director sends is filed by the next tick's world.step().
    if (operation?.state === 'active') director?.update(dt);
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

  /** Back to the start: enemies respawn, everyone's healed, re-armed and back at their spawn. */
  function reset() {
    revives.reset();
    interactions.reset();
    grenades.clear();
    callins.reset();
    supply.reset();
    enemies?.reset();
    for (const p of team.values()) {
      p.soldier.teleport(p.spawn.pos, p.spawn.yaw);
      p.health.reset();
      p.soldier.arsenal.rearm();
      p.lastCmd = idleCommand(p.spawn.yaw);
    }
    encounter?.reset();
    if (operation) {
      operation.restart();
      director?.calmDown();
    }
    world.step();
  }

  /**
   * Retry from the last checkpoint (a mission; with none yet, from the start).
   * The guards you'd already dealt with stay gone, everyone else is back where
   * they started and calm, reinforcements are gone, and each player gets back
   * the ammo they had (the host's copy here; each co-op browser keeps its own).
   */
  function retry() {
    const cp = operation?.checkpoint;
    if (!cp) { reset(); return null; }
    revives.reset();
    interactions.reset();
    grenades.clear();
    callins.retry();
    enemies?.reset({ retired: cp.retired });
    for (const p of team.values()) {
      const spot = cp.spots[p.owner % cp.spots.length];
      p.soldier.teleport(spot.pos, spot.yaw);
      p.health.reset(true);
      const ammo = cp.ammo.get(p.owner);
      if (ammo) {
        p.soldier.arsenal.load(ammo.guns);
        p.soldier.arsenal.state.grenades = ammo.grenades;
      }
      p.lastCmd = idleCommand(spot.yaw);
    }
    if (cp.crates) supply.restore(cp.crates);
    if (hostage && cp.hostage) hostage.restore(cp.hostage);
    operation.restore(cp);
    director?.calmDown();
    world.step();
    return cp.n;
  }

  return {
    def, level, world, registry, targets, nav, cover, noise, events,
    get enemies() { return enemies; },
    encounter, course, team, revives, interactions, supply, operation, director, callins, modifiers: mods,
    get hostage() { return hostage; },
    spots,
    grenades,
    throwGrenade,
    infiniteAmmo: unlimited,
    damage, // who gets hurt by a player's bullet (the co-op host applies clients' hits through it)
    player: (owner) => team.get(owner) ?? null,
    addPlayer,
    removePlayer,
    tick,
    reset,
    retry,
    /** Free the physics engine's memory (it lives outside JavaScript's garbage collector). */
    dispose() {
      director?.dispose();
      callins.dispose();
      world.free();
    },
  };
}
