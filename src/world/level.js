// Level: builds the physics side of a map from its definition in levels/.
//
// The drawing side lives in render/level-view.js. Keeping them apart means
// the physics can run without a screen, which is how the unit tests in
// tests/unit/ drive the player around a real level in Node.

import { RAPIER, quatY } from './physics.js';
import { expandLevel, wedgePoints } from './kit.js';
import { MATERIAL_SURFACE } from './surfaces.js';

/**
 * Adds a collider to the physics world for every solid in the level.
 * @param {object} [registry] if given, remembers what each collider is made of (for bullets)
 * @returns {{ spawn: {pos:number[], yaw:number}, expanded: ReturnType<typeof expandLevel> }}
 */
export function buildLevel(def, world, registry) {
  const expanded = expandLevel(def);
  for (const solid of expanded.solids) {
    const collider = world.createCollider(colliderFor(solid));
    registry?.set(collider, { surface: surfaceOf(solid.mat) });
  }
  // Rapier files new colliders into its search index during a step. Do one now,
  // so ray casts can find the level straight away.
  world.step();
  return { name: def.name, spawn: def.spawn, nav: def.nav ?? null, expanded };
}

/** What a level material is made of, for bullets. (Every colour of container is steel.) */
export function surfaceOf(mat) {
  if (MATERIAL_SURFACE[mat]) return MATERIAL_SURFACE[mat];
  if (mat?.startsWith('container')) return 'metal';
  return 'concrete';
}

function colliderFor(solid) {
  const [x, y, z] = solid.center;
  let desc;
  if (solid.kind === 'box') {
    const [w, h, d] = solid.size;
    desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2);
  } else if (solid.kind === 'wedge') {
    // A ramp is a "convex hull": the tightest shape that wraps its six corners.
    const pts = Object.values(wedgePoints(solid.width, solid.length, solid.height)).flat();
    desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
  } else {
    throw new Error(`Unknown solid kind "${solid.kind}"`);
  }
  return desc.setTranslation(x, y, z).setRotation(quatY(solid.rotY)).setFriction(0);
}
