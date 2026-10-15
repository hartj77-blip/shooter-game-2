// Menus: the title screen, pause screen and settings form.
//
// The settings form is built from SETTINGS_SCHEMA in core/settings.js, so
// adding a setting there automatically adds it here.

import { SETTINGS_SCHEMA } from '../core/settings.js';

const LABELS = {
  sensitivity:  { label: 'Mouse sensitivity', step: 0.05, format: (v) => v.toFixed(2) },
  invertY:      { label: 'Invert mouse up/down' },
  fov:          { label: 'Field of view', step: 1, format: (v) => `${Math.round(v)}°`, help: 'Wider shows more around you. Most PC shooters use 90–105.' },
  crouchMode:   { label: 'Crouch', names: { hold: 'Hold C', toggle: 'Press C to toggle' } },
  sprintMode:   { label: 'Sprint', names: { hold: 'Hold Shift', toggle: 'Press Shift to toggle' } },
  aimMode:      { label: 'Aim down sights', names: { hold: 'Hold right mouse', toggle: 'Click right mouse to toggle' } },
  adsSensitivity: { label: 'Aiming sensitivity', step: 0.05, format: (v) => `${Math.round(v * 100)}%`, help: '100% keeps the same feel as normal look, adjusted for the zoom.' },
  masterVolume: { label: 'Master volume', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  sfxVolume:    { label: 'Effects volume', step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  reduceMotion: { label: 'Reduce camera motion', help: 'Turns off head bob, tilt, landing dip and speed zoom. Helps with motion sickness.' },
  showReadout:  { label: 'Show speed readout' },
  showFps:      { label: 'Show frame rate' },
  quality:      { label: 'Graphics quality', names: { low: 'Low (fastest)', medium: 'Medium', high: 'High' } },
};

export function createMenus(settings) {
  const screens = {};
  for (const id of ['loading', 'title', 'pause', 'settings', 'error']) screens[id] = document.getElementById(id);
  const form = document.getElementById('settingsForm');
  const controls = {};

  for (const [key, rule] of Object.entries(SETTINGS_SCHEMA)) {
    const meta = LABELS[key] ?? { label: key };
    const row = document.createElement('label');
    row.className = 'setting';
    const name = document.createElement('span');
    name.className = 'setting-name';
    name.textContent = meta.label;
    row.append(name);

    let input;
    let value;
    if (typeof rule.default === 'boolean') {
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

  function refresh() {
    for (const [key, { input, value, meta }] of Object.entries(controls)) {
      const v = settings.values[key];
      if (input.type === 'checkbox') input.checked = v;
      else input.value = v;
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
