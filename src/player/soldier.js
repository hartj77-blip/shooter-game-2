// A soldier: a body that moves, hitboxes that bullets hit, and the guns it carries.
//
// You are a soldier. So is every enemy: same body, same guns, same rules. The
// only difference is where the commands come from: yours come from the
// keyboard and mouse (core/input.js), an enemy's from its brain (ai/brain.js).
// In co-op (milestone 4) your teammates will be soldiers driven over the network.
//
// The order inside a tick matters:
//   soldier.move(cmd, dt)   walk/jump/slide; the gun can slow you (aiming) or stop a sprint (firing);
//                           then the hitboxes follow the body
//   world.step()            the physics engine catches up with everything that moved
//   soldier.act(cmd, dt)    the gun fires from the new eye position; bullets are traced
//
// main.js (and the tests) call these in that order.

import { createPlayer } from './controller.js';
import { createHitboxes } from './hitboxes.js';
import { createArsenal } from '../weapons/arsenal.js';
import { traceShot } from '../weapons/hitscan.js';
import { createRandom } from '../core/random.js';
import { events as gameEvents } from '../core/events.js';
import { NOISE } from '../ai/noise.js';

/**
 * @param {object} opts
 * @param {object} opts.world     Rapier world
 * @param {object} opts.spawn     { pos, yaw }
 * @param {object} opts.registry  surface registry (what each collider is)
 * @param {object} [opts.targets] practice targets, to receive damage
 * @param {Function} [opts.damage] (victim, amount, hit) => { killed }: who gets hurt and how (main.js routes
 *                                 enemies, you and practice targets to the right system)
 * @param {object} [opts.entity]  what the hitboxes say they belong to (defaults to { kind: 'player', owner })
 * @param {boolean} [opts.flatZones] no headshot bonus on this soldier (used for you, against enemy fire)
 * @param {object} [opts.noise]   noise board (ai/noise.js): gunshots and footsteps go here for enemies to hear
 * @param {Function} [opts.passThrough] (what the collider is) => true if this soldier's bullets fly
 *                                 straight through it (teammates, with friendly fire off)
 * @param {object} [opts.events]  event bus
 * @param {number} [opts.seed]    random seed for bullet spread
 * @param {number|string} [opts.owner] who this is (0 = you)
 */
export function createSoldier({
  world, spawn, registry, targets = null, damage = null, entity = null, flatZones = false, noise = null,
  passThrough = null, events = gameEvents, seed = 1, owner = 0, loadout, options, tuning,
}) {
  const body = createPlayer({ world, spawn, events, owner, ...(tuning ? { tuning } : {}) });
  const rng = createRandom(seed);
  const arsenal = createArsenal({ loadout, rng, owner, options, emit: (name, data) => events.emit(name, data) });
  const me = entity ?? { kind: 'player', id: `p${owner}`, owner };
  const hitboxes = createHitboxes(world, registry, me, { flatZones });
  hitboxes.sync(body.state.pos, body.state.yaw, body.state.crouched);

  // By default only practice targets can be hurt.
  const hurt = damage ?? ((victim, amount) => (targets && victim.kind !== 'enemy' && victim.kind !== 'player'
    ? targets.damage(victim, amount)
    : { killed: false }));

  /** Is this collider part of me? Bullets I fire pass through my own body. */
  const owns = (collider) => collider.handle === body.collider.handle || hitboxes.owns(collider);
  const skip = passThrough ? (c) => owns(c) || passThrough(registry.get(c)) : owns;

  function move(cmd, dt) {
    const wasGrounded = body.state.grounded;
    const fallSpeed = -body.state.vel.y;
    body.update(cmd, dt, arsenal.movementMods(cmd));
    const s = body.state;
    hitboxes.sync(s.pos, s.yaw, s.crouched);
    if (noise) {
      // Footsteps: louder when sprinting, nearly silent crouched.
      if (s.grounded && s.speed > 1) {
        const radius = s.crouched ? NOISE.crouchStep : s.sprinting ? NOISE.sprintStep : NOISE.walkStep;
        noise.post({ pos: s.pos, radius, kind: 'step', owner });
      }
      if (s.grounded && !wasGrounded && fallSpeed > 4) noise.post({ pos: s.pos, radius: NOISE.land, kind: 'land', owner });
    }
  }

  /**
   * Fires the gun (if it should) and traces every bullet. Bullets go where cmd.yaw and cmd.pitch
   * point (plus spread); an enemy's brain sets those itself, aim error and warning shots included.
   * @param {object} [opts]
   * @param {boolean} [opts.trace] false: run the gun (ammo, reloads, aiming) but trace no bullets.
   *        The host does this for other players, whose own browsers trace their shots (net/host.js).
   * @returns {{look:{yaw:number, pitch:number}, shots:Array, hitTargets?:Map}} recoil for the view, and what each shot did
   */
  function act(cmd, dt, { trace = true } = {}) {
    const s = body.state;
    const eye = { x: s.pos.x, y: s.pos.y + body.eyeHeight(), z: s.pos.z };
    const { shots, look } = arsenal.update(cmd, dt, { ...s, eye, walkSpeed: body.tuning.walkSpeed });
    if (!shots.length || !trace) return { look, shots: [] };

    const def = shots[0].weapon;
    const traced = [];
    const hitTargets = new Map(); // one entry per target per trigger pull (for hit markers and scoring)
    for (const shot of shots) {
      const { hits, end } = traceShot(world, registry, shot, skip);
      traced.push({ ...shot, hits, end });
      for (const h of hits) {
        events.emit('bullet:impact', {
          owner, weapon: def.id, point: h.point, normal: h.normal, surface: h.surface,
          target: h.target?.id ?? null, exit: h.exit ?? null, dir: shot.dir,
        });
        if (!h.target) continue;
        const result = hurt(h.target, h.damage, { zone: h.zone, point: h.point, dir: shot.dir, from: eye, owner, weapon: def.id, distance: h.distance });
        const prev = hitTargets.get(h.target) ?? { damage: 0, headshot: false, killed: false, zone: h.zone, point: h.point };
        prev.damage += h.damage;
        prev.headshot ||= h.zone === 'head';
        prev.killed ||= result.killed;
        hitTargets.set(h.target, prev);
      }
    }
    noise?.post({ pos: eye, radius: def.noise ?? NOISE.gunshot, kind: 'gunshot', owner });
    events.emit('weapon:fire', {
      owner,
      weapon: def.id,
      origin: eye,
      pulls: shots.length / def.pellets, // trigger pulls this tick (a shotgun blast is one)
      shots: traced.map((t) => ({ end: t.end, tracer: t.tracer, dir: t.dir })),
    });
    for (const [target, hit] of hitTargets) {
      events.emit('target:hit', {
        owner,
        target,
        id: target.id,
        kind: target.kind,
        hostage: target.hostage,
        zone: hit.zone,
        point: hit.point,
        damage: hit.damage,
        headshot: hit.headshot,
        killed: hit.killed,
      });
    }
    return { look, shots: traced, hitTargets };
  }

  /** Puts the soldier somewhere instantly, with its hitboxes. */
  function teleport(pos, yaw) {
    body.teleport(pos, yaw);
    hitboxes.sync(body.state.pos, body.state.yaw, body.state.crouched);
  }

  /** Takes the soldier out of the world for good (enemies, when a fight restarts). */
  function remove() {
    hitboxes.remove();
    body.remove();
  }

  return {
    body,
    arsenal,
    hitboxes,
    rng,
    owner,
    entity: me,
    owns,
    move,
    act,
    teleport,
    remove,
    get state() { return body.state; },
  };
}
