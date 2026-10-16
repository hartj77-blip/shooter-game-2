// The missions: what you're sent to do, written down as data.
//
// A mission is a list of STAGES (game/objectives.js does the work), the sites
// each stage can use (the level's `site` pieces; which ones a game uses is
// picked from its seed), how the director should pace it (game/director.js),
// and its KEY MOMENTS: things that happen when something happens, like a
// film script. "When the download starts, a truck pulls up at the east road."
//
// Moment names come from the objectives (rescue:freed, intel:download,
// intel:downloaded, intel:pickup, sabotage:destroyed, sabotage:done,
// hold:start, hold:half, hold:late, hold:done, extract:called, extract:landed)
// plus 'start'. Each can send a wave ({ wave: size or true, entry }), start a
// crescendo, give a breather (relax), and say something on the radio (say).
//
// Missions play on maps from the same folder (the Harbour, for now): main.js
// turns each into its own entry in the map list, so a mission is chosen just
// like a map.

export const MISSIONS = [
  {
    id: 'harbour-rescue',
    map: 'harbour',
    title: 'Lifeline',
    kind: 'Rescue',
    brief: "A ship's engineer is being held somewhere in the fishing village. Find them, free them and get them to the helicopter.",
    stages: [
      { kind: 'rescue', sites: ['net-shed', 'chapel', 'smokehouse'] },
      { kind: 'extract', lz: 'lz', inbound: 60 },
    ],
    director: { calm: 40 },
    moments: {
      start: { say: 'Overlord to squad: the hostage is in the village, west side. Keep them alive.' },
      'rescue:freed': { wave: true, entry: 'village-road', say: "Good work. They know you're there. Get to the car park and call the bird." },
      'extract:called': { crescendo: true, say: 'Helicopter inbound, sixty seconds. Hold the landing zone.' },
      'extract:landed': { say: "She's down. Everybody aboard, the engineer too!" },
    },
  },
  {
    id: 'harbour-intel',
    map: 'harbour',
    title: 'Dead Drop',
    kind: 'Intel',
    brief: 'Their shipping records are on a laptop in one of three rooms. Download them (a minute, while they come for you) and carry the drive out.',
    stages: [
      { kind: 'intel', sites: ['office', 'mezzanine', 'dock-hut'], download: 60 },
      { kind: 'extract', lz: 'lz', inbound: 60 },
    ],
    director: { calm: 35 },
    moments: {
      start: { say: 'Overlord to squad: the laptop is in the office, the warehouse or the dock hut. Find it.' },
      'intel:download': { wave: true, entry: 'east-road', say: 'Download started. A truck just came through the east road. Defend that laptop.' },
      'intel:downloaded': { say: 'Download complete. Take the drive.' },
      'intel:pickup': { wave: true, say: 'Got it? Whoever has the drive, stay alive. Head for the car park.' },
      'extract:called': { crescendo: true, say: 'Helicopter inbound, sixty seconds.' },
      'extract:landed': { say: 'Bird is down. The drive comes with you.' },
    },
  },
  {
    id: 'harbour-sabotage',
    map: 'harbour',
    title: 'Short Fuse',
    kind: 'Sabotage',
    brief: 'Three weapons caches are hidden around the port. Plant a charge on each, get clear, then get out.',
    stages: [
      { kind: 'sabotage', sites: ['cache-yard-1', 'cache-yard-2', 'cache-quay', 'cache-warehouse', 'cache-village'], caches: 3 },
      { kind: 'extract', lz: 'lz', inbound: 60 },
    ],
    director: { calm: 35 },
    moments: {
      start: { say: 'Overlord to squad: three caches, somewhere in the yard, the quay, warehouse B or the village. Blow them all.' },
      'sabotage:destroyed': { wave: true, say: 'That one heard round the port. More are coming.' },
      'sabotage:done': { relax: true, say: 'All three gone. Get to the car park and call it in.' },
      'extract:called': { crescendo: true, say: 'Helicopter inbound, sixty seconds.' },
    },
  },
  {
    id: 'harbour-hold',
    map: 'harbour',
    title: 'Last Light',
    kind: 'Hold the line',
    brief: 'Get to the lighthouse, switch on its radio, and hold the headland for three minutes while it brings the helicopter in.',
    stages: [
      { kind: 'hold', sites: ['lighthouse'], hold: 180 },
      { kind: 'extract', lz: 'lz-headland', called: true, inbound: 20 },
    ],
    director: { calm: 45, gap: [24, 36] },
    moments: {
      start: { say: "Overlord to squad: the lighthouse radio is our only way to call you out. Get there." },
      'hold:start': { wave: true, say: "We hear you. Three minutes. Don't let them take that headland." },
      'hold:half': { wave: 5, say: 'Halfway. Boats on the water, more coming.' },
      'hold:late': { crescendo: true, say: 'Almost there. Hold on!' },
      'hold:done': { say: 'Helicopter is twenty seconds out. Landing on the headland.' },
      'extract:landed': { say: 'Down on the headland. Everybody in!' },
    },
  },
];

/**
 * Every mission as an entry for the map list (main.js): the map it plays on,
 * with the mission attached. `maps` is { id: level definition }.
 */
export function missionLevels(maps) {
  const out = {};
  for (const m of MISSIONS) out[m.id] = { ...maps[m.map], mission: m };
  return out;
}
