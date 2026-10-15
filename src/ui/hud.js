// The HUD (heads-up display): everything drawn on top of the 3D view while you play.
// It's plain HTML and CSS rather than 3D, which keeps text crisp and cheap to update.
//
// It only reads game state and listens to events; it never changes the game.

import * as THREE from 'three';
import { HOSTAGE_PENALTY } from '../game/course.js';

const MODE_LABEL = { mantle: 'CLIMB', slide: 'SLIDE', air: 'AIR' };
const DEG = Math.PI / 180;

const formatTime = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export function createHud({ soldier, settings, loop, input, camera, course, events }) {
  const player = soldier.body;
  const arsenal = soldier.arsenal;
  const el = (id) => document.getElementById(id);
  const root = el('hud');
  const speed = el('rSpeed');
  const mode = el('rMode');
  const readout = el('readout');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const hint = el('hint');
  const fps = el('fps');
  const slots = el('slots');
  const wName = el('wName');
  const ammoMag = el('ammoMag');
  const ammoReserve = el('ammoReserve');
  const ammoHint = el('ammoHint');
  const courseBox = el('course');
  const courseTitle = el('courseTitle');
  const courseTime = el('courseTime');
  const courseInfo = el('courseInfo');
  const results = el('results');
  const resultsTitle = el('resultsTitle');
  const resultsList = el('resultsList');
  const toast = el('toast');
  const dmgLayer = el('dmgNums');

  const options = { damageNumbers: false };
  const touchScreen = matchMedia('(pointer: coarse)');
  let lastText = '';
  let lastMode = '';
  let fpsTimer = 0;
  let toastTimer = 0;
  let resultsTimer = 0;
  let bestTime = null;
  const last = {};

  // Slot numbers along the top of the weapon panel.
  for (const g of arsenal.guns) {
    const s = document.createElement('span');
    s.textContent = g.def.slot;
    s.title = g.def.name;
    slots.append(s);
  }

  /** Only touch the page when a value really changes: DOM updates are slow. */
  function set(node, key, value, prop = 'textContent') {
    if (last[key] === value) return;
    last[key] = value;
    node[prop] = value;
  }

  function modeName(s) {
    if (MODE_LABEL[s.mode]) return MODE_LABEL[s.mode];
    if (s.crouched) return 'CROUCH';
    if (s.sprinting) return 'SPRINT';
    return s.speed > 0.3 ? 'WALK' : 'STAND';
  }

  function setHint(text) {
    if (text === lastText) return;
    lastText = text;
    hint.textContent = text;
    hint.classList.toggle('on', !!text);
  }

  function showToast(text, seconds = 2) {
    toast.textContent = text;
    toast.classList.add('on');
    toastTimer = seconds;
  }

  // ---- hit markers: white for a hit, gold for a headshot, red for a kill
  events.on('target:hit', (e) => {
    if ((e.owner ?? 0) !== 0) return;
    hitmarker.classList.remove('on', 'head', 'kill', 'hostage');
    void hitmarker.offsetWidth; // restart the CSS animation
    hitmarker.classList.add('on');
    if (e.hostage) hitmarker.classList.add('hostage');
    else if (e.killed) hitmarker.classList.add('kill');
    else if (e.headshot) hitmarker.classList.add('head');
    if (options.damageNumbers && e.kind !== 'steel') damageNumber(e.point, e.damage, e.headshot);
  });

  // ---- floating damage numbers (a learning aid; switch on in the tuning panel)
  const numbers = Array.from({ length: 16 }, () => {
    const d = document.createElement('div');
    d.className = 'dmg';
    d.hidden = true;
    dmgLayer.append(d);
    return { el: d, pos: new THREE.Vector3(), life: 0 };
  });
  let nextNumber = 0;
  function damageNumber(point, amount, head) {
    const n = numbers[nextNumber++ % numbers.length];
    n.pos.set(point.x, point.y, point.z);
    n.life = 0.9;
    n.el.textContent = Math.round(amount);
    n.el.classList.toggle('head', !!head);
    n.el.hidden = false;
  }
  const projected = new THREE.Vector3();

  // ---- the kill house
  events.on('course:ready', (e) => {
    bestTime = e.best;
    results.hidden = true;
  });
  events.on('course:blocked', (e) => showToast(`${e.remaining} target${e.remaining === 1 ? '' : 's'} still standing`));
  events.on('course:penalty', (e) => showToast(`Hostage hit: +${e.seconds} s`));
  events.on('course:finish', (r) => {
    bestTime = r.best;
    resultsTitle.textContent = r.record ? (r.previous ? 'New best time!' : 'First run complete') : 'Course complete';
    const rows = [
      ['Time', formatTime(r.time)],
      ['Hostage penalty', r.penalty ? `+${r.penalty} s` : 'none'],
      ['Total', formatTime(r.total)],
      ['Best', formatTime(r.best)],
      ['Accuracy', `${Math.round(r.accuracy * 100)}% (${r.hits}/${r.shots})`],
      ['Headshots', String(r.headshots)],
    ];
    resultsList.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));
    results.hidden = false;
    resultsTimer = 10;
  });

  function updateCourse(dt) {
    if (!course) return;
    resultsTimer -= dt;
    if (resultsTimer <= 0) results.hidden = true;
    const showing = course.state === 'ready' || course.state === 'running';
    courseBox.hidden = !showing;
    if (!showing) return;
    courseTitle.textContent = 'KILL HOUSE';
    if (course.state === 'ready') {
      set(courseTime, 'ct', formatTime(0));
      set(courseInfo, 'ci', `Step off the pad to start${bestTime ? ` · best ${formatTime(bestTime)}` : ''}`);
    } else {
      set(courseTime, 'ct', formatTime(course.time + course.hostageHits * HOSTAGE_PENALTY));
      set(courseInfo, 'ci', `${course.remaining} target${course.remaining === 1 ? '' : 's'} left${course.hostageHits ? ` · ${course.hostageHits} hostage hit` : ''}`);
    }
  }

  return {
    options,
    show(on) { root.hidden = !on; },

    update(dt, { playing }) {
      const s = player.state;
      readout.hidden = !settings.showReadout;
      speed.textContent = s.speed.toFixed(1);
      const m = modeName(s);
      if (m !== lastMode) {
        lastMode = m;
        mode.textContent = m;
        mode.dataset.mode = m.toLowerCase();
      }

      // Crosshair: the gap shows the real spread (where your next bullet can land).
      const spreadPx = (Math.tan(arsenal.state.spread * DEG) / Math.tan((camera.fov * DEG) / 2)) * (innerHeight / 2);
      crosshair.style.setProperty('--spread', `${Math.max(3, spreadPx).toFixed(1)}px`);
      const gun = arsenal.current;
      const hide = arsenal.state.ads > 0.6 || s.sprinting || gun.status === 'raising' || gun.status === 'lowering';
      crosshair.classList.toggle('hide', hide);

      // Weapon panel.
      set(wName, 'wn', gun.def.name.toUpperCase());
      set(ammoMag, 'am', String(gun.mag));
      set(ammoReserve, 'ar', arsenal.options.infiniteAmmo ? ' / ∞' : ` / ${gun.reserve}`);
      ammoMag.classList.toggle('low', gun.mag <= gun.def.mag * 0.25);
      [...slots.children].forEach((c, i) => c.classList.toggle('on', i === arsenal.state.current));
      let ammoText = '';
      if (gun.status === 'reloading') ammoText = 'RELOADING';
      else if (gun.mag === 0 && gun.reserve === 0) ammoText = 'NO AMMO';
      else if (gun.mag <= gun.def.mag * 0.25) ammoText = 'R  RELOAD';
      set(ammoHint, 'ah', ammoText);

      if (playing && !input.isLocked() && input.requireLock && !touchScreen.matches) setHint('Click to capture the mouse');
      else if (s.standBlocked) setHint('No room to stand up');
      else setHint('');

      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove('on');

      updateCourse(dt);

      for (const n of numbers) {
        if (n.el.hidden) continue;
        n.life -= dt;
        n.pos.y += dt * 0.6;
        projected.copy(n.pos).project(camera);
        if (n.life <= 0 || projected.z > 1) { n.el.hidden = true; continue; }
        n.el.style.transform = `translate(${((projected.x + 1) / 2) * innerWidth}px, ${((1 - projected.y) / 2) * innerHeight}px)`;
        n.el.style.opacity = Math.min(1, n.life * 2.5).toFixed(2);
      }

      fps.hidden = !settings.showFps;
      fpsTimer -= dt;
      if (settings.showFps && fpsTimer <= 0) {
        fpsTimer = 0.25;
        const st = loop.stats;
        fps.textContent = `${st.fps} fps · update ${st.updateMs.toFixed(1)} ms · draw ${st.renderMs.toFixed(1)} ms`;
      }
    },
  };
}
