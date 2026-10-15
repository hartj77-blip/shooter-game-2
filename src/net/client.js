// A co-op client: your browser when you've joined someone else's game.
//
// The host runs the real game (net/host.js). Your browser keeps its own copy
// of the level, your own soldier, and stand-ins ("proxies") for everyone else.
//
// CLIENT-SIDE PREDICTION: when you press W, your soldier moves straight away,
// using the same movement code the host runs. Waiting for the host's answer
// would make every step lag by your ping.
//
// RECONCILIATION: each snapshot says "this is where you were after your
// command number N". Your browser kept what it predicted for N. If they match,
// nothing happens (the usual case). If not (you bumped into an enemy the host
// saw somewhere else, or a packet went missing), it rewinds: puts you where the
// host says, then quickly replays every command since N. Like writing in pencil
// and correcting it when the teacher hands back the marked page. The camera
// eases out any small jump (`correction`, used by game/mission.js).
//
// FAVOUR THE SHOOTER: your bullets are traced here, against the proxies where
// you see them, and you tell the host what you hit ("fire" messages).
//
// Events from the host (gunfire, impacts, enemies going down) are played back
// in step with the proxies, 0.1 s behind, so tracers line up with the muzzles
// you see. Events about you (getting hurt, near misses) play straight away.
//
// Runs in Node: the tests drive two clients and a host over a pretend network.

import { createPhysicsWorld } from '../world/physics.js';
import { buildLevel } from '../world/level.js';
import { createSurfaceRegistry } from '../world/surfaces.js';
import { createTargets } from '../world/targets.js';
import { createSoldier } from '../player/soldier.js';
import { DEFAULT_HEALTH } from '../player/health.js';
import { ROLES } from '../ai/enemy-data.js';
import { spawnFor } from '../game/sim.js';
import { createEvents } from '../core/events.js';
import { idleCommand } from '../core/input.js';
import { createProxy, blend } from './proxies.js';
import {
  INTERP_DELAY, CMD_REDUNDANCY, encodeCommand, roundCommand, decodePlayer, decodeEnemy, decodeTarget, decodeEncounter,
} from './protocol.js';

const MATCH = 0.01;    // metres: closer than this to the host's answer counts as a match
const KEEP = 40;       // snapshots kept for interpolation (2 s)
// Events drawn in step with the proxies (0.1 s behind); the rest play at once.
const ON_TIMELINE = new Set(['weapon:fire', 'weapon:cue', 'bullet:impact', 'target:hit', 'enemy:down', 'enemy:bark', 'player:down', 'player:dead', 'player:revive', 'ping:mark']);
const r2 = (v) => Math.round(v * 100) / 100;
const round = (p) => (p ? { x: r2(p.x), y: r2(p.y), z: r2(p.z) } : null);

/**
 * @param {object} opts
 * @param {object} opts.def     the level definition (the host sent its name)
 * @param {number} opts.me      your player slot (1 to 3)
 * @param {object} opts.link    your link to the host (net/transport.js)
 * @param {Array}  [opts.roster] [{ slot, callsign }] who's in the game
 * @param {object} [opts.events]
 * @param {() => number} [opts.clock] milliseconds, for measuring ping
 */
export function createClient({ def, me, link, roster = [], events = createEvents(), clock = () => performance.now(), seed = 1 }) {
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  const level = buildLevel(def, world, registry);
  const targets = createTargets(world, registry, level.expanded.targets);
  const callsigns = new Map(roster.map((r) => [r.slot, r.callsign]));

  // Replays must not repeat sounds and camera bumps you've already had.
  let replaying = false;
  const quietEvents = { ...events, emit: (name, data) => { if (!replaying) events.emit(name, data); } };

  // ---------------------------------------------------------------- your soldier (predicted)
  let hits = []; // what this tick's bullets hit, to claim
  const claim = (victim, amount, hit) => {
    if (victim.kind === 'player') return { killed: false }; // friendly fire is off
    hits.push({ id: victim.id, damage: Math.round(amount * 10) / 10, zone: hit.zone, point: round(hit.point), dir: hit.dir, distance: r2(hit.distance) });
    if (victim.kind === 'enemy') {
      const p = enemyById.get(victim.id);
      return { killed: !!p && !p.view.dead && p.view.hp - amount <= 0 };
    }
    victim.lastHit = 0;
    return { killed: victim.health - amount <= 0 && victim.state === 'up' };
  };
  const spawn = spawnFor(level, me);
  const soldier = createSoldier({
    world, registry, targets, damage: claim, events: quietEvents, owner: me, seed: seed * 101 + me * 7 + 1,
    flatZones: true, passThrough: (info) => info.target?.kind === 'player', spawn, options: { infiniteAmmo: true },
  });

  // Your health lives on the host; this mirror shows what the snapshots say.
  const healthState = { hp: DEFAULT_HEALTH.max, sinceHit: Infinity, down: false, bleeding: false, dead: false, downTime: 0, taken: 0, downs: 0 };
  const health = {
    state: healthState, tuning: { ...DEFAULT_HEALTH }, godMode: false,
    get fraction() { return healthState.hp / DEFAULT_HEALTH.max; },
    update(dt) { if (healthState.down) healthState.downTime += dt; },
    damage: () => ({ killed: false }),
    reset() {},
  };
  const local = { owner: me, soldier, health, get callsign() { return callsigns.get(me); }, spawn };

  // ---------------------------------------------------------------- everyone else (proxies)
  const enemyList = level.expanded.enemies.map((spec, i) => createProxy({
    world, registry, id: spec.id ?? `e${i}`, owner: `e${i}`, kind: 'enemy', role: spec.role,
    weapon: ROLES[spec.role]?.weapon ?? 'carbine', pos: { x: spec.at[0], y: spec.at[1] ?? 0, z: spec.at[2] },
  }));
  const enemyById = new Map(enemyList.map((p) => [p.id, p]));
  const enemies = { list: enemyList };
  const mates = new Map(); // owner -> proxy
  const teammates = { list: [] };

  // The encounter's scoreboard, as the host last told us.
  const encounter = level.expanded.enemies.length
    ? { id: def.name, state: 'ready', time: 0, remaining: enemyList.length, total: enemyList.length, result: null, players: new Map() }
    : null;

  // ---------------------------------------------------------------- messages
  const inbox = [];
  const snaps = [];          // decoded snapshots, oldest first
  const timeline = [];       // host events waiting for the proxies to catch up
  const history = [];        // { seq, cmd, mods, dt, state } for commands the host hasn't confirmed
  const sent = [];           // the last few encoded commands, sent again with each new one
  let seq = 0;
  let ack = 0;
  let renderTick = null;     // the host tick the proxies are showing (fractional)
  let lastPing = -Infinity;
  const stats = { corrections: 0, snapshots: 0, rtt: 0, bigCorrection: 0 };
  const correction = { x: 0, y: 0, z: 0 }; // how far the last fix moved you (the camera eases it out)
  let rate = 1;
  let restartPending = false;

  const offs = [
    link.onMessage((msg) => inbox.push(msg)),
  ];

  function receive(msg) {
    if (msg.t === 'snap') onSnapshot(msg);
    else if (msg.t === 'ev') {
      for (const [name, data] of msg.list) {
        if (ON_TIMELINE.has(name) && renderTick !== null) timeline.push({ tick: msg.tick, name, data });
        else play(name, data);
      }
    } else if (msg.t === 'pong') stats.rtt = clock() - msg.at;
  }

  /** Play a host event here, after tidying up anything that needs it. */
  function play(name, data) {
    if (name === 'mission:restart') restartPending = true;
    if (name === 'player:joined') callsigns.set(data.owner, data.callsign);
    if (name === 'player:hurt' && data.owner === me) healthState.sinceHit = 0;
    if (name === 'target:hit' && data.kind !== 'enemy' && data.kind !== 'player') {
      const t = targets.list.find((x) => x.id === data.id);
      if (t) t.lastHit = 0;
    }
    if (name === 'encounter:finish' && encounter) encounter.result = data;
    if (name === 'encounter:ready' && encounter) encounter.result = null;
    events.emit(name, data);
  }

  function onSnapshot(msg) {
    if (snaps.length && msg.tick <= snaps[snaps.length - 1].tick) return; // old news (unreliable messages can overtake)
    stats.snapshots++;
    const snap = {
      tick: msg.tick,
      players: new Map(msg.p.map((a) => { const d = decodePlayer(a); return [d.owner, d]; })),
      enemies: msg.e.map(decodeEnemy),
    };
    snaps.push(snap);
    if (snaps.length > KEEP) snaps.shift();

    // Things shown as they are now (no smoothing needed).
    for (const a of msg.g) {
      const g = decodeTarget(a);
      const t = targets.list[g.index];
      if (!t) continue;
      Object.assign(t, { state: g.state, tilt: g.tilt, health: g.health });
      t.pos.x = g.x;
      t.pos.z = g.z;
      targets.sync(t);
    }
    const enc = decodeEncounter(msg.enc);
    if (enc && encounter) Object.assign(encounter, enc);
    const mine = snap.players.get(me);
    if (mine) {
      if (mine.down && !healthState.down) healthState.downTime = 0;
      Object.assign(healthState, { hp: msg.you?.hp ?? mine.hp, down: mine.down || mine.bleeding, bleeding: mine.bleeding, dead: mine.dead });
      if (msg.you) healthState.taken = msg.you.taken;
    }
    // Keep the host's command cushion about two deep: run a touch faster or slower.
    rate = msg.buf < 1 ? 1.02 : msg.buf > 4 ? 0.98 : 1;
    if (msg.you && msg.ack >= ack) reconcile(msg.ack, msg.you.s);
  }

  /** Check our guess for command `confirmed` against the host's answer, and fix it if it was wrong. */
  function reconcile(confirmed, theirs) {
    ack = confirmed;
    while (history.length && history[0].seq < confirmed) history.shift();
    const mine = history[0]?.seq === confirmed ? history.shift() : null;
    if (restartPending) {
      restartPending = false;
      history.length = 0; // a restart moved everyone: start predicting afresh from here
      soldier.restore(theirs);
      Object.assign(soldier.body.prev, soldier.state.pos);
      return;
    }
    if (mine && agrees(mine.state, theirs)) return;
    if (!mine && confirmed === 0) return; // the host hasn't used any of our commands yet

    stats.corrections++;
    const before = { ...soldier.state.pos };
    replaying = true;
    soldier.restore(theirs);
    for (const h of history) {
      soldier.body.update(h.cmd, h.dt, h.mods);
      h.state = soldier.body.save();
    }
    soldier.hitboxes.sync(soldier.state.pos, soldier.state.yaw, soldier.state.crouched);
    replaying = false;
    const p = soldier.state.pos;
    const d = { x: before.x - p.x, y: before.y - p.y, z: before.z - p.z };
    const size = Math.hypot(d.x, d.y, d.z);
    stats.bigCorrection = Math.max(stats.bigCorrection, size);
    if (size < 2) {
      // Small: move the smoothing point too, and let the camera glide over the gap.
      const prev = soldier.body.prev;
      prev.x -= d.x; prev.y -= d.y; prev.z -= d.z;
      correction.x += d.x; correction.y += d.y; correction.z += d.z;
    } else {
      Object.assign(soldier.body.prev, p); // a big jump (a teleport, a restart): just go there
    }
  }

  function agrees(a, b) {
    return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < MATCH
      && Math.hypot(a.vel.x - b.vel.x, a.vel.y - b.vel.y, a.vel.z - b.vel.z) < 0.05
      && a.mode === b.mode && a.crouched === b.crouched;
  }

  // ---------------------------------------------------------------- interpolation

  /** Move the proxies to where they were INTERP_DELAY ticks before the newest snapshot. */
  function interpolate() {
    if (!snaps.length) return;
    const newest = snaps[snaps.length - 1].tick;
    const want = newest - INTERP_DELAY;
    if (renderTick === null || Math.abs(want - renderTick) > 30) renderTick = want;
    else renderTick += 1 + Math.max(-0.1, Math.min(0.1, (want - renderTick) * 0.05)); // drift gently back on schedule
    renderTick = Math.min(renderTick, newest); // never guess beyond the newest snapshot

    let a = snaps[0];
    let b = null;
    for (const s of snaps) {
      if (s.tick <= renderTick) a = s;
      else { b = s; break; }
    }
    const t = b ? (renderTick - a.tick) / (b.tick - a.tick) : 0;

    enemyList.forEach((p, i) => {
      const sa = a.enemies[i];
      if (sa) p.set(blend(sa, b?.enemies[i], t));
    });

    const present = new Set();
    for (const [owner, sa] of a.players) {
      if (owner === me) continue;
      present.add(owner);
      const s = blend(sa, b?.players.get(owner), t);
      let p = mates.get(owner);
      if (!p) {
        p = createProxy({ world, registry, id: `p${owner}`, owner, kind: 'player', weapon: s.weapon, callsign: callsigns.get(owner) ?? `Player ${owner + 1}` });
        mates.set(owner, p);
        p.place(s);
      } else p.set(s);
      p.view.callsign = callsigns.get(owner) ?? p.view.callsign;
    }
    for (const [owner, p] of mates) if (!present.has(owner)) { p.remove(); mates.delete(owner); }
    teammates.list = [...mates.values()];

    // Host events whose moment has come.
    timeline.sort((x, y) => x.tick - y.tick);
    while (timeline.length && timeline[0].tick <= renderTick) {
      const e = timeline.shift();
      play(e.name, e.data);
    }
    if (timeline.length > 600) timeline.splice(0, timeline.length - 600).forEach((e) => play(e.name, e.data));
  }

  // ---------------------------------------------------------------- one tick

  function step(dt, rawCmd) {
    for (const msg of inbox.splice(0)) receive(msg);
    interpolate();

    const out = healthState.down || healthState.dead;
    const typed = roundCommand(rawCmd); // exactly what the host will see
    const cmd = out ? idleCommand(typed.yaw, typed.pitch) : typed;
    seq++;

    const mods = soldier.arsenal.movementMods(cmd);
    soldier.move(cmd, dt);
    world.step(); // file the moved proxies and your hitboxes before tracing bullets
    hits = [];
    const result = soldier.act(cmd, dt);
    history.push({ seq, cmd, mods, dt, state: soldier.body.save() });
    if (history.length > 240) history.shift();

    // Tell the host: this command (plus the last few again, in case one got lost).
    sent.push(encodeCommand(seq, typed));
    if (sent.length > CMD_REDUNDANCY) sent.shift();
    link.send({ t: 'cmd', c: sent }, { reliable: false });
    if (result.shots.length) sendFire(result);
    const now = clock();
    if (now - lastPing > 1000) {
      lastPing = now;
      link.send({ t: 'ping', at: now }, { reliable: false });
    }
    health.update(dt);
    return result;
  }

  function sendFire(result) {
    const first = result.shots[0];
    const def = first.weapon;
    const impacts = [];
    for (const shot of result.shots) {
      for (const h of shot.hits) {
        if (impacts.length >= 8) break;
        impacts.push({ point: round(h.point), normal: h.normal, surface: h.surface, target: h.target?.id ?? null, exit: h.exit ?? null, dir: shot.dir });
      }
    }
    link.send({
      t: 'fire',
      w: def.id,
      origin: round(first.origin),
      pulls: result.shots.length / def.pellets,
      shots: result.shots.map((s) => ({ end: round(s.end), tracer: s.tracer, dir: s.dir })),
      impacts,
      hits,
    });
  }

  return {
    role: 'client',
    me,
    events,
    world,
    registry,
    level,
    targets,
    encounter,
    course: null,
    local,
    enemies,
    teammates,
    stats,
    correction,
    pausable: false,
    get rate() { return rate; },
    get renderTick() { return renderTick; },
    get ack() { return ack; },
    get pending() { return history.length; },
    step,
    restart() {},  // only the host can restart a co-op game
    respawn() {},
    dispose() {
      for (const off of offs) off();
      world.free();
    },
  };
}
