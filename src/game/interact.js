// Hold-to-interact: hold F next to something for a moment to use it.
//
// Ammo crates, a hostage's ropes, a laptop, a charge to plant, a radio: they
// all work the same way, like holding a lift button. Stand close, hold F, and
// a ring fills up; let go, step away or go down, and it starts again from
// nothing. When it's full the thing happens.
//
// The same idea as reviving a teammate (game/revive.js), which always comes
// first: if there's a downed friend at your feet, F is for them.
//
// Each "spot" is plain data plus two small functions:
//   { id, kind, pos, range, height, time, label, can(p), done(p) }
// The game's systems hand over their spots each tick (game/supply.js, game/operation.js).
//
// Every player gets `using` (the spot's kind, or null) and `useProgress` (0..1),
// for the progress ring on every screen. Your hands are busy while you hold F
// (no shooting), decided from the command alone (player/soldier.js).
//
// Simulation only: runs in Node.

// Every kind of thing you can hold F at (snapshots send the kind as its place in this list).
export const USE_KINDS = ['crate', 'free', 'laptop', 'drive', 'charge', 'radio', 'board'];

export const INTERACT = {
  range: 1.6,   // metres, along the ground, unless the spot says otherwise
  height: 1.5,  // and no more than this far above or below
};

const standing = (h) => !h.state.down && !h.state.bleeding && !h.state.dead;

export function createInteractions({ tuning = INTERACT } = {}) {
  const progress = new Map(); // player's owner -> { id, t }
  const latched = new Set();  // finished something: must let go of F before starting again

  /** The nearest spot `p` can use from where they stand, or null. */
  function nearest(p, spots) {
    const at = p.soldier.state.pos;
    let best = null, bestD = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.pos.x - at.x, s.pos.z - at.z);
      if (d > (s.range ?? tuning.range) || Math.abs(s.pos.y - at.y) > (s.height ?? tuning.height)) continue;
      if (s.can && !s.can(p)) continue;
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  /**
   * @param {number} dt
   * @param {Iterable} team      sim.team values: { owner, soldier, health }
   * @param {Map} commands       this tick's command per owner
   * @param {Array} spots        everything that can be used right now
   * @param {(p) => boolean} [busy] true if `p` is reviving someone (that comes first)
   */
  function update(dt, team, commands, spots, busy = () => false) {
    for (const p of team) {
      p.using = null;
      p.useProgress = 0;
      const holding = !!commands.get(p.owner)?.interact;
      if (!holding) latched.delete(p.owner);
      if (!holding || latched.has(p.owner) || !standing(p.health) || busy(p)) {
        progress.delete(p.owner);
        continue;
      }
      const spot = nearest(p, spots);
      if (!spot) { progress.delete(p.owner); continue; }
      const was = progress.get(p.owner);
      const t = (was?.id === spot.id ? was.t : 0) + dt;
      if (t >= spot.time) {
        progress.delete(p.owner);
        latched.add(p.owner);
        spot.done(p);
        continue;
      }
      progress.set(p.owner, { id: spot.id, t });
      p.using = spot.kind;
      p.useProgress = t / spot.time;
    }
  }

  return {
    progress,
    nearest,
    update,
    reset() { progress.clear(); latched.clear(); },
  };
}
