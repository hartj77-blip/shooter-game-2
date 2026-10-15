// Enemy roles and difficulty, as tables of numbers.
//
// Every enemy runs the same brain (ai/brain.js). What makes a Rusher different
// from a Marksman is only these numbers: how far they see, how fast they react,
// how wild their aim starts and how quickly it settles, how long their bursts
// are, what range they like to fight at, and how keen they are to flank or
// charge. Change a number here (or in the tuning panel: AI) and the behaviour
// changes, with no new code. That's data-driven design again, as with the guns.
//
// Units: metres, seconds, degrees (these are read by people far more than by code).

export const ROLES = {
  rifleman: {
    name: 'Rifleman',
    weapon: 'carbine',
    health: 100,
    pace: { walk: 0.42, run: 0.86 },     // fractions of the 5 m/s walking speed
    sight: { range: 60, fov: 120, peripheral: 180 },
    hearing: 1,
    reaction: 0.45,                      // seconds from first seeing you to first shot
    aim: { start: 4.5, end: 1.1, settle: 1.6, lag: 0.22, turn: 240 }, // error (degrees) shrinks from start to end over `settle` s
    burst: [3, 6],                       // shots per burst
    pause: [0.55, 1.1],                  // seconds between bursts
    range: { min: 8, ideal: 22, max: 45 },
    cover: { peek: [1.4, 2.6], hide: [0.9, 1.7] },
    flank: 0.18,                         // chance to volunteer as the flanker (checked every few seconds)
    rush: 0,
    fireOnMove: 0.35,                    // chance to shoot while running to cover
    suppress: 1.2,                       // keeps firing at where you were for this long after losing sight
    ads: true,
  },
  rusher: {
    name: 'Rusher',
    weapon: 'smg',
    health: 90,
    pace: { walk: 0.45, run: 1 },
    sight: { range: 45, fov: 130, peripheral: 190 },
    hearing: 1.2,
    reaction: 0.35,
    aim: { start: 6, end: 2.2, settle: 1.1, lag: 0.16, turn: 320 },
    burst: [6, 10],
    pause: [0.3, 0.7],
    range: { min: 2, ideal: 7, max: 14 },
    cover: { peek: [0.8, 1.4], hide: [0.5, 1] },
    flank: 0.65,
    rush: 0.75,                          // chance to charge instead of taking cover
    fireOnMove: 1,
    suppress: 0.5,
    ads: false,
    sprint: true,
  },
  marksman: {
    name: 'Marksman',
    weapon: 'dmr',
    health: 80,
    pace: { walk: 0.4, run: 0.8 },
    sight: { range: 95, fov: 90, peripheral: 150 },
    hearing: 0.9,
    reaction: 0.6,
    aim: { start: 3, end: 0.3, settle: 2.2, lag: 0.35, turn: 120 },
    telegraph: 1.1,                      // seconds the laser shows on you before each shot
    burst: [1, 1],
    pause: [1.5, 2.3],
    range: { min: 22, ideal: 45, max: 95 },
    cover: { peek: [2.5, 4], hide: [1, 1.8] },
    flank: 0,
    rush: 0,
    fireOnMove: 0,
    suppress: 0,
    ads: true,
  },
};

export const DIFFICULTY = {
  recruit: { name: 'Recruit', damage: 0.3, reaction: 1.35, aim: 1.4, tokens: 1, awareness: 0.75 },
  regular: { name: 'Regular', damage: 0.45, reaction: 1, aim: 1, tokens: 2, awareness: 1 },
  veteran: { name: 'Veteran', damage: 0.7, reaction: 0.75, aim: 0.75, tokens: 3, awareness: 1.3 },
};

// More players means a fight that's over too fast, so enemies get a little
// tougher for each extra player (index = number of players - 1).
export const PLAYER_SCALING = {
  health: [1, 1.25, 1.45, 1.6],
};

// How noticing works (ai/senses.js). Awareness fills from 0 to 1; at 1 you're spotted.
export const AWARENESS = {
  rate: 1.9,          // per second, for someone in plain view, close, in the middle of the vision cone
  instant: 4,         // closer than this and in view: spotted at once
  peripheral: 0.35,   // out of the corner of their eye counts this much
  crouched: 0.55,
  still: 0.5,         // standing still
  sprinting: 1.5,
  firing: 3,          // you fired in the last half second
  decay: 0.12,        // per second, once you're out of sight
  suspicious: 0.35,   // awareness at which they stop and look
};

// Callouts, picked at random. Kept short so they read at a glance as subtitles.
export const BARKS = {
  spotted: ['Contact!', 'Enemy spotted!', 'Eyes on!', 'Contact front!'],
  glimpse: ['Hm?', "Something's moving.", 'Was that someone?'],
  heard: ['Did you hear that?', "Who's there?", 'What was that?'],
  investigate: ['Checking it out.', 'Going to look.'],
  calm: ['All clear.', "Must've been nothing."],
  lost: ['Lost visual!', "Where'd they go?", 'Lost them!'],
  search: ['Search the area!', 'Check the corners!'],
  reload: ['Reloading!', 'Changing mag!'],
  flank: ['Flanking!', "I'll go round!", 'Moving to flank!'],
  move: ['Moving!', 'Repositioning!'],
  rush: ['Pushing!', 'Going in!'],
  hit: ["I'm hit!", 'Taking fire!'],
  manDown: ['Man down!', "We've got one down!"],
  laser: ['Got a shot lined up.'],
};
