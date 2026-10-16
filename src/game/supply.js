// Supplies: the ammo crates on a mission map.
//
// In a mission your spare ammo is real: it runs out. That makes every
// magazine a small decision (fire now, or save it?), the "ammo economy". Ammo
// crates (the `crate` kit piece) put it back: hold F beside one for a second
// and every gun's spare ammo, and your grenades, are full again. Each crate
// holds a few refills, shared by the whole squad, so it's worth asking
// "who needs it most?".
//
// Who decides what, in co-op (lesson 17):
//   - the host decides that a refill happened (and how many the crate has left)
//   - your own browser fills your own guns when it hears `ammo:resupply`; your
//     ammo is yours, like your hits (net/client.js)
//
// Simulation only: runs in Node.

export const SUPPLY = {
  useTime: 1,     // seconds of holding F
  refills: 4,     // per crate, unless the level says otherwise
  range: 1.6,     // metres from the crate
};

/**
 * @param {object} opts
 * @param {Array} opts.crates  the level's crates (world/kit.js): { id, at, refills }
 * @param {Function} opts.emit
 */
export function createSupply({ crates = [], emit, tuning = SUPPLY }) {
  const list = crates.map((c, i) => ({
    id: c.id ?? `crate${i}`,
    pos: { x: c.at[0], y: c.at[1] ?? 0, z: c.at[2] },
    full: c.refills ?? tuning.refills,
    left: c.refills ?? tuning.refills,
  }));

  /** The crates that still have something in them, as hold-F spots (game/interact.js). */
  function spots() {
    return list.filter((c) => c.left > 0).map((c) => ({
      id: c.id,
      kind: 'crate',
      pos: c.pos,
      range: tuning.range,
      time: tuning.useTime,
      label: 'Ammo',
      can: (p) => !p.soldier.arsenal.full(), // don't waste a refill on someone who's full
      done: (p) => {
        c.left--;
        emit('ammo:resupply', { owner: p.owner, crate: c.id, left: c.left });
      },
    }));
  }

  return {
    list,
    spots,
    /** How many refills each crate has left (checkpoints, snapshots). */
    save: () => list.map((c) => c.left),
    restore(lefts) { list.forEach((c, i) => { c.left = lefts?.[i] ?? c.full; }); },
    reset() { for (const c of list) c.left = c.full; },
  };
}
