// An encounter: "clear the Compound". The game rules around a fight.
//
//   ready --leave the start area--> running --every hostile down--> cleared
//                                      │
//                                      └──you go down──> down --restart--> ready
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
 * @param {object} opts.start      trigger box { min, max }: the timer starts when you leave it
 * @param {object} opts.enemies    ai/enemies.js
 * @param {object} opts.health     player/health.js
 * @param {object} opts.records    createRecords() from game/course.js
 * @param {Function} [opts.emit]
 */
export function createEncounter({ id, start, enemies, health, records, emit = () => {} }) {
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
    reset,
  };

  function reset() {
    Object.assign(enc, { state: 'ready', time: 0, shots: 0, hits: 0, headshots: 0, kills: 0, result: null });
    enc.total = enemies.list.length;
    emit('encounter:ready', { id, best: records.best(id), total: enc.total });
  }

  /** @param {{x,y,z}} feet your feet position */
  function update(dt, feet) {
    if (enc.state === 'ready') {
      if (!inside(start, feet)) {
        enc.state = 'running';
        emit('encounter:start', { id, total: enc.total });
      }
      return;
    }
    if (enc.state !== 'running') return;
    enc.time += dt;
    if (health.state.down) {
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
        damageTaken: Math.round(health.state.taken),
        best: records.best(id),
        previous,
        record,
      };
      enc.state = 'cleared';
      emit('encounter:finish', { id, ...enc.result });
    }
  }

  /** One trigger pull. */
  function onShot() {
    if (enc.state === 'running' || enc.state === 'ready') enc.shots++;
  }

  /** A trigger pull hit an enemy (once per enemy per pull). */
  function onHit({ headshot = false, killed = false } = {}) {
    if (enc.state !== 'running' && enc.state !== 'ready') return;
    enc.hits++;
    if (headshot) enc.headshots++;
    if (killed) enc.kills++;
  }

  reset();
  return enc;
}
