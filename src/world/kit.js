// The level kit: a small set of building pieces, like LEGO bricks.
//
// A level file (see levels/) is just a list of pieces with sizes and positions.
// expandPiece() turns each piece into plain shape descriptions:
//   solids    things you can stand on and bump into (they get a mesh AND a collider)
//   decor     trims that only make things look built: wall caps, door and window
//             frames, sills, table legs (mesh only: they're too thin to matter,
//             so bullets, eyes and route-finding ignore them)
//   paint     flat decoration on the floor (mesh only, you walk straight over it)
//   signs     text panels (mesh only)
//   targets   things to shoot (src/world/targets.js brings them to life)
//   triggers  invisible boxes that notice when you walk in (start and finish pads)
//   racks     tables showing the guns (drawn by the presentation code)
//   enemies   where enemy soldiers start, and how they behave (src/ai/enemies.js)
//   crates    ammo crates (src/game/supply.js)
//   sites, entries, lzs  where a mission's objectives can be, where reinforcements
//             arrive, and where the helicopter lands (src/game/operation.js)
//   lamps     where the lights are, for the night (world/lighting.js)
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

/** A cylinder solid, standing up, or lying (`lie`) along its own x axis (east-west before rotY). */
function cylinder(radius, height, center, rotY, mat, lie = false) {
  return { kind: 'cylinder', radius, height, center, rotY, mat, lie };
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
  // Make steps (`run`) at least 0.35 m deep if enemies should use them: shallower
  // steps are too steep for their route-finding (src/ai/nav-grid.js).
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

  // A straight wall from `from` to `to` (both [x, z]), with optional openings:
  //   openings: [{ at: metres from `from` to the opening's middle, width, bottom, top }]
  // A door is an opening with bottom 0; a window has a sill (bottom > 0).
  wall(p) {
    const [x1, z1] = p.from;
    const [x2, z2] = p.to;
    const length = Math.hypot(x2 - x1, z2 - z1);
    const rotY = Math.atan2(-(z2 - z1), x2 - x1); // turns local +X to point along the wall
    const mid = [(x1 + x2) / 2, p.base ?? 0, (z1 + z2) / 2];
    const height = p.height ?? 2.6;
    const thick = p.thick ?? 0.3;
    const mat = p.mat ?? 'concrete';
    const solids = [];
    const part = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const c = placePoint([(s0 + s1) / 2 - length / 2, (y0 + y1) / 2, 0], mid, rotY);
      solids.push(box([s1 - s0, y1 - y0, thick], c, rotY, mat));
    };
    // Trims (decor): a cap along the top, a frame round each opening, a sill
    // under each window. They stand a few centimetres proud of the wall, and
    // never into an opening (a gap you can walk or shoot through stays as wide
    // as it looks). Full-height walls only: not sandbags or the map's edge.
    const decor = [];
    const trim = p.trim ?? height >= 1.8;
    const T = 0.08; // how wide a trim is
    const deco = (s0, s1, y0, y1, proud) => {
      const c = placePoint([(s0 + s1) / 2 - length / 2, (y0 + y1) / 2, 0], mid, rotY);
      decor.push(box([s1 - s0, y1 - y0, thick + 2 * proud], c, rotY, 'trim'));
    };
    if (trim) deco(-0.03, length + 0.03, height - 0.05, height + 0.03, 0.03);
    let cursor = 0;
    for (const o of [...(p.openings ?? [])].sort((a, b) => a.at - b.at)) {
      const s0 = o.at - o.width / 2;
      const s1 = o.at + o.width / 2;
      part(cursor, s0, 0, height);
      part(s0, s1, 0, o.bottom ?? 0);
      part(s0, s1, o.top ?? height, height);
      cursor = s1;
      if (!trim) continue;
      const top = Math.min(o.top ?? height, height);
      const bottom = o.bottom ?? 0;
      // (A hair into the opening, so the frame's face isn't drawn on top of the wall's own.)
      deco(s0 - T, s0 + 0.005, bottom, top, 0.03);
      deco(s1 - 0.005, s1 + T, bottom, top, 0.03);
      if (top < height - 0.01) deco(s0 - T, s1 + T, top - 0.005, Math.min(height - 0.05, top + T), 0.03);
      if (bottom > 0) deco(s0 - T, s1 + T, bottom - 0.06, bottom + 0.005, 0.06);
    }
    part(cursor, length, 0, height);
    return { solids, decor };
  },

  // Something to shoot. kind: 'paper' | 'popup' | 'hostage' | 'steel' | 'mover'.
  // `at` is the ground point under it; rotY 0 means it faces south (towards +Z).
  target(p) {
    return { targets: [{ ...p, rotY: p.rotY ?? 0 }] };
  },

  // An invisible box that notices when you're inside it. `at` is its ground centre.
  trigger(p) {
    const [w, h, d] = p.size;
    return {
      triggers: [{
        id: p.id,
        min: [p.at[0] - w / 2, p.at[1], p.at[2] - d / 2],
        max: [p.at[0] + w / 2, p.at[1] + h, p.at[2] + d / 2],
      }],
      paint: p.paint ? [{ size: [w, d], center: [p.at[0], p.at[1] + 0.006, p.at[2]], rotY: 0, color: p.paint }] : [],
    };
  },

  // A table with the guns laid out on it.
  rack(p) {
    const size = p.size ?? [3, 0.9, 0.8];
    return {
      solids: [box(size, [p.at[0], p.at[1] + size[1] / 2, p.at[2]], p.rotY ?? 0, 'plank')],
      racks: [{ at: [p.at[0], p.at[1] + size[1], p.at[2]], rotY: p.rotY ?? 0, width: size[0], weapons: p.weapons }],
    };
  },

  // A shipping container: 6 x 2.6 x 2.4 m of corrugated steel, great high cover.
  // `open: true` leaves the doors at its south end (before rotY) open, so you can hide inside.
  container(p) {
    const rotY = p.rotY ?? 0;
    const mat = p.mat ?? 'container';
    const [L, H, W] = [6, 2.6, 2.4];
    if (!p.open) return { solids: [box([W, H, L], [p.at[0], p.at[1] + H / 2, p.at[2]], rotY, mat)] };
    const t = 0.1;
    const part = (size, local) => box(size, placePoint(local, p.at, rotY), rotY, mat);
    return {
      solids: [
        part([t, H, L], [-W / 2 + t / 2, H / 2, 0]),
        part([t, H, L], [W / 2 - t / 2, H / 2, 0]),
        part([W, t, L], [0, H - t / 2, 0]),
        part([W, H, t], [0, H / 2, -L / 2 + t / 2]),
      ],
    };
  },

  // A low wall of sandbags from `from` to `to` ([x, z]): waist-high cover you can shoot over.
  sandbags(p) {
    return expanders.wall({ ...p, height: p.height ?? 1.0, thick: p.thick ?? 0.6, mat: 'sandbag', trim: false });
  },

  // An oil drum, 0.6 m across and 0.9 m tall: cover for your legs. mat: 'barrel' (blue) or 'barrel_red'.
  barrel(p) {
    const [x, y, z] = p.at;
    const mat = p.mat ?? 'barrel';
    return {
      solids: [cylinder(0.3, 0.9, [x, y + 0.45, z], 0, mat)],
      decor: [0.3, 0.6].map((h) => cylinder(0.312, 0.035, [x, y + h, z], 0, mat)), // the rolling hoops
    };
  },

  // A wooden pallet (1.2 x 1 m), with a load on it if `load` (its height, in
  // metres) is given: sacks (`cargo: 'sandbag'`, the default) or boxes ('crate').
  pallet(p) {
    const rotY = p.rotY ?? 0;
    const solids = [box([1.2, 0.15, 1.0], placePoint([0, 0.075, 0], p.at, rotY), rotY, 'plank')];
    if (p.load) solids.push(box([1.1, p.load, 0.9], placePoint([0, 0.15 + p.load / 2, 0], p.at, rotY), rotY, p.cargo ?? 'sandbag'));
    return { solids };
  },

  // A lamp post: a 4 m pole with a lamp on an arm reaching forward (-Z before
  // rotY). Only the pole is solid. At night the lamp lights the ground around it
  // (`radius` metres) and anyone standing there (world/lighting.js).
  lamp(p) {
    const rotY = p.rotY ?? 0;
    const H = 4;
    const head = placePoint([0, H - 0.15, -0.85], p.at, rotY);
    return {
      solids: [cylinder(0.07, H, placePoint([0, H / 2, 0], p.at, rotY), rotY, 'post')],
      decor: [
        box([0.06, 0.06, 0.9], placePoint([0, H - 0.03, -0.45], p.at, rotY), rotY, 'post'),
        box([0.32, 0.1, 0.42], placePoint([0, H - 0.08, -0.85], p.at, rotY), rotY, 'post'),
      ],
      lamps: [{ at: head, radius: p.radius ?? 9 }],
    };
  },

  // A fuel tank: a steel cylinder (2 m across, `length` long, default 4 m)
  // lying east-west (before rotY) on two concrete saddles. Solid, chest-high cover.
  tank(p) {
    const rotY = p.rotY ?? 0;
    const L = p.length ?? 4;
    const R = 1;
    const saddle = (x) => box([0.4, 0.6, 1.6], placePoint([x, 0.3, 0], p.at, rotY), rotY, 'concrete');
    return {
      solids: [
        cylinder(R, L, placePoint([0, 0.4 + R, 0], p.at, rotY), rotY, p.mat ?? 'tank', true),
        saddle(-L / 2 + 0.6), saddle(L / 2 - 0.6),
      ],
    };
  },

  // An ammo crate (missions): hold F beside it to fill up your spare ammo and
  // grenades (game/supply.js). `refills`: how many times it can be used,
  // shared by the whole squad.
  crate(p) {
    const size = [1.1, 0.75, 0.7];
    return {
      solids: [box(size, [p.at[0], p.at[1] + size[1] / 2, p.at[2]], p.rotY ?? 0, 'crate')],
      crates: [{ id: p.id ?? null, at: p.at, rotY: p.rotY ?? 0, refills: p.refills ?? null }],
    };
  },

  // MISSIONS (game/operation.js). These are invisible: what's there depends on the mission.
  //
  // A place an objective can be: where a hostage is held, a laptop sits, a weapons
  // cache is hidden, or a position must be held. `safe` [x, z, yaw] (or [x, z, yaw, y]
  // if it isn't on the ground) is where the squad starts again if they retry from
  // the checkpoint this site gives.
  // `radius` (hold the line): how big the area to hold is.
  //
  // `prop`: what always stands there, whatever the mission, as level geometry
  // (solid, the same on every computer): 'table' (where a laptop can be),
  // 'stack' (crates, where a weapons cache can be hidden under a tarp) or
  // 'radio' (a stand for a radio). The mission only adds what's on top
  // (render/props-view.js), so you can't walk through it.
  site(p) {
    return {
      sites: [{
        id: p.id, at: p.at, yaw: p.yaw ?? 0, radius: p.radius ?? null, label: p.label ?? null,
        safe: p.safe ?? null, prop: p.prop ?? null,
      }],
      ...(p.prop ? SITE_PROPS[p.prop]([p.at[0], p.at[1] ?? 0, p.at[2]], p.yaw ?? 0) : {}),
    };
  },

  // Where reinforcements arrive (game/director.js): a gate, a jetty, a road in.
  // `route` [[x, z] or [x, z, y], ...]: the way they run in before they go looking for you.
  entry(p) {
    return { entries: [{ id: p.id, at: p.at, yaw: p.yaw ?? 0, route: p.route ?? [], label: p.label ?? null }] };
  },

  // The helicopter landing zone: a square `size` metres across, a radio (`radio`
  // [x, z]) to call the helicopter with, and the direction it flies in from
  // (`approach`, radians: 0 = from the north).
  lz(p) {
    const radio = p.radio ?? [p.at[0] + 4, p.at[2]];
    return {
      lzs: [{ id: p.id ?? 'lz', at: p.at, size: p.size ?? 10, radio, approach: p.approach ?? 0, safe: p.safe ?? null }],
      paint: [{ size: [p.size ?? 10, p.size ?? 10], center: [p.at[0], (p.at[1] ?? 0) + 0.006, p.at[2]], rotY: 0, color: '#3a4a36' }],
      ...SITE_PROPS.radio([radio[0], p.at[1] ?? 0, radio[1]], 0),
    };
  },

  // An invisible wall from `from` to `to` ([x, z]) at the edge of the map, say
  // along a quay: it stops people walking off, but bullets and eyes pass straight
  // through and nobody can climb it (the BOUNDARY collision group, world/groups.js).
  boundary(p) {
    const { solids } = expanders.wall({ ...p, height: p.height ?? 6, thick: p.thick ?? 0.4, mat: 'concrete' });
    return { solids: solids.map((s) => ({ ...s, hidden: true, boundary: true })) };
  },

  // Where an enemy soldier starts (src/ai/enemies.js). role: 'rifleman' | 'rusher' | 'marksman'.
  //   yaw     which way they face (0 = north)
  //   squad   enemies with the same squad name share what they know
  //   patrol  [[x, z], ...] (or [x, z, y] upstairs): walk this loop; otherwise stand guard
  //   perch   a Marksman's lookout: hold this spot in a fight
  enemy(p) {
    return {
      enemies: [{
        id: p.id, role: p.role, at: p.at, yaw: p.yaw ?? 0, squad: p.squad ?? null,
        patrol: p.patrol ?? null, perch: !!p.perch,
      }],
    };
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

// What stands at a mission site (see `site` above). `at` is the ground point, `yaw` the site's.
// render/props-view.js puts the mission's things on top of these heights.
export const SITE_PROPS = {
  table(at, yaw) {
    const legs = [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]];
    return {
      solids: [box([1.2, 0.05, 0.7], placePoint([0, 0.74, 0], at, yaw), yaw, 'plank')],
      decor: legs.map(([x, z]) => box([0.05, 0.715, 0.05], placePoint([x, 0.3575, z], at, yaw), yaw, 'plank')),
    };
  },
  stack(at, yaw) {
    return { solids: [box([1.3, 0.9, 0.7], placePoint([0, 0.45, 0], at, yaw), yaw, 'crate')] };
  },
  radio(at, yaw) {
    return { solids: [box([0.7, 0.5, 0.5], placePoint([0, 0.25, 0], at, yaw), yaw, 'crate')] };
  },
};

/** Turns one level piece into { solids, paint, signs }. */
export function expandPiece(piece) {
  const fn = expanders[piece.type];
  if (!fn) throw new Error(`Unknown level piece type "${piece.type}"`);
  const out = fn(piece);
  const result = {};
  for (const key of KINDS) result[key] = out[key] ?? [];
  return result;
}

const KINDS = ['solids', 'decor', 'paint', 'signs', 'targets', 'triggers', 'racks', 'enemies', 'crates', 'sites', 'entries', 'lzs', 'lamps'];

/** Expands a whole level definition. */
export function expandLevel(def) {
  const all = {};
  for (const key of KINDS) all[key] = [];
  for (const piece of def.pieces) {
    const e = expandPiece(piece);
    for (const key of KINDS) all[key].push(...e[key]);
  }
  return all;
}
