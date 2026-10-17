// Lighting, for the simulation: how lit is a spot? 0 = pitch dark, 1 = daylight.
//
// The enemies use it (ai/senses.js): in the dark they see less far, and it takes
// them longer to be sure what they saw. So at night, darkness hides you, and a
// lamp, a muzzle flash or an enemy's flashlight gives you away. By day everything
// is 1 and nothing changes.
//
// This isn't the light you SEE (render/night-view.js draws that, with real
// three.js lights): it's a simple sum anybody can work out from the level and
// the game state, the same on the host and in the tests, every time. Like a
// stage manager's lighting plot: "the area under lamp 3 is bright", with no
// photons involved.
//
//   moonlight  the level's ambient light: 1 by day, LIGHTING.night at night
//   lamps      bright under a lamp, fading out to its `radius` (world/kit.js `lamp`)
//   firing     a muzzle flash lights you up for a moment
//   flashlight an enemy's torch: a cone ahead of them (only that enemy's eyes benefit)
//
// No DOM, no three.js: this runs in Node.

export const LIGHTING = {
  night: 0.15,           // moonlight on open ground at night (0..1)
  lampFull: 0.4,         // the middle part of a lamp's radius (this fraction of it) is fully lit...
  lampBright: 0.9,       // ...this bright
  firing: 0.85,          // a muzzle flash lights you up this much...
  firingTime: 0.4,       // ...for this many seconds
  flashlightRange: 22,   // metres an enemy's torch reaches
  flashlightCone: 14,    // degrees either side of where they're looking
  flashlightBright: 0.8, // how bright you are in the middle of the beam, close up
  darkSight: 0.35,       // in full darkness, enemies see this fraction of their daylight range
  darkRate: 0.3,         // ...and become sure of what they saw this much as fast
};

const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The lighting of a level: its moonlight and its lamps.
 * @param {object} def       the level definition (`night: true` for a night mission)
 * @param {object} expanded  the expanded level (world/kit.js), for its lamps
 */
export function createLighting(def, expanded, tuning = LIGHTING) {
  const night = !!def.night;
  return {
    night,
    /** Moonlight (or daylight). */
    get ambient() { return night ? tuning.night : 1; },
    lamps: night ? (expanded.lamps ?? []) : [], // lamps are only lit at night
    tuning,
  };
}

/**
 * How lit a spot is, 0..1, from the moon and the lamps, and (if `firedAgo`, the
 * seconds since that person last fired, is small) their own muzzle flash.
 */
export function lightAt(pos, lighting, firedAgo = Infinity) {
  const T = lighting.tuning;
  let light = lighting.ambient;
  for (const lamp of lighting.lamps) {
    const d = Math.hypot(pos.x - lamp.at[0], pos.z - lamp.at[2]);
    if (d >= lamp.radius) continue;
    const full = lamp.radius * T.lampFull;
    const k = d <= full ? 1 : 1 - (d - full) / (lamp.radius - full);
    light = Math.max(light, lighting.ambient + (T.lampBright - lighting.ambient) * k);
  }
  if (firedAgo < T.firingTime) light = Math.max(light, T.firing);
  return Math.min(1, light);
}

/**
 * How much an enemy's own flashlight lights `point` up, 0..1 (0 by day, or
 * outside the beam). The beam points where they face (`yaw`, from `eye`).
 */
export function flashlightOn(lighting, eye, yaw, point) {
  if (!lighting.night) return 0;
  const T = lighting.tuning;
  const dx = point.x - eye.x, dz = point.z - eye.z;
  const d = Math.hypot(dx, dz);
  if (d > T.flashlightRange) return 0;
  if (d > 0.5 && Math.abs(wrap(Math.atan2(-dx, -dz) - yaw)) > T.flashlightCone * DEG) return 0;
  return T.flashlightBright * (1 - 0.5 * (d / T.flashlightRange)); // dimmer further away
}

/** In this light, the fraction of their daylight range an enemy can see (1 in daylight). */
export function sightScale(light, tuning = LIGHTING) {
  return tuning.darkSight + (1 - tuning.darkSight) * light;
}

/** In this light, how fast awareness builds compared with daylight (1 in daylight). */
export function noticeScale(light, tuning = LIGHTING) {
  return tuning.darkRate + (1 - tuning.darkRate) * light;
}
