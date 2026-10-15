// The host: the browser that runs the real game. Think of it as the referee.
//
// It owns the one true simulation (game/sim.js): the enemies, every bullet that
// can hurt a player, the timer, who's down. Solo play is simply "hosting a game
// for one", so it runs through this same file and keeps being exercised every
// time anyone plays. (Co-op adds a connection to the other players on top.)
//
// A session is what a mission (game/mission.js) plays through. It has the same
// shape on the host and on a co-op client (net/client.js):
//   local      your own soldier and health
//   enemies    { list } of enemies, each with a `view` summary for drawing
//   teammates  { list } of the other players, each with a `view`
//   step(dt, cmd)  run one tick with your command, return your recoil and shots
//
// Runs in Node: no screen, no keyboard.

/**
 * @param {object} opts
 * @param {object} opts.sim  game/sim.js
 * @param {number} [opts.me] your player slot
 */
export function createHost({ sim, me = 0 }) {
  // Everyone but you (players come and go, so this is worked out when asked).
  const teammates = { get list() { return [...sim.team.values()].filter((p) => p.owner !== me); } };

  const commands = new Map();

  return {
    role: 'host',
    me,
    sim,
    events: sim.events,
    world: sim.world,
    registry: sim.registry,
    level: sim.level,
    targets: sim.targets,
    encounter: sim.encounter,
    course: sim.course,
    get local() { return sim.player(me); },
    enemies: sim.enemies ?? { list: [] },
    teammates,
    /** Solo games stop when you pause. A game with friends in it keeps going. */
    get pausable() { return sim.team.size === 1; },

    /** One tick: your command (plus, in co-op, everyone else's), then the whole simulation. */
    step(dt, cmd) {
      commands.set(me, cmd);
      const outs = sim.tick(dt, commands);
      return outs.get(me);
    },

    /** Everyone back to the start. */
    restart() { sim.reset(); },

    /** Just you, back to your spawn (the Proving Ground's "Back to spawn"). */
    respawn() {
      const p = sim.player(me);
      p.soldier.teleport(p.spawn.pos, p.spawn.yaw);
      p.health.reset();
    },

    dispose() { sim.dispose(); },
  };
}
