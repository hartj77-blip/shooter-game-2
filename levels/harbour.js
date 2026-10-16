// THE HARBOUR: the mission map (milestone 5).
//
// A small fishing port that a private military company has taken over. Four
// missions are played here (levels/missions.js); this file is only the place:
// buildings, cover, where objectives can be (`site` pieces), where the
// helicopter lands (`lz`), where reinforcements arrive (`entry`), ammo crates
// and the garrison. Like every level, it's plain data (src/world/kit.js).
//
// Seen from above (north is up, the sea is north):
//
//    ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~   the sea
//                                                 jetty ║        ┌─lighthouse──┐
//  ┌──────────────────── the quay: cranes, dock hut ─────╨────────┘  (hold it) │
//  │ [net shed] [house] [house]                                   LZ (headland)│
//  │                           ▭▭ ▭▭ ▭▭   ▭▭ ▭▭ ▭▭    [ WAREHOUSE A  ] [ WARE- ]│
//  │ [house]  square   [house] ▭▭ CONTAINER YARD ▭▭   [ (mezzanine)  ] [ HOUSE ]│
//  │ [smokehouse] [house] [chapel] ▭▭ ▭▭ ▭▭  ▭▭ ▭▭                    [   B   ]│
//  │   the village                ▭▭ ▭▭ ▭▭  ▭▭       [harbour office]  east road
//  │                         car park + LZ                                     │
//  ├── west gate ─────────────── main gate ──────────── land gate ─────────────┤ the fence
//  │  [berm]   (you start here)            the road in                         │
//  └──────────────────────────────────────────────────────────────────────────┘
//
// Landmarks so you never get lost: the two cranes (north), the lighthouse
// (north-east), the chapel's red roof (west), the white harbour office (east).
//
// Units: metres. Facing (yaw / rotY): 0 = north, PI = south, -PI/2 = east, PI/2 = west.

const PI = Math.PI;
const deg = (d) => (d * PI) / 180;
const NORTH = 0, SOUTH = PI, EAST = -PI / 2, WEST = PI / 2;

const pieces = [];
const add = (...p) => pieces.push(...p);

/** Four walls round a rectangle; openings at absolute x (north/south walls) or z (east/west walls). */
function room(x0, z0, x1, z1, { height = 2.8, base = 0, thick = 0.3, mat = 'whitewash', n = [], s = [], e = [], w = [] } = {}) {
  const rel = (list, start) => list.map((o) => ({ ...o, at: o.at - start }));
  add(
    { type: 'wall', from: [x0, z0], to: [x1, z0], height, base, thick, mat, openings: rel(n, x0) },
    { type: 'wall', from: [x0, z1], to: [x1, z1], height, base, thick, mat, openings: rel(s, x0) },
    { type: 'wall', from: [x1, z0], to: [x1, z1], height, base, thick, mat, openings: rel(e, z0) },
    { type: 'wall', from: [x0, z0], to: [x0, z1], height, base, thick, mat, openings: rel(w, z0) },
  );
}
/** A flat roof over a rectangle, at height `y`. */
const roof = (x0, z0, x1, z1, y, mat = 'roof', t = 0.25) =>
  add({ type: 'box', size: [x1 - x0 + 0.4, t, z1 - z0 + 0.4], at: [(x0 + x1) / 2, y, (z0 + z1) / 2], mat });
/** A one-room house: walls, doors and windows, and a roof. */
function house(x0, z0, x1, z1, opts = {}) {
  room(x0, z0, x1, z1, opts);
  roof(x0, z0, x1, z1, opts.height ?? 2.8, opts.roofMat ?? 'roof_red');
}
const door = (at, width = 1.4, top = 2.3) => ({ at, width, bottom: 0, top });
const roller = (at, width = 4.5, top = 4.5) => ({ at, width, bottom: 0, top });
const window_ = (at, width = 1.4, bottom = 1.0, top = 1.9) => ({ at, width, bottom, top });

// ---------------------------------------------------------------- land, sea and the edges of the map
add(
  { type: 'box', size: [170, 1, 114], at: [0, -1, 7], mat: 'quay' },     // the land: x -85..85, z -50..64
  { type: 'box', size: [30, 1, 12], at: [70, -1, -56], mat: 'quay' },    // the headland, under the lighthouse
  { type: 'box', size: [6, 1, 16], at: [39, -1, -58], mat: 'plank' },    // the jetty
  { type: 'paint', size: [210, 40], at: [0, -1.25, -70], color: '#2e5866' }, // the sea (to look at, not to stand on)
  // Solid walls round the land side.
  { type: 'box', size: [1, 4, 114], at: [-85.5, 0, 7], mat: 'wall' },
  { type: 'box', size: [1, 4, 126], at: [85.5, 0, 1], mat: 'wall' },
  { type: 'box', size: [172, 4, 1], at: [0, 0, 64.5], mat: 'wall' },
  // Invisible walls along the water's edge: you can't fall in, but you can shoot (and see) across.
  { type: 'boundary', from: [-85, -50.3], to: [35.7, -50.3] },
  { type: 'boundary', from: [35.7, -50.3], to: [35.7, -66.3] },
  { type: 'boundary', from: [35.7, -66.3], to: [42.3, -66.3] },
  { type: 'boundary', from: [42.3, -66.3], to: [42.3, -50.3] },
  { type: 'boundary', from: [42.3, -50.3], to: [54.7, -50.3] },
  { type: 'boundary', from: [54.7, -50.3], to: [54.7, -62.3] },
  { type: 'boundary', from: [54.7, -62.3], to: [85, -62.3] },
);
// Bollards along the quay (knee-high: something to crouch behind).
for (const x of [-78, -66, -54, -42, -30, -18, 26, 48]) add({ type: 'box', size: [0.6, 0.7, 0.6], at: [x, 0, -49.2], mat: 'steel' });

// ---------------------------------------------------------------- the fence, the road in, and where you start
const gate = (x, width) => ({ at: x + 85, width, bottom: 0, top: 2.6 });
add(
  { type: 'wall', from: [-85, 40], to: [85, 40], height: 2.6, thick: 0.15, mat: 'post', openings: [gate(-60, 5), gate(0, 6), gate(40, 5)] },
  { type: 'paint', size: [170, 6], at: [0, 0, 32], color: '#3a3c3f' }, // the harbour road
  { type: 'paint', size: [170, 6], at: [0, 0, 52], color: '#3a3c3f' }, // the road outside
  // A berm and a bus shelter: nobody inside the fence can see you arrive.
  { type: 'box', size: [12, 2.2, 1.6], at: [-61, 0, 46.5], mat: 'sandbag' },
  { type: 'box', size: [4, 2.6, 0.3], at: [-50, 0, 57], mat: 'post' },
  { type: 'sign', at: [-66, 2.2, 47.4], size: [5, 1.4], rotY: SOUTH, title: 'PORT OF SALTWATER', lines: ['Private property. Keep out.'], post: true },
  { type: 'crate', at: [-56, 0, 53], refills: 3 },
);

// ---------------------------------------------------------------- the car park and the landing zone
add(
  { type: 'lz', id: 'lz', at: [-4, 0, 22], size: 14, radio: [5, 22], approach: SOUTH, safe: [-4, 34, NORTH] },
  { type: 'crate', at: [6, 0, 17], refills: 3 },
  // Parked trucks and a skip: cover around the pad.
  { type: 'box', size: [2.6, 3, 7.5], at: [16, 0, 22], mat: 'container_blue' },
  { type: 'box', size: [2.6, 3, 7.5], at: [-22, 0, 18], mat: 'container_red' },
  { type: 'box', size: [3.5, 1.4, 2], at: [-14, 0, 30], mat: 'steel' },
  { type: 'sandbags', from: [22, 12], to: [28, 12] },
  { type: 'sandbags', from: [-30, 26], to: [-30, 32] },
);

// ---------------------------------------------------------------- the container yard
// Rows of containers lying east-west, with lanes between the rows and a wide
// cross lane down the middle. "2" means stacked two high.
const C = { g: 'container', r: 'container_red', b: 'container_blue' };
const rows = {
  [-30]: ['r2', 'b', 'g2', 'r', 'b2', 'g'],
  [-22]: ['g', 'r2', 'b', 'g2', 'r', 'b2'],
  [-14]: ['b2', 'g', null, 'r', 'g2', 'r'],
  [-6]: ['r', 'b2', 'g', 'b', 'r2', 'g'],
  [2]: ['g2', 'r', 'b2', 'g', null, 'b'],
};
const columns = [-26, -18, -10, 2, 10, 18];
for (const [z, row] of Object.entries(rows)) {
  row.forEach((kind, i) => {
    if (!kind) return;
    const x = columns[i];
    const mat = C[kind[0]];
    add({ type: 'container', at: [x, 0, Number(z)], rotY: WEST, mat, open: kind === 'g' && i === 1 });
    if (kind.endsWith('2')) add({ type: 'container', at: [x, 2.6, Number(z)], rotY: WEST, mat: kind[0] === 'r' ? C.b : C.r });
  });
}
add(
  { type: 'site', id: 'cache-yard-1', at: [-10, 0, -14], label: 'the middle of the container yard', safe: [-4, -10, WEST] },
  { type: 'site', id: 'cache-yard-2', at: [10, 0, 2], label: 'the south of the container yard', safe: [10, 8, NORTH] },
  { type: 'crate', at: [-4, 0, -26] },
);

// ---------------------------------------------------------------- the quay: cranes and the dock hut
/** A dock crane: four legs, a frame on top, a boom over the water, and a platform with stairs (a lookout). */
function crane(cx, cz) {
  for (const [dx, dz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) add({ type: 'box', size: [0.7, 13, 0.7], at: [cx + dx, 0, cz + dz], mat: 'steel' });
  add(
    { type: 'box', size: [9, 1.2, 7], at: [cx, 13, cz], mat: 'ledge' },
    { type: 'box', size: [1.2, 1.2, 20], at: [cx, 13.4, cz - 8], mat: 'ledge' },
    { type: 'box', size: [3, 3.3, 3], at: [cx + 6, 0, cz + 1], mat: 'steel' },
    { type: 'stairs', at: [cx + 6, 0, cz + 6.7], width: 1.4, rise: 0.275, steps: 12, run: 0.35 },
  );
}
crane(-4, -43);
crane(16, -43);
house(24, -42, 30, -37, { s: [door(27)], mat: 'plank', roofMat: 'roof' });
add(
  { type: 'site', id: 'dock-hut', at: [27, 0, -39.5], label: 'the dock hut', safe: [27, -32, NORTH] },
  { type: 'site', id: 'cache-quay', at: [6, 0, -44], label: 'the quay, between the cranes', safe: [6, -36, NORTH] },
  { type: 'crate', at: [10, 0, -37] },
  // Pallets and crates: cover along the quay.
  { type: 'box', size: [2, 1.2, 2], at: [-20, 0, -45], mat: 'crate' },
  { type: 'box', size: [2, 2.4, 2], at: [-26, 0, -44], mat: 'crate' },
  { type: 'box', size: [3, 1.2, 1.6], at: [-40, 0, -45], mat: 'crate' },
  { type: 'box', size: [2, 1.2, 2], at: [34, 0, -46], mat: 'crate' },
  { type: 'box', size: [1.6, 2.2, 1.6], at: [48, 0, -44], mat: 'crate' },
);

// ---------------------------------------------------------------- the headland and the lighthouse (hold the line)
add(
  { type: 'box', size: [5, 16, 5], at: [79, 0, -57], mat: 'whitewash' },
  { type: 'box', size: [6, 0.6, 6], at: [79, 16, -57], mat: 'hazard' },
);
house(62, -61, 68, -57, { s: [door(65)], mat: 'whitewash', roofMat: 'roof' });
add(
  { type: 'sandbags', from: [60, -47], to: [65.5, -47] },
  { type: 'sandbags', from: [70.5, -47], to: [76, -47] },
  { type: 'sandbags', from: [59, -60], to: [59, -51] },
  { type: 'box', size: [1.4, 1.1, 1.4], at: [71, 0, -52], mat: 'crate' },
  { type: 'site', id: 'lighthouse', at: [68, 0, -53], radius: 8, label: 'the lighthouse', safe: [68, -51, NORTH] },
  { type: 'lz', id: 'lz-headland', at: [70, 0, -41], size: 10, radio: [63, -41], approach: NORTH, safe: [70, -44, NORTH] },
  { type: 'crate', at: [62, 0, -50], refills: 4 },
);

// ---------------------------------------------------------------- warehouse A, with its mezzanine (intel)
room(32, -34, 56, -12, { height: 8, thick: 0.4, mat: 'brick', n: [door(36)], s: [roller(44)], w: [roller(-24)], e: [door(-16)] });
roof(32, -34, 56, -12, 8, 'roof', 0.3);
add(
  // The mezzanine: a steel deck along the north wall, 3.3 m up, reached by stairs at its east end.
  { type: 'box', size: [20, 0.3, 4.8], at: [44, 3.0, -31.4], mat: 'steel' },
  { type: 'box', size: [0.3, 3.0, 0.3], at: [34.5, 0, -29.2], mat: 'steel' },
  { type: 'box', size: [0.3, 3.0, 0.3], at: [44, 0, -29.2], mat: 'steel' },
  { type: 'wall', from: [34, -29.1], to: [51, -29.1], base: 3.3, height: 1, thick: 0.1, mat: 'post' },
  { type: 'stairs', at: [52, 0, -24.8], width: 1.6, rise: 0.275, steps: 12, run: 0.35 },
  { type: 'site', id: 'mezzanine', at: [40, 3.3, -31.5], label: 'the mezzanine in warehouse A', safe: [44, -18, NORTH] },
  // Stock on the floor.
  { type: 'box', size: [3, 2, 2], at: [38, 0, -19], mat: 'crate' },
  { type: 'box', size: [2, 1.2, 2], at: [48, 0, -16], mat: 'crate' },
  { type: 'box', size: [4, 1.6, 1.4], at: [42, 0, -25], mat: 'plank' },
  { type: 'crate', at: [34.5, 0, -14] },
);

// ---------------------------------------------------------------- warehouse B (a weapons cache)
room(60, -34, 82, -14, { height: 7, thick: 0.4, mat: 'wall', w: [roller(-24)], s: [door(70)], n: [roller(74)] });
roof(60, -34, 82, -14, 7, 'roof', 0.3);
add(
  { type: 'site', id: 'cache-warehouse', at: [71, 0, -26], label: 'warehouse B', safe: [70, -9, NORTH] },
  { type: 'box', size: [3, 2.4, 2], at: [66, 0, -30], mat: 'crate' },
  { type: 'box', size: [2, 1.2, 4], at: [77, 0, -20], mat: 'crate' },
  { type: 'container', at: [76, 0, -28], rotY: WEST, mat: 'container' },
);

// ---------------------------------------------------------------- the harbour office (intel), two floors
room(36, 0, 50, 10, {
  height: 6.6, mat: 'whitewash',
  s: [door(42), { at: 39, width: 1.4, bottom: 4.3, top: 5.6 }, { at: 46, width: 1.4, bottom: 4.3, top: 5.6 }],
  n: [window_(40), { at: 44, width: 1.4, bottom: 4.3, top: 5.6 }],
  e: [{ at: 5, width: 1.4, bottom: 4.3, top: 5.6 }],
  w: [door(3)],
});
roof(36, 0, 50, 10, 6.6, 'roof', 0.3);
add(
  // Upstairs floor, with the stairwell left open (x 46.2-47.8, z 3.2-7.4).
  { type: 'box', size: [10.05, 0.3, 9.7], at: [41.175, 3.0, 5], mat: 'floor' },
  { type: 'box', size: [3.65, 0.3, 3.05], at: [48.025, 3.0, 1.675], mat: 'floor' },
  { type: 'box', size: [2.05, 0.3, 6.65], at: [48.825, 3.0, 6.525], mat: 'floor' },
  { type: 'box', size: [1.6, 0.3, 2.45], at: [47, 3.0, 8.625], mat: 'floor' },
  { type: 'stairs', at: [47, 0, 7.4], width: 1.6, rise: 0.275, steps: 12, run: 0.35 },
  // An office upstairs (the laptop's here, perhaps), with a doorway.
  { type: 'wall', from: [42, 0.15], to: [42, 9.85], base: 3.3, height: 2.8, thick: 0.2, mat: 'whitewash', openings: [{ at: 7.5, width: 1.4, bottom: 0, top: 2.3 }] },
  { type: 'box', size: [1.8, 0.8, 0.9], at: [38.5, 3.3, 1.5], mat: 'plank' }, // a desk
  { type: 'site', id: 'office', at: [39, 3.3, 3], label: 'upstairs in the harbour office', safe: [42, 14, NORTH] },
  { type: 'box', size: [2, 0.9, 1], at: [39, 0, 7], mat: 'plank' },
);

// ---------------------------------------------------------------- the village (west)
// The net shed: three walls and a roof, open to the south.
add(
  { type: 'wall', from: [-82, -47], to: [-74, -47], height: 2.6, mat: 'plank' },
  { type: 'wall', from: [-82, -47], to: [-82, -41], height: 2.6, mat: 'plank' },
  { type: 'wall', from: [-74, -47], to: [-74, -41], height: 2.6, mat: 'plank' },
);
roof(-82, -47, -74, -41, 2.6, 'roof');
house(-70, -47, -62, -41, { s: [door(-66)], n: [window_(-66)] });
house(-58, -47, -50, -41, { s: [door(-54)], e: [window_(-44)] });
house(-82, -32, -74, -24, { e: [door(-28)], s: [window_(-78)] });
house(-70, -32, -62, -24, { s: [door(-66)], w: [window_(-28)] });
house(-44, -32, -38, -24, { s: [door(-41)], n: [window_(-41)] });
house(-68, -6, -60, 2, { n: [door(-64)], e: [window_(-2)] });
// The smokehouse (brick, door to the east).
house(-82, -14, -74, -6, { mat: 'brick', e: [door(-10)], roofMat: 'roof' });
// The chapel: tall, white, red roof, door to the south.
room(-54, -14, -46, 2, {
  height: 5, mat: 'whitewash',
  s: [door(-50, 1.8, 2.8)], e: [window_(-9, 1.2, 1.5, 3), window_(-3, 1.2, 1.5, 3)], w: [window_(-9, 1.2, 1.5, 3)],
});
roof(-54, -14, -46, 2, 5, 'roof_red', 0.3);
add(
  { type: 'box', size: [1.6, 0.9, 1.6], at: [-60, 0, -18], mat: 'concrete' }, // the well in the square
  { type: 'wall', from: [-68, -20], to: [-68, -15], height: 1.6, thick: 0.1, mat: 'plank' }, // net-drying racks
  { type: 'wall', from: [-52, -36], to: [-46, -36], height: 1.6, thick: 0.1, mat: 'plank' },
  { type: 'box', size: [3, 1.2, 1.6], at: [-40, 0, -14], mat: 'crate' },
  { type: 'site', id: 'net-shed', at: [-78, 0, -44.5], label: 'the net shed', safe: [-78, -36, NORTH] },
  { type: 'site', id: 'smokehouse', at: [-78, 0, -10], label: 'the smokehouse', safe: [-68, -10, WEST] },
  { type: 'site', id: 'chapel', at: [-50, 0, -9], label: 'the chapel', safe: [-50, 8, NORTH] },
  { type: 'site', id: 'cache-village', at: [-56, 0, -18], label: 'the village square', safe: [-56, -10, NORTH] },
  { type: 'crate', at: [-63, 0, -15] },
);

// ---------------------------------------------------------------- where reinforcements arrive
add(
  { type: 'entry', id: 'land-gate', at: [66, 0, 56], yaw: NORTH, label: 'the land gate', route: [[40, 46], [40, 34], [28, 16]] },
  { type: 'entry', id: 'east-road', at: [82, 0, 4], yaw: WEST, label: 'the east road', route: [[70, 4], [56, -4]] },
  { type: 'entry', id: 'jetty', at: [39, 0, -63], yaw: SOUTH, label: 'the jetty', route: [[39, -52], [28, -45]] },
  { type: 'entry', id: 'quay-west', at: [-82, 0, -49], yaw: EAST, label: 'the west quay', route: [[-72, -38], [-60, -34]] },
  { type: 'entry', id: 'village-road', at: [-82, 0, 18], yaw: EAST, label: 'the village road', route: [[-72, 12], [-62, 4]] },
);

// ---------------------------------------------------------------- the garrison
// 16 soldiers in 8 squads. More arrive as the mission goes on (game/director.js).
add(
  // The village.
  { type: 'enemy', role: 'rifleman', squad: 'village', at: [-60, 0, -21], patrol: [[-60, -21], [-60, -36], [-46, -36], [-46, -21]] },
  { type: 'enemy', role: 'rusher', squad: 'village', at: [-66, 0, -36], yaw: EAST },
  { type: 'enemy', role: 'rifleman', squad: 'chapel', at: [-50, 0, 4.5], yaw: SOUTH },
  { type: 'enemy', role: 'rifleman', squad: 'sheds', at: [-72, 0, -38], yaw: SOUTH },
  { type: 'enemy', role: 'rusher', squad: 'sheds', at: [-58, 0, -38], patrol: [[-58, -38], [-80, -38]] },
  // The container yard, and a Marksman on the west crane's platform.
  { type: 'enemy', role: 'rifleman', squad: 'yard', at: [-4, 0, -18], patrol: [[-4, -18], [-4, -34], [22, -34], [22, -18]] },
  { type: 'enemy', role: 'rifleman', squad: 'yard', at: [-20, 0, -10], yaw: SOUTH },
  { type: 'enemy', role: 'rusher', squad: 'yard', at: [8, 0, -2], yaw: SOUTH },
  { type: 'enemy', role: 'marksman', squad: 'crane', at: [2, 3.3, -42], yaw: SOUTH, perch: true },
  // Warehouse A (one on the mezzanine) and B.
  { type: 'enemy', role: 'rifleman', squad: 'warehouse', at: [38, 3.3, -31], patrol: [[38, -31, 3.3], [48, -31, 3.3]] },
  { type: 'enemy', role: 'rifleman', squad: 'warehouse', at: [44, 0, -20], yaw: SOUTH },
  { type: 'enemy', role: 'rusher', squad: 'warehouse', at: [66, 0, -24], yaw: WEST },
  // Upstairs in the harbour office, watching the road.
  { type: 'enemy', role: 'rifleman', squad: 'office', at: [44, 3.3, 7.5], yaw: SOUTH },
  // The quay, and the headland.
  { type: 'enemy', role: 'rifleman', squad: 'quay', at: [-20, 0, -43], patrol: [[-20, -43], [30, -44]] },
  { type: 'enemy', role: 'rifleman', squad: 'quay', at: [28, 0, -46], yaw: WEST },
  { type: 'enemy', role: 'rifleman', squad: 'headland', at: [66, 0, -52], yaw: SOUTH },
);

export default {
  name: 'The Harbour',
  spawn: { pos: [-62, 0, 56], yaw: NORTH },
  mood: 'golden', // render/moods.js
  sun: { azimuth: deg(-40), elevation: deg(38) },
  nav: { min: [-84, -66], max: [84, 63], top: 20 },
  pieces,
};
