// Cover: places to hide from the player.
//
// When the level loads, we look at every walkable cell beside something solid
// and shine two short sideways rays at it:
//   - at knee-to-waist height (0.9 m): something there means LOW cover: crouch behind it
//   - at head height (1.55 m):          something there too means HIGH cover: stand behind it
// Those spots become "cover points", each remembering which way its wall faces.
// High cover also remembers "peek" cells just past the wall's edge, where you
// can lean out to shoot.
//
// In a fight, an enemy picking cover asks (with a couple of rays each):
//   1. Safe?    Is the player's line of sight to my (hidden) head blocked here?
//   2. Useful?  Can I pop up, or step out, and shoot back from here?
// plus "is it a sensible distance for my weapon?", "is it on the way?" and
// "is a squad-mate already there?". The best score wins.
//
// See docs/lessons/09-pathfinding-and-cover.md.

import { RAPIER } from '../world/physics.js';
import { SIGHT } from '../world/groups.js';
import { DIRS } from './nav-grid.js';

export const COVER = {
  low: 0.9,          // the height of the low ray
  high: 1.55,        // the height of the high ray
  reach: 0.75,       // how far the rays look for a wall
  spacing: 1.2,      // cover points closer together than this (facing the same way) are merged
  hideLow: 0.95,     // head height crouched behind low cover
  hideHigh: 1.6,     // head height standing behind high cover
  peekHead: 1.62,    // head height when popping up to shoot
};

const BUCKET = 4; // metres: cover points are filed in a grid of 4 m squares for quick lookups

/** Finds every cover point in the level. Call once, after the nav grid. */
export function buildCover(world, nav) {
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const points = [];
  const buckets = new Map();
  const key = (x, z) => `${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`;
  const hits = (x, y, z, dx, dz, len) => {
    ray.origin = { x, y, z };
    ray.dir = { x: dx, y: 0, z: dz };
    return world.castRay(ray, len, true, undefined, SIGHT) !== null;
  };

  function nearbyPoints(x, z, r) {
    const out = [];
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    const n = Math.ceil(r / BUCKET);
    for (let i = bx - n; i <= bx + n; i++) {
      for (let j = bz - n; j <= bz + n; j++) {
        const list = buckets.get(`${i},${j}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }

  for (let c = 0; c < nav.count; c++) {
    if (nav.component[c] !== nav.main || nav.degree(c) === 8) continue;
    const x = nav.X[c], y = nav.Y[c], z = nav.Z[c];
    for (let d = 0; d < 8; d += 2) {
      const [dx, dz] = DIRS[d];
      if (!hits(x, y + COVER.low, z, dx, dz, COVER.reach)) continue;
      const high = hits(x, y + COVER.high, z, dx, dz, COVER.reach);
      // Merge with a nearby point facing the same way.
      const clash = nearbyPoints(x, z, COVER.spacing).some((p) => (
        Math.hypot(p.pos.x - x, p.pos.z - z) < COVER.spacing && p.dir.x * dx + p.dir.z * dz > 0.7 && Math.abs(p.pos.y - y) < 1
      ));
      if (clash) continue;
      const point = { id: points.length, cell: c, pos: { x, y, z }, dir: { x: dx, z: dz }, high, peeks: [] };
      if (high) {
        // Where can you lean out? Try stepping sideways along the wall until the head-height ray misses it.
        for (const side of [-1, 1]) {
          for (const step of [0.6, 0.9, 1.2]) {
            const px = x + -dz * side * step, pz = z + dx * side * step;
            const pc = nav.nearest({ x: px, y, z: pz }, { radius: 0.35 });
            if (pc < 0) break;
            if (!hits(nav.X[pc], nav.Y[pc] + COVER.high, nav.Z[pc], dx, dz, COVER.reach + 0.3)) {
              point.peeks.push(pc);
              break;
            }
          }
        }
      }
      points.push(point);
      const k = key(x, z);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(point);
    }
  }

  const clear = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return true;
    ray.origin = { x: from.x, y: from.y, z: from.z };
    ray.dir = { x: dx / len, y: dy / len, z: dz / len };
    return world.castRay(ray, len - 0.05, true, undefined, SIGHT) === null;
  };

  /**
   * Is this point any good against a threat at `eye` right now?
   * @returns {{safe:boolean, canShoot:boolean, peek:number}} peek: the cell to lean out from (-1 = stand up where you are)
   */
  function evaluate(p, eye) {
    // The wall has to be between us and them.
    const tx = eye.x - p.pos.x, tz = eye.z - p.pos.z;
    const tl = Math.hypot(tx, tz) || 1;
    if ((tx * p.dir.x + tz * p.dir.z) / tl < 0.25) return { safe: false, canShoot: false, peek: -1 };
    const hideY = p.pos.y + (p.high ? COVER.hideHigh : COVER.hideLow);
    const safe = !clear(eye, { x: p.pos.x, y: hideY, z: p.pos.z })
      && !clear(eye, { x: p.pos.x, y: p.pos.y + (p.high ? 1.1 : 0.6), z: p.pos.z });
    if (!safe) return { safe, canShoot: false, peek: -1 };
    if (!p.high) {
      return { safe, canShoot: clear(eye, { x: p.pos.x, y: p.pos.y + COVER.peekHead, z: p.pos.z }), peek: -1 };
    }
    for (const pc of p.peeks) {
      if (clear(eye, { x: nav.X[pc], y: nav.Y[pc] + COVER.peekHead, z: nav.Z[pc] })) return { safe, canShoot: true, peek: pc };
    }
    return { safe, canShoot: false, peek: -1 };
  }

  /**
   * The best cover for someone at `from` against a threat at `eye`.
   * @param {object} q
   * @param {{x,y,z}} q.from       where the enemy is now
   * @param {{x,y,z}} q.eye        the threat's eye position
   * @param {{min,ideal,max}} q.range the distances this enemy likes to fight at
   * @param {number} [q.maxTravel] how far it's willing to run
   * @param {Set<number>} [q.taken] cover points claimed by others
   * @param {Array<{x,z}>} [q.mates] where squad-mates are (stay a little apart)
   * @param {{x,z}} [q.flankFrom]  when flanking: prefer points at a wide angle from this direction to the threat
   * @param {number} [q.exclude]   a point not to pick again (the one that just stopped working)
   * @param {number} [q.limit]     how many candidates get the (more expensive) ray checks
   * @returns {{point:object, peek:number, canShoot:boolean, score:number}|null}
   */
  function find({ from, eye, range, maxTravel = 22, taken = new Set(), mates = [], flankFrom = null, exclude = -1, limit = 14 }) {
    const candidates = [];
    for (const p of nearbyPoints(from.x, from.z, maxTravel)) {
      if (p.id === exclude || taken.has(p.id)) continue;
      const travel = Math.hypot(p.pos.x - from.x, p.pos.z - from.z) + Math.abs(p.pos.y - from.y) * 2;
      if (travel > maxTravel) continue;
      const dThreat = Math.hypot(p.pos.x - eye.x, p.pos.z - eye.z);
      if (dThreat < range.min * 0.7) continue;
      if (mates.some((m) => Math.hypot(m.x - p.pos.x, m.z - p.pos.z) < 1.8)) continue;
      let score = -travel * 0.9 - Math.abs(dThreat - range.ideal) * 0.5 + (p.high ? 0.5 : 0);
      if (flankFrom) {
        const ax = p.pos.x - eye.x, az = p.pos.z - eye.z;
        const bx = flankFrom.x - eye.x, bz = flankFrom.z - eye.z;
        const cos = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1);
        const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        if (angle < 40) continue;
        score += angle * 0.12 + travel * 0.5; // a flanker happily runs further for a better angle
      }
      candidates.push({ p, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    let best = null;
    for (const { p, score } of candidates.slice(0, limit)) {
      const e = evaluate(p, eye);
      if (!e.safe) continue;
      const total = score + (e.canShoot ? 6 : -4);
      if (!best || total > best.score) best = { point: p, peek: e.peek, canShoot: e.canShoot, score: total };
    }
    return best;
  }

  return { points, evaluate, find, near: nearbyPoints };
}
