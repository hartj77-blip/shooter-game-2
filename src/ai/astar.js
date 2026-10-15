// A* ("A star"): finding a route through the navigation grid.
//
// Think of a sat-nav. From where you are, it could try every road in every
// direction (that works, but slowly). A* is smarter: it always explores next
// the road that looks most promising, judged by
//      distance travelled so far + distance still to go "as the crow flies".
// The crow-flies part (the "heuristic") never overestimates, so the first time
// A* reaches the goal it has found the shortest route.
//
// The raw route zig-zags from square to square, so we then "pull the string
// tight": skip every corner we can walk straight past (nav.straight).
//
// See docs/lessons/09-pathfinding-and-cover.md.

const SQRT2 = Math.SQRT2;

// Scratch space, reused between searches so finding a path makes no garbage.
let size = 0;
let g, parent, seen, closed, heapNode, heapF;
let stamp = 0;

function ensure(n) {
  if (n <= size) return;
  size = n;
  g = new Float32Array(n);
  parent = new Int32Array(n);
  seen = new Uint32Array(n);
  closed = new Uint32Array(n);
  // A cell can be put on the to-do list once per neighbour, so allow for 8 each.
  heapNode = new Int32Array(n * 8 + 8);
  heapF = new Float32Array(n * 8 + 8);
  stamp = 0;
}

/**
 * The shortest route between two cells, as a list of cells, or null if there's none.
 * @param {ReturnType<import('./nav-grid.js').buildNavGrid>} nav
 * @param {number} start cell
 * @param {number} goal cell
 * @param {object} [opts]
 * @param {{x:number, z:number, radius:number, weight:number}} [opts.avoid] make cells near a point cost more
 *        (flankers use this to swing wide around you instead of walking into your sights)
 * @param {number} [opts.maxNodes] give up after exploring this many cells
 * @returns {{cells:number[], explored:number}|null}
 */
export function findPath(nav, start, goal, { avoid = null, maxNodes = 60000 } = {}) {
  if (start < 0 || goal < 0) return null;
  if (nav.component[start] !== nav.component[goal]) return null; // different islands: no route at all
  ensure(nav.count);
  stamp++;
  const { X, Y, Z, IX, IZ, links, cell } = nav;
  const gx = IX[goal], gz = IZ[goal];
  const h = (c) => {
    const dx = Math.abs(IX[c] - gx), dz = Math.abs(IZ[c] - gz);
    return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * cell + Math.abs(Y[c] - Y[goal]) * 0.5;
  };

  // A binary heap: a to-do list that always hands back the most promising cell first.
  let len = 0;
  const push = (node, f) => {
    let i = len++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapNode[i] = heapNode[p]; heapF[i] = heapF[p];
      i = p;
    }
    heapNode[i] = node; heapF[i] = f;
  };
  const pop = () => {
    const top = heapNode[0];
    const lastNode = heapNode[--len], lastF = heapF[len];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= len) break;
      if (c + 1 < len && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lastF) break;
      heapNode[i] = heapNode[c]; heapF[i] = heapF[c];
      i = c;
    }
    heapNode[i] = lastNode; heapF[i] = lastF;
    return top;
  };

  g[start] = 0;
  parent[start] = -1;
  seen[start] = stamp;
  push(start, h(start));
  let explored = 0;

  while (len > 0) {
    const c = pop();
    if (closed[c] === stamp) continue;
    closed[c] = stamp;
    if (c === goal) break;
    if (++explored > maxNodes) return null;
    for (let d = 0; d < 8; d++) {
      const n = links[c * 8 + d];
      if (n < 0 || closed[n] === stamp) continue;
      let cost = (d % 2 ? SQRT2 : 1) * cell + Math.abs(Y[n] - Y[c]) * 0.5;
      if (avoid) {
        const dist = Math.hypot(X[n] - avoid.x, Z[n] - avoid.z);
        if (dist < avoid.radius) cost += avoid.weight * (1 - dist / avoid.radius) * cell;
      }
      // Hugging walls looks robotic and snags on corners: open ground is a touch cheaper.
      if (nav.degree(n) < 8) cost += 0.15 * cell;
      const next = g[c] + cost;
      if (seen[n] === stamp && next >= g[n]) continue;
      seen[n] = stamp;
      g[n] = next;
      parent[n] = c;
      push(n, next + h(n));
    }
  }
  if (closed[goal] !== stamp) return null;

  const cells = [];
  for (let c = goal; c >= 0; c = parent[c]) cells.push(c);
  cells.reverse();
  return { cells, explored };
}

/**
 * Pulls a route tight: keeps only the corners you can't walk straight past.
 * @returns {number[]} the cells to walk to, in order (the first is where you start)
 */
export function smoothPath(nav, cells) {
  if (cells.length <= 2) return cells.slice();
  const out = [cells[0]];
  let anchor = 0;
  for (let i = 2; i < cells.length; i++) {
    if (!nav.straight(cells[anchor], cells[i])) {
      anchor = i - 1;
      out.push(cells[anchor]);
    }
  }
  out.push(cells[cells.length - 1]);
  return out;
}

/** A route from one position to another, as smoothed waypoints {x, y, z}, or null. */
export function route(nav, from, to, opts = {}) {
  const start = nav.nearest(from);
  const goal = nav.nearest(to, { radius: opts.goalRadius ?? 3 });
  const found = findPath(nav, start, goal, opts);
  if (!found) return null;
  return smoothPath(nav, found.cells).map((c) => nav.pos(c));
}
