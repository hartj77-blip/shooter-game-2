// Senses: what an enemy sees and hears, and how aware of you it is.
//
// SIGHT is a cone, like a torch beam. You're seen if you're
//   - close enough (the role's sight range),
//   - inside the cone (or the wider "corner of the eye" cone, which counts less),
//   - and a ray from their eyes to your head or chest reaches you without
//     hitting a wall ("line of sight").
//
// Being seen doesn't mean being spotted. AWARENESS fills up like a kettle
// heating: faster when you're close, in the middle of their view, moving or
// shooting; slower when you're crouched, still, or at the edge of their vision.
// At 1 you're spotted. Out of sight it cools down again. That's what makes
// sneaking possible, and gives you a moment to react when you're seen.
//
// HEARING reads the noise board (ai/noise.js): gunshots carry far, sprinting
// footsteps a fair way, walking a little, crouch-walking almost not at all.
//
// This runs every 0.1 s per enemy, not every tick, with enemies taking turns.
// That's "time slicing": nobody notices a tenth of a second, and it divides
// the cost of all these rays by six.

import { RAPIER } from '../world/physics.js';
import { SIGHT, BULLET } from '../world/groups.js';
import { AWARENESS } from './enemy-data.js';

const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createSenseState() {
  return {
    visible: false,      // can see you right now
    clearShot: false,    // ... and nothing (a squad-mate, say) is in the way of a bullet
    peripheral: false,   // only out of the corner of the eye
    visibleFor: 0,       // seconds seen continuously
    unseenFor: Infinity, // seconds since last seen
    awareness: 0,        // 0 = no idea, 1 = spotted
    seenPos: null,       // where you were when last seen
    heard: null,         // { pos, kind, time, alarm } the most important thing heard lately
    heardAt: -Infinity,  // board time of the last noise read
    underFire: -Infinity,// game time someone last shot at or near this enemy
    shotFrom: null,      // ... and roughly from where
  };
}

const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

function clear(world, from, to, groups, skip) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  ray.origin = from;
  ray.dir = { x: dx / len, y: dy / len, z: dz / len };
  return world.castRay(ray, len - 0.05, true, undefined, groups, undefined, undefined, skip) === null;
}

/** Would a bullet from `from` reach the player, rather than a squad-mate or a wall? */
function shotIsClear(ai, e, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  ray.origin = from;
  ray.dir = { x: dx / len, y: dy / len, z: dz / len };
  const hit = ai.world.castRay(ray, len + 0.3, true, undefined, BULLET, undefined, undefined, (c) => !e.soldier.owns(c));
  return !hit || ai.registry.get(hit.collider).target?.kind === 'player';
}

/**
 * One look and listen. `dt` is the time since this enemy last sensed (about 0.1 s).
 * @param {object} e   the enemy (ai/enemy.js)
 * @param {object} ai  shared AI context (ai/enemies.js): world, registry, player, noise, time, difficulty
 */
export function sense(e, ai, dt) {
  const S = e.senses;
  const def = e.def;
  const p = ai.player;
  const eye = e.eye();

  // ---- sight
  let visible = false;
  let peripheral = false;
  let distance = Infinity;
  if (!p.down) {
    for (const target of [p.chest, p.head]) {
      const vx = target.x - eye.x, vy = target.y - eye.y, vz = target.z - eye.z;
      const d = Math.hypot(vx, vy, vz);
      if (d > def.sight.range) break;
      const yawTo = Math.atan2(-vx, -vz);
      const off = Math.abs(wrap(yawTo - e.motor.yaw)) / DEG;
      if (off > def.sight.peripheral / 2) break;
      if (Math.abs(Math.atan2(vy, Math.hypot(vx, vz))) > 70 * DEG) break;
      if (clear(ai.world, eye, target, SIGHT)) {
        visible = true;
        peripheral = off > def.sight.fov / 2;
        distance = d;
        break;
      }
    }
  }

  S.visible = visible;
  S.peripheral = peripheral;
  if (visible) {
    S.visibleFor += dt;
    S.unseenFor = 0;
    S.seenPos = { ...p.pos };
    // Would a bullet get there, or is a squad-mate in the way?
    S.clearShot = shotIsClear(ai, e, eye, p.chest);
    const A = AWARENESS;
    if (distance < A.instant && !peripheral) {
      S.awareness = 1;
    } else {
      const near = Math.min(1, Math.max(0.2, 1 - (distance - 6) / (def.sight.range - 6)));
      let rate = A.rate * near * (peripheral ? A.peripheral : 1) * ai.difficulty.awareness;
      if (p.crouched) rate *= A.crouched;
      if (p.speed < 0.5) rate *= A.still;
      else if (p.sprinting) rate *= A.sprinting;
      if (ai.time - p.firedAt < 0.5) rate *= A.firing;
      S.awareness = Math.min(1, S.awareness + rate * dt);
    }
  } else {
    S.visibleFor = 0;
    S.unseenFor += dt;
    S.clearShot = false;
    if (!e.inCombat) S.awareness = Math.max(0, S.awareness - AWARENESS.decay * dt);
  }

  // ---- hearing
  const ear = eye;
  for (const n of ai.noise.since(S.heardAt)) {
    if (n.owner !== p.owner) continue; // only the player's noises matter (squads share the rest by radio)
    const d = Math.hypot(n.pos.x - ear.x, n.pos.y - ear.y, n.pos.z - ear.z);
    let radius = n.radius * def.hearing;
    if (d > radius) continue;
    const source = { x: n.pos.x, y: n.pos.y + (n.kind === 'gunshot' ? 0 : 0.6), z: n.pos.z };
    if (d > radius / 2 && !clear(ai.world, ear, source, SIGHT)) continue; // a wall muffles it: half the range
    const rank = n.kind === 'gunshot' ? 2 : 1;
    const prev = S.heard && ai.time - S.heard.time < 1 ? (S.heard.kind === 'gunshot' ? 2 : 1) : 0;
    if (rank < prev) continue;
    // You can tell roughly where a sound came from, better when it's close.
    const err = d * 0.12;
    S.heard = {
      pos: { x: n.pos.x + e.rng.range(-err, err), y: n.pos.y, z: n.pos.z + e.rng.range(-err, err) },
      kind: n.kind,
      time: ai.time,
      alarm: n.kind === 'gunshot' && d < radius * 0.35, // a gunshot this close: they know roughly where you are
      handled: false,
    };
  }
  S.heardAt = ai.noise.now;
}
