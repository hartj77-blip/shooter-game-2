// The HUD (heads-up display): everything drawn on top of the 3D view while you play.
// It's plain HTML and CSS rather than 3D, which keeps text crisp and cheap to update.
//
// It only reads game state and listens to events; it never changes the game.
// Each mission builds its own HUD and calls dispose() when it ends, which
// empties everything this file added to the page.

import * as THREE from 'three';
import { HOSTAGE_PENALTY } from '../game/course.js';
import { ROLES } from '../ai/enemy-data.js';

const MODE_LABEL = { mantle: 'CLIMB', slide: 'SLIDE', air: 'AIR' };
const DEG = Math.PI / 180;

const formatTime = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {object} opts
 * @param {object} [opts.course]     the kill house (Proving Ground)
 * @param {object} [opts.encounter]  the Compound's rules (game/encounter.js)
 * @param {{list: Array}} [opts.threats] the enemies (each with a `view`), for "someone's noticing you" arrows
 * @param {object} [opts.health]     player/health.js
 * @param {number} [opts.owner]      your player slot: only your hits, hurts and kills show
 * @param {boolean} [opts.coop]      a co-op game: the squad HUD (ui/squad-hud.js) shows who's down
 * @param {Function} [opts.nameOf]   owner -> callsign, for the results card
 */
export function createHud({
  soldier, settings, loop, input, camera, course, encounter = null, threats = null, health = null, events, owner = 0,
  coop = false, nameOf = (o) => `Player ${o + 1}`,
}) {
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
  const hurt = el('hurt');
  const healthBox = el('health');
  const healthFill = el('healthFill');
  const dirsLayer = el('dirs');
  const feed = el('feed');
  const subs = el('subs');
  const downBox = el('down');
  const downInfo = el('downInfo');
  const view = el('view');

  const options = { damageNumbers: false };
  const touchScreen = matchMedia('(pointer: coarse)');
  let lastText = '';
  let lastMode = '';
  let fpsTimer = 0;
  let toastTimer = 0;
  let resultsTimer = 0;
  let bestTime = null;
  const last = {};
  const mine = (e) => (e.owner ?? 0) === owner;
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };

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
    if (!mine(e)) return;
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

  // ---- getting hurt: red screen edges and an arrow pointing at the shooter
  let hurtFlash = 0;
  let saturation = 1;
  const arrows = Array.from({ length: 6 }, () => {
    const d = document.createElement('div');
    d.className = 'dir';
    d.append(document.createElement('i'));
    dirsLayer.append(d);
    return { el: d, from: null, life: 0 };
  });
  let nextArrow = 0;
  events.on('player:hurt', (e) => {
    if (!mine(e)) return;
    hurtFlash = Math.min(0.8, hurtFlash + 0.25 + e.amount / 60);
    if (!e.from) return;
    // One arrow per shooter: reuse it if this one's already showing.
    const same = arrows.find((a) => a.life > 0 && a.from && Math.hypot(a.from.x - e.from.x, a.from.z - e.from.z) < 2);
    const a = same ?? arrows[nextArrow++ % arrows.length];
    a.from = { ...e.from };
    a.life = 1.8;
  });
  // "Someone's noticing you": white arrows turning red as their awareness fills.
  const notices = Array.from({ length: 8 }, () => {
    const d = document.createElement('div');
    d.className = 'dir notice';
    d.append(document.createElement('i'));
    dirsLayer.append(d);
    return d;
  });
  const angleTo = (p) => {
    const me = player.state.pos;
    const yawTo = Math.atan2(-(p.x - me.x), -(p.z - me.z));
    return -wrap(yawTo - input.yaw) / DEG; // screen degrees, clockwise from straight ahead
  };

  // ---- kill notices and callout subtitles
  function line(box, html, cls = '', seconds = 3.5, max = 4) {
    const d = document.createElement('div');
    d.innerHTML = html;
    if (cls) d.className = cls;
    box.append(d);
    while (box.children.length > max) box.firstChild.remove();
    later(() => { d.style.opacity = '0'; }, seconds * 1000);
    later(() => d.remove(), seconds * 1000 + 450);
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  events.on('enemy:down', (e) => {
    if (!mine(e)) return;
    line(feed, `<b>${esc(ROLES[e.role]?.name ?? 'Enemy')}</b> down${e.headshot ? ' · headshot' : ''}`, e.headshot ? 'head' : '');
  });
  events.on('enemy:bark', (e) => {
    // Subtitles for what you'd hear: only callouts from nearby.
    const me = player.state.pos;
    if (Math.hypot(e.pos.x - me.x, e.pos.z - me.z) > 40) return;
    line(subs, `<b>${esc(ROLES[e.role]?.name ?? 'Enemy')}</b>${esc(e.text)}`, '', 3, 3);
  });

  // ---- the Compound
  events.on('encounter:ready', (e) => {
    bestTime = e.best;
    results.hidden = true;
    downBox.hidden = true;
  });
  events.on('encounter:down', (e) => {
    if (coop) return; // the squad HUD says "Mission failed"
    downInfo.textContent = `${e.kills} of ${e.total} hostiles down · ${formatTime(e.time)}`;
    downBox.hidden = false;
    el('downKey').textContent = input.glyph?.('reload') ?? 'R'; // "X" on a controller
  });
  events.on('encounter:finish', (r) => {
    bestTime = r.best;
    resultsTitle.textContent = r.record && r.previous ? 'New best time!' : 'Compound cleared';
    const rows = [
      ['Time', formatTime(r.time)],
      ['Best', formatTime(r.best)],
      ['Hostiles', String(r.kills)],
      ['Headshots', String(r.headshots)],
      ['Accuracy', `${Math.round(r.accuracy * 100)}% (${r.hits}/${r.shots})`],
      ['Damage taken', String(r.damageTaken)],
    ];
    // Co-op: everyone's own numbers too.
    if (r.players?.length > 1) {
      for (const p of [...r.players].sort((a, b) => a.owner - b.owner)) {
        const extra = [p.downs ? `${p.downs} down` : '', p.revives ? `${p.revives} revive${p.revives > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
        rows.push([nameOf(p.owner), `${p.kills} kill${p.kills === 1 ? '' : 's'} · ${Math.round(p.accuracy * 100)}%${extra ? ` · ${extra}` : ''}`]);
      }
    }
    resultsList.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));
    results.hidden = false;
    resultsTimer = 14;
  });

  function updateThreats(dt) {
    if (!health) return;
    const frac = health.fraction;
    healthBox.hidden = !threats;
    set(healthFill.style, 'hw', `${Math.round(frac * 100)}%`, 'width');
    healthBox.classList.toggle('low', health.state.hp < health.tuning.low);
    hurtFlash = Math.max(0, hurtFlash - dt * 1.6);
    const edge = Math.min(1, Math.pow(1 - frac, 1.4) * 0.85 + hurtFlash);
    set(hurt.style, 'hurt', edge.toFixed(2), 'opacity');
    // Low health drains the colour from the world.
    const sat = frac < health.tuning.low / health.tuning.max ? 0.35 + 0.65 * (frac / (health.tuning.low / health.tuning.max)) : 1;
    if (Math.abs(sat - saturation) > 0.02 || (sat === 1 && saturation !== 1)) {
      saturation = sat;
      view.style.filter = sat < 1 ? `saturate(${sat.toFixed(2)})` : '';
    }
    for (const a of arrows) {
      a.life -= dt;
      if (a.life <= 0 || !a.from) { a.el.style.opacity = '0'; continue; }
      a.el.style.transform = `rotate(${angleTo(a.from).toFixed(1)}deg)`;
      a.el.style.opacity = Math.min(1, a.life).toFixed(2);
    }
    // Who's noticing you? (Not a teammate: only enemies watching you.)
    let n = 0;
    if (threats && !health.state.down) {
      for (const t of threats.list) {
        if (n >= notices.length) break;
        const e = t.view;
        if (e.dead || e.target !== owner) continue;
        const laser = e.laserOn && e.sees;
        const aw = e.awareness;
        const fresh = e.inCombat ? e.fresh : aw > 0.04;
        if (!laser && !fresh) continue;
        const d = notices[n++];
        d.classList.toggle('laser', laser);
        d.style.setProperty('--k', aw.toFixed(2));
        d.style.transform = `rotate(${angleTo(e.pos).toFixed(1)}deg) scale(${(0.7 + 0.5 * aw).toFixed(2)})`;
        d.style.opacity = laser ? '1' : (0.35 + 0.65 * aw).toFixed(2);
      }
    }
    for (let i = n; i < notices.length; i++) notices[i].style.opacity = '0';
  }

  function updateEncounter() {
    if (!encounter) return false;
    const showing = encounter.state === 'ready' || encounter.state === 'running';
    courseBox.hidden = !showing;
    if (encounter.state !== 'down') downBox.hidden = true;
    if (!showing) return true;
    set(courseTitle, 'cT', 'THE COMPOUND');
    if (encounter.state === 'ready') {
      set(courseTime, 'ct', formatTime(0));
      set(courseInfo, 'ci', `Leave the start area to begin${bestTime ? ` · best ${formatTime(bestTime)}` : ''}`);
    } else {
      set(courseTime, 'ct', formatTime(encounter.time));
      set(courseInfo, 'ci', `${encounter.remaining} hostile${encounter.remaining === 1 ? '' : 's'} left`);
    }
    return true;
  }

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
    resultsTimer -= dt;
    if (resultsTimer <= 0) results.hidden = true;
    if (updateEncounter() || !course) return;
    const showing = course.state === 'ready' || course.state === 'running';
    courseBox.hidden = !showing;
    if (!showing) return;
    set(courseTitle, 'cT', 'KILL HOUSE');
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
    /** A line in the kill feed (top right). `html` must already be escaped. */
    feedLine(html, cls = '') { line(feed, html, cls); },
    esc,

    /** Remove everything this HUD added to the page (the mission is ending). */
    dispose() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const box of [slots, dmgLayer, dirsLayer, feed, subs]) box.replaceChildren();
      for (const box of [results, downBox, courseBox]) box.hidden = true;
      toast.classList.remove('on');
      hitmarker.classList.remove('on', 'head', 'kill', 'hostage');
      hurt.style.opacity = '0';
      view.style.filter = '';
      setHint('');
      root.hidden = true;
    },

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
      const hide = arsenal.state.ads > 0.6 || s.sprinting || gun.status === 'raising' || gun.status === 'lowering' || !!health?.state.down;
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
      updateThreats(dt);

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
