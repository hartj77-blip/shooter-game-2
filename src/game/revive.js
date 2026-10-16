// Reviving: getting a downed teammate back on their feet.
//
// Stand next to someone who's bleeding out and hold F (the "interact" button)
// for three seconds. Let go, wander off or go down yourself, and you start
// again from nothing. Your hands are busy meanwhile, so you can't shoot
// (player/soldier.js): it's a risk you take for a friend.
//
// Runs on the host, once a tick, after health (game/sim.js). Each player gets
// `reviving` (0..1, how far along someone is with them) and `reviver` (who),
// for the HUD's progress ring on every screen.
//
// Simulation only: runs in Node.

export const REVIVE = {
  time: 3,     // seconds of holding F
  range: 1.8,  // metres from them (along the ground)
  height: 1.2, // and no more than this far above or below
};

const standing = (h) => !h.state.down && !h.state.bleeding && !h.state.dead;

export function createRevives({ tuning = REVIVE } = {}) {
  const progress = new Map(); // downed player's owner -> { by, t }

  /**
   * @param {number} dt
   * @param {Iterable} team     sim.team values: { owner, soldier, health }
   * @param {Map} commands      this tick's command per owner
   * @param {Array} [extras]    others who can be revived but don't help (the hostage, ai/hostage.js)
   */
  function update(dt, team, commands, extras = []) {
    const players = [...team];
    for (const p of [...players, ...extras]) {
      p.reviving = 0;
      p.reviver = null;
      if (!p.health.state.bleeding) {
        progress.delete(p.owner);
        continue;
      }
      // Who's helping? The closest standing teammate holding F within reach.
      const at = p.soldier.state.pos;
      let helper = null;
      let nearest = Infinity;
      for (const r of players) {
        if (r === p || !standing(r.health) || !commands.get(r.owner)?.interact) continue;
        const q = r.soldier.state.pos;
        const d = Math.hypot(q.x - at.x, q.z - at.z);
        if (d <= tuning.range && Math.abs(q.y - at.y) <= tuning.height && d < nearest) {
          helper = r;
          nearest = d;
        }
      }
      const was = progress.get(p.owner);
      if (!helper) {
        progress.delete(p.owner);
        continue;
      }
      const t = (was?.by === helper.owner ? was.t : 0) + dt;
      if (t >= tuning.time) {
        progress.delete(p.owner);
        p.health.revive(helper.owner);
        continue;
      }
      progress.set(p.owner, { by: helper.owner, t });
      p.reviving = t / tuning.time;
      p.reviver = helper.owner;
    }
  }

  return {
    progress,
    update,
    reset() { progress.clear(); },
  };
}
