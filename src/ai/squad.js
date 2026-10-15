// Squads and attack tokens: how enemies work as a team (and play fair).
//
// SQUADS share what they know. When one member sees you, the whole squad
// learns where you were (your "last known position") and when. Nearby squads
// hear it "on the radio" too. That's why, if you slip away, they all shoot
// and search where you *were*, not where you are: they're working from shared,
// slightly stale information, like people do.
//
// ATTACK TOKENS keep fights fair and readable. Imagine a ticket counter with
// only two tickets: an enemy must hold a ticket to shoot at you, and gives it
// back after its burst. Everyone else moves, flanks or waits their turn.
// Without this, ten enemies seeing you at once would all fire at once and you'd
// drop before you knew where they were. (The Marksman has a counter of its own,
// with one ticket.) How many tickets there are is part of the difficulty.

export function createSquads(enemies) {
  const squads = new Map();
  for (const e of enemies) {
    const id = e.squadId ?? e.id;
    if (!squads.has(id)) {
      squads.set(id, { id, members: [], knowledge: null, alert: 'calm', flanker: null, lastBark: -Infinity });
    }
    const sq = squads.get(id);
    sq.members.push(e);
    e.squad = sq;
  }
  return squads;
}

/** Everyone in `e`'s squad who's still standing, apart from `e`. */
export const squadMates = (e) => e.squad.members.filter((m) => m !== e && !m.dead);

/**
 * Tell the squad (and squads within radio range) where the player is or was.
 * @param {boolean} seen true if actually seen; false if only heard or shot at from there
 */
export function report(squads, e, pos, time, seen, radio = 35) {
  const k = { pos: { x: pos.x, y: pos.y, z: pos.z }, time, seen };
  const sq = e.squad;
  if (!sq.knowledge || seen || !sq.knowledge.seen || time - sq.knowledge.time > 1) sq.knowledge = k;
  sq.alert = 'combat';
  for (const other of squads.values()) {
    if (other === sq || other.alert === 'combat') continue;
    const near = other.members.some((m) => !m.dead && Math.hypot(m.pos.x - e.pos.x, m.pos.z - e.pos.z) < radio);
    if (near) {
      other.knowledge = { ...k, seen: false };
      other.alert = 'combat';
    }
  }
}

/**
 * @param {() => number} limit how many enemies may shoot at once (from the difficulty)
 */
export function createTokens(limit) {
  const holders = new Map(); // enemy -> { pool, since }
  const poolOf = (e) => (e.role === 'marksman' ? 'marksman' : 'general');
  const capacity = (pool) => (pool === 'marksman' ? 1 : limit());
  return {
    holders,
    /** Ask for a ticket. True if `e` now holds one. */
    take(e, now) {
      if (holders.has(e)) return true;
      const pool = poolOf(e);
      let used = 0;
      for (const h of holders.values()) if (h.pool === pool) used++;
      if (used >= capacity(pool)) return false;
      holders.set(e, { pool, since: now });
      return true;
    },
    has: (e) => holders.has(e),
    release(e) { holders.delete(e); },
    clear() { holders.clear(); },
  };
}
