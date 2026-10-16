// The sound bank: every sound the game can play, and how loud it is in the mix.
//
// Each entry lists its recordings (in assets/sounds/, built by
// tools/build-sounds.py). When there are several, one is picked at random,
// and every play gets a slightly different pitch and volume. Hearing exactly the
// same sample 15 times a second makes a machine gun sound robotic; small
// differences make it sound real.
//
//   volume     loudness in the mix (0-1)
//   pitch      random pitch range, e.g. 0.06 means ±6%
//   bus        'sfx' (most sounds) or 'ui' (interface beeps)
//   spatial    true = comes from a point in the world (gets louder as you get closer)
//   reverb     how much echo to add (gunshots ring out)
//   refDistance  (loops) how close you are before it stops getting louder

const files = (name, n) => Array.from({ length: n }, (_, i) => `${name}_${i + 1}`);

export const SOUNDS = {
  rifle:          { files: files('rifle', 2), volume: 0.8, pitch: 0.05, reverb: 0.35 },
  smg:            { files: files('smg', 3), volume: 0.7, pitch: 0.06, reverb: 0.3 },
  shotgun:        { files: files('shotgun', 2), volume: 0.95, pitch: 0.04, reverb: 0.45 },
  pistol:         { files: files('pistol', 3), volume: 0.7, pitch: 0.05, reverb: 0.3 },
  reload_rifle:   { files: files('reload_rifle', 1), volume: 0.6, pitch: 0.02 },
  reload_smg:     { files: files('reload_smg', 1), volume: 0.6, pitch: 0.02 },
  reload_pistol:  { files: files('reload_pistol', 1), volume: 0.55, pitch: 0.02 },
  charge:         { files: files('charge', 1), volume: 0.6, pitch: 0.03 },
  pump:           { files: files('pump', 1), volume: 0.6, pitch: 0.03 },
  shell:          { files: files('shell', 1), volume: 0.5, pitch: 0.06 },
  rack:           { files: files('rack', 1), volume: 0.6, pitch: 0.03 },
  dry:            { files: files('dry', 1), volume: 0.5, pitch: 0.04 },
  gear:           { files: files('gear', 3), volume: 0.35, pitch: 0.08 },
  casing:         { files: files('casing', 3), volume: 0.18, pitch: 0.15 },
  hit_concrete:   { files: files('hit_concrete', 3), volume: 0.45, pitch: 0.12, spatial: true },
  hit_dirt:       { files: files('hit_dirt', 3), volume: 0.5, pitch: 0.12, spatial: true },
  hit_wood:       { files: files('hit_wood', 3), volume: 0.55, pitch: 0.12, spatial: true },
  hit_metal:      { files: files('hit_metal', 3), volume: 0.45, pitch: 0.12, spatial: true },
  hit_paper:      { files: files('hit_paper', 3), volume: 0.6, pitch: 0.1, spatial: true },
  ding:           { files: files('ding', 3), volume: 0.75, pitch: 0.05, spatial: true },
  step_concrete:  { files: files('step_concrete', 5), volume: 0.28, pitch: 0.1 },
  step_wood:      { files: files('step_wood', 5), volume: 0.3, pitch: 0.1 },
  land:           { files: files('land', 2), volume: 0.45, pitch: 0.08 },
  // Milestone 3: soldiers.
  hit_flesh:      { files: files('hit_flesh', 3), volume: 0.6, pitch: 0.1, spatial: true },
  hurt:           { files: files('hurt', 2), volume: 0.75, pitch: 0.08 },
  bodyfall:       { files: files('bodyfall', 3), volume: 0.7, pitch: 0.08, spatial: true },
  whizz:          { synth: 'whizz', volume: 0.55, pitch: 0.15, spatial: true },
  heartbeat:      { synth: 'heartbeat', volume: 0.5, pitch: 0.02 },
  radio:          { synth: 'radio', volume: 0.3, pitch: 0.05, spatial: true },
  laser:          { synth: 'laser', volume: 0.4, pitch: 0.02, spatial: true },
  // Milestone 5: missions.
  explosion:      { files: files('explosion', 3), volume: 1.0, pitch: 0.08, spatial: true, reverb: 0.6 },
  bounce:         { files: files('hit_metal', 3), volume: 0.35, pitch: 0.2, spatial: true },
  rotor:          { synth: 'rotor', volume: 0.7, spatial: true, refDistance: 12 }, // a loop (audio.loop)
  // Interface sounds are made by code (see audio.js), so they have no files.
  hitmarker:      { synth: 'tick', volume: 0.35, pitch: 0.03, bus: 'ui' },
  kill:           { synth: 'kill', volume: 0.45, pitch: 0.02, bus: 'ui' },
  headshot:       { synth: 'head', volume: 0.45, pitch: 0.02, bus: 'ui' },
  beep:           { synth: 'beep', volume: 0.4, pitch: 0, bus: 'ui' },
  chime:          { synth: 'chime', volume: 0.45, pitch: 0, bus: 'ui' },
  buzz:           { synth: 'buzz', volume: 0.4, pitch: 0, bus: 'ui' },
};

/** Every file the game needs to download. */
export function soundFiles() {
  return [...new Set(Object.values(SOUNDS).flatMap((s) => s.files ?? []))];
}
