// Moods: the light a map is played in, written down as data.
//
// A mood is everything that sets the time of day and the weather: the sky's
// colours, how thick the fog is, the sun's colour, height and strength, the
// soft light from the sky and the ground (the "hemisphere"), the camera's
// exposure, and a colour grade (saturation, contrast, a tint, a vignette)
// applied at the very end (render/post.js). Think of a film crew choosing the
// time of day to shoot a scene, then a colourist giving it a look.
//
// A level names its mood (`mood: 'golden'`); its `sun` still says which way the
// sun is (azimuth). A mood may also set the sun's height (`elevation`).
// Presentation only: nothing in the simulation reads these.

const deg = (d) => (d * Math.PI) / 180;

export const MOODS = {
  // The Proving Ground: a bright, clear midday. Short shadows, true colours.
  midday: {
    skyTop: '#4f84c4', skyHorizon: '#cfdbe0',
    fog: '#c9d6db', fogNear: 80, fogFar: 320,
    sun: '#fff4e2', sunIntensity: 2.8, elevation: null,
    hemiSky: '#9fb8d6', hemiGround: '#5a5544', hemiIntensity: 2.3,
    exposure: 1.0,
    grade: { saturation: 1.06, contrast: 1.05, tint: '#ffffff', vignette: 0.15 },
  },
  // The Compound: late afternoon in dusty haze. Warm, soft, and the far end of the base fades out.
  haze: {
    skyTop: '#7d93ae', skyHorizon: '#e6caa2',
    fog: '#d9c3a3', fogNear: 35, fogFar: 210,
    sun: '#ffd39c', sunIntensity: 2.4, elevation: deg(24),
    hemiSky: '#b4b6b8', hemiGround: '#6a5a42', hemiIntensity: 2.0,
    exposure: 1.05,
    grade: { saturation: 0.94, contrast: 1.04, tint: '#fff2e0', vignette: 0.2 },
  },
  // The Harbour: golden hour. A low sun, long shadows, orange light on the white walls.
  golden: {
    skyTop: '#5872a6', skyHorizon: '#f2b67a',
    fog: '#e9b583', fogNear: 60, fogFar: 300,
    sun: '#ffb46e', sunIntensity: 2.9, elevation: deg(18),
    hemiSky: '#a6b6d6', hemiGround: '#7a5e3e', hemiIntensity: 2.2,
    exposure: 1.1,
    grade: { saturation: 1.08, contrast: 1.06, tint: '#fff0e0', vignette: 0.22 },
  },
  // Night (the Harbour's night missions): moonlight, deep blue, and fog that swallows the distance.
  // You can still make out shapes: dark, not black. Lamps and flashlights do the rest (render/night-view.js).
  night: {
    skyTop: '#04060c', skyHorizon: '#16223d',
    fog: '#0c1424', fogNear: 18, fogFar: 150,
    sun: '#a9bcff', sunIntensity: 0.9, elevation: deg(42),
    hemiSky: '#3a4d78', hemiGround: '#1a1e28', hemiIntensity: 1.9,
    exposure: 1.3,
    grade: { saturation: 0.82, contrast: 1.1, tint: '#dfe8ff', vignette: 0.32 },
  },
};

export const DEFAULT_MOOD = 'midday';

/** A level's mood, ready to use: the named one, with anything the level overrides. */
export function moodFor(level) {
  const m = level?.mood;
  const base = MOODS[typeof m === 'string' ? m : m?.name] ?? MOODS[DEFAULT_MOOD];
  return typeof m === 'object' && m ? { ...base, ...m, grade: { ...base.grade, ...(m.grade ?? {}) } } : base;
}
