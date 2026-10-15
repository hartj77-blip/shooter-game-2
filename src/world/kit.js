// The level kit: a small set of building pieces, like LEGO bricks.
//
// A level file (see levels/) is just a list of pieces with sizes and positions.
// expandPiece() turns each piece into plain shape descriptions:
//   solids  things you can stand on and bump into (they get a mesh AND a collider)
//   paint   flat decoration on the floor (mesh only, you walk straight over it)
//   signs   text panels (mesh only)
// The physics side (world/level.js) and the drawing side (render/level-view.js)
// both read these same descriptions, so what you see always matches what you hit.
//
// Units are metres. Y is up. `at` is the point on the ground under the piece
// (the middle of its footprint). `rotY` turns the piece around the vertical axis,
// in radians: 0 means its "forward" points north (-Z).

const { sin, cos } = Math;

/** Rotate a local [x, y, z] around Y by `a` radians, then move it by `at`. */
export function placePoint([x, y, z], at, a = 0) {
  const c = cos(a);
  const s = sin(a);
  return [at[0] + x * c + z * s, at[1] + y, at[2] - x * s + z * c];
}

/** A box solid. `center` is its middle; `size` is its full width/height/depth. */
function box(size, center, rotY, mat) {
  return { kind: 'box', size, center, rotY, mat };
}

/**
 * Wedge (ramp) corner points in local space. The low edge is at +Z (south),
 * the high edge at -Z (north), so walking north goes uphill.
 */
export function wedgePoints(width, length, height) {
  const w = width / 2;
  const l = length / 2;
  return {
    A: [-w, 0, l], B: [w, 0, l],          // low edge, on the ground
    C: [-w, 0, -l], D: [w, 0, -l],        // back edge, on the ground
    E: [-w, height, -l], F: [w, height, -l], // back edge, at the top
  };
}

// Triangles of the wedge, wound counter-clockwise seen from outside.
export const WEDGE_TRIANGLES = [
  ['A', 'C', 'D'], ['A', 'D', 'B'], // bottom
  ['A', 'B', 'F'], ['A', 'F', 'E'], // slope
  ['C', 'E', 'F'], ['C', 'F', 'D'], // back
  ['A', 'E', 'C'],                  // left side
  ['B', 'D', 'F'],                  // right side
];

const expanders = {
  // A plain block. size = [width, height, depth].
  box(p) {
    const [w, h, d] = p.size;
    return { solids: [box([w, h, d], [p.at[0], p.at[1] + h / 2, p.at[2]], p.rotY ?? 0, p.mat ?? 'concrete')] };
  },

  // A ramp `length` long rising to `height`, optionally with a flat landing at the top.
  ramp(p) {
    const rotY = p.rotY ?? 0;
    const mat = p.mat ?? 'ramp';
    const solids = [{
      kind: 'wedge',
      width: p.width, length: p.length, height: p.height,
      center: [p.at[0], p.at[1], p.at[2]],
      rotY, mat,
    }];
    if (p.landing) {
      const c = placePoint([0, p.height / 2, -p.length / 2 - p.landing / 2], p.at, rotY);
      solids.push(box([p.width, p.height, p.landing], c, rotY, p.landingMat ?? 'concrete'));
    }
    return { solids };
  },

  // A flight of stairs climbing north (before rotation). Each step is a solid
  // column down to the ground, so there are no gaps underneath to fall into.
  stairs(p) {
    const rotY = p.rotY ?? 0;
    const mat = p.mat ?? 'stairs';
    const solids = [];
    for (let i = 0; i < p.steps; i++) {
      const h = (i + 1) * p.rise;
      const last = i === p.steps - 1;
      const depth = last && p.landing ? p.landing : p.run;
      const z = -(i * p.run) - depth / 2;
      solids.push(box([p.width, h, depth], placePoint([0, h / 2, z], p.at, rotY), rotY, last && p.landing ? 'concrete' : mat));
    }
    return { solids };
  },

  // Flat paint on the floor, such as lane stripes. No collider.
  paint(p) {
    return { paint: [{ size: p.size, center: [p.at[0], p.at[1] + 0.006, p.at[2]], rotY: p.rotY ?? 0, color: p.color }] };
  },

  // A text panel. `at` is the centre of the panel. Lying flat on the floor if `floor` is set.
  sign(p) {
    const out = { signs: [{ ...p, rotY: p.rotY ?? 0, size: p.size ?? [2, 1] }] };
    if (p.post) {
      const postH = p.at[1] - (p.size?.[1] ?? 1) / 2;
      out.solids = [box([0.12, postH, 0.12], [p.at[0], postH / 2, p.at[2]], p.rotY ?? 0, 'post')];
    }
    return out;
  },
};

/** Turns one level piece into { solids, paint, signs }. */
export function expandPiece(piece) {
  const fn = expanders[piece.type];
  if (!fn) throw new Error(`Unknown level piece type "${piece.type}"`);
  const out = fn(piece);
  return { solids: out.solids ?? [], paint: out.paint ?? [], signs: out.signs ?? [] };
}

/** Expands a whole level definition. */
export function expandLevel(def) {
  const all = { solids: [], paint: [], signs: [] };
  for (const piece of def.pieces) {
    const e = expandPiece(piece);
    all.solids.push(...e.solids);
    all.paint.push(...e.paint);
    all.signs.push(...e.signs);
  }
  return all;
}
