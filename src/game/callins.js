// Call-ins: support you call on the radio. A supply drop, a recon drone, a
// mortar strike or a smoke screen, aimed where you're looking (press T, or View
// on a controller).
//
// You earn the right to call one. Your CHARGE fills as you play (kills,
// objectives, and slowly by itself); full, it's ready. Each use makes the next
// charge take a little longer, so they stay special. Like a coffee shop loyalty
// card: earn the stamps, get the treat, and the next card has more boxes.
//
// What each one does (all the numbers are in CALLINS):
//   supply  a crate falls by parachute; once it lands, it's an ammo crate (hold F)
//   recon   a drone circles the spot, marking every enemy near it for the whole squad
//   mortar  red smoke marks the spot (a warning anyone can see), then shells land
//           around it. They use the grenade's blast (game/sim.js), which never
//           hurts the squad; enemies who see the smoke run from it
//   smoke   a wall of smoke clouds that nobody can see through: they're colliders
//           in the SMOKE group (world/groups.js), which only eyesight meets.
//           Bullets fly straight through (you shoot blind)
//
// The host decides everything here: who called what, where, and when it lands.
// Clients only draw it, from `view` (sent in snapshots: net/protocol.js) and the
// `callin:*` events. A client adds the same smoke colliders from the view, so
// its aim assist is blocked by smoke too.
//
// Runs in Node: no DOM, no three.js.

import { RAPIER } from '../world/physics.js';
import { LEVEL, SMOKE_GROUPS } from '../world/groups.js';

export const CALLINS = {
  range: 60,          // metres: how far away you can call one
  windup: 1.5,        // seconds of radio before it arrives
  charge: {
    kill: 0.12,       // of a full charge, per enemy you drop
    headshot: 0.04,   // ...extra for a headshot
    objective: 0.35,  // everyone, when an objective is done
    perSecond: 1 / 300, // ...and slowly by itself (5 minutes, the first time)
  },
  slower: 1.3,        // each use, the next charge fills this many times slower
  supply: { fall: 6, height: 45, refills: 2, range: 1.6, useTime: 1, keep: 20 },
  recon: { duration: 25, radius: 35, height: 28 },
  mortar: {
    warn: 3,          // seconds from the red smoke to the first shell
    shells: 4,
    over: 3,          // seconds between the first shell and the last
    spread: 6,        // metres from the mark
    radius: 7, inner: 2, damage: 220, noise: 140, // each shell's blast (like a grenade's, bigger)
  },
  smoke: { duration: 25, clouds: 4, radius: 3, spacing: 4.5 },
};

export const CALLIN_KINDS = ['supply', 'recon', 'smoke', 'mortar'];
// Supply and mortar come from the sky, so they need open sky above the spot.
const FROM_ABOVE = new Set(['supply', 'mortar']);

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {object} opts
 * @param {object} opts.world     the physics world (aiming, the ground, smoke colliders)
 * @param {object} opts.events    the mission's event bus
 * @param {object} opts.rng       seeded random (core/random.js): shells land the same on every replay
 * @param {Function} opts.explode (blast, tuning) => void: game/sim.js's grenade explosion
 * @param {() => Array} opts.enemies  the living enemies
 * @param {boolean} [opts.practice] always charged (the Proving Ground)
 */
export function createCallins({ world, events, rng, explode, enemies = () => [], practice = false, tuning = CALLINS }) {
  const players = new Map(); // owner -> { kind, charge, uses }
  let active = [];           // call-ins on their way or working
  let n = 0;                 // for ids
  let time = 0;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  function cast(from, dir, len) {
    ray.origin = from;
    ray.dir = dir;
    const hit = world.castRay(ray, len, true, undefined, LEVEL);
    return hit ? hit.timeOfImpact : null;
  }
  /** The ground under (x, z), looking down from a little above `y`. */
  function groundAt(x, y, z) {
    const t = cast({ x, y: y + 3, z }, { x: 0, y: -1, z: 0 }, 30);
    return t === null ? y : y + 3 - t;
  }

  // ---- earning charge
  const gain = (owner, amount) => {
    const p = players.get(owner);
    if (!p || p.charge >= 1) return;
    p.charge = Math.min(1, p.charge + amount / (tuning.slower ** p.uses));
    if (p.charge >= 1) events.emit('callin:ready', { owner, kind: p.kind });
  };
  const offs = [
    events.on('enemy:down', (e) => {
      if (typeof e.owner !== 'number') return;
      gain(e.owner, tuning.charge.kill + (e.headshot ? tuning.charge.headshot : 0));
    }),
    events.on('objective:complete', () => { for (const owner of players.keys()) gain(owner, tuning.charge.objective); }),
  ];

  /**
   * Player `p` pressed T: if their call-in is ready, aim it where they're
   * looking and put it on its way. Returns the call-in, or null (refused, and why).
   */
  function call(p, cmd) {
    const me = players.get(p.owner);
    if (!me) return null;
    const refuse = (reason) => { events.emit('callin:refused', { owner: p.owner, kind: me.kind, reason }); return null; };
    if (me.charge < 1) return refuse('charging');
    const s = p.soldier.state;
    const eye = { x: s.pos.x, y: s.pos.y + p.soldier.body.eyeHeight(), z: s.pos.z };
    const c = Math.cos(cmd.pitch);
    const dir = { x: -Math.sin(cmd.yaw) * c, y: Math.sin(cmd.pitch), z: -Math.cos(cmd.yaw) * c };
    const t = cast(eye, dir, tuning.range);
    if (t === null) return refuse('range');
    // The spot on the ground: step back off a wall a little, then down to the floor.
    const back = Math.max(0, t - 0.4);
    const at = { x: eye.x + dir.x * back, y: eye.y + dir.y * back, z: eye.z + dir.z * back };
    at.y = groundAt(at.x, at.y, at.z);
    if (FROM_ABOVE.has(me.kind) && cast({ x: at.x, y: at.y + 0.3, z: at.z }, { x: 0, y: 1, z: 0 }, 40) !== null) return refuse('sky');
    me.charge = practice ? 1 : 0;
    me.uses++;
    const item = {
      id: `c${++n}`, kind: me.kind, owner: p.owner, pos: { x: r2(at.x), y: r2(at.y), z: r2(at.z) },
      phase: 'inbound', t: tuning.windup, yaw: r2(cmd.yaw),
    };
    active.push(item);
    events.emit('callin:call', { id: item.id, owner: p.owner, kind: item.kind, pos: { ...item.pos }, windup: tuning.windup });
    return item;
  }

  /** It arrives: set it up. */
  function arrive(c) {
    c.phase = 'active';
    if (c.kind === 'supply') {
      c.t = tuning.supply.fall; // falling
      c.left = Math.max(1, tuning.supply.refills * Math.max(1, players.size));
    } else if (c.kind === 'recon') {
      c.t = tuning.recon.duration;
    } else if (c.kind === 'mortar') {
      const M = tuning.mortar;
      c.t = M.warn + M.over + 0.5;
      // Where and when each shell lands, decided now (seeded: the same every replay).
      c.shells = Array.from({ length: M.shells }, (_, i) => {
        const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * M.spread;
        const x = c.pos.x + Math.sin(a) * d, z = c.pos.z + Math.cos(a) * d;
        return { at: M.warn + (M.shells > 1 ? (i / (M.shells - 1)) * M.over : 0), pos: { x: r2(x), y: r2(groundAt(x, c.pos.y, z)), z: r2(z) }, done: false };
      });
      c.age = 0;
    } else if (c.kind === 'smoke') {
      const S = tuning.smoke;
      c.t = S.duration;
      // A line of clouds across the caller's view, centred on the spot.
      const across = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
      c.clouds = Array.from({ length: S.clouds }, (_, i) => {
        const k = (i - (S.clouds - 1) / 2) * S.spacing;
        const x = c.pos.x + across.x * k, z = c.pos.z + across.z * k;
        return { x: r2(x), y: r2(groundAt(x, c.pos.y, z) + S.radius * 0.6), z: r2(z) };
      });
      c.colliders = addSmoke(world, c.clouds, S.radius);
    }
    events.emit('callin:start', { id: c.id, owner: c.owner, kind: c.kind, pos: { ...c.pos }, ...(c.clouds ? { clouds: c.clouds } : {}) });
  }

  function finish(c) {
    if (c.colliders) removeSmoke(world, c.colliders);
    events.emit('callin:end', { id: c.id, kind: c.kind });
  }

  function update(dt) {
    time += dt;
    for (const [owner, p] of players) {
      if (practice) p.charge = 1;
      else if (p.charge < 1) gain(owner, tuning.charge.perSecond * dt);
    }

    const marks = new Set();
    for (const c of active) {
      c.t -= dt;
      if (c.phase === 'inbound') {
        if (c.t <= 0) arrive(c);
        continue;
      }
      if (c.kind === 'supply' && !c.landed && c.t <= 0) {
        c.landed = true;
        c.t = Infinity; // stays until it's empty
        events.emit('callin:landed', { id: c.id, kind: c.kind, pos: { ...c.pos } });
      } else if (c.kind === 'supply' && c.landed && c.left <= 0 && c.t === Infinity) {
        c.t = tuning.supply.keep; // empty: gone after a while
      } else if (c.kind === 'recon') {
        for (const e of enemies()) {
          if (Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) <= tuning.recon.radius) marks.add(e);
        }
      } else if (c.kind === 'mortar') {
        c.age += dt;
        for (const s of c.shells) {
          if (s.done || c.age < s.at) continue;
          s.done = true;
          explode({ id: `${c.id}:${c.shells.indexOf(s)}`, owner: c.owner, pos: { ...s.pos }, kind: 'mortar' }, tuning.mortar);
        }
      }
    }
    // Recon: marked while a drone watches them (and a moment after, so the marker doesn't flicker).
    for (const e of enemies()) {
      if (marks.has(e)) e.markedUntil = time + 1;
      e.marked = (e.markedUntil ?? -Infinity) > time && !e.dead;
    }
    const over = active.filter((c) => c.phase === 'active' && c.t <= 0);
    for (const c of over) finish(c);
    if (over.length) active = active.filter((c) => !over.includes(c));
  }

  /** The supply drops on the ground with ammo left, as hold-F spots (game/interact.js). */
  function spots() {
    return active.filter((c) => c.kind === 'supply' && c.landed && c.left > 0).map((c) => ({
      id: c.id,
      kind: 'crate',
      pos: c.pos,
      range: tuning.supply.range,
      time: tuning.supply.useTime,
      label: 'Ammo',
      can: (p) => !p.soldier.arsenal.full(),
      done: (p) => {
        c.left--;
        events.emit('ammo:resupply', { owner: p.owner, crate: c.id, left: c.left });
      },
    }));
  }

  /** Mortar marks, for enemies to run from (like a grenade landing: ai/senses.js). */
  function hazards() {
    return active.filter((c) => c.kind === 'mortar' && c.phase === 'active').map((c) => ({ id: c.id, pos: c.pos, owner: c.owner, from: c.pos }));
  }

  function clearActive() {
    for (const c of active) if (c.colliders) removeSmoke(world, c.colliders);
    active = [];
    for (const e of enemies()) { e.marked = false; e.markedUntil = -Infinity; }
  }

  return {
    tuning,
    /** A player joins, with the call-in from their loadout. */
    addPlayer(owner, kind = 'supply') {
      players.set(owner, { owner, kind: CALLIN_KINDS.includes(kind) ? kind : 'supply', charge: practice ? 1 : 0, uses: 0 });
    },
    removePlayer(owner) { players.delete(owner); },
    player: (owner) => players.get(owner) ?? null,
    call,
    update,
    spots,
    hazards,
    get active() { return active; },
    /**
     * What's happening, for drawing (and for clients, in snapshots): each call-in's
     * kind, where, its phase, and the seconds left in it.
     */
    get view() {
      return active.map((c) => ({
        id: c.id, kind: c.kind, owner: c.owner, pos: c.pos, phase: c.landed ? 'landed' : c.phase, t: c.t,
        left: c.left ?? 0, clouds: c.clouds ?? null, shells: c.shells ? c.shells.filter((s) => !s.done).length : 0,
      }));
    },
    /** Back to the start of the mission: nothing in the air, nobody charged. */
    reset() {
      clearActive();
      for (const p of players.values()) { p.charge = practice ? 1 : 0; p.uses = 0; }
    },
    /** Retry from a checkpoint: what was on its way is gone; charges are kept. */
    retry: clearActive,
    dispose() {
      clearActive();
      for (const off of offs) off();
    },
  };
}

/** Smoke clouds as colliders only eyesight meets (world/groups.js SMOKE). Shared with net/client.js. */
export function addSmoke(world, clouds, radius = CALLINS.smoke.radius) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const colliders = clouds.map((c) => world.createCollider(
    RAPIER.ColliderDesc.ball(radius).setTranslation(c.x, c.y, c.z).setCollisionGroups(SMOKE_GROUPS),
    body,
  ));
  return { body, colliders };
}

export function removeSmoke(world, smoke) {
  world.removeRigidBody(smoke.body); // (takes its colliders with it)
}
