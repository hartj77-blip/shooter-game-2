// The first-person camera rig: decides where your eyes are and how the view moves.
//
// Everything here is *presentation*: head bob, the dip when you land, the
// field of view widening as you sprint, the tilt in a slide. None of it changes
// where you actually are in the world (that's player/controller.js), which is
// why it's safe to turn it all off with "Reduce camera motion" in settings.
//
// It runs once per drawn frame, not per tick, and blends between the last two
// ticks using `alpha` from the game loop, so motion is smooth on any monitor.

import * as THREE from 'three';
import { events as gameEvents } from '../core/events.js';
import { WEAPONS } from '../weapons/weapons-data.js';

export const DEFAULT_CAMERA_TUNING = {
  bobAmount: 0.045,     // metres of head bob at walking speed
  bobStride: 1.7,       // metres per full stride (two steps)
  strafeTilt: 0.8,      // degrees the view leans when you strafe
  slideTilt: 4,         // degrees the view leans in a slide
  landDip: 1.0,         // how hard landings push the view down (0 = off)
  sprintFovKick: 7,     // percent wider view while sprinting
  slideFovKick: 11,     // percent wider view while sliding
  crouchSmoothing: 14,  // how quickly your eyes move when crouching (higher = faster)
  shotPunch: 1.0,       // how much each shot jolts the view (0 = off)
  shake: 1.0,           // camera shake from big shots (0 = off)
  thirdPerson: false,   // debug: watch your own capsule from behind
};

const DEG = Math.PI / 180;
const ASPECT_16_9 = 16 / 9;

/**
 * Frame-rate independent smoothing: moves `current` towards `target`, covering
 * the same fraction per second whether you run at 30 or 240 frames per second.
 */
export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Converts a horizontal field of view (measured on a 16:9 screen) to the vertical one three.js wants. */
export function verticalFov(horizontalDeg) {
  return (2 * Math.atan(Math.tan((horizontalDeg * DEG) / 2) / ASPECT_16_9)) / DEG;
}

/**
 * @param {object} opts
 * @param {() => {amount:number, zoom:number}} [opts.aim] how far you're aiming down the sights, and the gun's zoom
 */
export function createCameraRig({ camera, player, input, settings, aim = () => ({ amount: 0, zoom: 1 }), tuning = { ...DEFAULT_CAMERA_TUNING }, events = gameEvents }) {
  const rig = {
    tuning,
    eyeY: player.eyeHeight(),
    bobPhase: 0,
    bobWeight: 0,
    dip: 0,
    dipVel: 0,
    roll: 0,
    fovScale: 1,
    punch: 0,       // visual-only upward jolt from the last shot (radians)
    punchVel: 0,
    trauma: 0,      // 0..1, how shaken the camera is; fades over time
    time: 0,
    update,
    snap,
  };

  // Each shot jolts the view up a touch (on top of the real recoil, which moves
  // your aim) and adds "trauma". Shake is trauma squared: small shots barely
  // wobble, a shotgun blast really shakes.
  events.on('weapon:fire', (e) => {
    if ((e.owner ?? 0) !== 0) return;
    const kick = WEAPONS[e.weapon]?.kick;
    if (!kick) return;
    const k = 1 - aim().amount * 0.5;
    rig.punchVel += kick.rot * DEG * 9 * k * tuning.shotPunch;
    rig.trauma = Math.min(1, rig.trauma + kick.shake * k);
  });

  const mine = (e) => (e.owner ?? 0) === 0; // only your own body moves your camera
  events.on('player:land', (e) => {
    const { speed } = e;
    if (!mine(e) || speed < 2.5) return;
    rig.dipVel -= Math.min(speed, 22) * 0.035 * tuning.landDip;
  });
  events.on('player:mantle', (e) => {
    if (!mine(e)) return;
    rig.dipVel -= 0.25 * tuning.landDip;
  });
  events.on('player:crouch-air', (e) => {
    if (!mine(e)) return;
    rig.eyeY -= e.feetShift; // your feet moved but your head didn't: keep the eyes where they were
  });

  const feet = new THREE.Vector3();
  const back = new THREE.Vector3();

  /** Skip smoothing, e.g. after a teleport. */
  function snap() {
    rig.eyeY = player.eyeHeight();
    rig.dip = rig.dipVel = rig.roll = 0;
  }

  /**
   * @param {number} alpha  0..1, how far we are between the previous tick and the latest one
   * @param {number} dt     seconds since the last drawn frame
   */
  function update(alpha, dt) {
    const s = player.state;
    const p = player.prev;
    const t = tuning;
    const motion = settings.reduceMotion ? 0 : 1;

    // Blend between the last two ticks so motion looks smooth between updates.
    feet.set(
      p.x + (s.pos.x - p.x) * alpha,
      p.y + (s.pos.y - p.y) * alpha,
      p.z + (s.pos.z - p.z) * alpha,
    );

    // Eye height eases towards crouching or standing instead of snapping.
    rig.eyeY = damp(rig.eyeY, player.eyeHeight(), t.crouchSmoothing, dt);

    // Head bob: one dip per footstep, one side-to-side sway per stride.
    const walking = s.mode === 'ground' && s.speed > 0.5;
    const walkSpeed = player.tuning.walkSpeed;
    rig.bobWeight = damp(rig.bobWeight, walking ? Math.min(s.speed / walkSpeed, 1.6) : 0, 10, dt);
    if (walking) rig.bobPhase += ((s.speed * dt) / t.bobStride) * Math.PI * 2;
    const aiming = aim();
    const bob = t.bobAmount * rig.bobWeight * motion * (1 - aiming.amount * 0.75);
    const bobY = -Math.abs(Math.sin(rig.bobPhase)) * bob + bob * 0.5;
    const bobX = Math.sin(rig.bobPhase * 0.5) * bob * 0.6;

    // Landing dip: a spring that gets kicked down and bounces back.
    // Springs are updated in small steps: one big step on a slow frame would
    // overshoot further each time and explode.
    const steps = Math.ceil(dt * 240);
    const h = dt / Math.max(steps, 1);
    for (let i = 0; i < steps; i++) {
      rig.dipVel += (-140 * rig.dip - 17 * rig.dipVel) * h;
      rig.dip += rig.dipVel * h;
      rig.punchVel += (-420 * rig.punch - 38 * rig.punchVel) * h;
      rig.punch += rig.punchVel * h;
    }
    rig.dip = Math.max(-0.5, Math.min(0.2, rig.dip));

    // Lean: a touch when strafing, more in a slide.
    const right = Math.cos(s.yaw) * s.vel.x - Math.sin(s.yaw) * s.vel.z;
    let rollTarget = -(right / walkSpeed) * t.strafeTilt * DEG;
    if (s.mode === 'slide') rollTarget += t.slideTilt * DEG;
    rig.roll = damp(rig.roll, rollTarget * motion, 8, dt);

    // Mantling: the view dips forward a little as you haul yourself up.
    let pitchOffset = 0;
    if (s.mantle) pitchOffset = -Math.sin(Math.PI * s.mantle.t) * 5 * DEG * motion;

    // Field of view widens with speed, which sells the sense of going fast.
    // Aiming down the sights zooms in by the gun's zoom factor.
    let fovTarget = 1;
    if (s.sprinting) fovTarget += (t.sprintFovKick / 100) * motion;
    if (s.mode === 'slide') fovTarget += (t.slideFovKick / 100) * motion;
    rig.fovScale = damp(rig.fovScale, fovTarget, 6, dt);
    const zoom = 1 + (aiming.zoom - 1) * aiming.amount;
    const vfov = verticalFov(Math.min((settings.fov * rig.fovScale) / zoom, 150));
    if (Math.abs(camera.fov - vfov) > 0.01) {
      camera.fov = vfov;
      camera.updateProjectionMatrix();
    }

    // Shot punch (a stiff spring) and shake (trauma squared times smooth wobble).
    rig.time += dt;
    rig.trauma = Math.max(0, rig.trauma - 1.6 * dt);
    const shake = rig.trauma * rig.trauma * 1.5 * DEG * motion * t.shake;
    const wobble = (f, o) => Math.sin(rig.time * f + o) * 0.6 + Math.sin(rig.time * f * 2.3 + o * 1.7) * 0.4;
    const shakePitch = shake * wobble(31, 0);
    const shakeYaw = shake * wobble(27, 2);
    const shakeRoll = shake * wobble(23, 4);

    // Look direction comes straight from the mouse (input.yaw/pitch), not from
    // the last tick, so aiming responds the instant you move the mouse.
    const yaw = input.yaw;
    const pitch = input.pitch;
    camera.rotation.set(pitch + pitchOffset + rig.punch * motion + shakePitch, yaw + shakeYaw, rig.roll + shakeRoll, 'YXZ');
    camera.position.set(
      feet.x + Math.cos(yaw) * bobX,
      feet.y + rig.eyeY + bobY + rig.dip * motion,
      feet.z - Math.sin(yaw) * bobX,
    );

    if (t.thirdPerson) {
      // Debug view: pull the camera back behind your head.
      back.set(0, 0, 1).applyEuler(camera.rotation).multiplyScalar(4);
      camera.position.add(back);
      camera.position.y += 0.6;
    }
  }

  return rig;
}
