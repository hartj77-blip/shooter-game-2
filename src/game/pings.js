// Pings: pointing at something so your whole squad sees it.
//
// Press Z (or click the mouse wheel) and a line goes out from your eyes along
// your aim. If it meets an enemy, they get a red marker that follows them for
// a few seconds; if it meets the ground or a wall, that spot gets a yellow
// "go here" marker. Everyone's HUD shows it (ui/hud.js), with the distance.
//
// The host works out what you pointed at (game/sim.js) and posts a
// 'ping:mark' event, which reaches every player.
//
// Simulation only: runs in Node.

import { RAPIER } from '../world/physics.js';
import { BULLET } from '../world/groups.js';

export const PING = {
  range: 150,   // metres
  life: 4,      // seconds a marker stays up
};

const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });

/**
 * What does a look from `eye` along yaw/pitch land on?
 * @param {Function} skip  (collider) => true for colliders to see through (your own body)
 * @returns {{kind:'enemy'|'place', id:string|null, point:{x,y,z}}|null}
 */
export function pingFrom(world, registry, eye, yaw, pitch, skip) {
  const c = Math.cos(pitch);
  ray.origin = eye;
  ray.dir = { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
  // Bullet rules: walls and soldiers' hitboxes, not the fat movement cylinders.
  // Teammates are seen through: you're pointing past them.
  const hit = world.castRay(ray, PING.range, true, undefined, BULLET, undefined, undefined, (col) => {
    if (skip(col)) return false;
    return registry.get(col).target?.kind !== 'player';
  });
  if (!hit) return null;
  const t = hit.timeOfImpact;
  const point = { x: eye.x + ray.dir.x * t, y: eye.y + ray.dir.y * t, z: eye.z + ray.dir.z * t };
  const target = registry.get(hit.collider).target;
  if (target?.kind === 'enemy' && !target.dead) return { kind: 'enemy', id: target.id, point };
  return { kind: 'place', id: null, point };
}
