// The host: the browser that runs the real game. Think of it as the referee.
//
// It owns the one true simulation (game/sim.js): the enemies, every bullet that
// can hurt a player, the timer, who's down. Solo play is simply "hosting a game
// for one", so it runs through this same file and keeps being exercised every
// time anyone plays.
//
// With friends connected (each one a "client" on a link, net/transport.js), each tick:
//   1. read what arrived: their commands go into a jitter buffer each (net/jitter.js);
//      their shots ("fire") are checked and applied
//   2. run the simulation with everyone's command
//   3. send each friend the events they need (reliable)
//   4. every third tick, send each a snapshot (unreliable), with the number of
//      their last command used ("ack") and their own soldier's exact state, so
//      their prediction can check itself (net/client.js)
//
// FAVOUR THE SHOOTER: each client traces its own bullets against what it sees
// on its screen and tells the host what it hit. The host does loose checks
// (are you alive? did the shot start near you? is the damage possible for that
// gun?) and applies it. Great among friends; competitive games can't trust
// players like this.
//
// A session (what game/mission.js plays through) has the same shape here and on
// a co-op client (net/client.js): local, enemies, teammates, step(dt, cmd)...
//
// Runs in Node: no screen, no keyboard.

import { createJitterBuffer } from './jitter.js';
import {
  SNAPSHOT_EVERY, DEAD_KEPT, decodeCommand, encodePlayer, encodeEnemy, encodeTarget, encodeEncounter, eventFor, wireEvent,
} from './protocol.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { NOISE } from '../ai/noise.js';

const MAX_PULLS = 3;   // trigger pulls one fire message may claim (one tick, plus a little catch-up)
const REACH = 3.5;     // metres: how far from where the host has you a shot may start
const QUIET = 10;      // seconds without hearing from a client before they're dropped

/**
 * @param {object} opts
 * @param {object} opts.sim  game/sim.js
 * @param {number} [opts.me] your player slot
 * @param {boolean} [opts.coop] a co-op game (keeps running when you pause, even alone)
 * @param {() => number} [opts.clock] milliseconds, for spotting silent clients
 */
export function createHost({ sim, me = 0, coop = false, clock = () => performance.now() }) {
  // Everyone but you (players come and go, so this is worked out when asked).
  const teammates = { get list() { return [...sim.team.values()].filter((p) => p.owner !== me); } };
  const clients = new Map(); // slot -> { slot, link, jitter, heard, off }
  const inbox = [];
  let pending = [];          // [name, data] events this tick, before sorting out who gets what
  let tick = 0;
  const commands = new Map();
  const remote = new Set();
  // Rounds each client has claimed per gun since their last refill (a loose check:
  // a client keeps its own ammo count, lesson 17).
  const spent = new Map(); // slot -> Map(weapon id -> rounds)

  sim.events.onAny((name, data) => { if (clients.size) pending.push([name, data]); });
  sim.events.on('ammo:resupply', (e) => spent.delete(e.owner));
  sim.events.on('mission:restart', () => spent.clear());

  /** Could they really have fired this many? A full load since their last refill, plus a magazine to spare. */
  function canSpend(slot, def, rounds) {
    if (sim.infiniteAmmo) return true;
    if (!spent.has(slot)) spent.set(slot, new Map());
    const mine = spent.get(slot);
    const total = (mine.get(def.id) ?? 0) + rounds;
    if (total > def.mag * 2 + def.reserve) return false;
    mine.set(def.id, total);
    return true;
  }

  // ---------------------------------------------------------------- friends coming and going

  /** A friend joins (net/room.js calls this once their browser has loaded the map). */
  function addClient({ slot, link, callsign }) {
    if (clients.has(slot)) removeClient(slot);
    sim.addPlayer(slot, { callsign });
    const c = { slot, link, jitter: createJitterBuffer(), heard: clock(), off: [] };
    c.off.push(link.onMessage((msg) => inbox.push([slot, msg])));
    c.off.push(link.onClose(() => removeClient(slot)));
    clients.set(slot, c);
    remote.add(slot);
    sim.events.emit('player:joined', { owner: slot, callsign });
  }

  function removeClient(slot) {
    const c = clients.get(slot);
    if (!c) return;
    for (const off of c.off) off();
    clients.delete(slot);
    remote.delete(slot);
    commands.delete(slot);
    const callsign = sim.player(slot)?.callsign;
    sim.removePlayer(slot);
    sim.events.emit('player:left', { owner: slot, callsign });
  }

  // ---------------------------------------------------------------- messages from clients

  function receive(slot, msg) {
    const c = clients.get(slot);
    if (!c) return;
    c.heard = clock();
    if (msg.t === 'cmd') {
      for (const a of msg.c) {
        const [seq, cmd] = decodeCommand(a);
        c.jitter.push(seq, cmd);
      }
    } else if (msg.t === 'fire') {
      applyFire(slot, msg);
    } else if (msg.t === 'ping') {
      c.link.send({ t: 'pong', at: msg.at }, { reliable: false });
    }
  }

  /** A client fired: check what they say happened, then make it happen here. */
  function applyFire(slot, msg) {
    const p = sim.player(slot);
    const def = WEAPONS[msg.w];
    if (!p || !def) return;
    const h = p.health.state;
    if (h.down || h.bleeding || h.dead) return;
    const s = p.soldier.state;
    const o = msg.origin;
    if (!o || Math.hypot(o.x - s.pos.x, o.y - s.pos.y - 1.5, o.z - s.pos.z) > REACH) return;
    const pulls = Math.min(MAX_PULLS, Math.max(1, msg.pulls | 0));
    const shots = (msg.shots ?? []).slice(0, def.pellets * pulls);
    if (!canSpend(slot, def, pulls)) return; // out of ammo, by any honest count

    // Everyone hears it: enemies through the noise board, players through the event.
    sim.noise?.post({ pos: o, radius: def.noise ?? NOISE.gunshot, kind: 'gunshot', owner: slot });
    sim.enemies?.playerShots(shots.map((shot) => ({ origin: o, end: shot.end })), slot);
    sim.events.emit('weapon:fire', { owner: slot, weapon: def.id, origin: o, pulls, shots });
    for (const i of (msg.impacts ?? []).slice(0, 8)) sim.events.emit('bullet:impact', { owner: slot, weapon: def.id, ...i });

    // The hits: never more than the gun could do, only on things that can be hurt.
    const most = def.damage.near * Math.max(...Object.values(def.zones));
    const byTarget = new Map();
    for (const hit of (msg.hits ?? []).slice(0, shots.length * 3)) {
      const target = findTarget(hit.id);
      if (!target) continue;
      const result = sim.damage(target, Math.min(most, Math.max(0, hit.damage)), {
        zone: hit.zone, point: hit.point, dir: hit.dir, from: o, owner: slot, weapon: def.id, distance: hit.distance,
      });
      const sum = byTarget.get(target) ?? { damage: 0, headshot: false, killed: false, zone: hit.zone, point: hit.point };
      sum.damage += hit.damage;
      sum.headshot ||= hit.zone === 'head';
      sum.killed ||= result.killed;
      byTarget.set(target, sum);
    }
    for (const [target, sum] of byTarget) {
      sim.events.emit('target:hit', {
        owner: slot, target, id: target.id, kind: target.kind, hostage: target.hostage, ...sum,
      });
    }
  }

  /** An enemy or practice target that can still be hurt, by name. Never a player: friendly fire is off. */
  function findTarget(id) {
    const e = sim.enemies?.list.find((x) => x.id === id);
    if (e) return e.dead ? null : e;
    return sim.targets.list.find((t) => t.id === id) ?? null;
  }

  // ---------------------------------------------------------------- what clients are told

  /** Enemies worth telling clients about: everyone standing, and anyone who fell a moment ago. */
  function enemyRows() {
    const en = sim.enemies;
    if (!en) return [];
    const rows = [];
    en.list.forEach((e, i) => {
      if (!e.dead || en.ai.time - e.deadAt < DEAD_KEPT) rows.push(encodeEnemy(i, e.view, e.health));
    });
    return rows;
  }

  /** The parts of a snapshot that are the same for everyone. */
  function snapshotBase() {
    return {
      t: 'snap',
      tick,
      p: [...sim.team.values()].map((p) => encodePlayer(p.view)),
      e: enemyRows(),
      g: sim.targets.list.map((t, i) => encodeTarget(i, t)),
      enc: encodeEncounter(sim.encounter),
      ...(sim.supply.list.length ? { cr: sim.supply.save() } : {}), // refills left in each ammo crate
    };
  }

  function send() {
    if (!clients.size) { pending = []; return; }
    const events = pending.map(([name, data]) => [name, data, wireEvent(name, data)]);
    pending = [];
    const base = tick % SNAPSHOT_EVERY === 0 ? snapshotBase() : null;
    for (const c of clients.values()) {
      const list = events.filter(([name, data]) => eventFor(name, data, c.slot)).map(([, , wire]) => wire);
      if (list.length) c.link.send({ t: 'ev', tick, list });
      if (base) {
        const p = sim.player(c.slot);
        c.link.send({
          ...base,
          ack: c.jitter.ack,
          buf: c.jitter.size,
          you: { s: p.soldier.body.save(), hp: p.health.state.hp, taken: p.health.state.taken },
        }, { reliable: false });
      }
    }
  }

  // ---------------------------------------------------------------- the session

  return {
    role: 'host',
    me,
    sim,
    events: sim.events,
    world: sim.world,
    registry: sim.registry,
    level: sim.level,
    targets: sim.targets,
    encounter: sim.encounter,
    course: sim.course,
    supply: sim.supply,
    get local() { return sim.player(me); },
    enemies: sim.enemies ?? { list: [] },
    teammates,
    clients,
    get tick() { return tick; },
    /** Solo games stop when you pause. A co-op game keeps going. */
    get pausable() { return !coop && sim.team.size === 1; },

    addClient,
    removeClient,

    /** One tick: everyone's commands, the whole simulation, then tell the clients. */
    step(dt, cmd) {
      for (const [slot, msg] of inbox.splice(0)) receive(slot, msg);
      const now = clock();
      for (const c of [...clients.values()]) if (now - c.heard > QUIET * 1000) removeClient(c.slot);
      commands.set(me, cmd);
      for (const c of clients.values()) commands.set(c.slot, c.jitter.take());
      const outs = sim.tick(dt, commands, { remote });
      tick++;
      send();
      return outs.get(me);
    },

    /**
     * Everyone back to the start. The event carries the tick it happened on, so
     * clients can throw away older news still on its way (net/client.js).
     */
    restart() {
      sim.reset();
      sim.events.emit('mission:restart', { tick: tick + 1 });
    },

    /** Just you, back to your spawn (the Proving Ground's "Back to spawn"). */
    respawn() {
      const p = sim.player(me);
      p.soldier.teleport(p.spawn.pos, p.spawn.yaw);
      p.health.reset();
    },

    dispose() {
      for (const slot of [...clients.keys()]) removeClient(slot);
      sim.dispose();
    },
  };
}
