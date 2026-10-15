// A soldier: one player's movement plus the guns they carry.
//
// The order inside a tick matters:
//   soldier.move(cmd, dt)   walk/jump/slide; the gun can slow you (aiming) or stop a sprint (firing)
//   world.step()            the physics engine catches up with everything that moved
//   soldier.act(cmd, dt)    the gun fires from your new eye position; bullets are traced
//
// main.js (and the tests) call these in that order. Later, every player in a
// co-op game will be one of these, driven by their own commands.

import { createPlayer } from './controller.js';
import { createArsenal } from '../weapons/arsenal.js';
import { traceShot } from '../weapons/hitscan.js';
import { createRandom } from '../core/random.js';
import { events as gameEvents } from '../core/events.js';

/**
 * @param {object} opts
 * @param {object} opts.world     Rapier world
 * @param {object} opts.spawn     { pos, yaw }
 * @param {object} opts.registry  surface registry (what each collider is)
 * @param {object} [opts.targets] targets system, to receive damage
 * @param {object} [opts.events]  event bus
 * @param {number} [opts.seed]    random seed for bullet spread
 * @param {number} [opts.owner]   player number (for co-op later)
 */
export function createSoldier({ world, spawn, registry, targets = null, events = gameEvents, seed = 1, owner = 0, loadout, options }) {
  const body = createPlayer({ world, spawn, events });
  const rng = createRandom(seed);
  const arsenal = createArsenal({ loadout, rng, owner, options, emit: (name, data) => events.emit(name, data) });

  function move(cmd, dt) {
    body.update(cmd, dt, arsenal.movementMods(cmd));
  }

  /**
   * Fires the gun (if it should) and traces every bullet.
   * @returns {{look:{yaw:number, pitch:number}, shots:Array}} recoil for the view, and what each shot did
   */
  function act(cmd, dt) {
    const s = body.state;
    const eye = { x: s.pos.x, y: s.pos.y + body.eyeHeight(), z: s.pos.z };
    const { shots, look } = arsenal.update(cmd, dt, { ...s, eye, walkSpeed: body.tuning.walkSpeed });
    if (!shots.length) return { look, shots };

    const def = shots[0].weapon;
    const traced = [];
    const hitTargets = new Map(); // one entry per target per trigger pull (for hit markers and scoring)
    for (const shot of shots) {
      const { hits, end } = traceShot(world, registry, shot, body.collider);
      traced.push({ ...shot, hits, end });
      for (const h of hits) {
        events.emit('bullet:impact', { owner, weapon: def.id, point: h.point, normal: h.normal, surface: h.surface, target: h.target?.id ?? null, exit: h.exit ?? null });
        if (!h.target || !targets) continue;
        const result = targets.damage(h.target, h.damage);
        const prev = hitTargets.get(h.target) ?? { damage: 0, headshot: false, killed: false, zone: h.zone, point: h.point };
        prev.damage += h.damage;
        prev.headshot ||= h.zone === 'head';
        prev.killed ||= result.killed;
        hitTargets.set(h.target, prev);
      }
    }
    events.emit('weapon:fire', {
      owner,
      weapon: def.id,
      origin: eye,
      pulls: shots.length / def.pellets, // trigger pulls this tick (a shotgun blast is one)
      shots: traced.map((t) => ({ end: t.end, tracer: t.tracer })),
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

  return {
    body,
    arsenal,
    rng,
    move,
    act,
    get state() { return body.state; },
  };
}
