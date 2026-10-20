// Menus: the title screen, pause screen and settings form.
//
// The settings form is built from SETTINGS_SCHEMA in core/settings.js, so
// adding a setting there automatically adds it here.

import { SETTINGS_SCHEMA } from '../core/settings.js';
import { DEFAULT_BINDINGS, keyName } from '../core/input.js';

// The actions you can give your own key (Settings → Controls), in a sensible order.
const ACTION_NAMES = {
  forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jump: 'Jump / climb', sprint: 'Sprint',
  crouch: 'Crouch / slide', fire: 'Fire', ads: 'Aim', reload: 'Reload', last: 'Last gun', grenade: 'Grenade',
  interact: 'Use (hold)', ping: 'Ping', callin: 'Call-in', radio: 'Squad radio (hold)', nightvision: 'Night vision',
};

const LABELS = {
  sensitivity:  { label: 'Mouse sensitivity', step: 0.05, format: (v) => v.toFixed(2) },
  invertY:      { label: 'Invert mouse up/down' },
  fov:          { label: 'Field of view', step: 1, format: (v) => `${Math.round(v)}°`, help: 'Wider shows more around you. Most PC shooters use 90–105.' },
  crouchMode:   { label: 'Crouch', names: { hold: 'Hold C', toggle: 'Press C to toggle' } },
  sprintMode:   { label: 'Sprint', names: { hold: 'Hold Shift', toggle: 'Press Shift to toggle' } },
  aimMode:      { label: 'Aim down sights', names: { hold: 'Hold right mouse', toggle: 'Click right mouse to toggle' } },
  difficulty:   {
    label: 'Difficulty',
    names: { recruit: 'Recruit: forgiving', regular: 'Regular', veteran: 'Veteran: they hit hard and react fast' },
    help: 'How much enemy bullets hurt, how fast enemies react and aim, and how many can shoot at you at once.',
  },
  adsSensitivity: { label: 'Aiming sensitivity', step: 0.05, format: (v) => `${Math.round(v * 100)}%`, help: '100% keeps the same feel as normal look, adjusted for the zoom.' },
  padSensitivity: { label: 'Controller look speed', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  aimAssist:    { label: 'Controller aim assist', help: 'With a controller, turning slows down while your sights are over an enemy. A stick is far less precise than a mouse.' },
  rumble:       { label: 'Controller vibration' },
  masterVolume: { label: 'Master volume', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  sfxVolume:    { label: 'Effects volume', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  reduceMotion: { label: 'Reduce camera motion', help: 'Turns off head bob, tilt, landing dip and speed zoom. Helps with motion sickness.' },
  showReadout:  { label: 'Show speed readout' },
  showFps:      { label: 'Show frame rate' },
  quality:      { label: 'Graphics quality', names: { low: 'Low (fastest)', medium: 'Medium', high: 'High' } },
  callsign:     { label: 'Callsign', placeholder: 'Your name in co-op games', help: 'Shown to your teammates. Up to 16 characters.' },
  voiceMode:    {
    label: 'Voice chat',
    names: { both: 'Radio (hold V) + nearby voice', radio: 'Push-to-talk only (hold V)', off: 'Off: no microphone, no voices' },
    help: 'Nearby voice: teammates close to you hear you from where you stand. Wear headphones so nobody hears themselves echo.',
  },
  voiceVolume:  { label: 'Voice volume', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  uiVolume:     { label: 'Interface volume', step: 0.05, format: (v) => `${Math.round(v * 100)}%`, help: 'Hit markers, beeps and chimes.' },
  hudScale:     { label: 'HUD size', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  showHud:      { label: 'Show the HUD', help: 'Off: a clean screen for screenshots. The crosshair and prompts stay.' },
  subtitles:    { label: 'Subtitles', help: 'Radio lines and enemy callouts as text.' },
  autoQuality:  { label: 'Automatic graphics quality', help: 'Steps the graphics quality down if the game stays slow for a few seconds.' },
};

/**
 * @param {object} settings  core/settings.js
 * @param {object} [input]   core/input.js, for catching the key you press when rebinding
 */
export function createMenus(settings, input = null) {
  const screens = {};
  for (const id of ['loading', 'title', 'join', 'lobby', 'debrief', 'pause', 'settings', 'loadout', 'error']) screens[id] = document.getElementById(id);
  const form = document.getElementById('settingsForm');
  const controls = {};

  for (const [key, rule] of Object.entries(SETTINGS_SCHEMA)) {
    if (rule.bindings) continue; // your keys get their own list below
    const meta = LABELS[key] ?? { label: key };
    const row = document.createElement('label');
    row.className = 'setting';
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.textContent = meta.label;
    row.append(name);

    let input;
    let value;
    if (rule.text) {
      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = rule.maxLength;
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (meta.placeholder) input.placeholder = meta.placeholder;
      input.addEventListener('change', () => { settings.set(key, input.value); input.value = settings.values[key]; });
      row.classList.add('setting-text');
    } else if (typeof rule.default === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => settings.set(key, input.checked));
      row.classList.add('setting-check');
    } else if (typeof rule.default === 'number') {
      input = document.createElement('input');
      input.type = 'range';
      input.min = rule.min;
      input.max = rule.max;
      input.step = meta.step ?? 0.1;
      value = document.createElement('output');
      input.addEventListener('input', () => {
        settings.set(key, Number(input.value));
        value.textContent = meta.format ? meta.format(settings.values[key]) : settings.values[key];
      });
    } else {
      input = document.createElement('select');
      for (const opt of rule.options) {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = meta.names?.[opt] ?? opt;
        input.append(o);
      }
      input.addEventListener('change', () => settings.set(key, input.value));
    }
    input.name = key;
    row.append(input);
    if (value) row.append(value);
    if (meta.help) {
      const help = document.createElement('small');
      help.textContent = meta.help;
      row.append(help);
    }
    form.append(row);
    controls[key] = { input, value, meta };
  }

  // ---- Controls: click an action, then press the key (or mouse button) you want for it.
  const keysHead = document.createElement('h3');
  keysHead.className = 'settings-head';
  keysHead.textContent = 'Controls (click, then press a key)';
  form.append(keysHead);
  const keyButtons = {};
  const bound = (action) => keyName(settings.values.keys[action] ?? DEFAULT_BINDINGS[action][0]);
  for (const [action, label] of Object.entries(ACTION_NAMES)) {
    const row = document.createElement('div');
    row.className = 'setting setting-key';
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.textContent = label;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = action;
    b.addEventListener('click', () => {
      if (!input) return;
      b.textContent = 'Press a key…';
      input.captureNext((code) => {
        if (code !== 'Escape') settings.set('keys', { ...settings.values.keys, [action]: code });
        refresh();
      });
    });
    row.append(name, b);
    form.append(row);
    keyButtons[action] = b;
  }
  const resetKeys = document.createElement('button');
  resetKeys.type = 'button';
  resetKeys.textContent = 'Default keys';
  resetKeys.addEventListener('click', () => { settings.set('keys', {}); refresh(); });
  form.append(resetKeys);

  function refresh() {
    for (const [action, b] of Object.entries(keyButtons)) b.textContent = bound(action);
    for (const [key, { input: control, value, meta }] of Object.entries(controls)) {
      const v = settings.values[key];
      if (control.type === 'checkbox') control.checked = v;
      else control.value = v;
      if (value) value.textContent = meta.format ? meta.format(v) : v;
    }
  }

  let settingsReturn = null;

  return {
    show(id) {
      if (id === 'settings') refresh();
      screens[id].hidden = false;
    },
    hide(id) { screens[id].hidden = true; },
    only(...ids) {
      for (const [id, el] of Object.entries(screens)) if (id !== 'error') el.hidden = !ids.includes(id);
      if (ids.includes('settings')) refresh();
    },
    isOpen(id) { return !screens[id].hidden; },
    openSettings(back) {
      settingsReturn = back;
      refresh();
      screens.settings.hidden = false;
    },
    closeSettings() {
      screens.settings.hidden = true;
      settingsReturn?.();
      settingsReturn = null;
    },
    setLoading(fraction, text) {
      document.getElementById('loadBar').style.width = `${Math.round(fraction * 100)}%`;
      document.getElementById('loadText').textContent = text;
    },
    refresh,
  };
}
