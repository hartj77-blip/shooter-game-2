// Grenades: a thrown object that flies, bounces and goes bang.
//
// Bullets are "hitscan" (weapons/hitscan.js): instant lines. A grenade is a
// PROJECTILE instead: a small object with a position and a velocity, moved a
// little every tick. Gravity pulls it down; when it hits something it bounces
// (losing some speed) and rolls to a stop. When its fuse runs out it explodes.
//
// THE BLAST does AREA DAMAGE: everyone within `radius` is hurt, more the closer
// they are (full damage inside `inner`, then fading to nothing at the edge: the
// FALLOFF). Walls protect you: the blast needs a clear line to your chest or
// head. Friendly fire is off, so it never hurts the squad.
//
// IN CO-OP every browser flies every grenade itself, with this same code. It
// only bounces off the level, which is identical everywhere, so given the same
// start (where it left the hand, how fast) every computer sees the same flight.
// The host's explosion is the truth for damage. The thrower's own browser
// throws it the moment you press G (prediction, lesson 12) and tells the host.
//
// Runs in Node: the tests fly grenades in two separate worlds and compare.

import { RAPIER } from '../world/physics.js';
import { LEVEL } from '../world/groups.js';

export const GRENADE = {
  max: 2,          // carried at the start of a mission (crates refill them)
  gesture: 0.6,    // seconds the throw takes (your trigger finger is busy meanwhile)
  release: 0.22,   // ... and when in the throw it leaves your hand
  speed: 15,       // m/s, thrown
  loft: 0.12,      // radians: thrown a little above where you look
  carry: 0.5,      // how much of your own running speed it keeps
  gravity: 16,     // m/s² (a touch less than the players' 20: a nicer arc)
  bounce: 0.38,    // how much speed it keeps bouncing straight off something
  grip: 0.45,      // how much it keeps sliding along a surface on each bounce
  roll: 14,        // m/s² it slows down rolling along the ground
  fuse: 3.2,       // seconds from leaving your hand
  radius: 7,       // metres: nothing beyond this is hurt
  inner: 1.5,      // metres: full damage this close
  damage: 160,
  noise: 95,       // how far away enemies hear it (ai/noise.js)
  size: 0.06,      // its own radius, for bouncing
};

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Where a grenade leaves your hand, and how fast, for a throw towards (yaw, pitch).
 * Rounded to the centimetre, so a co-op client and the host start from exactly
 * the same numbers (the same trick as roundCommand, net/protocol.js).
 */
export function throwFrom(eye, yaw, pitch, bodyVel, tuning = GRENADE) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const p = Math.min(1.3, pitch + tuning.loft);
  const cp = Math.cos(p), sp = Math.sin(p);
  return {
    origin: { x: r2(eye.x + fx * 0.3 + rx * 0.15), y: r2(eye.y - 0.1), z: r2(eye.z + fz * 0.3 + rz * 0.15) },
    vel: {
      x: r2(fx * cp * tuning.speed + bodyVel.x * tuning.carry),
      y: r2(sp * tuning.speed + Math.max(0, bodyVel.y) * tuning.carry),
      z: r2(fz * cp * tuning.speed + bodyVel.z * tuning.carry),
    },
  };
}

/** How much of the blast reaches something `d` metres away (before walls): 1 close up, 0 at the edge. */
export function falloff(d, tuning = GRENADE) {
  if (d <= tuning.inner) return 1;
  const k = Math.max(0, 1 - (d - tuning.inner) / (tuning.radius - tuning.inner));
  return k * k;
}

/**
 * The grenades in flight in one world.
 * @param {object} opts
 * @param {object} opts.world   the physics world (only the level is bounced off)
 * @param {Function} [opts.emit] for 'grenade:bounce' (a clink you hear) and, via onExplode, the blast
 * @param {(g) => void} [opts.onExplode] the fuse ran out: what happens is up to the caller (game/sim.js on
 *        the host does the damage; a co-op client only shows it)
 */
export function createGrenades({ world, emit = () => {}, onExplode = () => {}, tuning = GRENADE }) {
  let list = [];
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

  /**
   * A grenade leaves someone's hand.
   * @param {object} g { id, owner, origin, vel, fuse? }
   */
  function spawn({ id, owner, origin, vel, fuse = tuning.fuse, age = 0 }) {
    if (list.some((g) => g.id === id)) return null;
    const g = {
      id, owner, fuse, age,
      pos: { ...origin }, prev: { ...origin }, vel: { ...vel },
      resting: false, from: { ...origin },
    };
    list.push(g);
    // Catch up if it was thrown a little while ago (a client hearing of it late).
    for (let t = 0; t < age; t += 1 / 60) fly(g, 1 / 60);
    return g;
  }

  /** One small step of flight: fall, move, bounce off whatever's in the way. */
  function fly(g, dt) {
    if (g.resting) return;
    const v = g.vel;
    v.y -= tuning.gravity * dt;
    let left = dt;
    for (let bounce = 0; bounce < 3 && left > 0; bounce++) {
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      if (speed < 1e-6) break;
      const dir = { x: v.x / speed, y: v.y / speed, z: v.z / speed };
      const reach = speed * left;
      ray.origin = g.pos;
      ray.dir = dir;
      const hit = world.castRayAndGetNormal(ray, reach + tuning.size, true, undefined, LEVEL);
      if (!hit) {
        g.pos.x += v.x * left; g.pos.y += v.y * left; g.pos.z += v.z * left;
        break;
      }
      // Up to the surface (stopping just short of it), then bounce.
      const travel = Math.max(0, hit.timeOfImpact - tuning.size);
      g.pos.x += dir.x * travel; g.pos.y += dir.y * travel; g.pos.z += dir.z * travel;
      left -= travel / speed;
      const n = hit.normal;
      const into = v.x * n.x + v.y * n.y + v.z * n.z;
      if (into >= 0) break;
      // Split the speed into "straight into the surface" and "along it":
      // the first bounces back (some of it), the second slides on (most of it).
      const nx = n.x * into, ny = n.y * into, nz = n.z * into;
      v.x = (v.x - nx) * tuning.grip - nx * tuning.bounce;
      v.y = (v.y - ny) * tuning.grip - ny * tuning.bounce;
      v.z = (v.z - nz) * tuning.grip - nz * tuning.bounce;
      if (-into > 1.5) emit('grenade:bounce', { id: g.id, owner: g.owner, pos: { ...g.pos }, speed: -into });
      // On the floor and barely bouncing: it rolls, then stops.
      if (n.y > 0.7 && Math.abs(v.y) < 1.2) {
        v.y = 0;
        const flat = Math.sqrt(v.x * v.x + v.z * v.z);
        const slower = Math.max(0, flat - tuning.roll * dt);
        if (slower < 0.3) { v.x = 0; v.z = 0; g.resting = true; break; }
        v.x *= slower / flat; v.z *= slower / flat;
      }
    }
  }

  function update(dt) {
    for (const g of list) {
      g.prev = { ...g.pos };
      g.age += dt;
      fly(g, dt);
    }
    const done = list.filter((g) => g.age >= g.fuse);
    if (done.length) {
      list = list.filter((g) => g.age < g.fuse);
      for (const g of done) onExplode(g);
    }
  }

  return {
    get list() { return list; },
    spawn,
    update,
    /** Take one away without a bang (the host's explosion arrived first, or a restart). */
    remove(id) { list = list.filter((g) => g.id !== id); },
    clear() { list = []; },
  };
}

/**
 * What a blast at `pos` does to each of `victims`: who's in reach, and how hard
 * they're hit (walls in the way protect them).
 * @param {object} world
 * @param {{x,y,z}} pos
 * @param {Array} victims [{ thing, points: [{x,y,z}, ...], ignore? }]: a chest and a head, say
 *        (`ignore`: the victim's own colliders, if it's part of the level's group, like a practice target)
 * @returns {Array} [{ thing, amount, point, distance }]
 */
export function blast(world, pos, victims, tuning = GRENADE) {
  const from = { x: pos.x, y: pos.y + 0.3, z: pos.z };
  const ray = new RAPIER.Ray(from, { x: 0, y: 1, z: 0 });
  const out = [];
  for (const v of victims) {
    let best = null;
    const keep = v.ignore ? (c) => !v.ignore.includes(c) : undefined;
    for (const p of v.points) {
      const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > tuning.radius) continue;
      if (d > 0.05) {
        ray.dir = { x: dx / d, y: dy / d, z: dz / d };
        if (world.castRay(ray, d, true, undefined, LEVEL, undefined, undefined, keep)) continue; // a wall in the way
      }
      if (!best || d < best.distance) best = { point: p, distance: d };
    }
    if (!best) continue;
    const amount = tuning.damage * falloff(best.distance, tuning);
    if (amount > 0.5) out.push({ thing: v.thing, amount, point: best.point, distance: best.distance });
  }
  return out;
}
