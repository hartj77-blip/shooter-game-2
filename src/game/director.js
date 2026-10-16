// The director: decides when reinforcements arrive, so a mission has a rhythm.
//
// Think of a film director, or the person running a haunted house: they don't
// throw everything at you at once. They let you creep forward, build the
// tension, hit you hard, then give you a moment to catch your breath. A
// mission with no pacing is either boring or exhausting; with pacing it
// feels like a story. Left 4 Dead (2008) made this famous with its "AI Director".
//
// INTENSITY. Each player has a number from 0 to 1, a stress meter: getting
// hurt, bullets cracking past, going down and enemies dropping close by push
// it up; a few calm seconds let it drain away. The squad's intensity is the
// highest of the players still standing.
//
// PHASES (a small state machine, lesson 1):
//
//   calm ──(time)──▶ build ──(intensity high)──▶ peak ──(intensity falls)──▶ relax ──(time)──▶ build
//                     │ waves every so often       no new waves                no new waves
//                     ▼
//               crescendo: the end of a mission (calling the helicopter): waves
//               keep coming whatever the intensity
//
// KEY MOMENTS. Missions add set pieces (levels/missions.js): "you started the
// download: a truck pulls up at the north gate". They happen whatever the phase.
//
// FAIR SPAWNS. Reinforcements appear at the level's `entry` pieces, never where
// anyone standing can see the spot, never closer than `minDistance`, and they
// run in along the entry's route before they go looking for you (ai/brain.js
// "advance"). A cap (`maxAlive`) keeps the fight readable.
//
// Simulation only, deterministic from the seed (the same commands give the
// same waves). Its numbers are in DIRECTOR, with sliders in the tuning panel.

import { createRandom } from '../core/random.js';
import { RAPIER } from '../world/physics.js';
import { SIGHT } from '../world/groups.js';

export const DIRECTOR = {
  calm: 30,                    // seconds of quiet at the start (and after a checkpoint retry)
  gap: [30, 48],               // seconds between waves while building up
  size: [3, 4, 5, 6],          // enemies per wave, for 1 to 4 players
  maxAlive: [16, 18, 21, 24],  // never more enemies standing than this, for 1 to 4 players
  peak: 0.72,                  // squad intensity that counts as a peak
  relaxBelow: 0.3,             // ... and calm enough to start relaxing
  relax: [20, 32],             // seconds of breathing space after a peak
  crescendoGap: 14,            // seconds between waves during a crescendo
  minDistance: 35,             // metres: no one appears closer than this to a player
  mix: { rifleman: 0.5, rusher: 0.35, marksman: 0.15 }, // what a wave is made of
  // Intensity:
  hurt: 0.012,                 // per point of damage taken
  nearMiss: 0.06,              // a bullet cracking past
  down: 1,                     // going down
  killNear: 0.08,              // an enemy dropping within `killRange`
  killRange: 12,
  fadeAfter: 4,                // seconds of calm before intensity starts to fall
  fade: 0.07,                  // per second
};

// How much each difficulty speeds up the waves (shorter gaps) and grows them.
const DIFFICULTY_PACE = { recruit: { gap: 1.3, size: -1 }, regular: { gap: 1, size: 0 }, veteran: { gap: 0.8, size: 1 } };

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const standing = (h) => !h.state.down && !h.state.bleeding && !h.state.dead;

/**
 * @param {object} opts
 * @param {object} opts.world
 * @param {object} opts.enemies   ai/enemies.js
 * @param {() => Array} opts.players  sim.team values
 * @param {Array} opts.entries   the level's entry pieces (world/kit.js)
 * @param {object} opts.events
 * @param {number} [opts.seed]
 * @param {string} [opts.difficulty]
 * @param {object} [opts.mission] the mission's own director settings (levels/missions.js) and key moments
 */
export function createDirector({ world, enemies, players, entries, events, seed = 1, difficulty = 'regular', mission = {}, tuning = { ...DIRECTOR } }) {
  const rng = createRandom(seed * 13 + 7);
  const pace = DIFFICULTY_PACE[difficulty] ?? DIFFICULTY_PACE.regular;
  const settings = { ...tuning, ...(mission.director ?? {}) };
  const moments = mission.moments ?? {};
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  const d = {
    phase: 'calm',
    t: 0,               // seconds in this phase
    next: settings.calm, // seconds until the next wave (while building)
    waves: 0,
    spawned: 0,
    intensity: new Map(), // owner -> { value, quiet }
    log: [],              // recent decisions, for the tuning panel
    tuning: settings,
  };
  const meter = (owner) => {
    if (!d.intensity.has(owner)) d.intensity.set(owner, { value: 0, quiet: 0 });
    return d.intensity.get(owner);
  };
  const bump = (owner, amount) => {
    if (typeof owner !== 'number') return;
    const m = meter(owner);
    m.value = Math.min(1, m.value + amount);
    m.quiet = 0;
  };

  // ---- reading the fight
  const offs = [
    events.on('player:hurt', (e) => bump(e.owner, e.amount * settings.hurt)),
    events.on('bullet:nearmiss', (e) => bump(e.victim, settings.nearMiss)),
    events.on('player:down', (e) => bump(e.owner, settings.down)),
    events.on('enemy:down', (e) => {
      for (const p of players()) if (flat(p.soldier.state.pos, e.pos) < settings.killRange) bump(p.owner, settings.killNear);
    }),
  ];

  /** The squad's intensity: the most stressed player still standing. */
  function squadIntensity() {
    let most = 0;
    for (const p of players()) if (standing(p.health)) most = Math.max(most, meter(p.owner).value);
    return most;
  }

  const count = () => Math.max(1, Math.min(4, players().length));

  function go(phase) {
    d.phase = phase;
    d.t = 0;
    if (phase === 'relax') d.next = rng.range(settings.relax[0], settings.relax[1]);
    if (phase === 'build') d.next = Math.min(d.next, rng.range(settings.gap[0], settings.gap[1]) * pace.gap * 0.5);
    if (phase === 'crescendo') d.next = Math.min(d.next, 4); // the first wave soon, whatever the clock said
    note(`phase: ${phase}`);
  }

  function note(text) {
    d.log.push({ time: d.clock ?? 0, text });
    if (d.log.length > 8) d.log.shift();
  }

  // ---- where to send them
  function visibleFrom(p, spot) {
    const s = p.soldier.state;
    const eye = { x: s.pos.x, y: s.pos.y + 1.6, z: s.pos.z };
    for (const h of [1.0, 1.7]) {
      const to = { x: spot.x, y: spot.y + h, z: spot.z };
      const dx = to.x - eye.x, dy = to.y - eye.y, dz = to.z - eye.z;
      const len = Math.hypot(dx, dy, dz);
      ray.origin = eye;
      ray.dir = { x: dx / len, y: dy / len, z: dz / len };
      if (!world.castRay(ray, len - 0.05, true, undefined, SIGHT)) return true;
    }
    return false;
  }

  /** Entries nobody standing can see and nobody is too close to, nearest the squad first. */
  function goodEntries(wanted = null) {
    const up = players().filter((p) => standing(p.health));
    const centre = up.length
      ? { x: up.reduce((s, p) => s + p.soldier.state.pos.x, 0) / up.length, z: up.reduce((s, p) => s + p.soldier.state.pos.z, 0) / up.length }
      : { x: 0, z: 0 };
    const ok = [];
    for (const e of entries) {
      if (wanted && e.id !== wanted) continue;
      const spot = { x: e.at[0], y: e.at[1] ?? 0, z: e.at[2] };
      if (up.some((p) => flat(p.soldier.state.pos, spot) < settings.minDistance)) continue;
      if (up.some((p) => visibleFrom(p, spot))) continue;
      const end = e.route.length ? e.route[e.route.length - 1] : [spot.x, spot.z];
      ok.push({ e, score: Math.hypot(end[0] - centre.x, end[1] - centre.z) });
    }
    return ok.sort((a, b) => a.score - b.score).map((o) => o.e);
  }

  function pickRole() {
    let r = rng.next();
    for (const [role, share] of Object.entries(settings.mix)) {
      if ((r -= share) < 0) return role;
    }
    return 'rifleman';
  }

  /**
   * Send a wave of `size` (or the usual size) from an entry (a named one, or the best one).
   * Returns how many came.
   */
  function wave({ size = null, entry = null, reason = 'wave' } = {}) {
    const cap = settings.maxAlive[count() - 1] ?? settings.maxAlive.at(-1);
    let n = Math.max(1, (size ?? settings.size[count() - 1] ?? 4) + pace.size);
    n = Math.min(n, cap - enemies.alive.length);
    if (n <= 0) { note(`${reason}: skipped (enough enemies already)`); return 0; }
    // A named entry from a key moment, if it's fair right now; otherwise the best fair one.
    const choice = (entry && goodEntries(entry)[0]) ?? goodEntries()[0];
    if (!choice) { note(`${reason}: no fair entry`); return 0; }
    d.waves++;
    const squad = `w${d.waves}`;
    const [x, y = 0, z] = choice.at;
    for (let i = 0; i < n; i++) {
      // A loose huddle around the entry point, facing in.
      const a = (i / n) * Math.PI * 2;
      const r = i === 0 ? 0 : 1.2;
      const route = choice.route.map(([rx, rz, ry]) => [rx + Math.cos(a) * r * 0.6, rz + Math.sin(a) * r * 0.6, ry]);
      enemies.spawn({ role: pickRole(), at: [x + Math.cos(a) * r, y, z + Math.sin(a) * r], yaw: choice.yaw, squad }, { route });
    }
    d.spawned += n;
    events.emit('director:wave', { entry: choice.id, label: choice.label ?? null, count: n, reason, wave: d.waves });
    note(`${reason}: ${n} from ${choice.id}`);
    return n;
  }

  /** A key moment from the mission's script (levels/missions.js), by name. */
  function moment(name) {
    const m = moments[name];
    if (!m) return;
    if (m.wave) wave({ size: m.wave === true ? null : m.wave, entry: m.entry ?? null, reason: name });
    if (m.crescendo) go('crescendo');
    if (m.relax) go('relax');
    if (m.say) events.emit('mission:radio', { text: m.say, from: 'Overlord' });
  }

  function update(dt) {
    d.clock = (d.clock ?? 0) + dt;
    d.t += dt;
    for (const p of players()) {
      const m = meter(p.owner);
      m.quiet += dt;
      if (m.quiet > settings.fadeAfter) m.value = Math.max(0, m.value - settings.fade * dt);
    }
    const level = squadIntensity();
    d.next -= dt;
    switch (d.phase) {
      case 'calm':
        if (d.next <= 0) { go('build'); d.next = 0; }
        break;
      case 'build':
        if (level >= settings.peak) { go('peak'); break; }
        if (d.next <= 0) {
          wave();
          d.next = rng.range(settings.gap[0], settings.gap[1]) * pace.gap;
        }
        break;
      case 'peak':
        if (level < settings.relaxBelow || d.t > 40) go('relax');
        break;
      case 'relax':
        if (d.next <= 0) go('build');
        break;
      case 'crescendo':
        if (d.next <= 0) {
          wave({ reason: 'crescendo' });
          d.next = settings.crescendoGap * pace.gap;
        }
        break;
      default:
    }
  }

  // (defineProperties, not Object.assign: Object.assign would run `get view()` once and copy
  // that one answer, a frozen photo, instead of the getter itself. A real bug, lesson 14.)
  return Object.defineProperties(d, Object.getOwnPropertyDescriptors({
    update,
    wave,
    moment,
    squadIntensity,
    /** Quiet for a while (a checkpoint retry): a fresh start. */
    calmDown() {
      d.phase = 'calm';
      d.t = 0;
      d.next = settings.calm;
      for (const m of d.intensity.values()) { m.value = 0; m.quiet = 0; }
      note('calm (retry)');
    },
    stop() { d.phase = 'off'; },
    /** What the tuning panel shows. */
    get view() {
      return {
        phase: d.phase, next: Math.max(0, d.next), waves: d.waves, alive: enemies.alive.length,
        intensity: [...d.intensity].map(([owner, m]) => [owner, m.value]),
        squad: squadIntensity(), log: d.log,
      };
    },
    dispose() { for (const off of offs) off?.(); },
  }));
}
