// Hitscan: bullets as instant invisible lines.
//
// Real bullets fly so fast (900 m/s) that, inside a game map, "instant" is a
// good enough answer. So instead of moving a bullet object frame by frame, we
// cast a ray: an invisible line from your eyes in the bullet's direction, and
// ask the physics engine what it touches first. That's "hitscan". (Things you
// can see flying, like grenades and rockets, are "projectiles" instead.)
//
// Penetration: if the first thing hit is thin enough wood, we measure how thick
// it is (a second ray from inside, looking for the far side) and carry on with
// less damage. Concrete and steel stop bullets dead.

import { RAPIER } from '../world/physics.js';
import { SURFACES } from '../world/surfaces.js';
import { damageAt } from './weapons-data.js';

const MAX_SURFACES = 4;

const along = (p, d, t) => ({ x: p.x + d.x * t, y: p.y + d.y * t, z: p.z + d.z * t });

/**
 * Traces one bullet (or pellet) through the world.
 * @param {RAPIER.World} world
 * @param {ReturnType<import('../world/surfaces.js').createSurfaceRegistry>} registry
 * @param {{weapon:object, origin:{x,y,z}, dir:{x,y,z}}} shot
 * @param {RAPIER.Collider} [exclude] the shooter's own body, which bullets must ignore
 * @returns {{hits: Array, end: {x,y,z}}} everything hit, in order, and where the bullet stopped
 */
export function traceShot(world, registry, shot, exclude) {
  const def = shot.weapon;
  const dir = shot.dir;
  let origin = { ...shot.origin };
  let travelled = 0;
  let penetration = def.penetration;
  let damageScale = 1;
  const hits = [];
  let end = along(origin, dir, def.range);

  for (let i = 0; i < MAX_SURFACES; i++) {
    const remaining = def.range - travelled;
    if (remaining <= 0) break;
    const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, dir), remaining, true, undefined, undefined, exclude);
    if (!hit) {
      end = along(origin, dir, remaining);
      break;
    }
    const point = along(origin, dir, hit.timeOfImpact);
    travelled += hit.timeOfImpact;
    end = point;

    const info = registry.get(hit.collider);
    const surface = SURFACES[info.surface] ?? SURFACES.concrete;
    const record = {
      point,
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: travelled,
      surface: info.surface,
    };
    if (info.target) {
      record.target = info.target;
      record.zone = info.zone;
      record.damage = damageAt(def, travelled) * (def.zones[info.zone] ?? 1) * damageScale;
    }
    hits.push(record);

    if (!(surface.resistance < Infinity)) break;

    // How thick is it? Start a hair inside and look for where the ray comes out
    // of this same collider. (solid = false means "from inside, find the exit".)
    const inside = along(point, dir, 0.001);
    const exit = world.castRay(
      new RAPIER.Ray(inside, dir), 3, false, undefined, undefined, undefined, undefined,
      (c) => c.handle === hit.collider.handle,
    );
    if (!exit) break;
    const thickness = exit.timeOfImpact + 0.001;
    const cost = thickness * surface.resistance;
    if (cost > penetration) break;
    penetration -= cost;
    damageScale *= 1 - 0.5 * (cost / def.penetration);
    origin = along(inside, dir, exit.timeOfImpact + 0.002);
    travelled += thickness;
    record.penetrated = true;
    record.exit = { ...origin };
  }

  return { hits, end };
}
