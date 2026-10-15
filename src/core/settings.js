// Player settings (mouse sensitivity, field of view...), saved in the browser.
//
// Saved data is untrusted: it might be from an older version of the game,
// hand-edited, or half-written. So every value is checked against the schema
// below when loading, and anything wrong quietly falls back to its default.
// A broken save must never stop the game from starting.

import { events } from './events.js';

const STORAGE_KEY = 'fireteam.settings';
const VERSION = 1;

// One row per setting: its default, and the rules a saved value must follow.
export const SETTINGS_SCHEMA = {
  sensitivity:  { default: 2.0,    min: 0.1, max: 10 },   // mouse look speed
  invertY:      { default: false },                       // mouse up looks down
  fov:          { default: 100,    min: 70,  max: 120 },  // horizontal field of view in degrees (at 16:9)
  crouchMode:   { default: 'hold', options: ['hold', 'toggle'] },
  sprintMode:   { default: 'hold', options: ['hold', 'toggle'] },
  reduceMotion: { default: false },                       // turns off head bob and camera tilt
  showFps:      { default: false },
  showReadout:  { default: true },                        // speed and movement state, bottom left
  quality:      { default: 'high', options: ['low', 'medium', 'high'] },
};

export function defaultSettings() {
  const out = {};
  for (const [key, rule] of Object.entries(SETTINGS_SCHEMA)) out[key] = rule.default;
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
  if (rule.options) return rule.options.includes(value) ? value : rule.default;
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
