// The objective HUD: what to do next in a mission, and where.
//
//   - the objective panel (top right): the mission, what to do now, a progress
//     bar (the download, holding the line, the helicopter's countdown) and the
//     mission clock
//   - markers on the places that matter. You're told roughly where to look
//     ("one of these three buildings"), not exactly: a candidate site shows
//     "?" until you get close enough to see what's there.
//   - "Hold F" prompts when you're close enough to use something, and the
//     progress ring while you hold it
//   - Overlord's radio lines, objective news in the feed, "Mission failed"
//
// Like the rest of the HUD it only reads: the mission's `view` (the same on
// the host and on co-op clients, game/operation.js), the level's sites, and
// where you are. It works the same in solo play and in co-op.

import { HELI } from '../game/helicopter.js';
import { SUPPLY } from '../game/supply.js';
import { INTERACT } from '../game/interact.js';
import { SLOT_COLORS } from '../net/room.js';

const REVEAL = 11;  // metres: close enough to see which candidate site is the real one
const formatTime = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
const posOf = (thing) => ({ x: thing.at[0], y: thing.at[1] ?? 0, z: thing.at[2] });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lift = (p, h) => ({ x: p.x, y: p.y + h, z: p.z });

// What the ring says while you hold F at each kind of thing.
const USING = { crate: 'Taking ammo', free: 'Untying the hostage', laptop: 'Starting the download', drive: 'Taking the drive', charge: 'Planting the charge', radio: 'Calling in' };

/**
 * @param {object} opts
 * @param {object} opts.session   net/host.js or net/client.js (its operation, hostage, supply, local)
 * @param {object} opts.events
 * @param {object} opts.hud       ui/hud.js (feed lines)
 * @param {object} opts.markers   ui/markers.js
 * @param {object} opts.ring      ui/markers.js
 * @param {boolean} opts.hosting  solo, or the co-op host (who retries a failed mission)
 * @param {(owner:number) => string} opts.nameOf
 * @param {object} [opts.audio]   for the radio's click
 * @param {(action:string) => string} [opts.glyph] what to call a button ("F", or "X" on a controller)
 */
export function createObjectiveHud({ session, events, hud, markers, ring, hosting, nameOf, audio = null, glyph = (a) => ({ interact: 'F', reload: 'R' })[a] }) {
  const el = (id) => document.getElementById(id);
  const box = el('course');
  const title = el('courseTitle');
  const time = el('courseTime');
  const info = el('courseInfo');
  const bar = el('courseBar');
  const barFill = el('courseBarFill');
  const prompt = el('prompt');
  const radio = el('radioLine');
  const downBox = el('missionDown');
  const downTitle = el('missionDownTitle');
  const downInfo = el('missionDownInfo');
  const downHint = el('missionDownHint');
  const grenades = el('grenades');
  const op = session.operation;
  const mission = op.mission;
  const level = session.level.expanded;
  const sites = level.sites;
  const me = session.me;
  const esc = hud.esc;
  const last = {};
  const set = (node, key, value, prop = 'textContent') => {
    if (last[key] === value) return;
    last[key] = value;
    node[prop] = value;
  };
  const found = new Set();   // site indices you've been close enough to see (this screen only)
  let radioTimer = 0;
  box.hidden = false;
  box.classList.add('mission');

  // ---- news
  const who = (owner) => (owner === me ? 'You' : `<b style="color:${SLOT_COLORS[owner] ?? '#fff'}">${esc(nameOf(owner))}</b>`);
  const offs = [
    events.on('mission:radio', (e) => {
      radio.innerHTML = `<b>${esc(e.from ?? 'Overlord')}</b>${esc(e.text)}`;
      radio.classList.add('on');
      radioTimer = 7;
      audio?.play('radio', { volume: 0.5 });
    }),
    events.on('mission:checkpoint', () => hud.feedLine('<b>Checkpoint reached</b>', 'objective')),
    events.on('objective:freed', (e) => hud.feedLine(`${who(e.by)} freed the hostage`, 'objective')),
    events.on('objective:download', () => hud.feedLine('Download started: defend the laptop', 'objective')),
    events.on('objective:downloaded', () => hud.feedLine('<b>Download complete</b>: take the drive', 'objective')),
    events.on('objective:pickup', (e) => hud.feedLine(`${who(e.by)} took the drive`, 'objective')),
    events.on('objective:dropped', () => hud.feedLine('<b>The drive was dropped</b>', 'objective warn')),
    events.on('objective:planted', (e) => hud.feedLine(`${who(e.by)} planted a charge: ${Math.round(e.fuse)} s`, 'objective')),
    events.on('objective:destroyed', (e) => hud.feedLine(`<b>Cache destroyed</b>${e.left ? ` · ${e.left} to go` : ''}`, 'objective')),
    events.on('objective:hold', () => hud.feedLine('Radio on: <b>hold the area</b>', 'objective')),
    events.on('extract:called', () => hud.feedLine('<b>Helicopter inbound</b>', 'objective')),
    events.on('extract:landed', () => hud.feedLine('<b>The helicopter is down</b>: get aboard', 'objective')),
    events.on('hostage:down', () => hud.feedLine(`<b>The hostage is down!</b> Hold ${glyph('interact')} to revive them`, 'objective warn')),
    events.on('hostage:revive', (e) => hud.feedLine(`${who(e.by)} got the hostage up`, 'objective')),
    events.on('hostage:wait', () => hud.feedLine('The hostage can’t keep up: <b>wait for them</b>', 'objective warn')),
    events.on('director:wave', (e) => { if (e.label) hud.feedLine(`Enemy reinforcements: ${esc(e.label)}`, 'warn'); }),
    events.on('mission:restart', () => { found.clear(); }),
  ];

  // ---- what's where, worked out from the mission's view (presentation only)
  const stage = (v) => mission.stages[v.stage] ?? null;
  const candidates = (v) => (stage(v)?.sites ?? []).map((id) => sites.findIndex((s) => s.id === id)).filter((i) => i >= 0);
  const lzOf = (v) => level.lzs.find((l) => l.id === (v.lz ?? stage(v)?.lz)) ?? level.lzs[0];
  const carrierPos = (v) => {
    if (v.carrier === null) return null;
    if (v.carrier === me) return session.local.soldier.state.pos;
    return session.teammates.list.find((m) => m.owner === v.carrier)?.view.pos ?? null;
  };

  /** What you could hold F at (the same spots the simulation offers, from what this screen knows). */
  function usable(v) {
    const out = [];
    const h = session.hostage?.view;
    if (v.kind === 'rescue' && v.phase === 'find' && h?.captive) out.push({ pos: h.pos, kind: 'free', label: 'Free the hostage', range: 1.7 });
    if (h && h.bleeding) out.push({ pos: h.pos, kind: 'revive', label: 'Revive the hostage', range: 1.8 });
    if (v.kind === 'intel' && (v.phase === 'find' || v.phase === 'collect')) {
      const s = sites[v.sites[0]];
      out.push({ pos: posOf(s), kind: v.phase === 'find' ? 'laptop' : 'drive', label: v.phase === 'find' ? 'Start the download' : 'Take the drive' });
    }
    if (v.drop) out.push({ pos: v.drop, kind: 'drive', label: 'Take the drive' });
    if (v.kind === 'sabotage') {
      v.sites.forEach((i, k) => { if (!((v.done | v.armed) & (1 << k))) out.push({ pos: posOf(sites[i]), kind: 'charge', label: 'Plant a charge', range: 1.9 }); });
    }
    if (v.kind === 'hold' && v.phase === 'reach') out.push({ pos: posOf(sites[v.sites[0]]), kind: 'radio', label: 'Switch on the radio', range: 1.8 });
    if (v.kind === 'extract' && v.phase === 'call') {
      const lz = lzOf(v);
      out.push({ pos: { x: lz.radio[0], y: lz.at[1] ?? 0, z: lz.radio[1] }, kind: 'radio', label: 'Call the helicopter' });
    }
    for (const c of session.supply?.list ?? []) {
      out.push({ pos: c.pos, kind: 'crate', label: c.left > 0 ? `Ammo (${c.left} left)` : 'Ammo (empty)', range: SUPPLY.range, empty: c.left <= 0 });
    }
    return out;
  }

  function instruction(v) {
    const carrying = v.carrier !== null ? (v.carrier === me ? 'You have the drive' : `${nameOf(v.carrier)} has the drive`) : v.drop ? 'The drive is on the ground: pick it up' : '';
    const hostage = session.hostage?.view;
    switch (`${v.kind}:${v.phase}`) {
      case 'rescue:find': return 'Find the hostage and free them';
      case 'intel:find': return 'Find the laptop';
      case 'intel:download': return v.contested ? 'Download stalled: clear the enemies from the laptop!' : 'Defend the laptop while it downloads';
      case 'intel:collect': return 'Take the drive';
      case 'sabotage:plant': {
        const n = v.sites.length;
        let done = 0;
        for (let k = 0; k < n; k++) if (v.done & (1 << k)) done++;
        return `Destroy the weapons caches: ${done} of ${n}`;
      }
      case 'hold:reach': return `Get to ${sites[v.sites[0]]?.label ?? 'the position'} and switch on the radio`;
      case 'hold:hold': return v.contested ? 'Enemies in the area: push them out!' : 'Hold the area';
      case 'extract:call': return `Get to the landing zone and call the helicopter${carrying ? ` · ${carrying}` : ''}`;
      case 'extract:inbound': return `Hold out: helicopter inbound${carrying ? ` · ${carrying}` : ''}`;
      case 'extract:landing': return 'The helicopter is landing';
      case 'extract:landed': {
        const cargo = hostage ? ' with the hostage' : v.carrier !== null || v.drop ? ' with the drive' : '';
        return `Everyone aboard${cargo}`;
      }
      case 'extract:leaving': return 'Lifting off…';
      default: return '';
    }
  }

  function progressOf(v) {
    if (v.kind === 'intel' && v.phase === 'download') return v.progress;
    if (v.kind === 'hold' && v.phase === 'hold') return v.progress;
    if (v.kind === 'sabotage') return v.progress;
    if (v.kind === 'extract' && v.phase === 'inbound') return 1 - v.timer / Math.max(1, v.heli.inbound || HELI.inbound);
    return null;
  }

  function timerText(v) {
    if (v.kind === 'extract' && v.phase === 'inbound') return `${Math.ceil(v.timer)} s`;
    if (v.kind === 'intel' && v.phase === 'download') return `${Math.ceil(v.timer)} s`;
    if (v.kind === 'hold' && v.phase === 'hold') return `${Math.ceil(v.timer)} s`;
    if (v.kind === 'sabotage' && v.armed) return `${Math.ceil(v.timer)} s`;
    return '';
  }

  // ---- markers
  function updateMarks(v, here) {
    const { mark, metres } = markers;
    const h = session.hostage?.view;
    // Candidate sites: "?" until you've been close enough to see; then what's there.
    if (['rescue', 'intel', 'sabotage'].includes(v.kind) && ['find', 'plant'].includes(v.phase)) {
      const real = new Set(v.sites);
      candidates(v).forEach((i) => {
        const at = posOf(sites[i]);
        if (flat(at, here) < REVEAL) found.add(i);
        if (!found.has(i)) { mark('objective search', lift(at, 2.4), '?', metres(at)); return; }
        if (!real.has(i)) return; // nothing here
        if (v.kind === 'sabotage') {
          const k = v.sites.indexOf(i);
          if ((v.done | v.armed) & (1 << k)) return; // (an armed one says "Get clear!", below)
          mark('objective', lift(at, 1.6), 'Cache', metres(at));
        } else if (v.kind === 'rescue' && h) mark('objective', lift(h.pos, 1.7), 'Hostage', metres(h.pos));
        else mark('objective', lift(at, 1.4), 'Laptop', metres(at));
      });
    }
    if (v.kind === 'intel' && (v.phase === 'download' || v.phase === 'collect')) {
      const at = posOf(sites[v.sites[0]]);
      mark(v.contested ? 'objective warn' : 'objective', lift(at, 1.4), v.phase === 'download' ? (v.contested ? 'Defend!' : 'Laptop') : 'Drive', metres(at));
    }
    if (v.kind === 'sabotage' && v.armed) {
      v.sites.forEach((i, k) => { if ((v.armed & (1 << k)) && found.has(i)) mark('objective warn', lift(posOf(sites[i]), 1.6), 'Get clear!', `${Math.ceil(v.timer)} s`); });
    }
    if (v.kind === 'hold') {
      const at = posOf(sites[v.sites[0]]);
      mark(v.contested ? 'objective warn' : 'objective', lift(at, 2.5), v.phase === 'reach' ? 'Radio' : 'Hold here', metres(at));
    }
    if (v.kind === 'extract') {
      const lz = lzOf(v);
      if (v.phase === 'call') mark('objective', { x: lz.radio[0], y: (lz.at[1] ?? 0) + 1.8, z: lz.radio[1] }, 'Call the helicopter', metres(posOf(lz)));
      else mark('objective lz', lift(posOf(lz), 1.5), 'Landing zone', v.phase === 'inbound' ? `${metres(posOf(lz))} · ${Math.ceil(v.timer)} s` : metres(posOf(lz)));
    }
    // The cargo, once it's on the move.
    if (h && !h.captive && !h.dead) {
      if (h.bleeding) mark('revive', lift(h.pos, 0.9), 'Revive the hostage', `${metres(h.pos)} · ${Math.ceil(h.bleedLeft)} s`);
      else if (flat(h.pos, here) > 8) mark('objective cargo', lift(h.pos, 2.0), h.waiting ? 'Hostage (waiting)' : 'Hostage', metres(h.pos));
    }
    if (v.drop) mark('objective warn', lift(v.drop, 0.8), 'Drive', metres(v.drop));
    const cp = carrierPos(v);
    if (cp && v.carrier !== me) mark('objective cargo', lift(cp, 2.3), 'Drive', metres(cp), SLOT_COLORS[v.carrier] ?? null, false);
    // Ammo crates nearby, when you're running low.
    const g = session.local.soldier.arsenal;
    const low = !g.options.infiniteAmmo && g.guns.some((gun) => gun.reserve < gun.def.reserve * 0.5);
    if (low) {
      for (const c of session.supply?.list ?? []) {
        if (c.left > 0 && flat(c.pos, here) < 35) mark('crate', lift(c.pos, 1.3), 'Ammo', metres(c.pos), null, false);
      }
    }
  }

  // ---- "Hold F"
  function updatePrompt(v, here) {
    const local = session.local;
    const standing = !local.health.state.down && !local.health.state.dead;
    let best = null;
    if (standing && v.state === 'active') {
      for (const s of usable(v)) {
        const d = flat(s.pos, here);
        if (d > (s.range ?? INTERACT.range) || Math.abs(s.pos.y - here.y) > INTERACT.height) continue;
        if (!best || d < best.d) best = { ...s, d };
      }
    }
    const full = best?.kind === 'crate' && local.soldier.arsenal.full();
    const text = !best ? '' : best.empty ? 'Ammo crate: empty' : full ? 'Ammo crate: you’re full' : `Hold ${glyph('interact')}: ${best.label}`;
    set(prompt, 'p', text);
    prompt.classList.toggle('on', !!text);
    if (local.using && local.useProgress > 0) ring.want(local.useProgress, USING[local.using] ?? `Hold ${glyph('interact')}`);
  }

  // ---- mission failed
  function updateDown(v) {
    const failed = v.state === 'failed';
    downBox.hidden = !failed;
    if (!failed) return;
    set(downTitle, 'dt', 'Mission failed');
    set(downInfo, 'di', v.reason === 'hostage' ? 'The hostage didn’t make it.' : 'Nobody is left standing.');
    const from = v.checkpoint ? `checkpoint ${v.checkpoint}` : 'the start';
    set(downHint, 'dh', hosting ? `Press ${glyph('reload')} to retry from ${from}` : `Waiting for the host to retry from ${from}`);
  }

  return {
    update(dt) {
      const v = op.view;
      radioTimer -= dt;
      if (radioTimer <= 0) radio.classList.remove('on');
      // Grenades left (next to your ammo).
      const ar = session.local.soldier.arsenal;
      set(grenades, 'g', ar.options.infiniteAmmo ? '' : `${'●'.repeat(ar.state.grenades)}${'○'.repeat(Math.max(0, 2 - ar.state.grenades))} G`);
      if (!v) return;
      const here = session.local.soldier.state.pos;
      set(title, 't', `${mission.title.toUpperCase()} · ${mission.kind.toUpperCase()}`);
      set(time, 'tm', formatTime(v.time));
      set(info, 'i', v.state === 'complete' ? 'Mission complete' : instruction(v));
      const p = v.state === 'active' ? progressOf(v) : null;
      bar.hidden = p === null;
      if (p !== null) set(barFill.style, 'b', `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`, 'width');
      bar.classList.toggle('warn', !!v.contested);
      set(box, 'c', v.state === 'active' && v.stage > 0 ? 'Checkpoint' : '', 'title');
      if (v.state === 'active') updateMarks(v, here);
      updatePrompt(v, here);
      updateDown(v);
    },
    dispose() {
      for (const off of offs) off();
      box.hidden = true;
      box.classList.remove('mission');
      bar.hidden = true;
      prompt.classList.remove('on');
      prompt.textContent = '';
      radio.classList.remove('on');
      downBox.hidden = true;
      grenades.textContent = '';
    },
  };
}

