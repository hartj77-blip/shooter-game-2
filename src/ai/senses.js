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
// DARKNESS (world/lighting.js): at night they see less far, and become sure
// more slowly, unless you're under a lamp, firing, or in their own flashlight's
// beam. By day the light is 1 everywhere and none of this changes anything.
//
// HEARING reads the noise board (ai/noise.js): gunshots carry far, sprinting
// footsteps a fair way, walking a little, crouch-walking almost not at all.
//
// With several players, each enemy keeps one TARGET: the player it can see
// (sticking with the one it already had), otherwise nobody until it finds
// someone. Awareness is about the most noticeable player in view.
//
// This runs every 0.1 s per enemy, not every tick, with enemies taking turns.
// That's "time slicing": nobody notices a tenth of a second, and it divides
// the cost of all these rays by six.

import { RAPIER } from '../world/physics.js';
import { SIGHT, BULLET, LEVEL } from '../world/groups.js';
import { AWARENESS } from './enemy-data.js';
import { flashlightOn, sightScale, noticeScale } from '../world/lighting.js';

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
const HAZARD_RANGE = 8; // metres: grenades closer than this are their problem (the blast reaches 7 m)

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
 * How lit player `p` is for enemy `e`: the light where they stand (moon, lamps,
 * their own muzzle flash; ai/enemies.js works it out each tick), or this enemy's
 * own flashlight, whichever is brighter.
 */
function lightFor(ai, e, eye, p) {
  if (!ai.lighting?.night) return 1;
  return Math.max(p.light ?? 1, flashlightOn(ai.lighting, eye, e.motor.yaw, p.chest));
}

/** Can enemy `e` (eyes at `eye`) see player `p`? Returns { distance, peripheral, light, range } or null. */
function look(ai, e, eye, p) {
  const light = lightFor(ai, e, eye, p);
  const range = e.def.sight.range * sightScale(light, ai.lighting?.tuning);
  for (const point of [p.chest, p.head]) {
    const vx = point.x - eye.x, vy = point.y - eye.y, vz = point.z - eye.z;
    const d = Math.hypot(vx, vy, vz);
    if (d > range) return null;
    const yawTo = Math.atan2(-vx, -vz);
    const off = Math.abs(wrap(yawTo - e.motor.yaw)) / DEG;
    if (off > e.def.sight.peripheral / 2) return null;
    if (Math.abs(Math.atan2(vy, Math.hypot(vx, vz))) > 70 * DEG) return null;
    if (clear(ai.world, eye, point, SIGHT)) return { distance: d, peripheral: off > e.def.sight.fov / 2, light, range };
  }
  return null;
}

/**
 * One look and listen. `dt` is the time since this enemy last sensed (about 0.1 s).
 * @param {object} e   the enemy (ai/enemy.js)
 * @param {object} ai  shared AI context (ai/enemies.js): world, registry, targets (players), noise, time, difficulty
 */
export function sense(e, ai, dt) {
  const S = e.senses;
  const def = e.def;
  const eye = e.eye();

  // ---- sight: who can I see? Keep my current target if I still can; otherwise the closest.
  let seen = null;
  for (const P of ai.targets) {
    const v = look(ai, e, eye, P);
    if (!v) continue;
    if (P === e.target) { seen = { P, ...v }; break; }
    if (!seen || v.distance < seen.distance) seen = { P, ...v };
  }
  if (seen) e.target = seen.P;
  const p = seen?.P ?? null;
  const visible = !!seen;
  const peripheral = seen?.peripheral ?? false;
  const distance = seen?.distance ?? Infinity;

  S.visible = visible;
  S.peripheral = peripheral;
  if (visible) {
    S.visibleFor += dt;
    S.unseenFor = 0;
    S.seenPos = { ...p.pos };
    // Would a bullet get there, or is a squad-mate in the way?
    S.clearShot = shotIsClear(ai, e, eye, p.chest);
    const A = AWARENESS;
    // (In the dark, "right in front of me" is closer, and the kettle heats slower.)
    const dark = sightScale(seen.light, ai.lighting?.tuning);
    if (distance < A.instant * dark && !peripheral) {
      S.awareness = 1;
    } else {
      const near = Math.min(1, Math.max(0.2, 1 - (distance - 6) / (seen.range - 6)));
      let rate = A.rate * near * (peripheral ? A.peripheral : 1) * ai.difficulty.awareness;
      rate *= noticeScale(seen.light, ai.lighting?.tuning);
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

  // ---- grenades: one landing nearby is worth noticing (and maybe running from, ai/brain.js).
  // They have to see it, unless it lands right by their feet (they hear it clatter).
  S.hazard = null;
  for (const g of ai.hazards ?? []) {
    const d = Math.hypot(g.pos.x - e.pos.x, g.pos.z - e.pos.z);
    if (d > HAZARD_RANGE || Math.abs(g.pos.y - e.pos.y) > 3) continue;
    if (d > 2.5) {
      const off = Math.abs(wrap(Math.atan2(-(g.pos.x - eye.x), -(g.pos.z - eye.z)) - e.motor.yaw)) / DEG;
      if (off > def.sight.fov / 2 || !clear(ai.world, eye, g.pos, SIGHT)) continue;
    }
    if (!S.hazard || d < S.hazard.d) S.hazard = { id: g.id, pos: { ...g.pos }, from: g.from, owner: g.owner, d };
  }

  // ---- hearing
  const ear = eye;
  for (const n of ai.noise.since(S.heardAt)) {
    if (typeof n.owner !== 'number') continue; // only players' noises matter (squads share the rest by radio)
    const d = Math.hypot(n.pos.x - ear.x, n.pos.y - ear.y, n.pos.z - ear.z);
    let radius = n.radius * def.hearing;
    if (d > radius) continue;
    const loud = n.kind === 'gunshot' || n.kind === 'explosion';
    const source = { x: n.pos.x, y: n.pos.y + (loud ? 0.3 : 0.6), z: n.pos.z };
    if (d > radius / 2 && !clear(ai.world, ear, source, LEVEL)) continue; // a wall muffles it: half the range (smoke doesn't)
    const rank = loud ? 2 : 1;
    const prev = S.heard && ai.time - S.heard.time < 1 ? (S.heard.kind === 'gunshot' || S.heard.kind === 'explosion' ? 2 : 1) : 0;
    if (rank < prev) continue;
    // You can tell roughly where a sound came from, better when it's close.
    const err = d * 0.12;
    S.heard = {
      pos: { x: n.pos.x + e.rng.range(-err, err), y: n.pos.y, z: n.pos.z + e.rng.range(-err, err) },
      kind: n.kind,
      time: ai.time,
      // A gunshot this close (or any explosion they can hear): they know roughly where you are.
      alarm: (n.kind === 'gunshot' && d < radius * 0.35) || (n.kind === 'explosion' && d < radius * 0.6),
      owner: n.owner,
      handled: false,
    };
  }
  S.heardAt = ai.noise.now;
}
