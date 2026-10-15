// Hitboxes: the boxes bullets actually hit on a soldier.
//
// A soldier moves with one fat invisible cylinder (player/controller.js). That's
// great for sliding along walls, but terrible for bullets: a shot that should
// whistle past someone's ear would hit the cylinder. So every soldier also
// carries a set of smaller boxes shaped like the body (head, body, arms, legs).
// Bullets only see these (see world/groups.js), and the box decides the damage
// zone, like the targets' zones. Players and enemies use the same rig.
//
// The boxes have no physics of their own. Each tick, sync() moves them to follow
// the soldier's feet, facing and stance, before world.step() files them away
// for the next ray casts (the same rule as the targets).

import { RAPIER, quatY } from '../world/physics.js';
import { HITBOX_GROUPS } from '../world/groups.js';
import { placePoint } from '../world/kit.js';

// Box sizes [width, height, depth] and centres [x, y, z] in the soldier's own
// space: x to the right, y up from the feet, -z forwards. They match the block
// soldier drawn by src/render/soldier-model.js (standing, and crouched with its
// lean forwards), so shooting what you see hits what you see.
export const HITBOX_POSES = {
  stand: [
    { zone: 'head', size: [0.26, 0.28, 0.28], at: [0, 1.6, 0] },
    { zone: 'body', size: [0.48, 0.74, 0.3], at: [0, 1.13, 0] },
    { zone: 'limb', size: [0.13, 0.56, 0.16], at: [-0.31, 1.18, -0.06] },
    { zone: 'limb', size: [0.13, 0.56, 0.16], at: [0.31, 1.18, -0.06] },
    { zone: 'limb', size: [0.18, 0.76, 0.2], at: [-0.12, 0.38, 0] },
    { zone: 'limb', size: [0.18, 0.76, 0.2], at: [0.12, 0.38, 0] },
  ],
  crouch: [
    { zone: 'head', size: [0.26, 0.28, 0.3], at: [0, 1.06, -0.17] },
    { zone: 'body', size: [0.48, 0.62, 0.36], at: [0, 0.66, -0.03] },
    { zone: 'limb', size: [0.13, 0.42, 0.18], at: [-0.31, 0.7, -0.16] },
    { zone: 'limb', size: [0.13, 0.42, 0.18], at: [0.31, 0.7, -0.16] },
    { zone: 'limb', size: [0.18, 0.36, 0.5], at: [-0.12, 0.2, -0.1] },
    { zone: 'limb', size: [0.18, 0.36, 0.5], at: [0.12, 0.2, -0.1] },
  ],
};

/**
 * @param {RAPIER.World} world
 * @param {object} registry  surface registry: each box is filed as { surface: 'flesh', target: entity, zone }
 * @param {object} entity    who the boxes belong to (an enemy, or the player)
 * @param {object} [opts]
 * @param {boolean} [opts.flatZones] every box counts as 'body' (enemies don't get headshot bonuses on you)
 */
export function createHitboxes(world, registry, entity, { flatZones = false } = {}) {
  const boxes = HITBOX_POSES.stand.map((part, i) => {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(part.size[0] / 2, part.size[1] / 2, part.size[2] / 2).setCollisionGroups(HITBOX_GROUPS),
    );
    registry.set(c, { surface: 'flesh', target: entity, zone: flatZones ? 'body' : part.zone });
    return { collider: c, index: i };
  });
  const handles = new Set(boxes.map((b) => b.collider.handle));
  let pose = 'stand';
  let enabled = true;

  /** Follow the soldier: feet position {x,y,z}, facing (yaw) and stance. */
  function sync(feet, yaw, crouched) {
    const next = crouched ? 'crouch' : 'stand';
    const parts = HITBOX_POSES[next];
    if (next !== pose) {
      pose = next;
      for (const b of boxes) {
        const s = parts[b.index].size;
        b.collider.setHalfExtents({ x: s[0] / 2, y: s[1] / 2, z: s[2] / 2 });
      }
    }
    const at = [feet.x, feet.y, feet.z];
    const rot = quatY(yaw);
    for (const b of boxes) {
      const [x, y, z] = placePoint(parts[b.index].at, at, yaw);
      b.collider.setTranslation({ x, y, z });
      b.collider.setRotation(rot);
    }
  }

  return {
    colliders: boxes.map((b) => b.collider),
    /** Is this collider one of mine? (So your own bullets skip your own head.) */
    owns: (collider) => handles.has(collider.handle),
    sync,
    get enabled() { return enabled; },
    /** Switch the boxes off (a downed soldier stops catching bullets) or back on. */
    setEnabled(on) {
      enabled = on;
      for (const b of boxes) b.collider.setEnabled(on);
    },
    /** Take the boxes out of the world for good. */
    remove() {
      for (const b of boxes) {
        registry.delete(b.collider);
        world.removeCollider(b.collider, false);
      }
      handles.clear();
    },
  };
}
