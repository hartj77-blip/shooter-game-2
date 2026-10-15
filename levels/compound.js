// THE COMPOUND: the first real fight (milestone 3).
//
// A walled compound held by a private military company. Clear every hostile.
// Like every level, it's only data: pieces from the level kit (src/world/kit.js)
// plus enemy pieces saying where each soldier starts and how it behaves.
//
// Layout, seen from above (north is up). You start outside, south-west, behind a berm:
//
//        ┌──────────────────────── perimeter wall ─────────────────────────┐
//        │ [ HOUSE, 2 floors  ]                       [   WAREHOUSE     ]   │
//        │ [ balcony ▼        ]      containers        [ roller doors ▼  ]   │
//        │                     ▫▫▫  sandbags  ▫▫▫                           breach (east)
// drain  │ [ BARRACKS ]              courtyard            truck  [tower]    │
// (west, │                                                                  │
// crouch)└────────────────────────────── GATE ─────────────────────────────┘
//                 [berm]                              wreck
//            (you start here)
//
// Units: metres. Facing (yaw / rotY): 0 = north, PI = south, -PI/2 = east, PI/2 = west.

const PI = Math.PI;
const deg = (d) => (d * PI) / 180;
const NORTH = 0, SOUTH = PI, EAST = -PI / 2, WEST = PI / 2;
/** The yaw that faces from (x1, z1) towards (x2, z2). */
const facing = (x1, z1, x2, z2) => Math.atan2(-(x2 - x1), -(z2 - z1));

const pieces = [];
const add = (...p) => pieces.push(...p);

/**
 * Four walls round a rectangle. Openings are given as absolute x (north/south
 * walls) or z (east/west walls), which is easier to lay out than "metres along".
 */
function room(x0, z0, x1, z1, { height = 3, base = 0, thick = 0.3, mat = 'wall', n = [], s = [], e = [], w = [] } = {}) {
  const rel = (list, start) => list.map((o) => ({ ...o, at: o.at - start }));
  add(
    { type: 'wall', from: [x0, z0], to: [x1, z0], height, base, thick, mat, openings: rel(n, x0) },
    { type: 'wall', from: [x0, z1], to: [x1, z1], height, base, thick, mat, openings: rel(s, x0) },
    { type: 'wall', from: [x1, z0], to: [x1, z1], height, base, thick, mat, openings: rel(e, z0) },
    { type: 'wall', from: [x0, z0], to: [x0, z1], height, base, thick, mat, openings: rel(w, z0) },
  );
}
const door = (at, width = 1.4, top = 2.3) => ({ at, width, bottom: 0, top });
const window_ = (at, width = 1.6, bottom = 1.0, top = 2.0) => ({ at, width, bottom, top });

// ---------------------------------------------------------------- ground and the edge of the map
add(
  { type: 'box', size: [112, 1, 112], at: [0, -1, 3], mat: 'ground' },
  { type: 'box', size: [113, 4, 1], at: [0, 0, -53.5], mat: 'wall' },
  { type: 'box', size: [113, 4, 1], at: [0, 0, 59.5], mat: 'wall' },
  { type: 'box', size: [1, 4, 112], at: [56.5, 0, 3], mat: 'wall' },
  { type: 'box', size: [1, 4, 112], at: [-56.5, 0, 3], mat: 'wall' },
);

// ---------------------------------------------------------------- the perimeter wall
room(-36, -36, 36, 24, {
  height: 3.2, thick: 0.4, mat: 'concrete',
  s: [{ at: 0, width: 5, bottom: 0, top: 3.2 }],          // the main gate
  e: [{ at: 0, width: 2.4, bottom: 0, top: 3.2 }],        // a breach blown in the east wall
  w: [{ at: 10, width: 1.4, bottom: 0, top: 1.35 }],      // a drain: crouch to get through (enemies can't follow)
});
add(
  // Gate posts and a lintel.
  { type: 'box', size: [0.8, 4, 0.8], at: [-2.9, 0, 24], mat: 'post' },
  { type: 'box', size: [0.8, 4, 0.8], at: [2.9, 0, 24], mat: 'post' },
  { type: 'box', size: [6.6, 0.5, 0.8], at: [0, 4, 24], mat: 'post' },
  // Rubble by the breach.
  { type: 'box', size: [1.2, 0.7, 1.0], at: [37.5, 0, -2.2], mat: 'concrete' },
  { type: 'box', size: [0.9, 0.5, 1.4], at: [38.4, 0, 2.4], rotY: deg(20), mat: 'concrete' },
  { type: 'box', size: [1.0, 0.6, 0.9], at: [34.6, 0, 2.0], rotY: deg(-15), mat: 'concrete' },
);

// ---------------------------------------------------------------- the approach (outside, south)
add(
  // The berm you start behind: nobody inside can see you here.
  { type: 'box', size: [16, 3, 3], at: [-10, 0, 37], mat: 'ground' },
  { type: 'box', size: [4, 2, 3], at: [-19.5, 0, 37.5], rotY: deg(12), mat: 'ground' },
  // A burnt-out truck on the road, rocks and a sandbagged checkpoint by the gate.
  { type: 'box', size: [2.2, 1.3, 4.6], at: [6, 0, 33], rotY: deg(8), mat: 'steel' },
  { type: 'box', size: [2.0, 0.9, 1.8], at: [6.3, 1.3, 31.6], rotY: deg(8), mat: 'steel' },
  { type: 'box', size: [2, 1.2, 1.6], at: [-24, 0, 30], rotY: deg(25), mat: 'concrete' },
  { type: 'box', size: [1.6, 1.0, 1.6], at: [16, 0, 29], rotY: deg(-10), mat: 'concrete' },
  { type: 'box', size: [2.4, 1.6, 2], at: [26, 0, 34], rotY: deg(30), mat: 'concrete' },
  { type: 'sandbags', from: [-6.5, 27.5], to: [-3.2, 27.5] },
  { type: 'sandbags', from: [3.2, 27.5], to: [6.5, 27.5] },
  // The road.
  { type: 'paint', size: [6, 20], at: [0, 0, 34], color: '#5a5a4c' },
  { type: 'paint', size: [14, 4], at: [-7, 0, 42], color: '#5a5a4c' },
);

// ---------------------------------------------------------------- the house (north-west), two floors
{
  const [x0, z0, x1, z1] = [-30, -30, -16, -18];
  const FLOOR = 3.3; // the upstairs floor's top
  // Ground floor.
  room(x0, z0, x1, z1, {
    height: 3,
    s: [door(-26), window_(-21)],
    e: [door(-26)],
    n: [door(-28), window_(-23, 2)],
    w: [window_(-24)],
  });
  add({ type: 'wall', from: [-23, z0], to: [-23, z1], height: 3, openings: [door(6)] });
  // Stairs up the inside of the east wall, climbing north. 12 steps of 0.275 m make 3.3 m.
  // (Steps at least 0.35 m deep: enemies' route-finding needs that. See the stairs piece in kit.js.)
  add({ type: 'stairs', at: [-17, 0, -19.6], width: 1.6, rise: 0.275, steps: 12, run: 0.35, mat: 'stairs' });
  // The upstairs floor, with a hole over the stairs.
  add(
    { type: 'box', size: [12.15, 0.3, 12], at: [-23.925, 3, -24], mat: 'floor' },
    { type: 'box', size: [1.85, 0.3, 6.2], at: [-16.925, 3, -26.9], mat: 'floor' },
    { type: 'wall', from: [-17.85, -18.15], to: [-17.85, -23.8], height: 1.0, base: FLOOR, thick: 0.1, mat: 'post' },
  );
  // Upstairs walls, windows over the courtyard, a door out to the balcony.
  room(x0, z0, x1, z1, {
    height: 2.8, base: FLOOR,
    s: [door(-27, 1.4, 2.2), window_(-22, 1.8, 1.0, 2.1)],
    e: [window_(-27, 1.8, 1.0, 2.1)],
    n: [window_(-24, 1.6, 1.0, 2.1)],
    w: [window_(-22, 1.6, 1.0, 2.1)],
  });
  add({ type: 'wall', from: [-22, z0], to: [-22, -24], height: 2.8, base: FLOOR });
  // The balcony: a Marksman's lookout over the courtyard.
  add(
    { type: 'box', size: [9, 0.3, 2.2], at: [-25.5, 3, -16.9], mat: 'floor' },
    { type: 'wall', from: [-30, -15.85], to: [-21, -15.85], height: 1.05, base: FLOOR, thick: 0.15, mat: 'post' },
    { type: 'wall', from: [-21.05, -15.85], to: [-21.05, -18], height: 1.05, base: FLOOR, thick: 0.15, mat: 'post' },
    { type: 'wall', from: [-29.95, -15.85], to: [-29.95, -18], height: 1.05, base: FLOOR, thick: 0.15, mat: 'post' },
    { type: 'box', size: [0.3, 3, 0.3], at: [-29.8, 0, -16], mat: 'post' },
    { type: 'box', size: [0.3, 3, 0.3], at: [-21.2, 0, -16], mat: 'post' },
    // Roof.
    { type: 'box', size: [14.3, 0.3, 12.3], at: [-23, 6.1, -24], mat: 'roof' },
    // Furniture: a table and a sofa downstairs, crates upstairs.
    { type: 'box', size: [1.8, 0.8, 1.0], at: [-27, 0, -24], mat: 'plank' },
    { type: 'box', size: [2.2, 0.85, 0.9], at: [-19.5, 0, -28.8], mat: 'crate' },
    { type: 'box', size: [1.1, 1.1, 1.1], at: [-26, FLOOR, -28], mat: 'crate' },
    { type: 'box', size: [1.4, 0.9, 1.0], at: [-19.5, FLOOR, -28.5], mat: 'crate' },
  );
}

// ---------------------------------------------------------------- the warehouse (north-east)
{
  const [x0, z0, x1, z1] = [12, -32, 32, -16];
  room(x0, z0, x1, z1, {
    height: 5.5, mat: 'steel',
    s: [door(17, 3.6, 3.2), door(27, 3.6, 3.2)],   // roller doors (open)
    w: [door(-24)],
    e: [door(-28)],
    n: [window_(18, 2, 3.4, 4.3), window_(26, 2, 3.4, 4.3)],
  });
  add(
    { type: 'box', size: [20.3, 0.3, 16.3], at: [22, 5.5, -24], mat: 'roof' },
    // Shelving rows (north-south), crates, a forklift.
    { type: 'box', size: [1.0, 2.4, 6], at: [15, 0, -27], mat: 'plank' },
    { type: 'box', size: [1.0, 2.4, 6], at: [19.5, 0, -27], mat: 'plank' },
    { type: 'box', size: [1.0, 2.4, 6], at: [24.5, 0, -27], mat: 'plank' },
    { type: 'box', size: [1.0, 2.4, 6], at: [29, 0, -27], mat: 'plank' },
    { type: 'box', size: [1.2, 1.2, 1.2], at: [20.5, 0, -19.5], mat: 'crate' },
    { type: 'box', size: [1.0, 1.0, 1.0], at: [24, 0, -21], mat: 'crate' },
    { type: 'box', size: [1.0, 1.0, 1.0], at: [24, 1.0, -21], mat: 'crate' },
    { type: 'box', size: [1.4, 1.7, 2.6], at: [22, 0, -18.6], mat: 'container_red' },
    { type: 'box', size: [1.2, 0.9, 1.2], at: [14.2, 0, -19], mat: 'crate' },
  );
}

// ---------------------------------------------------------------- the barracks (south-west)
{
  const [x0, z0, x1, z1] = [-30, 4, -16, 16];
  room(x0, z0, x1, z1, {
    height: 3,
    e: [door(10)],
    w: [door(10)],
    n: [window_(-26, 1.4), window_(-20, 1.4)],
    s: [window_(-26, 1.4), window_(-20, 1.4)],
  });
  // A corridor down the middle, two rooms each side.
  add(
    { type: 'wall', from: [x0, 8.5], to: [x1, 8.5], height: 3, openings: [door(4), door(10)] },
    { type: 'wall', from: [x0, 11.5], to: [x1, 11.5], height: 3, openings: [door(4), door(10)] },
    { type: 'wall', from: [-23, z0], to: [-23, 8.5], height: 3 },
    { type: 'wall', from: [-23, 11.5], to: [-23, z1], height: 3 },
    { type: 'box', size: [14.3, 0.3, 12.3], at: [-23, 3, 10], mat: 'roof' },
    // Bunks: low cover in each room.
    { type: 'box', size: [0.9, 0.7, 2.0], at: [-28.8, 0, 6.2], mat: 'plank' },
    { type: 'box', size: [0.9, 0.7, 2.0], at: [-17.2, 0, 6.2], mat: 'plank' },
    { type: 'box', size: [0.9, 0.7, 2.0], at: [-28.8, 0, 13.8], mat: 'plank' },
    { type: 'box', size: [0.9, 0.7, 2.0], at: [-17.2, 0, 13.8], mat: 'plank' },
    { type: 'box', size: [1.4, 0.8, 0.7], at: [-24.6, 0, 14.9], mat: 'crate' },
  );
}

// ---------------------------------------------------------------- the guard tower (south-east corner)
{
  const [cx, cz, top] = [30, 14, 4];
  add(
    { type: 'box', size: [3.4, 0.3, 3.4], at: [cx, top - 0.3, cz], mat: 'floor' },
    { type: 'box', size: [0.3, top - 0.3, 0.3], at: [cx - 1.55, 0, cz - 1.55], mat: 'post' },
    { type: 'box', size: [0.3, top - 0.3, 0.3], at: [cx + 1.55, 0, cz - 1.55], mat: 'post' },
    { type: 'box', size: [0.3, top - 0.3, 0.3], at: [cx - 1.55, 0, cz + 1.55], mat: 'post' },
    { type: 'box', size: [0.3, top - 0.3, 0.3], at: [cx + 1.55, 0, cz + 1.55], mat: 'post' },
    // Low walls round the top (a gap on the south side, where the stairs arrive).
    { type: 'wall', from: [cx - 1.7, cz - 1.7], to: [cx + 1.7, cz - 1.7], height: 1.0, base: top, thick: 0.15, mat: 'steel' },
    { type: 'wall', from: [cx - 1.7, cz - 1.7], to: [cx - 1.7, cz + 1.7], height: 1.0, base: top, thick: 0.15, mat: 'steel' },
    { type: 'wall', from: [cx + 1.7, cz - 1.7], to: [cx + 1.7, cz + 1.7], height: 1.0, base: top, thick: 0.15, mat: 'steel' },
    { type: 'wall', from: [cx - 1.7, cz + 1.7], to: [cx - 0.75, cz + 1.7], height: 1.0, base: top, thick: 0.15, mat: 'steel' },
    { type: 'wall', from: [cx + 0.75, cz + 1.7], to: [cx + 1.7, cz + 1.7], height: 1.0, base: top, thick: 0.15, mat: 'steel' },
    // 16 steps of 0.25 m, climbing north to the platform.
    { type: 'stairs', at: [cx, 0, cz + 1.7 + 16 * 0.35], width: 1.3, rise: 0.25, steps: 16, run: 0.35, mat: 'stairs' },
  );
}

// ---------------------------------------------------------------- the courtyard
add(
  // Shipping containers: high cover. One is open; you can hide inside it.
  { type: 'container', at: [-4, 0, -8] },
  { type: 'container', at: [4, 0, 2], rotY: WEST, mat: 'container_red' },
  { type: 'container', at: [4.2, 2.6, 2.3], rotY: WEST, mat: 'container_blue' },
  { type: 'container', at: [-10, 0, 7], rotY: WEST, open: true, mat: 'container_blue' },
  { type: 'container', at: [14, 0, -7], mat: 'container_blue' },
  // Sandbags: low cover.
  { type: 'sandbags', from: [-6, 17], to: [-2, 17] },
  { type: 'sandbags', from: [6, 12], to: [10, 12] },
  { type: 'sandbags', from: [16, -11], to: [22, -11] },
  { type: 'sandbags', from: [-14, -12], to: [-10, -12] },
  { type: 'sandbags', from: [-1, -14], to: [3, -14] },
  // Crates and a parked truck.
  { type: 'box', size: [1.2, 1.2, 1.2], at: [8, 0, -12], mat: 'crate' },
  { type: 'box', size: [1.2, 1.2, 1.2], at: [-14, 0, 0], mat: 'crate' },
  { type: 'box', size: [1.0, 1.0, 1.0], at: [-13.4, 0, 1.3], mat: 'crate' },
  { type: 'box', size: [1.4, 1.1, 1.0], at: [-2, 0, 11], mat: 'crate' },
  { type: 'box', size: [1.2, 1.2, 1.2], at: [20, 0, 6], mat: 'crate' },
  { type: 'box', size: [1.0, 1.0, 1.0], at: [20, 1.2, 6], mat: 'crate' },
  { type: 'box', size: [2.4, 1.3, 5.2], at: [16, 0, 13], mat: 'container' },
  { type: 'box', size: [2.4, 1.2, 1.8], at: [16, 1.3, 11.2], mat: 'steel' },
);

// ---------------------------------------------------------------- signs
add(
  {
    type: 'sign', at: [-14, 2.0, 40.6], size: [4.6, 1.5], post: true,
    title: 'THE COMPOUND',
    lines: ['Clear every hostile. The timer starts when you leave this area.', 'Ways in: the main gate, a breach in the east wall,', 'a drain in the west wall (crouch through it).'],
  },
  { type: 'trigger', id: 'compound:start', at: [-14, 0, 45], size: [12, 3, 8], paint: '#3d5a36' },
);

// ---------------------------------------------------------------- the enemy
// 16 soldiers in 6 squads. Squad-mates share what they know; nearby squads hear it on the radio.
add(
  // The gate.
  { type: 'enemy', role: 'rifleman', squad: 'gate', at: [-4, 0, 19.5], yaw: SOUTH },
  { type: 'enemy', role: 'rifleman', squad: 'gate', at: [8, 0, 19], patrol: [[8, 19], [24, 19], [24, 8], [10, 15]] },
  { type: 'enemy', role: 'rusher', squad: 'gate', at: [6, 0, 14.5], yaw: deg(160) },
  // The courtyard.
  { type: 'enemy', role: 'rifleman', squad: 'yard', at: [-8, 0, -2], patrol: [[-8, -2], [9, -3], [9, 7], [-6, 4]] },
  { type: 'enemy', role: 'rifleman', squad: 'yard', at: [1, 0, -12.6], yaw: SOUTH },
  { type: 'enemy', role: 'rusher', squad: 'yard', at: [-13, 0, 4], patrol: [[-13, 4], [-13, -9], [-3, -13]] },
  { type: 'enemy', role: 'rusher', squad: 'yard', at: [10, 0, -3], yaw: facing(10, -3, 0, 20) },
  // The house.
  { type: 'enemy', role: 'marksman', squad: 'house', at: [-24, 3.3, -16.8], yaw: facing(-24, -16.8, 0, 20), perch: true },
  { type: 'enemy', role: 'rifleman', squad: 'house', at: [-19.5, 3.3, -26], yaw: EAST },
  { type: 'enemy', role: 'rifleman', squad: 'house', at: [-14, 0, -16], patrol: [[-14, -16], [-14, -28], [-10, -28], [-10, -16]] },
  // The warehouse.
  { type: 'enemy', role: 'rifleman', squad: 'warehouse', at: [22, 0, -22.5], yaw: SOUTH },
  { type: 'enemy', role: 'rusher', squad: 'warehouse', at: [17, 0, -23], yaw: SOUTH },
  { type: 'enemy', role: 'rifleman', squad: 'warehouse', at: [14, 0, -13.5], patrol: [[14, -13.5], [30, -13.5]] },
  // The tower.
  { type: 'enemy', role: 'marksman', squad: 'tower', at: [30, 4, 13.4], yaw: facing(30, 13.4, 0, 22), perch: true },
  // The barracks.
  { type: 'enemy', role: 'rifleman', squad: 'barracks', at: [-21, 0, 10], yaw: EAST },
  { type: 'enemy', role: 'rusher', squad: 'barracks', at: [-14, 0, 2], patrol: [[-14, 2], [-14, 18], [-32, 18], [-32, 2]] },
);

export default {
  name: 'The Compound',
  spawn: { pos: [-14, 0, 45], yaw: NORTH },
  sun: { azimuth: deg(35), elevation: deg(48) },
  nav: { min: [-46, -42], max: [46, 52] },
  pieces,
};
