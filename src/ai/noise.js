// Noise: what enemies can hear.
//
// Anything loud posts a "noise" here: a position, how far away it can be heard
// (its radius), what kind of noise it is, and who made it. It's a noticeboard:
// enemies check it when they think (ai/senses.js), reading only the notes put
// up since they last looked, and old notes are taken down after half a second.
//
// Sound travels through walls in real life, just quieter, so senses.js halves
// the radius when there's a wall between the noise and the listener.

// How far each kind of noise carries, in metres. Tuning panel: AI → Hearing.
export const NOISE = {
  gunshot: 70,     // any gunshot (guns can set their own `noise`)
  sprintStep: 14,
  walkStep: 6,
  crouchStep: 1.5, // crouch-walking is nearly silent
  land: 9,         // landing from a jump or a drop
};

const KEEP = 0.5; // seconds a noise stays on the board

export function createNoiseBoard() {
  let notes = [];
  const board = {
    /** The game clock; enemies.js keeps it up to date. */
    now: 0,
    /** Something made a noise: { pos: {x,y,z}, radius, kind, owner }. */
    post(n) {
      // Footsteps would post every tick: keep just the latest one per owner.
      if (n.kind === 'step') notes = notes.filter((o) => !(o.kind === 'step' && o.owner === n.owner));
      notes.push({ pos: { x: n.pos.x, y: n.pos.y, z: n.pos.z }, radius: n.radius, kind: n.kind, owner: n.owner, time: board.now });
    },
    /** Noises posted after `time`. */
    since(time) {
      return notes.filter((n) => n.time > time);
    },
    /** Take down old notes. */
    prune() {
      notes = notes.filter((n) => board.now - n.time <= KEEP);
    },
    clear() { notes = []; },
    get list() { return notes; },
  };
  return board;
}
