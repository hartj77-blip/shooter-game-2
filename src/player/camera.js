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

export const DEFAULT_CAMERA_TUNING = {
  bobAmount: 0.045,     // metres of head bob at walking speed
  bobStride: 1.7,       // metres per full stride (two steps)
  strafeTilt: 0.8,      // degrees the view leans when you strafe
  slideTilt: 4,         // degrees the view leans in a slide
  landDip: 1.0,         // how hard landings push the view down (0 = off)
  sprintFovKick: 7,     // percent wider view while sprinting
  slideFovKick: 11,     // percent wider view while sliding
  crouchSmoothing: 14,  // how quickly your eyes move when crouching (higher = faster)
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

export function createCameraRig({ camera, player, input, settings, tuning = { ...DEFAULT_CAMERA_TUNING }, events = gameEvents }) {
  const rig = {
    tuning,
    eyeY: player.eyeHeight(),
    bobPhase: 0,
    bobWeight: 0,
    dip: 0,
    dipVel: 0,
    roll: 0,
    fovScale: 1,
    update,
    snap,
  };

  events.on('player:land', ({ speed }) => {
    if (speed < 2.5) return;
    rig.dipVel -= Math.min(speed, 22) * 0.035 * tuning.landDip;
  });
  events.on('player:mantle', () => {
    rig.dipVel -= 0.25 * tuning.landDip;
  });
  events.on('player:crouch-air', ({ feetShift }) => {
    rig.eyeY -= feetShift; // your feet moved but your head didn't: keep the eyes where they were
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
    const bob = t.bobAmount * rig.bobWeight * motion;
    const bobY = -Math.abs(Math.sin(rig.bobPhase)) * bob + bob * 0.5;
    const bobX = Math.sin(rig.bobPhase * 0.5) * bob * 0.6;

    // Landing dip: a spring that gets kicked down and bounces back.
    const k = 140;
    const c = 17;
    rig.dipVel += (-k * rig.dip - c * rig.dipVel) * dt;
    rig.dip += rig.dipVel * dt;
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
    let fovTarget = 1;
    if (s.sprinting) fovTarget += (t.sprintFovKick / 100) * motion;
    if (s.mode === 'slide') fovTarget += (t.slideFovKick / 100) * motion;
    rig.fovScale = damp(rig.fovScale, fovTarget, 6, dt);
    const vfov = verticalFov(Math.min(settings.fov * rig.fovScale, 150));
    if (Math.abs(camera.fov - vfov) > 0.01) {
      camera.fov = vfov;
      camera.updateProjectionMatrix();
    }

    // Look direction comes straight from the mouse (input.yaw/pitch), not from
    // the last tick, so aiming responds the instant you move the mouse.
    const yaw = input.yaw;
    const pitch = input.pitch;
    camera.rotation.set(pitch + pitchOffset, yaw, rig.roll, 'YXZ');
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
