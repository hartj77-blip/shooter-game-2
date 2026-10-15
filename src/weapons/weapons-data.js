// The weapon table. Every gun is a row of numbers here, so adding a gun or
// making one kick harder means editing data, not code. (The tuning panel's
// Weapons section edits these live.)
//
// Units: metres, seconds, degrees (for spread and recoil, converted where used).
//
// How the main numbers work (see docs/lessons/05-how-shooting-works.md):
//   rpm        rounds per minute. 600 rpm = 10 shots a second.
//   damage     falls from `near` to `far` between `nearRange` and `farRange` metres.
//   spread     how far from the centre of the crosshair a bullet can go, in degrees.
//              `hip` when firing from the hip, `ads` when aiming down the sights.
//              Each shot adds `perShot` (up to `max` extra) and that "bloom"
//              shrinks back at `recovery` degrees per second.
//   recoil     how far each shot kicks your view up (`pitch`) and sideways
//              (`pattern`, a repeating list, plus a little `yawRandom`).
//              `recover` is the share of the kick that drifts back by itself.
//   penetration how many metres of wood a bullet can punch through.

export const ZONES = { head: 2.0, body: 1.0, limb: 0.75 };

// Colours for the block-built models (stylized military).
export const GUN_COLORS = {
  body: '#5b6052',
  dark: '#383b33',
  olive: '#7a8a5a',
  tan: '#b89c6c',
  metal: '#8c8f88',
  accent: '#e8b14a',
};

export const WEAPONS = {
  carbine: {
    id: 'carbine',
    name: 'K4 Carbine',
    slot: 1,
    fireMode: 'auto',
    rpm: 750,
    pellets: 1,
    damage: { near: 30, far: 22, nearRange: 25, farRange: 60 },
    zones: ZONES,
    range: 250,
    penetration: 0.6,
    spread: { hip: 2.6, ads: 0.12, perShot: 0.45, max: 3.0, recovery: 10, move: 1.8, air: 3.5, crouch: 0.85, adsBloom: 0.35 },
    recoil: {
      pitch: 0.42,
      pattern: [0.05, 0.12, -0.06, 0.15, 0.1, -0.12, 0.18, -0.04, 0.08, -0.15],
      yawRandom: 0.08,
      adsScale: 0.75,
      recover: 0.6,
      recoverSpeed: 7,
    },
    mag: 30,
    reserve: 120,
    reload: {
      tactical: 1.9,
      empty: 2.35,
      commit: 0.75, // past this share of the reload, sprinting no longer cancels it
      cues: { tactical: [[0.02, 'reload_rifle']], empty: [[0.02, 'reload_rifle'], [1.9, 'charge']] },
    },
    ads: { time: 0.2, zoom: 1.35, move: 0.62, distance: 0.3 },
    swap: { raise: 0.42, lower: 0.25 },
    sprintOut: 0.18,
    moveScale: 0.97,
    tracerEvery: 2,
    sounds: { fire: 'rifle' },
    kick: { back: 0.035, up: 0.01, rot: 2.2, shake: 0.12 },
    model: {
      hip: [0.15, -0.19, -0.44],
      sight: [0, 0.147, -0.08],
      muzzle: [0, 0.04, -0.74],
      eject: [0.04, 0.065, -0.08],
      support: [0, 0.0, -0.38],
      reticle: 'dot',
      parts: [
        { box: [0.07, 0.09, 0.3], at: [0, 0.035, -0.1], color: 'body' },
        { box: [0.05, 0.02, 0.3], at: [0, 0.09, -0.1], color: 'dark' },
        { box: [0.075, 0.075, 0.28], at: [0, 0.035, -0.39], color: 'olive' },
        { cyl: [0.012, 0.16], at: [0, 0.04, -0.6], color: 'metal' },
        { cyl: [0.02, 0.06], at: [0, 0.04, -0.71], color: 'dark' },
        { box: [0.06, 0.1, 0.22], at: [0, 0.01, 0.15], color: 'olive' },
        { box: [0.065, 0.12, 0.03], at: [0, 0.0, 0.27], color: 'dark' },
        { box: [0.04, 0.1, 0.05], at: [0, -0.055, 0.01], rot: [-0.25, 0, 0], color: 'dark' },
        { box: [0.035, 0.13, 0.07], at: [0, -0.075, -0.13], rot: [0.15, 0, 0], color: 'dark', name: 'mag' },
        { box: [0.032, 0.022, 0.05], at: [0, 0.11, -0.08], color: 'dark' },
        { box: [0.04, 0.04, 0.05], at: [0, 0.145, -0.08], color: 'body', hollow: true },
        { box: [0.012, 0.012, 0.03], at: [0.04, 0.07, -0.02], color: 'accent' },
      ],
    },
  },

  smg: {
    id: 'smg',
    name: 'Vanta SMG',
    slot: 2,
    fireMode: 'auto',
    rpm: 900,
    pellets: 1,
    damage: { near: 24, far: 15, nearRange: 12, farRange: 30 },
    zones: ZONES,
    range: 120,
    penetration: 0.35,
    spread: { hip: 3.2, ads: 0.35, perShot: 0.35, max: 2.6, recovery: 12, move: 1.2, air: 3.0, crouch: 0.85, adsBloom: 0.45 },
    recoil: {
      pitch: 0.3,
      pattern: [0.08, -0.1, 0.12, -0.06, 0.1, -0.12, 0.05, 0.1],
      yawRandom: 0.14,
      adsScale: 0.8,
      recover: 0.7,
      recoverSpeed: 8,
    },
    mag: 32,
    reserve: 160,
    reload: {
      tactical: 1.6,
      empty: 2.0,
      commit: 0.75,
      cues: { tactical: [[0.02, 'reload_smg']], empty: [[0.02, 'reload_smg'], [1.6, 'charge']] },
    },
    ads: { time: 0.15, zoom: 1.25, move: 0.7, distance: 0.27 },
    swap: { raise: 0.35, lower: 0.2 },
    sprintOut: 0.12,
    moveScale: 1.0,
    tracerEvery: 3,
    sounds: { fire: 'smg' },
    kick: { back: 0.025, up: 0.008, rot: 1.6, shake: 0.08 },
    model: {
      hip: [0.15, -0.18, -0.4],
      sight: [0, 0.103, -0.02],
      muzzle: [0, 0.04, -0.46],
      eject: [0.04, 0.06, -0.1],
      support: [0, -0.06, -0.32],
      reticle: 'irons',
      parts: [
        { box: [0.065, 0.1, 0.3], at: [0, 0.03, -0.12], color: 'body' },
        { box: [0.06, 0.06, 0.14], at: [0, 0.04, -0.33], color: 'olive' },
        { cyl: [0.011, 0.06], at: [0, 0.04, -0.42], color: 'metal' },
        { box: [0.02, 0.02, 0.2], at: [0, 0.05, 0.12], color: 'dark' },
        { box: [0.02, 0.02, 0.2], at: [0, -0.01, 0.12], color: 'dark' },
        { box: [0.05, 0.08, 0.02], at: [0, 0.02, 0.22], color: 'dark' },
        { box: [0.04, 0.1, 0.05], at: [0, -0.06, 0.0], rot: [-0.2, 0, 0], color: 'dark' },
        { box: [0.03, 0.17, 0.05], at: [0, -0.095, -0.16], color: 'dark', name: 'mag' },
        { box: [0.035, 0.08, 0.035], at: [0, -0.04, -0.32], color: 'olive' },
        { box: [0.03, 0.025, 0.015], at: [0, 0.092, -0.02], color: 'dark', notch: true },
        { box: [0.008, 0.03, 0.008], at: [0, 0.088, -0.38], color: 'accent' },
      ],
    },
  },

  shotgun: {
    id: 'shotgun',
    name: 'Breacher 12',
    slot: 3,
    fireMode: 'pump',
    rpm: 70,
    pellets: 8,
    damage: { near: 14, far: 4, nearRange: 6, farRange: 20 },
    zones: { head: 1.5, body: 1.0, limb: 0.75 },
    range: 60,
    penetration: 0.15,
    spread: { hip: 5.5, ads: 4.0, perShot: 0, max: 0, recovery: 0, move: 0.8, air: 1.5, crouch: 0.95, adsBloom: 1 },
    recoil: {
      pitch: 3.2,
      pattern: [0],
      yawRandom: 0.6,
      adsScale: 0.85,
      recover: 0.75,
      recoverSpeed: 9,
    },
    mag: 6,
    reserve: 36,
    reload: {
      // Shotguns load one shell at a time, and firing stops the reload.
      shellByShell: true,
      start: 0.35,
      perShell: 0.48,
      end: 0.3,
      rack: 0.45, // extra pump at the end when the gun was empty
      cues: { shell: 'shell', rack: 'rack' },
    },
    pump: { at: 0.3, sound: 'pump' },
    ads: { time: 0.22, zoom: 1.15, move: 0.6, distance: 0.3 },
    swap: { raise: 0.5, lower: 0.3 },
    sprintOut: 0.2,
    moveScale: 0.95,
    tracerEvery: 0,
    sounds: { fire: 'shotgun' },
    kick: { back: 0.09, up: 0.03, rot: 8, shake: 0.4 },
    model: {
      hip: [0.15, -0.19, -0.42],
      sight: [0, 0.08, -0.1],
      muzzle: [0, 0.055, -0.71],
      eject: [0.04, 0.05, -0.05],
      support: [0, 0.0, -0.36],
      reticle: 'bead',
      parts: [
        { box: [0.065, 0.085, 0.24], at: [0, 0.03, -0.06], color: 'body' },
        { cyl: [0.016, 0.5], at: [0, 0.055, -0.43], color: 'metal' },
        { cyl: [0.014, 0.42], at: [0, 0.015, -0.4], color: 'dark' },
        { box: [0.06, 0.055, 0.17], at: [0, 0.012, -0.36], color: 'tan', name: 'pump' },
        { box: [0.06, 0.11, 0.3], at: [0, -0.005, 0.21], color: 'tan' },
        { box: [0.065, 0.13, 0.03], at: [0, -0.01, 0.37], color: 'dark' },
        { box: [0.045, 0.07, 0.08], at: [0, -0.03, 0.04], color: 'tan' },
        { box: [0.01, 0.01, 0.01], at: [0, 0.075, -0.68], color: 'accent' },
        { box: [0.012, 0.012, 0.03], at: [0.035, 0.06, 0.0], color: 'accent' },
      ],
    },
  },

  pistol: {
    id: 'pistol',
    name: 'P9 Sidearm',
    slot: 4,
    fireMode: 'semi',
    rpm: 420, // the fastest you can click
    pellets: 1,
    damage: { near: 26, far: 18, nearRange: 15, farRange: 40 },
    zones: ZONES,
    range: 150,
    penetration: 0.3,
    spread: { hip: 1.8, ads: 0.2, perShot: 0.7, max: 2.5, recovery: 9, move: 1.0, air: 2.5, crouch: 0.85, adsBloom: 0.4 },
    recoil: {
      pitch: 1.1,
      pattern: [0.1, -0.1, 0.15, -0.05],
      yawRandom: 0.2,
      adsScale: 0.8,
      recover: 0.8,
      recoverSpeed: 10,
    },
    mag: 15,
    reserve: 60,
    reload: {
      tactical: 1.45,
      empty: 1.7,
      commit: 0.75,
      cues: { tactical: [[0.02, 'reload_pistol']], empty: [[0.02, 'reload_pistol']] },
    },
    ads: { time: 0.14, zoom: 1.2, move: 0.75, distance: 0.38 },
    swap: { raise: 0.28, lower: 0.18 },
    sprintOut: 0.1,
    moveScale: 1.05,
    tracerEvery: 0,
    sounds: { fire: 'pistol' },
    kick: { back: 0.04, up: 0.03, rot: 6, shake: 0.1 },
    model: {
      hip: [0.13, -0.17, -0.42],
      sight: [0, 0.088, 0.02],
      muzzle: [0, 0.06, -0.16],
      eject: [0.02, 0.08, -0.04],
      support: null, // both hands on the grip
      reticle: 'irons',
      parts: [
        { box: [0.03, 0.035, 0.19], at: [0, 0.06, -0.06], color: 'dark', name: 'slide' },
        { box: [0.028, 0.025, 0.17], at: [0, 0.033, -0.05], color: 'body' },
        { box: [0.03, 0.11, 0.045], at: [0, -0.03, 0.0], rot: [-0.25, 0, 0], color: 'body' },
        { box: [0.024, 0.1, 0.035], at: [0, -0.04, 0.005], rot: [-0.25, 0, 0], color: 'dark', name: 'mag' },
        { box: [0.02, 0.012, 0.008], at: [0, 0.082, 0.025], color: 'dark', notch: true },
        { box: [0.006, 0.012, 0.006], at: [0, 0.082, -0.14], color: 'accent' },
      ],
    },
  },

  // The enemy Marksman's rifle (not in your loadout yet: unlocks arrive in milestone 7).
  // Slow, heavy and very accurate. A laser on top warns you before every shot.
  dmr: {
    id: 'dmr',
    name: 'R7 Marksman Rifle',
    slot: 5,
    enemyOnly: true,
    fireMode: 'semi',
    rpm: 110,
    pellets: 1,
    damage: { near: 70, far: 60, nearRange: 40, farRange: 120 },
    zones: ZONES,
    range: 300,
    penetration: 0.9,
    noise: 90,
    spread: { hip: 2.2, ads: 0.05, perShot: 0.3, max: 1.5, recovery: 6, move: 2.2, air: 3.5, crouch: 0.8, adsBloom: 0.2 },
    recoil: {
      pitch: 1.6,
      pattern: [0.1, -0.1],
      yawRandom: 0.15,
      adsScale: 0.7,
      recover: 0.75,
      recoverSpeed: 5,
    },
    mag: 10,
    reserve: 40,
    reload: {
      tactical: 2.3,
      empty: 2.8,
      commit: 0.75,
      cues: { tactical: [[0.02, 'reload_rifle']], empty: [[0.02, 'reload_rifle'], [2.3, 'charge']] },
    },
    ads: { time: 0.3, zoom: 2.5, move: 0.55, distance: 0.3 },
    swap: { raise: 0.5, lower: 0.3 },
    sprintOut: 0.25,
    moveScale: 0.92,
    tracerEvery: 1,
    sounds: { fire: 'rifle' },
    kick: { back: 0.05, up: 0.02, rot: 4, shake: 0.2 },
    model: {
      hip: [0.15, -0.19, -0.46],
      sight: [0, 0.16, -0.1],
      muzzle: [0, 0.045, -0.92],
      eject: [0.04, 0.065, -0.1],
      support: [0, 0.0, -0.42],
      reticle: 'dot',
      parts: [
        { box: [0.07, 0.09, 0.36], at: [0, 0.035, -0.12], color: 'dark' },
        { box: [0.075, 0.07, 0.34], at: [0, 0.035, -0.46], color: 'tan' },
        { cyl: [0.014, 0.3], at: [0, 0.045, -0.76], color: 'metal' },
        { cyl: [0.024, 0.07], at: [0, 0.045, -0.9], color: 'dark' },
        { box: [0.06, 0.11, 0.26], at: [0, 0.0, 0.17], color: 'tan' },
        { box: [0.04, 0.1, 0.05], at: [0, -0.055, 0.01], rot: [-0.25, 0, 0], color: 'dark' },
        { box: [0.035, 0.1, 0.07], at: [0, -0.06, -0.14], color: 'dark', name: 'mag' },
        { cyl: [0.022, 0.2], at: [0, 0.13, -0.1], color: 'dark' },
        { box: [0.02, 0.02, 0.06], at: [0.035, 0.11, -0.24], color: 'accent', name: 'laser' },
      ],
    },
  },
};

export const LOADOUT = ['carbine', 'smg', 'shotgun', 'pistol'];

/** Damage of one bullet (or pellet) at a distance, before hit-zone multipliers. */
export function damageAt(def, distance) {
  const { near, far, nearRange, farRange } = def.damage;
  if (distance <= nearRange) return near;
  if (distance >= farRange) return far;
  const k = (distance - nearRange) / (farRange - nearRange);
  return near + (far - near) * k;
}
