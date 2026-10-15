// An encounter: "clear the Compound". The game rules around a fight.
//
//   ready --someone leaves the start area--> running --every hostile down--> cleared
//                                               │
//                                               └──everyone's down──> down --restart--> ready
//
// Solo, "everyone" is just you. In co-op, downed players can be revived
// (game/revive.js), so the squad is only out when nobody is left standing.
//
// It times the run and counts your shots, hits, headshots, kills and the
// damage you took, for the results card. Your best time is saved in the browser
// (with the same records as the kill house: src/game/course.js).
//
// Simulation only: the HUD shows it, main.js wires the restart.

const inside = (box, p) =>
  p.x >= box.min[0] && p.x <= box.max[0] && p.y >= box.min[1] - 0.5 && p.y <= box.max[1] && p.z >= box.min[2] && p.z <= box.max[2];

/**
 * @param {object} opts
 * @param {string} opts.id         record name (e.g. 'compound')
 * @param {object} [opts.start]    trigger box { min, max }: the timer starts when you leave it (no box: at once)
 * @param {object} opts.enemies    ai/enemies.js
 * @param {object} [opts.health]   player/health.js, for solo play
 * @param {Function} [opts.squad]  () => every player's health (co-op); replaces `health`
 * @param {object} opts.records    createRecords() from game/course.js
 * @param {Function} [opts.emit]
 */
export function createEncounter({ id, start, enemies, health = null, squad = null, records, emit = () => {} }) {
  const healths = squad ?? (() => [health]);
  const standing = (h) => !h.state.down && !h.state.bleeding && !h.state.dead;
  const enc = {
    id,
    state: 'ready',
    time: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    kills: 0,
    total: 0,
    result: null,
    get remaining() { return enemies.alive.length; },
    update,
    onShot,
    onHit,
    onDown,
    onRevive,
    reset,
    players: new Map(), // owner -> that player's own numbers, for the results card
  };
  const stat = (owner) => {
    if (!enc.players.has(owner)) enc.players.set(owner, { shots: 0, hits: 0, headshots: 0, kills: 0, downs: 0, revives: 0 });
    return enc.players.get(owner);
  };

  function reset() {
    Object.assign(enc, { state: 'ready', time: 0, shots: 0, hits: 0, headshots: 0, kills: 0, result: null });
    enc.players.clear();
    enc.total = enemies.list.length;
    emit('encounter:ready', { id, best: records.best(id), total: enc.total });
  }

  /** @param {{x,y,z}|Array<{x,y,z}>} feet every player's feet position */
  function update(dt, feet) {
    const all = Array.isArray(feet) ? feet : [feet];
    if (enc.state === 'ready') {
      if (!start || all.some((f) => !inside(start, f))) {
        enc.state = 'running';
        emit('encounter:start', { id, total: enc.total });
      }
      return;
    }
    if (enc.state !== 'running') return;
    enc.time += dt;
    const team = healths();
    if (team.length && !team.some(standing)) {
      enc.state = 'down';
      emit('encounter:down', { id, time: enc.time, kills: enc.kills, total: enc.total });
      return;
    }
    if (enemies.alive.length === 0) {
      const previous = records.best(id);
      const record = records.submit(id, enc.time);
      enc.result = {
        time: enc.time,
        total: enc.time,
        kills: enc.kills,
        headshots: enc.headshots,
        accuracy: enc.shots ? Math.min(1, enc.hits / enc.shots) : 0,
        shots: enc.shots,
        hits: enc.hits,
        damageTaken: Math.round(team.reduce((sum, h) => sum + h.state.taken, 0)),
        players: [...enc.players].map(([owner, s]) => ({ owner, ...s, accuracy: s.shots ? Math.min(1, s.hits / s.shots) : 0 })),
        best: records.best(id),
        previous,
        record,
      };
      enc.state = 'cleared';
      emit('encounter:finish', { id, ...enc.result });
    }
  }

  /** One trigger pull. */
  function onShot(owner = 0) {
    if (enc.state !== 'running' && enc.state !== 'ready') return;
    enc.shots++;
    stat(owner).shots++;
  }

  /** A trigger pull hit an enemy (once per enemy per pull). */
  function onHit({ owner = 0, headshot = false, killed = false } = {}) {
    if (enc.state !== 'running' && enc.state !== 'ready') return;
    const s = stat(owner);
    enc.hits++;
    s.hits++;
    if (headshot) { enc.headshots++; s.headshots++; }
    if (killed) { enc.kills++; s.kills++; }
  }

  /** Co-op: someone went down, or got someone back up (game/revive.js). */
  function onDown(owner) { if (enc.state === 'running') stat(owner).downs++; }
  function onRevive(owner) { if (enc.state === 'running') stat(owner).revives++; }

  reset();
  return enc;
}
