// Proxies: other soldiers on a co-op client, as seen through snapshots.
//
// On the host, enemies and teammates are real simulated soldiers. On a client
// they're stand-ins ("proxies"), puppets moved to wherever the snapshots say.
// Each proxy has:
//   - hitboxes, so your bullets hit what's on your screen (favour the shooter)
//   - a body, so you bump into them just as you would on the host
//   - a `view` summary, the same shape the host's soldiers have, so the drawing,
//     HUD and sound code can't tell the difference
//
// INTERPOLATION: proxies are drawn about 0.1 s in the past, sliding smoothly
// between the two snapshots either side of that moment. Snapshots arrive 20
// times a second, unevenly, sometimes not at all; drawing slightly in the past
// means there's (almost) always a "next" snapshot to slide towards. It's like
// watching a live broadcast on a short delay: smooth, at the cost of a moment's lag.
//
// Runs in Node (the tests use proxies too).

import { createHitboxes } from '../player/hitboxes.js';
import { BODY, bodyCollider, bodyHalfHeight } from '../player/controller.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;

/** Blend two decoded states: positions and angles slide, on/off things switch halfway. */
export function blend(a, b, t) {
  if (!b || a === b) return a;
  const near = t < 0.5 ? a : b;
  return {
    ...near,
    pos: { x: lerp(a.pos.x, b.pos.x, t), y: lerp(a.pos.y, b.pos.y, t), z: lerp(a.pos.z, b.pos.z, t) },
    yaw: a.yaw + wrap(b.yaw - a.yaw) * t,
    pitch: lerp(a.pitch, b.pitch, t),
    speed: lerp(a.speed, b.speed, t),
    awareness: a.awareness === undefined ? undefined : lerp(a.awareness, b.awareness, t),
    laserCharge: a.laserCharge === undefined ? undefined : lerp(a.laserCharge, b.laserCharge, t),
  };
}

/**
 * @param {object} opts
 * @param {object} opts.world, opts.registry
 * @param {string} opts.id      'e3' or 'p1'
 * @param {number|string} opts.owner
 * @param {'enemy'|'player'} opts.kind
 * @param {string} opts.weapon
 */
export function createProxy({ world, registry, id, owner, kind, role = null, weapon, callsign = null, pos = { x: 0, y: 0, z: 0 } }) {
  const entity = { kind, id, owner, role, proxy: true };
  const hitboxes = createHitboxes(world, registry, entity, { flatZones: kind === 'player' });
  const body = world.createCollider(bodyCollider(BODY.standHeight)); // exactly the shape the host's soldiers have
  const view = {
    id, owner, role, weapon, callsign,
    pos: { ...pos }, prev: { ...pos }, yaw: 0, pitch: 0,
    crouched: false, speed: 0, sprinting: false, grounded: true, ready: false, reloading: false,
    alert: 'calm', awareness: 0, inCombat: false, fresh: false, target: null, sees: false,
    laserOn: false, laserCharge: 0, hp: 100, down: false, bleeding: false, dead: false, marked: false, callin: 0,
    bleedLeft: 0, reviving: 0, reviver: null, using: null, useProgress: 0,
  };
  let crouched = null;

  const proxy = {
    id, owner, kind, role, entity, view, hitboxes, body,
    /** Where the snapshots say it is now (one call per client tick). */
    set(s) {
      Object.assign(view.prev, view.pos);
      Object.assign(view.pos, s.pos);
      for (const k of ['yaw', 'pitch', 'crouched', 'speed', 'sprinting', 'grounded', 'ready', 'reloading', 'alert',
        'awareness', 'inCombat', 'fresh', 'target', 'sees', 'laserOn', 'laserCharge', 'hp', 'down', 'bleeding', 'dead', 'weapon', 'marked', 'callin',
        'bleedLeft', 'reviving', 'reviver', 'using', 'useProgress']) {
        if (s[k] !== undefined) view[k] = s[k];
      }
      if (kind === 'player') view.down = !!(s.down || s.bleeding);
      hitboxes.setEnabled(!view.dead);
      hitboxes.sync(view.pos, view.yaw, view.crouched);
      const h = view.crouched ? BODY.crouchHeight : BODY.standHeight;
      if (crouched !== view.crouched) {
        crouched = view.crouched;
        body.setHalfHeight(bodyHalfHeight(h));
      }
      body.setTranslation({ x: view.pos.x, y: view.pos.y + h / 2, z: view.pos.z });
      body.setEnabled(!view.dead);
    },
    /** Jump straight there (first sighting, or after a restart). */
    place(s) {
      proxy.set(s);
      Object.assign(view.prev, view.pos);
    },
    remove() {
      hitboxes.remove();
      world.removeCollider(body, false);
    },
  };
  return proxy;
}
