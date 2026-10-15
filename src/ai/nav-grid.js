// The navigation grid: a map of everywhere an enemy can walk.
//
// Enemies can't "see" the level the way you do; all they have is the physics
// engine's invisible shapes. So when a level loads we lay an imaginary
// chessboard over it (squares of NAV.cell metres) and, over every square, drop
// an imaginary marble from the sky and note every floor it lands on. A landing
// spot becomes a walkable "cell" if:
//   - the floor isn't too steep, and
//   - a person-sized cylinder fits standing there (so cells hugging a wall, or
//     under a low ceiling, or inside a crate, are left out).
// Keeping every landing in a column (not just the top one) is what makes
// two-storey buildings work: the ground floor and the upstairs floor are both
// in the same column, as separate "layers".
//
// Then neighbouring cells are joined ("linked") when you could step from one to
// the other: each half of the step may rise at most a stair's height. Stairs
// and ramps link up; the top of a waist-high wall doesn't.
//
// ai/astar.js finds routes through these links. See docs/lessons/09-pathfinding-and-cover.md.

import { RAPIER, IDENTITY_ROTATION } from '../world/physics.js';
import { LEVEL } from '../world/groups.js';

const deg = (d) => (d * Math.PI) / 180;

export const NAV = {
  cell: 0.4,         // size of each square, in metres
  radius: 0.3,       // how far a cell's centre must stay from walls (a little under the body's 0.35)
  height: 1.75,      // headroom needed
  step: 0.35,        // the biggest rise allowed in half a cell (the same as the player's step height)
  maxSlope: deg(46),
  maxLayers: 4,      // floors stacked in one column
};

// The 8 directions to a neighbour: N, NE, E, SE, S, SW, W, NW (north is -Z).
export const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/**
 * Maps the level. Call after buildLevel() (which does the world.step() that files the colliders).
 * @param {RAPIER.World} world
 * @param {{min:number[], max:number[], top?:number, bottom?:number}} bounds  [x, z] corners of the area to map
 */
export function buildNavGrid(world, { min, max, top = 30, bottom = -3 }, opts = {}) {
  const cfg = { ...NAV, ...opts };
  const cell = cfg.cell;
  const nx = Math.ceil((max[0] - min[0]) / cell);
  const nz = Math.ceil((max[1] - min[1]) / cell);
  const L = cfg.maxLayers;
  const columns = new Int32Array(nx * nz * L).fill(-1);
  const xs = [], ys = [], zs = [], cx = [], cz = [];

  const cosSlope = Math.cos(cfg.maxSlope);
  const half = (cfg.height - cfg.step) / 2;
  const probe = new RAPIER.Cylinder(half, cfg.radius);
  const ray = new RAPIER.Ray({ x: 0, y: top, z: 0 }, { x: 0, y: -1, z: 0 });
  const centre = { x: 0, y: 0, z: 0 };
  const landings = [];

  // ---- 1. Drop marbles: find the walkable floors in every column.
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = min[0] + (ix + 0.5) * cell;
      const z = min[1] + (iz + 0.5) * cell;
      landings.length = 0;
      ray.origin = { x, y: top, z };
      world.intersectionsWithRay(ray, top - bottom, true, (hit) => {
        if (hit.normal.y >= cosSlope) landings.push(top - hit.timeOfImpact);
        return true; // keep going: we want every floor in this column
      }, undefined, LEVEL);
      landings.sort((a, b) => b - a);
      let layer = 0;
      let last = Infinity;
      for (const y of landings) {
        if (layer >= L) break;
        // Another surface less than a person's height above this one (a stair
        // step's front edge, a crate) means nobody can stand here.
        const above = last;
        last = y;
        if (above - y < cfg.height) continue;
        // Does a person fit here? (The cylinder starts a step above the floor, so stair edges don't count.)
        centre.x = x; centre.y = y + cfg.step + half + 0.02; centre.z = z;
        if (world.intersectionWithShape(centre, IDENTITY_ROTATION, probe, undefined, LEVEL) !== null) continue;
        columns[(iz * nx + ix) * L + layer++] = xs.length;
        xs.push(x); ys.push(y); zs.push(z); cx.push(ix); cz.push(iz);
      }
    }
  }

  const count = xs.length;
  const X = Float32Array.from(xs), Y = Float32Array.from(ys), Z = Float32Array.from(zs);
  const IX = Int16Array.from(cx), IZ = Int16Array.from(cz);
  const links = new Int32Array(count * 8).fill(-1);

  /** In column (ix, iz), the cell closest in height to y. */
  function closestInColumn(ix, iz, y) {
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return -1;
    let best = -1, bestDy = Infinity;
    const base = (iz * nx + ix) * L;
    for (let k = 0; k < L; k++) {
      const c = columns[base + k];
      if (c < 0) break;
      const dy = Math.abs(Y[c] - y);
      if (dy < bestDy) { bestDy = dy; best = c; }
    }
    return best;
  }

  // Can you step from cell a to cell b? Flat steps always; otherwise check the floor halfway.
  function canStep(a, b) {
    const dy = Math.abs(Y[a] - Y[b]);
    if (dy > 2 * cfg.step + 0.02) return false;
    if (dy < 0.02) return true;
    const hi = Math.max(Y[a], Y[b]);
    const mx = (X[a] + X[b]) / 2, mz = (Z[a] + Z[b]) / 2;
    const start = hi + cfg.step + 0.3;
    ray.origin = { x: mx, y: start, z: mz };
    const hit = world.castRay(ray, start - (Math.min(Y[a], Y[b]) - 0.3), true, undefined, LEVEL);
    if (!hit) return false; // a gap
    const mid = start - hit.timeOfImpact;
    return Math.abs(mid - Y[a]) <= cfg.step + 0.02 && Math.abs(Y[b] - mid) <= cfg.step + 0.02;
  }

  // ---- 2. Link neighbours. Straight directions first, then diagonals, which
  // also need both straight neighbours (so routes never cut a wall's corner).
  for (const pass of [[0, 2, 4, 6], [1, 3, 5, 7]]) {
    for (let c = 0; c < count; c++) {
      for (const d of pass) {
        const n = closestInColumn(IX[c] + DIRS[d][0], IZ[c] + DIRS[d][1], Y[c]);
        if (n < 0 || !canStep(c, n)) continue;
        if (d % 2 === 1 && (links[c * 8 + ((d + 7) % 8)] < 0 || links[c * 8 + ((d + 1) % 8)] < 0)) continue;
        links[c * 8 + d] = n;
      }
    }
  }
  // Keep only links that work both ways.
  for (let c = 0; c < count; c++) {
    for (let d = 0; d < 8; d++) {
      const n = links[c * 8 + d];
      if (n >= 0 && links[n * 8 + ((d + 4) % 8)] !== c) links[c * 8 + d] = -1;
    }
  }

  // ---- 3. Islands: number each group of connected cells. The biggest is the
  // level proper; small ones (the top of a wall, inside a closed box) are ignored.
  const component = new Int32Array(count).fill(-1);
  const sizes = [];
  const stack = [];
  for (let c = 0; c < count; c++) {
    if (component[c] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    component[c] = id;
    stack.push(c);
    while (stack.length) {
      const k = stack.pop();
      size++;
      for (let d = 0; d < 8; d++) {
        const n = links[k * 8 + d];
        if (n >= 0 && component[n] < 0) { component[n] = id; stack.push(n); }
      }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes, 0));

  const colOf = (x, z) => {
    const ix = Math.floor((x - min[0]) / cell);
    const iz = Math.floor((z - min[1]) / cell);
    return ix < 0 || iz < 0 || ix >= nx || iz >= nz ? -1 : iz * nx + ix;
  };

  const nav = {
    cell, nx, nz, min, max, count, config: cfg,
    X, Y, Z, IX, IZ, links, component, sizes, main,

    pos: (c) => ({ x: X[c], y: Y[c], z: Z[c] }),

    /** The cells stacked in the column under (x, z). */
    cellsAt(x, z) {
      const col = colOf(x, z);
      const out = [];
      if (col < 0) return out;
      for (let k = 0; k < L; k++) {
        const c = columns[col * L + k];
        if (c < 0) break;
        out.push(c);
      }
      return out;
    },

    /**
     * The walkable cell nearest to a position (feet height), or -1.
     * Only cells on the main island count unless `anyIsland` is set.
     */
    nearest(p, { radius = 2.5, anyIsland = false } = {}) {
      const r = Math.ceil(radius / cell);
      const ix0 = Math.floor((p.x - min[0]) / cell);
      const iz0 = Math.floor((p.z - min[1]) / cell);
      let best = -1, bestScore = Infinity;
      for (let iz = iz0 - r; iz <= iz0 + r; iz++) {
        if (iz < 0 || iz >= nz) continue;
        for (let ix = ix0 - r; ix <= ix0 + r; ix++) {
          if (ix < 0 || ix >= nx) continue;
          const base = (iz * nx + ix) * L;
          for (let k = 0; k < L; k++) {
            const c = columns[base + k];
            if (c < 0) break;
            if (!anyIsland && component[c] !== main) continue;
            const dy = Y[c] - p.y;
            if (dy > 0.9 || dy < -2.5) continue; // not a floor you're standing on
            const dx = X[c] - p.x, dz = Z[c] - p.z;
            const score = dx * dx + dz * dz + dy * dy * 4;
            if (score < bestScore && score <= radius * radius * 4) { bestScore = score; best = c; }
          }
        }
      }
      return best;
    },

    /**
     * Can you walk in a straight line from cell a to cell b, staying on linked
     * cells all the way? (Used to pull paths tight: see astar.js.)
     */
    straight(a, b) {
      const dx = X[b] - X[a], dz = Z[b] - Z[a];
      const len = Math.hypot(dx, dz);
      const steps = Math.ceil(len / (cell * 0.45));
      let cur = a;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const ix = Math.floor((X[a] + dx * t - min[0]) / cell);
        const iz = Math.floor((Z[a] + dz * t - min[1]) / cell);
        if (ix === IX[cur] && iz === IZ[cur]) continue;
        let next = -1;
        for (let d = 0; d < 8; d++) {
          const n = links[cur * 8 + d];
          if (n >= 0 && IX[n] === ix && IZ[n] === iz) { next = n; break; }
        }
        if (next < 0) return false;
        cur = next;
      }
      return cur === b;
    },

    /** How many links a cell has (8 = open ground, fewer = near a wall or edge). */
    degree(c) {
      let k = 0;
      for (let d = 0; d < 8; d++) if (links[c * 8 + d] >= 0) k++;
      return k;
    },
  };
  return nav;
}
