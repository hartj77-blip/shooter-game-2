// The call-in HUD: your charge meter (by the grenades), what the radio says
// ("Mortar strike inbound"), why a call was refused, and markers: enemies a
// recon drone has marked, a supply drop with ammo in it, and a mortar's mark
// (everyone gets that warning, enemies included: they see the red smoke).
//
// Presentation only: it reads your call-in's charge (`session.local.callin`),
// the call-ins' `view` and enemies' `view.marked`, and listens to `callin:*`
// events. Works the same in solo play and co-op.
//
// Talks to: ui/hud.js (toasts, the feed), ui/markers.js, the session.

import { CALLINS } from '../game/callins.js';
import { CALLIN_NAMES } from './names.js';

const REFUSED = {
  charging: (name, pct) => `${name}: ${pct}% charged`,
  range: () => `Out of range: point at the ground within ${CALLINS.range} m`,
  sky: () => 'Needs open sky above the spot',
};

/**
 * @param {object} opts
 * @param {object} opts.session
 * @param {object} opts.events
 * @param {object} opts.hud      ui/hud.js (toast, feedLine, esc)
 * @param {object} opts.markers  ui/markers.js
 * @param {Function} opts.nameOf owner -> callsign
 * @param {Function} [opts.glyph] action -> key name ("T", "View")
 */
export function createCallinHud({ session, events, hud, markers, nameOf, glyph = () => 'T' }) {
  const box = document.getElementById('callin');
  const name = document.getElementById('callinName');
  const fill = document.getElementById('callinFill');
  const me = session.me;
  const mine = () => session.local.callin;
  const nice = (kind) => CALLIN_NAMES[kind] ?? kind;
  const last = {};
  box.hidden = false;

  const offs = [
    events.on('callin:refused', (e) => {
      if (e.owner !== me) return;
      hud.toast(REFUSED[e.reason]?.(nice(e.kind), Math.floor((mine()?.charge ?? 0) * 100)) ?? 'Not now', 2.5);
    }),
    events.on('callin:ready', (e) => {
      if (e.owner === me) hud.toast(`${nice(e.kind)} ready · ${glyph('callin')}`, 2.5);
    }),
    events.on('callin:call', (e) => {
      const who = e.owner === me ? 'You' : `<b>${hud.esc(nameOf(e.owner))}</b>`;
      hud.feedLine?.(`${who} called in a <b>${nice(e.kind).toLowerCase()}</b>`, 'objective');
    }),
  ];

  function update() {
    // ---- the meter
    const c = mine();
    if (c) {
      const pct = Math.floor(c.charge * 100);
      const ready = pct >= 100;
      const text = ready ? `${nice(c.kind).toUpperCase()} · ${glyph('callin')}` : `${nice(c.kind).toUpperCase()} · ${pct}%`;
      if (last.text !== text) { last.text = text; name.textContent = text; }
      if (last.pct !== pct) { last.pct = pct; fill.style.width = `${pct}%`; }
      if (last.ready !== ready) { last.ready = ready; box.classList.toggle('ready', ready); }
    }
    // ---- markers
    for (const e of session.enemies?.list ?? []) {
      const v = e.view;
      if (!v.marked || v.dead) continue;
      markers.mark('marked', { x: v.pos.x, y: v.pos.y + (v.crouched ? 1.5 : 2.05), z: v.pos.z }, '', '', null, false);
    }
    for (const ci of session.callins?.view ?? []) {
      if (ci.kind === 'supply' && ci.phase === 'landed' && ci.left > 0) {
        markers.mark('crate', { x: ci.pos.x, y: ci.pos.y + 1.1, z: ci.pos.z }, 'Supply drop', `${markers.metres(ci.pos)} · ${ci.left} left`, null, false);
      } else if (ci.kind === 'mortar' && ci.phase === 'active' && ci.shells > 0) {
        markers.mark('objective warn', { x: ci.pos.x, y: ci.pos.y + 1, z: ci.pos.z }, 'Mortar', markers.metres(ci.pos));
      }
    }
  }

  return {
    update,
    dispose() {
      for (const off of offs) off();
      box.hidden = true;
    },
  };
}
