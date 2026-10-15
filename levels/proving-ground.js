// PROVING GROUND: the movement training course for milestone 1.
//
// This file is the whole level. It's just data: a list of pieces from the
// level kit (src/world/kit.js). Change a number, reload, and the world changes.
//
// Layout, seen from above (north is up, you spawn in the middle facing north):
//
//                 [ sprint lane, 60 m ]          [ tower + slide hill ]   [ firing ]
//     [mantle   ] [ crouch tunnel ]   ARCH       [ steps and ramps    ]   [ range  ]
//     [ wall    ]              (spawn)
//   [ kill house ]          [ jump gaps ]
//
// Facing guide for signs (rotY): 0 = readable from the south, PI = from the north,
// PI/2 = from the east, -PI/2 = from the west.

const PI = Math.PI;
const EAST = -PI / 2; // rotY that makes a ramp or stairs climb towards the east
const SOUTH = PI;     // ... towards the south

const deg = (d) => (d * PI) / 180;

// A ramp of `height` metres at `angle` degrees needs this much length.
const rampLength = (height, angle) => height / Math.tan(deg(angle));

const pieces = [];
const add = (...p) => pieces.push(...p);

// ---------------------------------------------------------------- ground and walls
add(
  { type: 'box', size: [140, 1, 140], at: [0, -1, 0], mat: 'ground' },
  { type: 'box', size: [141, 5, 1], at: [0, 0, -70.5], mat: 'wall' },
  { type: 'box', size: [141, 5, 1], at: [0, 0, 70.5], mat: 'wall' },
  { type: 'box', size: [1, 5, 140], at: [70.5, 0, 0], mat: 'wall' },
  { type: 'box', size: [1, 5, 140], at: [-70.5, 0, 0], mat: 'wall' },
);

// ---------------------------------------------------------------- spawn plaza
add(
  // The entrance arch over the sprint lane.
  { type: 'box', size: [0.3, 3.5, 0.3], at: [-2.75, 0, -7], mat: 'post' },
  { type: 'box', size: [0.3, 3.5, 0.3], at: [2.75, 0, -7], mat: 'post' },
  { type: 'sign', at: [0, 3.0, -7], size: [5.2, 1.0], title: 'PROVING GROUND', lines: ['Sprint lane: hold SHIFT to sprint, press C to slide'] },
  { type: 'sign', floor: true, at: [0, 0, -3.6], size: [3.6, 0.5], title: 'PRESS ` (UNDER ESC) FOR THE TUNING PANEL', plain: true },

  { type: 'sign', at: [-4.6, 1.5, -3], size: [2.2, 0.9], post: true, arrow: 'left', title: 'MANTLE WALL', lines: ['Crouch tunnel, kill house'] },
  { type: 'sign', at: [4.6, 1.5, -3], size: [2.2, 0.9], post: true, arrow: 'right', title: 'STEPS & RAMPS', lines: ['Tower, firing range'] },

  // A few obstacles to play with right away.
  { type: 'box', size: [1, 1, 1], at: [6, 0, 4], mat: 'crate' },
  { type: 'box', size: [1.5, 1.5, 1.5], at: [7.8, 0, 6.6], mat: 'crate' },
  { type: 'box', size: [1, 1, 1], at: [7.8, 1.5, 6.6], mat: 'crate' },
  { type: 'box', size: [3, 1.3, 0.4], at: [8, 0, -3.5], mat: 'concrete' },
  { type: 'box', size: [5, 1.0, 0.4], at: [-6.5, 0, 4], mat: 'concrete' },
  { type: 'sign', at: [-6.5, 0.5, 4.21], size: [1.6, 0.5], title: 'VAULT 1.0 m' },
);

// ---------------------------------------------------------------- sprint lane (north)
const LANE_START = -10;
const LANE_LENGTH = 60;
add(
  { type: 'paint', size: [6, LANE_LENGTH], at: [0, 0, LANE_START - LANE_LENGTH / 2], color: '#383d35' },
);
for (let m = 0; m <= LANE_LENGTH; m += 5) {
  const z = LANE_START - m;
  add({ type: 'paint', size: [6, m % 10 === 0 ? 0.16 : 0.08], at: [0, 0, z], color: '#c9c3b0' });
  if (m % 10 === 0) add({ type: 'sign', floor: true, at: [-2.2, 0, z - 0.6], size: [1.2, 0.6], title: `${m} m`, plain: true });
}

// ---------------------------------------------------------------- mantle wall (west)
const MANTLE_HEIGHTS = [0.75, 1.25, 1.75, 2.25, 2.75];
add({ type: 'sign', at: [-12.5, 1.6, -13], rotY: PI / 2, size: [2.8, 1.2], post: true, title: 'MANTLE WALL', lines: ['Run at a ledge and press SPACE', 'Jump first to reach higher ledges'] });
MANTLE_HEIGHTS.forEach((h, i) => {
  const z = -10 + i * 4;
  const tooHigh = h > 2.5;
  add(
    { type: 'box', size: [2, h, 3], at: [-17, 0, z], mat: tooHigh ? 'hazard' : 'ledge' },
    {
      type: 'sign', at: [-15.98, Math.min(h / 2, 1.1), z], rotY: PI / 2,
      size: [1.6, Math.min(0.6, h * 0.7)], title: `${h.toFixed(2)} m`, lines: tooHigh ? ['too high'] : [],
    },
  );
});

// ---------------------------------------------------------------- crouch tunnel
add(
  { type: 'box', size: [0.6, 2.0, 8], at: [-9.5, 0, -22], mat: 'concrete' },
  { type: 'box', size: [0.6, 2.0, 8], at: [-6.5, 0, -22], mat: 'concrete' },
  { type: 'box', size: [3.6, 0.7, 8], at: [-8, 1.3, -22], mat: 'concrete' },
  { type: 'sign', at: [-8, 1.65, -17.98], size: [3.2, 0.6], title: 'CROUCH TUNNEL · HOLD C' },
);

// ---------------------------------------------------------------- steps and ramps (east)
const X0 = 14; // where each test starts
const tests = [
  { z: -20, stairs: { rise: 0.2, steps: 8, run: 0.35 }, title: 'STEPS 0.2 m', lines: ['walk straight up'] },
  { z: -14, stairs: { rise: 0.3, steps: 6, run: 0.4 }, title: 'STEPS 0.3 m', lines: ['walk straight up'] },
  { z: -8, stairs: { rise: 0.5, steps: 4, run: 0.6 }, title: 'STEPS 0.5 m', lines: ['too tall: jump them'] },
  { z: 0, ramp: 15, title: 'RAMP 15°' },
  { z: 6, ramp: 30, title: 'RAMP 30°' },
  { z: 12, ramp: 45, title: 'RAMP 45°', lines: ['steepest you can walk'] },
  { z: 18, ramp: 55, title: 'RAMP 55°', lines: ['too steep: you slide off'], mat: 'hazard' },
];
for (const t of tests) {
  if (t.stairs) {
    add({ type: 'stairs', at: [X0, 0, t.z], rotY: EAST, width: 3, landing: 3, ...t.stairs });
  } else {
    const length = rampLength(2, t.ramp);
    add({ type: 'ramp', at: [X0 + length / 2, 0, t.z], rotY: EAST, width: 3, length, height: 2, landing: 3, mat: t.mat ?? 'ramp' });
  }
  add({ type: 'sign', at: [12.6, 1.3, t.z + 2.3], rotY: -PI / 2, size: [1.8, 0.8], post: true, title: t.title, lines: t.lines ?? [] });
}

// ---------------------------------------------------------------- tower and slide hill (north-east)
const TOWER_H = 5;
const HILL_ANGLE = 20;
const hill = rampLength(TOWER_H, HILL_ANGLE);
add(
  { type: 'box', size: [10, TOWER_H, 10], at: [25, 0, -45], mat: 'concrete' },
  { type: 'stairs', at: [13, 0, -45], rotY: EAST, width: 3, rise: 0.25, steps: 20, run: 0.35 },
  { type: 'ramp', at: [25, 0, -40 + hill / 2], width: 8, length: hill, height: TOWER_H, mat: 'ramp' },
  { type: 'sign', at: [11.6, 1.5, -42], rotY: -PI / 2, size: [2.2, 0.9], post: true, title: 'TOWER 5 m', lines: ['Jump off. Feel the landing.'] },
  { type: 'sign', floor: true, at: [25, TOWER_H, -41.2], rotY: SOUTH, size: [4, 1.1], title: 'SLIDE HILL', lines: ['sprint, then press C going down'] },
);

// ---------------------------------------------------------------- jump gaps (south)
const PLAT_H = 1.2;
const gaps = [2, 3, 4, 5, 6];
add(
  { type: 'stairs', at: [0, 0, 10.4], rotY: SOUTH, width: 4, rise: 0.3, steps: 4, run: 0.4 },
  { type: 'sign', at: [3.6, 1.4, 10.2], rotY: SOUTH, size: [2.8, 1.1], post: true, title: 'JUMP GAPS', lines: ['Which can you clear walking,', 'sprinting, or slide-jumping?'] },
);
let z = 12;
let platLength = 6;
add({ type: 'box', size: [4, PLAT_H, platLength], at: [0, 0, z + platLength / 2], mat: 'concrete' });
for (const gap of gaps) {
  add({ type: 'sign', floor: true, at: [0, PLAT_H, z + platLength - 0.8], rotY: SOUTH, size: [2, 0.8], title: `GAP ${gap} m`, plain: true });
  z += platLength + gap;
  platLength = gap === gaps.at(-1) ? 6 : 4;
  add({ type: 'box', size: [4, PLAT_H, platLength], at: [0, 0, z + platLength / 2], mat: 'concrete' });
}

// ---------------------------------------------------------------- firing range (east)
// Stand behind the benches and shoot north. Lanes are 7 m wide, from x = 34 to 62.
const BENCH_Z = -6.6;
const RANGE_Z = (metres) => BENCH_Z - 0.4 - metres; // distance from the firing line
const LANES = [37.5, 44.5, 51.5, 58.5];
add(
  { type: 'rack', at: [LANES[0], 0, BENCH_Z], size: [4.5, 0.95, 0.7], weapons: ['carbine', 'smg', 'shotgun', 'pistol'] },
  ...LANES.slice(1).map((x) => ({ type: 'box', size: [4.5, 0.95, 0.7], at: [x, 0, BENCH_Z], mat: 'plank' })),
  ...[34, 41, 48, 55, 62].map((x) => ({ type: 'paint', size: [0.1, 52], at: [x, 0, BENCH_Z - 26], color: '#6a6f60' })),
  { type: 'box', size: [32, 3, 4], at: [48, 0, RANGE_Z(56)], mat: 'ground' }, // earth bank behind the targets
  { type: 'sign', at: [31.4, 1.6, -4], size: [2.8, 1.2], post: true, title: 'FIRING RANGE', lines: ['Paper drops and pops back up. Steel rings.', '1–4 swap guns · R reload · right mouse aims'] },
);
for (const m of [10, 25, 35, 50]) {
  add({ type: 'sign', floor: true, at: [33, 0, RANGE_Z(m) + 0.6], size: [1.6, 0.6], title: `${m} m`, plain: true });
}
add(
  { type: 'target', kind: 'paper', at: [LANES[0], 0, RANGE_Z(10)] },
  { type: 'target', kind: 'paper', at: [LANES[1], 0, RANGE_Z(10)] },
  { type: 'target', kind: 'paper', at: [LANES[1], 0, RANGE_Z(25)] },
  { type: 'target', kind: 'paper', at: [LANES[2], 0, RANGE_Z(25)] },
  { type: 'target', kind: 'steel', at: [56.5, 0, RANGE_Z(25)] },
  { type: 'target', kind: 'steel', at: [58.5, 0, RANGE_Z(25)] },
  { type: 'target', kind: 'steel', at: [60.5, 0, RANGE_Z(25)] },
  { type: 'target', kind: 'mover', at: [36, 0, RANGE_Z(35)], to: [60, 0, RANGE_Z(35)], speed: 2.2 },
  { type: 'target', kind: 'paper', at: [LANES[0], 0, RANGE_Z(50)] },
  { type: 'target', kind: 'paper', at: [LANES[2], 0, RANGE_Z(50)] },
  { type: 'target', kind: 'steel', at: [LANES[3], 0, RANGE_Z(50)] },
);

// ---------------------------------------------------------------- kill house (south-west)
// Four rooms. Enter through the north door, clear every room, leave by the south door.
//
//   x: -46 ............ -34 ............ -22
//   z 16  [ room 1 (NW) ] | [ room 2 (NE) ]   <- entrance door in the north wall
//   z 24  ---door-----------------door-----
//         [ room 3 (SW) ] : [ room 4 (SE) ]   (":" is a thin wooden wall bullets go through)
//   z 36  ---exit door----------------------
const KH = 'killhouse';
const DOOR = { width: 1.3, bottom: 0, top: 2.2 };
const WINDOW = { width: 1.6, bottom: 1.0, top: 2.0 };
const W = PI / 2;
add(
  { type: 'wall', from: [-46, 16], to: [-22, 16], openings: [{ at: 16, ...DOOR }] },
  { type: 'wall', from: [-46, 36], to: [-22, 36], openings: [{ at: 6, ...DOOR }] },
  { type: 'wall', from: [-46, 16], to: [-46, 36], openings: [{ at: 11, ...WINDOW }] },
  { type: 'wall', from: [-22, 16], to: [-22, 36], openings: [{ at: 5, ...WINDOW }] },
  { type: 'wall', from: [-46, 24], to: [-22, 24], openings: [{ at: 6, ...DOOR }, { at: 18, ...DOOR }] },
  { type: 'wall', from: [-34, 16], to: [-34, 24], openings: [{ at: 4, ...DOOR }] },
  { type: 'wall', from: [-34, 24], to: [-34, 36], thick: 0.12, mat: 'plank', openings: [{ at: 6, ...DOOR }] },
  { type: 'box', size: [5, 1.0, 0.3], at: [-28, 0, 31], mat: 'concrete' },
  { type: 'box', size: [1, 1, 1], at: [-38, 0, 22.4], mat: 'crate' },

  { type: 'trigger', id: `${KH}:start`, at: [-30, 0, 12.5], size: [3, 3, 3], paint: '#4f7a3a' },
  { type: 'trigger', id: `${KH}:finish`, at: [-40, 0, 39], size: [3, 3, 3], paint: '#b8862f' },
  { type: 'sign', at: [-34.2, 1.7, 12.5], rotY: PI, size: [3.2, 1.2], post: true, title: 'KILL HOUSE', lines: ['Stand on the green pad. The timer starts when you step off.', 'Shoot every target, not the hostages. Finish on the amber pad.'] },
  { type: 'sign', at: [-34.2, 1.7, 12.5], rotY: 0, size: [3.2, 1.2], title: 'KILL HOUSE', lines: ['Entrance: north door'] },

  // Room 2 (north-east): you come in here, heading south.
  { type: 'target', kind: 'popup', group: KH, at: [-24, 0, 18.5], rotY: -W },
  { type: 'target', kind: 'popup', group: KH, at: [-25.5, 0, 22.8], rotY: PI },
  { type: 'target', kind: 'hostage', group: KH, at: [-31.5, 0, 22.8], rotY: PI },
  // Room 1 (north-west): through the door in the middle wall, heading west.
  { type: 'target', kind: 'popup', group: KH, at: [-44.6, 0, 17.6], rotY: W },
  { type: 'target', kind: 'popup', group: KH, at: [-44.6, 0, 22.2], rotY: W },
  { type: 'target', kind: 'hostage', group: KH, at: [-41, 0, 19.8], rotY: W },
  // Room 4 (south-east): through the right-hand door, heading south.
  { type: 'target', kind: 'popup', group: KH, at: [-24, 0, 34.6], rotY: PI },
  { type: 'target', kind: 'popup', group: KH, at: [-31, 0, 34.6], rotY: PI },
  { type: 'target', kind: 'popup', group: KH, at: [-33.3, 0, 26.5], rotY: W },
  // Room 3 (south-west): through the wooden wall's door, heading west.
  { type: 'target', kind: 'popup', group: KH, at: [-45, 0, 26], rotY: W },
  { type: 'target', kind: 'popup', group: KH, at: [-45, 0, 34], rotY: W },
  { type: 'target', kind: 'hostage', group: KH, at: [-42, 0, 30.4], rotY: W },
  { type: 'target', kind: 'popup', group: KH, at: [-38, 0, 35], rotY: PI },
);

export default {
  name: 'Proving Ground',
  spawn: { pos: [0, 0, 0], yaw: 0 },
  sun: { azimuth: deg(25), elevation: deg(50) }, // from the south-south-east, behind you at spawn
  pieces,
};
