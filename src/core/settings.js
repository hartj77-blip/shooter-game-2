// Player settings (mouse sensitivity, field of view...), saved in the browser.
//
// Saved data is untrusted: it might be from an older version of the game,
// hand-edited, or half-written. So every value is checked against the schema
// below when loading, and anything wrong quietly falls back to its default.
// A broken save must never stop the game from starting.

import { events } from './events.js';
import { cleanKeys } from './input.js';

const STORAGE_KEY = 'fireteam.settings';
const VERSION = 1;

// One row per setting: its default, and the rules a saved value must follow.
export const SETTINGS_SCHEMA = {
  sensitivity:  { default: 2.0,    min: 0.1, max: 10 },   // mouse look speed
  invertY:      { default: false },                       // mouse up looks down
  fov:          { default: 100,    min: 70,  max: 120 },  // horizontal field of view in degrees (at 16:9)
  crouchMode:   { default: 'hold', options: ['hold', 'toggle'] },
  sprintMode:   { default: 'hold', options: ['hold', 'toggle'] },
  aimMode:      { default: 'hold', options: ['hold', 'toggle'] },
  adsSensitivity: { default: 1.0,  min: 0.2, max: 2 },   // mouse speed while aiming, relative to normal
  padSensitivity: { default: 1.0,  min: 0.3, max: 2.5 },  // controller look speed (core/gamepad.js)
  aimAssist:    { default: true },                        // controller: turning slows while your sights are on an enemy
  rumble:       { default: true },                        // controller vibration
  difficulty:   { default: 'regular', options: ['recruit', 'regular', 'veteran'] }, // enemy damage, reactions, aim
  masterVolume: { default: 0.8,    min: 0,   max: 1 },
  sfxVolume:    { default: 1.0,    min: 0,   max: 1 },
  reduceMotion: { default: false },                       // turns off head bob and camera tilt
  showFps:      { default: false },
  showReadout:  { default: true },                        // speed and movement state, bottom left
  quality:      { default: 'high', options: ['low', 'medium', 'high'] },
  callsign:     { default: '', text: true, maxLength: 16 },   // your name in co-op games
  voiceMode:    { default: 'both', options: ['both', 'radio', 'off'] }, // co-op voice chat (net/voice-mix.js)
  voiceVolume:  { default: 1.0,  min: 0,   max: 1 },
  uiVolume:     { default: 0.8,  min: 0,   max: 1 },        // hit markers, beeps, chimes (the audio mix: audio/audio.js)
  hudScale:     { default: 1.0,  min: 0.75, max: 1.5 },     // how big the HUD is drawn
  showHud:      { default: true },                        // off: a clean screen (crosshair and prompts stay)
  subtitles:    { default: true },                        // radio lines and enemy callouts as text
  autoQuality:  { default: true },                        // drop the graphics quality if the frame rate stays low
  keys:         { default: {}, bindings: true },          // your own keys: { action: 'KeyE' } (core/input.js)
};

/**
 * Text someone typed, made safe to show anywhere: no control characters or
 * angle brackets, single spaces, trimmed, at most `max` characters.
 */
export function cleanText(value, max = 32) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function defaultSettings() {
  const out = {};
  for (const [key, rule] of Object.entries(SETTINGS_SCHEMA)) out[key] = structuredClone(rule.default);
  return out;
}

/** Returns `value` if it obeys the rule for `key`, otherwise the default. */
export function sanitize(key, value) {
  const rule = SETTINGS_SCHEMA[key];
  if (!rule) return undefined;
  if (typeof rule.default === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return rule.default;
    return Math.min(rule.max, Math.max(rule.min, value));
  }
  if (typeof rule.default === 'boolean') return typeof value === 'boolean' ? value : rule.default;
  if (rule.text) return typeof value === 'string' ? cleanText(value, rule.maxLength) : rule.default;
  if (rule.options) return rule.options.includes(value) ? value : rule.default;
  if (rule.bindings) return cleanKeys(value);
  return rule.default;
}

// localStorage can be missing or throw (private windows, blocked cookies).
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {Storage|null} [storage] where to save; pass a fake one in tests
 */
export function createSettings(storage = browserStorage()) {
  const values = defaultSettings();

  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved.values === 'object') {
      for (const key of Object.keys(values)) {
        if (key in saved.values) values[key] = sanitize(key, saved.values[key]);
      }
    }
  } catch {
    // Corrupt save: keep the defaults.
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, values }));
    } catch {
      // Storage full or blocked: settings still work, they just won't be remembered.
    }
  }

  return {
    values,
    set(key, value) {
      if (!(key in SETTINGS_SCHEMA)) return;
      values[key] = sanitize(key, value);
      save();
      events.emit('settings:change', { key, value: values[key] });
    },
    reset() {
      Object.assign(values, defaultSettings());
      save();
      for (const key of Object.keys(values)) events.emit('settings:change', { key, value: values[key] });
    },
  };
}
