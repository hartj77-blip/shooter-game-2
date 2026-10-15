// Physics: a thin wrapper around Rapier, our physics engine.
//
// A physics engine is the part of a game that makes things solid. It knows the
// invisible shape of everything (a box for a crate, a capsule for the player)
// and answers questions like "if I move this capsule 10 cm forward, what does
// it hit?" or "if I fire a ray from here, what's the first thing it touches?".
// Those invisible shapes are called colliders. They're usually much simpler
// than what you see: a detailed crate model is just a box to the physics engine.
//
// Rapier is written in Rust and compiled to WebAssembly, so it runs fast in the
// browser. It has to load before anything can use it, which is what initPhysics() does.

import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

let ready = null;

/** Loads Rapier's WebAssembly. Safe to call more than once. */
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

/** A new, empty physics world. Real gravity for loose objects; the player uses its own (see player/controller.js). */
export function createPhysicsWorld() {
  return new RAPIER.World({ x: 0, y: -9.81, z: 0 });
}

/** A rotation of `angle` radians around the vertical axis, in the form Rapier wants (a quaternion). */
export function quatY(angle) {
  const h = angle / 2;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

export const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
