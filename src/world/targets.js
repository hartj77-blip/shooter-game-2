// Targets: things to shoot at the range and in the kill house.
//
// Kinds:
//   paper    a person-shaped target. Falls over when its health runs out, pops back up later.
//   popup    the same, but starts lying down until the kill house course raises it.
//   hostage  a popup you must NOT shoot (it says so on it).
//   mover    a paper target sliding back and forth on a rail.
//   steel    a steel plate. It can't be knocked down; it just rings when hit.
//
// Each person target has three invisible colliders, its "hit zones": head,
// body and legs. When a bullet's ray hits one, the zone decides the damage
// (headshots count double). Each target is a small state machine:
//
//   up --(health gone)--> falling --> down --(reset)--> rising --> up
//
// Simulation only: targets-view.js draws them by reading this state.

import { RAPIER } from './physics.js';

const UP = 0;
const DOWN = -Math.PI / 2; // lying flat on its back
const FALL_TIME = 0.28;
const RISE_TIME = 0.35;

// Hit zones of a person target, in its own space: x across, y up (from the
// hinge at the bottom), z towards the shooter. [width, height] and centre height.
export const PERSON_ZONES = [
  { zone: 'limb', size: [0.42, 0.8], y: 0.47 },
  { zone: 'body', size: [0.5, 0.62], y: 1.18 },
  { zone: 'head', size: [0.22, 0.24], y: 1.63 },
];
export const PLATE = { size: [0.32, 0.32], y: 1.25 };
const THICK = 0.04;

const DEFAULTS = {
  paper: { health: 100, startsUp: true, resetAfter: 3 },
  mover: { health: 100, startsUp: true, resetAfter: 3 },
  popup: { health: 50, startsUp: false, resetAfter: null },
  hostage: { health: 50, startsUp: false, resetAfter: null },
  steel: { health: Infinity, startsUp: true, resetAfter: null },
};

function quat(rotY, tilt) {
  // A turn of rotY around the vertical, then a tilt of `tilt` around the target's own left-right axis.
  const cy = Math.cos(rotY / 2), sy = Math.sin(rotY / 2);
  const cx = Math.cos(tilt / 2), sx = Math.sin(tilt / 2);
  return { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx };
}

/** Where a point in the target's own space ends up in the world. */
export function targetPoint(t, [lx, ly, lz]) {
  // Tilt around local X, then turn around Y, then move to the target's position.
  const ca = Math.cos(t.tilt), sa = Math.sin(t.tilt);
  const y1 = ly * ca - lz * sa;
  const z1 = ly * sa + lz * ca;
  const c = Math.cos(t.rotY), s = Math.sin(t.rotY);
  return { x: t.pos.x + lx * c + z1 * s, y: t.pos.y + y1, z: t.pos.z - lx * s + z1 * c };
}

/**
 * @param {RAPIER.World} world
 * @param {object} registry  surface registry (src/world/surfaces.js)
 * @param {Array} specs      target pieces from the level
 */
export function createTargets(world, registry, specs) {
  const list = specs.map((spec, i) => {
    const d = DEFAULTS[spec.kind] ?? DEFAULTS.paper;
    const t = {
      id: spec.id ?? `t${i}`,
      kind: spec.kind,
      group: spec.group ?? null,
      hostage: spec.kind === 'hostage',
      maxHealth: spec.health ?? d.health,
      health: spec.health ?? d.health,
      resetAfter: spec.resetAfter ?? d.resetAfter,
      state: d.startsUp ? 'up' : 'down',
      tilt: d.startsUp ? UP : DOWN,
      timer: 0,
      rotY: spec.rotY ?? 0,
      home: { x: spec.at[0], y: spec.at[1], z: spec.at[2] },
      pos: { x: spec.at[0], y: spec.at[1], z: spec.at[2] },
      rail: spec.to ? { to: { x: spec.to[0], y: spec.to[1], z: spec.to[2] }, speed: spec.speed ?? 2, t: 0, dir: 1 } : null,
      colliders: [],
      hitCount: 0,
      lastHit: -1, // time since the last hit, for the steel plate swing and hit flashes
    };
    const zones = t.kind === 'steel' ? [{ zone: 'body', size: PLATE.size, y: PLATE.y }] : PERSON_ZONES;
    for (const z of zones) {
      const c = world.createCollider(RAPIER.ColliderDesc.cuboid(z.size[0] / 2, z.size[1] / 2, THICK / 2));
      c.local = [0, z.y, 0];
      registry.set(c, { surface: t.kind === 'steel' ? 'steel' : 'target', target: t, zone: z.zone });
      t.colliders.push(c);
    }
    place(t);
    return t;
  });

  function place(t) {
    const rot = quat(t.rotY, t.tilt);
    const solid = t.state === 'up' || t.kind === 'steel';
    for (const c of t.colliders) {
      c.setTranslation(targetPoint(t, c.local));
      c.setRotation(rot);
      c.setEnabled(solid);
    }
  }

  /** Advances every target by one tick. Call before world.step() so moved colliders get filed. */
  function update(dt) {
    for (const t of list) {
      t.lastHit += dt;
      let moved = false;
      if (t.state === 'falling') {
        t.tilt = Math.max(DOWN, t.tilt + (DOWN / FALL_TIME) * dt);
        if (t.tilt <= DOWN) { t.state = 'down'; t.timer = 0; }
        moved = true;
      } else if (t.state === 'rising') {
        t.tilt = Math.min(UP, t.tilt - (DOWN / RISE_TIME) * dt);
        if (t.tilt >= UP) t.state = 'up';
        moved = true;
      } else if (t.state === 'down' && t.resetAfter != null) {
        t.timer += dt;
        if (t.timer >= t.resetAfter) raise(t);
      }
      if (t.rail && t.state !== 'down') {
        // Ping-pong between home and the end of the rail.
        const r = t.rail;
        const length = Math.hypot(r.to.x - t.home.x, r.to.z - t.home.z);
        r.t += (r.dir * r.speed * dt) / length;
        if (r.t >= 1) { r.t = 1; r.dir = -1; }
        if (r.t <= 0) { r.t = 0; r.dir = 1; }
        t.pos.x = t.home.x + (r.to.x - t.home.x) * r.t;
        t.pos.z = t.home.z + (r.to.z - t.home.z) * r.t;
        moved = true;
      }
      if (moved) place(t);
    }
  }

  /**
   * A bullet hit target `t`.
   * @returns {{killed:boolean}} killed = this hit knocked it down
   */
  function damage(t, amount) {
    t.hitCount++;
    t.lastHit = 0;
    if (t.kind === 'steel' || t.state !== 'up') return { killed: false };
    t.health -= amount;
    if (t.health > 0) return { killed: false };
    t.health = 0;
    t.state = 'falling';
    place(t); // stop it catching more bullets while it falls
    return { killed: true };
  }

  function raise(t) {
    if (t.kind === 'steel') return;
    t.health = t.maxHealth;
    t.state = t.tilt >= UP ? 'up' : 'rising';
    t.timer = 0;
    place(t);
  }

  function lower(t, instant = false) {
    if (t.kind === 'steel') return;
    t.state = instant ? 'down' : 'falling';
    if (instant) t.tilt = DOWN;
    t.timer = 0;
    place(t);
  }

  const inGroup = (group) => list.filter((t) => t.group === group);

  return {
    list,
    update,
    damage,
    /** Move a target's colliders to match its state (a co-op client sets the state from snapshots). */
    sync: place,
    raise,
    lower,
    inGroup,
    raiseGroup: (group) => inGroup(group).forEach(raise),
    lowerGroup: (group, instant) => inGroup(group).forEach((t) => lower(t, instant)),
  };
}
