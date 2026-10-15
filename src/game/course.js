// The kill house course: a timed run through a building full of pop-up targets.
//
// Another state machine:
//
//   idle --stand on the start pad--> ready --step off--> running --reach the finish--> done
//
// While running it counts time, shots and hits. You can only finish once every
// hostile target is down. Each hostage you hit adds a time penalty. Your best
// time is saved in the browser (safely: if storage fails, the course still works).

export const HOSTAGE_PENALTY = 5; // seconds added per hostage hit
const RECORDS_KEY = 'fireteam.records';

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Best times, saved in the browser. */
export function createRecords(storage = browserStorage()) {
  let data = {};
  try {
    const parsed = JSON.parse(storage?.getItem(RECORDS_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {
    // Corrupt records: start fresh.
  }
  return {
    best(id) {
      const v = data[id];
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
    },
    submit(id, time) {
      const old = this.best(id);
      if (old !== null && old <= time) return false;
      data[id] = time;
      try {
        storage?.setItem(RECORDS_KEY, JSON.stringify(data));
      } catch {
        // Couldn't save; still counts for this visit.
      }
      return true;
    },
  };
}

const inside = (box, p) =>
  p.x >= box.min[0] && p.x <= box.max[0] && p.y >= box.min[1] - 0.5 && p.y <= box.max[1] && p.z >= box.min[2] && p.z <= box.max[2];

/**
 * @param {object} opts
 * @param {string} opts.id          course name, also the target group (e.g. 'killhouse')
 * @param {object} opts.start       trigger box { min, max }
 * @param {object} opts.finish      trigger box { min, max }
 * @param {object} opts.targets     the targets system (src/world/targets.js)
 * @param {object} opts.records     createRecords()
 * @param {Function} [opts.emit]    event bus emit
 */
export function createCourse({ id, start, finish, targets, records, emit = () => {} }) {
  const course = {
    id,
    state: 'idle',
    time: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    hostageHits: 0,
    remaining: 0,
    result: null,
    update,
    onShot,
    onHit,
  };
  const hostiles = () => targets.inGroup(id).filter((t) => !t.hostage);
  let blockedCooldown = 0;

  targets.lowerGroup(id, true);

  function reset() {
    targets.lowerGroup(id, true);
    Object.assign(course, { time: 0, shots: 0, hits: 0, headshots: 0, hostageHits: 0, result: null });
    course.remaining = hostiles().length;
  }

  /** @param {{x,y,z}} feet the player's feet position */
  function update(dt, feet) {
    const onStart = inside(start, feet);
    if (course.state === 'idle' || course.state === 'done') {
      if (onStart) {
        reset();
        course.state = 'ready';
        emit('course:ready', { id, best: records.best(id) });
      }
      return;
    }
    if (course.state === 'ready') {
      if (!onStart) {
        targets.raiseGroup(id);
        course.state = 'running';
        emit('course:start', { id });
      }
      return;
    }
    // Running.
    course.time += dt;
    blockedCooldown -= dt;
    course.remaining = hostiles().filter((t) => t.state === 'up' || t.state === 'rising').length;
    if (onStart && course.time > 1) {
      // Walked back to the start: restart.
      reset();
      course.state = 'ready';
      emit('course:ready', { id, best: records.best(id) });
      return;
    }
    if (inside(finish, feet)) {
      if (course.remaining > 0) {
        if (blockedCooldown <= 0) emit('course:blocked', { id, remaining: course.remaining });
        blockedCooldown = 2;
        return;
      }
      const total = course.time + course.hostageHits * HOSTAGE_PENALTY;
      const previous = records.best(id);
      const record = records.submit(id, total);
      course.result = {
        time: course.time,
        penalty: course.hostageHits * HOSTAGE_PENALTY,
        total,
        accuracy: course.shots ? Math.min(1, course.hits / course.shots) : 0,
        shots: course.shots,
        hits: course.hits,
        headshots: course.headshots,
        hostageHits: course.hostageHits,
        best: records.best(id),
        previous,
        record,
      };
      course.state = 'done';
      emit('course:finish', { id, ...course.result });
    }
  }

  /** One trigger pull (a shotgun blast counts once). */
  function onShot() {
    if (course.state === 'running') course.shots++;
  }

  /**
   * A shot hit a target. Call once per trigger pull per target.
   * @param {object} target
   * @param {{headshot:boolean}} info
   */
  function onHit(target, { headshot = false } = {}) {
    if (course.state !== 'running' || target.group !== id) return;
    if (target.hostage) {
      course.hostageHits++;
      emit('course:penalty', { id, seconds: HOSTAGE_PENALTY });
      return;
    }
    course.hits++;
    if (headshot) course.headshots++;
  }

  reset();
  return course;
}
