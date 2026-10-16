// The arsenal: the guns you carry, which one is in your hands, aiming down
// the sights, and turning each shot into a direction in the world.
//
// Each tick it:
//   1. handles switching guns (1-4, mouse wheel, Q for your last gun)
//   2. moves "aim" towards hip or sights
//   3. works out the current spread (bigger when moving, jumping, firing a lot)
//   4. lets the gun fire, then picks a direction for every bullet or pellet
//      inside the spread cone, using the seeded random generator
//
// It returns the shots (where they start and which way they go) and how far the
// recoil should move your view. soldier.js traces the shots through the world.

import { WEAPONS, LOADOUT } from './weapons-data.js';
import { createGun } from './gun.js';

const RAD = Math.PI / 180;

/** Forward direction for a yaw and pitch (yaw 0 = north, pitch 0 = level). */
export function lookDirection(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/**
 * A random direction inside a cone of `spreadDeg` degrees around (yaw, pitch).
 * Picking the radius with rng.next() (not its square root) packs more shots
 * near the middle, which feels fairer than a perfectly even spray.
 */
export function spreadDirection(yaw, pitch, spreadDeg, rng) {
  const f = lookDirection(yaw, pitch);
  const r = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };                 // right
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x }; // up = right × forward
  const radius = Math.tan(spreadDeg * RAD * rng.next());
  const angle = rng.next() * Math.PI * 2;
  const a = Math.cos(angle) * radius;
  const b = Math.sin(angle) * radius;
  const d = { x: f.x + r.x * a + u.x * b, y: f.y + r.y * a + u.y * b, z: f.z + r.z * a + u.z * b };
  const len = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / len, y: d.y / len, z: d.z / len };
}

export function createArsenal({ loadout = LOADOUT, rng, emit = () => {}, owner = 0, options = {} }) {
  const guns = loadout.map((id) => createGun(WEAPONS[id], { emit, rng, owner }));
  const state = {
    current: 0,
    previous: guns.length > 1 ? 1 : 0,
    pending: -1,       // gun to bring up once the current one is lowered
    ads: 0,            // 0 = hip, 1 = fully aimed
    sprintBlock: 0,    // seconds until you can fire after sprinting
    spread: 0,         // current spread in degrees (the HUD crosshair uses it)
  };
  const opts = { infiniteAmmo: false, ...options };

  guns[0].raise();

  const gun = () => guns[state.current];

  function switchTo(index) {
    if (index < 0 || index >= guns.length) return;
    if (index === state.current && state.pending < 0) return;
    if (state.pending >= 0) {
      state.pending = index; // already switching: just change where we're going
      return;
    }
    state.pending = index;
    gun().lower();
  }

  /** How the current gun affects movement this tick (call before moving). */
  function movementMods(cmd) {
    const def = gun().def;
    const speedScale = def.moveScale * (1 + (def.ads.move - 1) * state.ads);
    // Firing or aiming stops a sprint.
    const canSprint = !cmd.fire && !cmd.ads && state.ads < 0.3;
    return { speedScale, canSprint };
  }

  /**
   * @param {object} cmd   this tick's command
   * @param {number} dt
   * @param {object} body  the player's movement state, plus `eye` {x,y,z} and `walkSpeed`
   * @returns {{shots: Array, look: {yaw:number, pitch:number}}}
   */
  function update(cmd, dt, body) {
    const look = { yaw: 0, pitch: 0 };

    // 1. Switching.
    if (cmd.slot >= 1) switchTo(cmd.slot - 1);
    else if (cmd.cycle) switchTo((state.current + cmd.cycle + guns.length) % guns.length);
    else if (cmd.lastWeapon) switchTo(state.previous);

    const g = gun();
    if (state.pending >= 0 && g.status === 'stowed') {
      state.previous = state.current;
      state.current = state.pending;
      state.pending = -1;
      gun().raise();
    }
    const def = gun().def;

    // Sprinting lowers the gun; it takes a moment to bring it back up.
    if (body.sprinting) {
      state.sprintBlock = def.sprintOut;
      if (gun().reload && !gun().reloadCommitted()) gun().cancelReload();
    } else {
      state.sprintBlock = Math.max(0, state.sprintBlock - dt);
    }

    // 2. Aiming down the sights.
    const canAim = !body.sprinting && (gun().status === 'ready' || gun().status === 'reloading') && body.mode !== 'mantle';
    const target = cmd.ads && canAim ? 1 : 0;
    const before = state.ads;
    // Move towards the target by at most one step, and stop exactly on it.
    const rate = dt / def.ads.time;
    state.ads += Math.max(-rate, Math.min(rate, target - state.ads));
    if ((before < 0.5) !== (state.ads < 0.5)) emit('weapon:ads', { owner, weapon: def.id, on: state.ads >= 0.5 });

    // 3. Spread: hip or sights, plus movement, air and bloom from firing.
    const sp = def.spread;
    let spread = sp.hip + (sp.ads - sp.hip) * state.ads;
    spread += sp.move * Math.min(body.speed / Math.max(body.walkSpeed, 1), 1.6) * (1 - state.ads * 0.7);
    if (!body.grounded) spread += sp.air;
    if (body.crouched && body.grounded) spread *= sp.crouch;
    spread += gun().bloom * (1 + (sp.adsBloom - 1) * state.ads);
    state.spread = spread;

    // 4. Firing.
    const canFire = state.sprintBlock <= 0 && !body.sprinting && body.mode !== 'mantle';
    const fired = gun().update(
      { fire: cmd.fire, firePressed: cmd.firePressed, reload: cmd.reload, canFire, ads: state.ads },
      dt, look, opts,
    );

    const shots = [];
    for (let s = 0; s < fired; s++) {
      const index = gun().totalShots - fired + s;
      const tracer = def.tracerEvery > 0 && index % def.tracerEvery === 0;
      for (let p = 0; p < def.pellets; p++) {
        shots.push({
          weapon: def,
          origin: { ...body.eye },
          dir: spreadDirection(cmd.yaw, cmd.pitch, spread, rng),
          tracer: tracer || (def.pellets > 1 && p < 3),
          pellet: p,
        });
      }
    }
    return { shots, look };
  }

  /** What you're carrying: [magazine, spare] for each gun. */
  const ammo = () => guns.map((g) => [g.mag, g.reserve]);

  /**
   * Set what you're carrying (a checkpoint puts back what you had). A reload in
   * progress is called off; nothing else changes (a gun being raised stays
   * being raised), so movement and aiming carry on exactly as before.
   */
  function load(counts) {
    guns.forEach((g, i) => {
      if (!counts?.[i]) return;
      if (g.reload) g.cancelReload();
      [g.mag, g.reserve] = counts[i];
    });
  }

  /**
   * An ammo crate: every gun's spare ammo back to full. "Full" rather than "add
   * some", so doing it twice changes nothing: in co-op the host's copy of your
   * guns and your own browser both do it, a moment apart, and end up the same.
   */
  function resupply() {
    for (const g of guns) g.reserve = Math.max(g.reserve, g.def.reserve);
  }

  /** A full load: what you start a mission with. */
  const fresh = () => guns.map((g) => [g.def.mag, g.def.reserve]);

  /** True if a crate would give you nothing. */
  const full = () => guns.every((g) => g.reserve >= g.def.reserve);

  return {
    guns,
    state,
    options: opts,
    get current() { return gun(); },
    switchTo,
    movementMods,
    update,
    ammo,
    fresh,
    load,
    resupply,
    full,
  };
}
