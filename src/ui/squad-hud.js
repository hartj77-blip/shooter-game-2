// The squad HUD, for co-op games: who's who, who's hurt, who needs help.
//
//   - the roster (top left): each player's name in their slot colour, a
//     health bar, and DOWN 23s / OUT when things go wrong
//   - markers floating in the world: teammates' names over their heads, a
//     red cross over anyone bleeding out ("hold F" when you're close enough),
//     and pings, with distances. Markers off the edge of the screen stick to
//     the edge, so you can always tell which way to go.
//   - a progress ring while you revive someone (or someone revives you)
//   - your own situation: bleeding out (and for how long), out and watching a
//     teammate, or mission failed
//   - squad news in the kill feed: who went down, who got who back up
//
// Like the rest of the HUD it only reads state and listens to events. Callsigns
// come from other players, so they only ever reach the page as text.

import * as THREE from 'three';
import { SLOT_COLORS } from '../net/room.js';
import { PING } from '../game/pings.js';
import { REVIVE } from '../game/revive.js';
import { ROLES } from '../ai/enemy-data.js';

const EDGE = 60;   // px: markers off screen stay this far inside the sides...
const BOTTOM = 130; // ...and clear of the speed readout and gun panel at the bottom

/**
 * @param {object} opts
 * @param {object} opts.session   net/host.js or net/client.js
 * @param {THREE.Camera} opts.camera
 * @param {object} opts.events
 * @param {object} opts.hud       ui/hud.js (for feed lines)
 * @param {boolean} opts.hosting  are we the host (who restarts a failed mission)?
 */
export function createSquadHud({ session, camera, events, hud, hosting }) {
  const el = (id) => document.getElementById(id);
  const squad = el('squad');
  const marks = el('marks');
  const ring = el('ring');
  const ringFill = el('ringFill');
  const ringText = el('ringText');
  const down = el('coopDown');
  const downTitle = el('coopDownTitle');
  const downInfo = el('coopDownInfo');
  const downHint = el('coopDownHint');
  squad.hidden = false;

  const me = session.me;
  const nameOf = (owner) => {
    if (owner === me) return session.local.callsign ?? `Player ${owner + 1}`;
    return session.teammates.list.find((m) => m.owner === owner)?.view.callsign ?? `Player ${owner + 1}`;
  };
  const esc = hud.esc;
  const who = (owner) => `<b style="color:${SLOT_COLORS[owner] ?? '#fff'}">${esc(nameOf(owner))}</b>`;

  // ---- squad news
  events.on('player:down', (e) => { if (e.owner !== me && e.revivable) hud.feedLine(`${who(e.owner)} is down!`); });
  events.on('player:dead', (e) => { if (e.owner !== me) hud.feedLine(`${who(e.owner)} bled out`); });
  events.on('player:revive', (e) => hud.feedLine(e.by === me ? `You got ${who(e.owner)} back up` : `${who(e.by)} got ${e.owner === me ? 'you' : who(e.owner)} back up`));
  events.on('player:joined', (e) => { if (e.owner !== me) hud.feedLine(`${who(e.owner)} joined`); });
  events.on('player:left', (e) => hud.feedLine(`<b>${esc(e.callsign ?? 'A teammate')}</b> left`));
  events.on('enemy:down', (e) => {
    if (typeof e.owner === 'number' && e.owner !== me) hud.feedLine(`${who(e.owner)} ▸ ${esc(ROLES[e.role]?.name ?? 'Enemy')}`);
  });

  // ---- pings: one per player at a time
  const pings = new Map(); // owner -> { kind, id, point, age }
  events.on('ping:mark', (e) => pings.set(e.owner, { ...e, age: 0 }));

  // ---- the roster
  const rows = new Map(); // owner -> { li, name, state, fill }
  function rowFor(owner) {
    let r = rows.get(owner);
    if (r) return r;
    const li = document.createElement('li');
    li.style.setProperty('--c', SLOT_COLORS[owner] ?? '#fff');
    const dot = document.createElement('i');
    dot.className = 'dot';
    const name = document.createElement('b');
    const state = document.createElement('span');
    state.className = 'state';
    const bar = document.createElement('span');
    bar.className = 'hp';
    const fill = document.createElement('i');
    bar.append(fill);
    li.append(dot, name, state, bar);
    r = { li, name, state, fill, last: '' };
    rows.set(owner, r);
    return r;
  }

  /** Everyone, you included, as { owner, view } (your own "view" comes from your health). */
  function people() {
    const h = session.local.health.state;
    const mine = {
      owner: me, callsign: nameOf(me), hp: h.hp, down: h.down || h.bleeding, bleeding: h.bleeding, dead: h.dead,
      bleedLeft: h.bleedLeft, reviving: session.local.view?.reviving ?? h.reviving ?? 0,
    };
    return [{ owner: me, view: mine }, ...session.teammates.list.map((m) => ({ owner: m.owner, view: m.view }))]
      .sort((a, b) => a.owner - b.owner);
  }

  function updateRoster(list) {
    const keep = new Set();
    list.forEach(({ owner, view: v }, i) => {
      keep.add(owner);
      const r = rowFor(owner);
      if (squad.children[i] !== r.li) squad.insertBefore(r.li, squad.children[i] ?? null);
      const name = v.callsign ?? nameOf(owner);
      const state = v.dead ? 'Out' : v.bleeding ? `Down ${Math.ceil(v.bleedLeft)}s` : v.down ? 'Down' : owner === me ? 'You' : '';
      const key = `${name}|${state}|${Math.round(v.hp)}`;
      if (r.last === key) return;
      r.last = key;
      r.name.textContent = name;
      r.state.textContent = state;
      r.fill.style.width = `${Math.max(0, Math.min(100, v.hp))}%`;
      r.li.classList.toggle('is-down', !!v.down && !v.dead);
      r.li.classList.toggle('is-dead', !!v.dead);
    });
    for (const [owner, r] of rows) if (!keep.has(owner)) { r.li.remove(); rows.delete(owner); }
  }

  // ---- markers
  const pool = [];
  let used = 0;
  const v3 = new THREE.Vector3();
  /** A marker at a world position. `stick`: off screen, hold it at the edge (otherwise hide it). */
  function mark(cls, pos, text, sub = '', color = null, stick = true) {
    let m = pool[used];
    if (!m) {
      const d = document.createElement('div');
      const label = document.createElement('span');
      const small = document.createElement('small');
      d.append(label, small);
      marks.append(d);
      m = { d, label, small, key: '' };
      pool.push(m);
    }
    used++;
    v3.set(pos.x, pos.y, pos.z).project(camera);
    const behind = v3.z > 1;
    let x = (v3.x + 1) / 2;
    let y = (1 - v3.y) / 2;
    if (behind) { x = 1 - x; y = 1; } // behind you: show it along the bottom edge, on the side it's on
    const w = innerWidth, h = innerHeight;
    const off = behind || x < 0 || x > 1 || y < 0 || y > 1;
    if (off && !stick) { used--; return; }
    const px = Math.min(w - EDGE, Math.max(EDGE, x * w));
    const py = Math.min(h - BOTTOM, Math.max(EDGE + 20, y * h));
    const key = `${cls}|${text}|${sub}|${color}|${off}`;
    if (m.key !== key) {
      m.key = key;
      m.d.className = `mark ${cls}${off ? ' edge' : ''}`;
      m.label.textContent = text;
      m.small.textContent = sub;
      if (color) m.d.style.setProperty('--c', color);
      else m.d.style.removeProperty('--c');
    }
    m.d.hidden = false;
    m.d.style.transform = `translate(${px.toFixed(0)}px, ${py.toFixed(0)}px) translate(-50%, -100%)`;
  }
  const metres = (p) => `${Math.round(camera.position.distanceTo(v3.set(p.x, p.y, p.z)))} m`;

  function updateMarks(dt, list) {
    used = 0;
    const me3 = session.local.soldier.state.pos;
    const standing = !session.local.health.state.down && !session.local.health.state.dead;
    for (const { owner, view: v } of list) {
      if (owner === me || v.dead) continue;
      const head = { x: v.pos.x, y: v.pos.y + (v.down ? 0.9 : v.crouched ? 1.5 : 2.1), z: v.pos.z };
      if (v.bleeding) {
        const near = standing && Math.hypot(v.pos.x - me3.x, v.pos.z - me3.z) <= REVIVE.range;
        mark('revive', head, near ? 'Hold F to revive' : `Revive ${v.callsign ?? ''}`, near ? `${Math.ceil(v.bleedLeft)} s` : `${metres(head)} · ${Math.ceil(v.bleedLeft)} s`);
      } else {
        mark('tag', head, v.callsign ?? nameOf(owner), '', SLOT_COLORS[owner], false);
      }
    }
    for (const [owner, p] of pings) {
      p.age += dt;
      if (p.age > PING.life) { pings.delete(owner); continue; }
      let at = p.point;
      if (p.kind === 'enemy') {
        const e = session.enemies.list.find((x) => x.id === p.id);
        if (!e || e.view.dead) { pings.delete(owner); continue; }
        at = { x: e.view.pos.x, y: e.view.pos.y + 2.2, z: e.view.pos.z }; // follows them
      }
      const by = owner === me ? 'You' : nameOf(owner);
      mark(`ping ${p.kind}`, { x: at.x, y: at.y + (p.kind === 'place' ? 0.4 : 0), z: at.z }, p.kind === 'enemy' ? 'Enemy' : 'Here', `${metres(at)} · ${by}`);
    }
    for (let i = used; i < pool.length; i++) pool[i].d.hidden = true;
  }

  // ---- the ring, and your own situation
  function updateRing(list) {
    const mine = list.find((x) => x.owner === me).view;
    let progress = 0;
    let text = '';
    if (mine.bleeding && mine.reviving > 0) {
      progress = mine.reviving;
      text = 'Getting you up';
    } else {
      const helping = list.find((x) => x.owner !== me && x.view.reviver === me && x.view.reviving > 0);
      if (helping) {
        progress = helping.view.reviving;
        text = `Reviving ${helping.view.callsign ?? ''}`;
      }
    }
    ring.hidden = progress <= 0;
    if (!ring.hidden) {
      ringFill.style.strokeDashoffset = String(176 * (1 - progress));
      ringText.textContent = text;
    }
  }

  function updateDown(list, watching) {
    const mine = list.find((x) => x.owner === me).view;
    const enc = session.encounter;
    let title = '', info = '', hint = '';
    if (enc?.state === 'down') {
      title = 'Mission failed';
      info = `${enc.total - enc.remaining} of ${enc.total} hostiles down`;
      hint = hosting ? 'Press R to restart for everyone' : 'Waiting for the host to restart';
    } else if (mine.dead) {
      title = 'Out until the next fight';
      info = watching ? `Watching ${watching}` : 'Everyone else is down too';
      hint = watching ? 'Click to watch someone else' : '';
    } else if (mine.bleeding) {
      title = "You're down";
      info = `Bleeding out in ${Math.ceil(mine.bleedLeft)} s`;
      hint = 'A teammate can revive you: hold on! (Z to ping)';
    }
    down.hidden = !title;
    if (title) {
      downTitle.textContent = title;
      downInfo.textContent = info;
      downHint.textContent = hint;
    }
  }

  return {
    /** @param {string|null} watching the callsign of the teammate you're spectating */
    update(dt, { watching = null } = {}) {
      const list = people();
      updateRoster(list);
      updateMarks(dt, list);
      updateRing(list);
      updateDown(list, watching);
    },
    dispose() {
      squad.replaceChildren();
      squad.hidden = true;
      marks.replaceChildren();
      ring.hidden = true;
      down.hidden = true;
    },
  };
}
