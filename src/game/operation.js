// An operation: one mission, played out. The rules around the fight, the way
// game/encounter.js is for the Compound.
//
// A mission (levels/missions.js) is a list of STAGES, each an objective
// (game/objectives.js): "rescue the hostage, then get to the helicopter".
// This file runs them in order and keeps the things that last across stages:
//
//   CARGO       what you're bringing home: the hostage (who follows you) or the
//               drive with the intel (someone carries it; if they bleed out it
//               drops where they fell, and anyone can pick it up)
//   CHECKPOINTS each finished step saves one: the stage you're on, what's
//               done, which guards you'd already dealt with, the crates' refills
//               and where to start again. When everyone's down, the host
//               retries from there (game/sim.js retry). A checkpoint saves only
//               what matters, not the whole world: enemies come back calm, and
//               reinforcements are gone. Teammates who bled out come back
//               beside a standing friend when the next checkpoint is reached.
//   THE ENDING  success when the helicopter lifts off with everyone; failure
//               when nobody is standing, or the hostage bleeds out
//   THE SCORE   time, and each player's kills, accuracy, downs, revives, for
//               the debrief (and best times, kept per mission and squad size)
//
// Which site each objective uses (which building the hostage is in, which
// three of five spots hide the caches) is picked from the mission's seed at
// the start, so a retry keeps the same answers.
//
// Simulation only: runs in Node. The HUD reads `view`; co-op clients get the
// same `view` in snapshots (net/protocol.js encodeOp).

import { KINDS, SITES_USED, OBJECTIVES } from './objectives.js';
import { placePoint } from '../world/kit.js';

const standing = (h) => !h.state.down && !h.state.bleeding && !h.state.dead;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (thing) => ({ x: thing.at[0], y: thing.at[1] ?? 0, z: thing.at[2] });
// Where players 1 to 4 start again around a checkpoint spot (metres: right, back), like spawnFor in game/sim.js.
const AROUND = [[0, 0], [1.5, 0.9], [-1.5, 0.9], [0, 1.8]];

/**
 * @param {object} opts
 * @param {object} opts.mission    levels/missions.js
 * @param {object} opts.level      the built level (its sites, entries and landing zones)
 * @param {Map} opts.team          sim.team: owner -> player
 * @param {object} opts.rng        core/random.js
 * @param {Function} opts.emit
 * @param {() => object} opts.enemies     ai/enemies.js (a function: it may not exist yet)
 * @param {() => object} opts.director    game/director.js
 * @param {() => object|null} opts.hostage
 * @param {(spawn) => object} opts.makeHostage
 * @param {Function} opts.explode  (pos, { owner, kind }) area damage (game/sim.js)
 * @param {object} opts.records    best times (game/course.js)
 * @param {Function} opts.recordId () => 'harbour-rescue' or 'harbour-rescue-2p'
 * @param {object} [opts.supply]   game/supply.js (crates' refills are part of a checkpoint)
 */
export function createOperation({
  mission, level, team, rng, emit, enemies, director, hostage, makeHostage, explode, records, recordId, supply = null,
  tuning = OBJECTIVES,
}) {
  const sites = level.expanded.sites.map((s, index) => ({ ...s, index }));
  const lzs = level.expanded.lzs;
  const site = (id) => sites.find((s) => s.id === id) ?? null;
  const lz = (id) => lzs.find((l) => l.id === id) ?? lzs[0];

  // Which sites each stage uses, decided once (a retry keeps the same answers).
  const stages = mission.stages ?? []; // (a mission with none: just the fight and the director)
  const picks = stages.map((stage) => {
    const pool = (stage.sites ?? []).map((id) => {
      const s = site(id);
      if (!s) throw new Error(`Mission ${mission.id}: no site "${id}" on this map`);
      return s;
    });
    const n = typeof SITES_USED[stage.kind] === 'function' ? SITES_USED[stage.kind](stage) : SITES_USED[stage.kind];
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n).sort((a, b) => a.index - b.index);
  });

  const op = {
    mission,
    state: 'active',     // 'active' | 'complete' | 'failed'
    reason: null,        // why it failed: 'down' | 'hostage'
    time: 0,
    stage: 0,
    objective: null,
    cargo: null,         // { kind: 'hostage' } | { kind: 'intel', carrier, drop }
    checkpoint: null,    // the latest one (see save())
    checkpoints: 0,
    retries: 0,
    result: null,
    players: new Map(),  // owner -> their numbers, for the debrief
    totals: { shots: 0, hits: 0, headshots: 0, kills: 0 },
  };
  const stat = (owner) => {
    if (!op.players.has(owner)) op.players.set(owner, { shots: 0, hits: 0, headshots: 0, kills: 0, downs: 0, revives: 0 });
    return op.players.get(owner);
  };
  const up = () => [...team.values()].filter((p) => standing(p.health));

  // ---------------------------------------------------------------- the toolbox objectives use
  const ctx = {
    tuning,
    get index() { return op.stage; },
    get picks() { return picks[op.stage]; },
    site,
    lz,
    emit,
    standing: up,
    playersNear: (pos, r) => up().filter((p) => flat(p.soldier.state.pos, pos) < r && Math.abs(p.soldier.state.pos.y - pos.y) < 3).length,
    enemiesNear: (pos, r) => (enemies()?.alive ?? []).filter((e) => flat(e.pos, pos) < r && Math.abs(e.pos.y - pos.y) < 3).length,
    anyoneBleeding: () => [...team.values()].some((p) => p.health.state.bleeding) || !!hostage()?.health.state.bleeding,
    hostage,
    makeHostage,
    explode,
    moment: (name) => director()?.moment(name),
    setCargo(cargo) { op.cargo = cargo; },
    /** Is what you came for aboard? (Nothing to bring: yes.) */
    cargoAboard(inZone) {
      const c = op.cargo;
      if (!c) return true;
      if (c.kind === 'hostage') {
        const h = hostage();
        const there = h && standing(h.health) && inZone(h.pos);
        if (there) h.board(); else h?.unboard();
        return !!there;
      }
      if (c.kind === 'intel') {
        const p = c.carrier !== null ? team.get(c.carrier) : null;
        return !!p && inZone(p.soldier.state.pos);
      }
      return true;
    },
    checkpoint: (at) => saveCheckpoint(at),
    /** This stage is done: on to the next, saving a checkpoint there if asked. */
    complete({ checkpoint = null, moment = null } = {}) {
      emit('objective:complete', { stage: op.stage, kind: op.objective.kind });
      op.stage++;
      op.objective = startStage();
      if (moment) ctx.moment(moment);
      if (checkpoint) saveCheckpoint(checkpoint);
    },
    success,
  };

  function startStage() {
    const stage = stages[op.stage];
    if (!stage) return null;
    const o = KINDS[stage.kind](ctx, stage);
    emit('objective:start', { stage: op.stage, kind: stage.kind, sites: o.sites });
    return o;
  }

  // ---------------------------------------------------------------- checkpoints

  /** Where the squad starts again from a checkpoint at `at` (a site, or the landing zone). */
  function spotsAt(at) {
    // (A safe spot is on the ground unless it says otherwise: the laptop may be upstairs, the restart isn't.)
    const [sx, sz, syaw, sy = 0] = at.safe ?? [at.at[0], at.at[2] + 2, at.yaw ?? 0, at.at[1] ?? 0];
    return AROUND.map(([dx, dz]) => ({ pos: placePoint([dx, 0, dz], [sx, sy, sz], syaw), yaw: syaw }));
  }

  function saveCheckpoint(at) {
    const all = enemies()?.list ?? [];
    const own = level.expanded.enemies.length; // only the level's own enemies are remembered (reinforcements are gone on a retry)
    op.checkpoints++;
    op.checkpoint = {
      n: op.checkpoints,
      stage: op.stage,
      objective: op.objective?.save() ?? null,
      cargo: op.cargo ? { ...op.cargo, drop: op.cargo.drop ? { ...op.cargo.drop } : null } : null,
      hostage: hostage()?.save() ?? null,
      retired: all.slice(0, own).map((e, i) => (e.dead ? i : -1)).filter((i) => i >= 0),
      crates: supply?.save() ?? null,
      time: op.time,
      spots: spotsAt(at),
      // The host's copy of everyone's guns (each co-op browser saves its own, net/client.js).
      ammo: new Map([...team.values()].map((p) => [p.owner, { guns: p.soldier.arsenal.ammo(), grenades: p.soldier.arsenal.state.grenades }])),
    };
    emit('mission:checkpoint', { n: op.checkpoints, stage: op.stage });
    // Teammates who bled out come back now, beside someone standing.
    const mates = up();
    for (const p of team.values()) {
      if (!p.health.state.dead || !mates.length) continue;
      const friend = mates[p.owner % mates.length].soldier.state;
      const pos = placePoint([1.2, 0, 1.2], [friend.pos.x, friend.pos.y, friend.pos.z], friend.yaw);
      p.soldier.teleport(pos, friend.yaw);
      p.health.reset(true);
      emit('player:respawn', { owner: p.owner, pos: { x: pos[0], y: pos[1], z: pos[2] } });
    }
  }

  /** Back to the latest checkpoint (game/sim.js does the enemies, players and the hostage). */
  function restore(cp) {
    op.state = 'active';
    op.reason = null;
    op.result = null;
    op.retries++;
    op.time = cp.time;
    op.stage = cp.stage;
    op.cargo = cp.cargo ? { ...cp.cargo, drop: cp.cargo.drop ? { ...cp.cargo.drop } : null } : null;
    op.objective = startStage();
    if (cp.objective) op.objective?.restore(cp.objective);
    if (op.cargo?.kind === 'intel' && op.cargo.carrier !== null && !team.has(op.cargo.carrier)) {
      op.cargo.drop ??= { ...cp.spots[0].pos };
      op.cargo.carrier = null;
    }
  }

  // ---------------------------------------------------------------- the ending

  function success() {
    op.state = 'complete';
    const id = recordId();
    const previous = records.best(id);
    const record = records.submit(id, op.time);
    op.result = results({ previous, record, best: records.best(id) });
    director()?.stop();
    emit('mission:complete', { id: mission.id, ...op.result });
  }

  function fail(reason) {
    if (op.state !== 'active') return;
    op.state = 'failed';
    op.reason = reason;
    op.result = results({});
    emit('mission:failed', { id: mission.id, reason, checkpoint: op.checkpoint?.n ?? 0, ...op.result });
  }

  function results(extra) {
    const healths = [...team.values()].map((p) => p.health);
    return {
      title: mission.title,
      time: op.time,
      stagesDone: op.stage,
      stages: stages.length,
      kills: op.totals.kills,
      headshots: op.totals.headshots,
      accuracy: op.totals.shots ? Math.min(1, op.totals.hits / op.totals.shots) : 0,
      damageTaken: Math.round(healths.reduce((sum, h) => sum + h.state.taken, 0)),
      retries: op.retries,
      players: [...op.players].map(([owner, s]) => ({ owner, ...s, accuracy: s.shots ? Math.min(1, s.hits / s.shots) : 0 })),
      ...extra,
    };
  }

  // ---------------------------------------------------------------- each tick

  function update(dt) {
    if (op.state !== 'active') return;
    op.time += dt;
    op.objective?.update(dt);
    // The drive: if whoever carries it bleeds out (or leaves), it drops where they were.
    const c = op.cargo;
    if (c?.kind === 'intel' && c.carrier !== null) {
      const p = team.get(c.carrier);
      if (!p || p.health.state.dead) {
        c.drop = p ? { ...p.soldier.state.pos } : c.drop ?? { ...op.checkpoint?.spots[0].pos };
        c.carrier = null;
        emit('objective:dropped', { pos: c.drop });
      }
    }
    if (c?.kind === 'hostage' && hostage()?.health.state.dead) { fail('hostage'); return; }
    if (team.size && !up().length) fail('down');
  }

  /** Things to hold F at: this stage's, plus a dropped drive. */
  function spots() {
    const list = op.state === 'active' ? op.objective?.spots() ?? [] : [];
    const c = op.cargo;
    if (op.state === 'active' && c?.kind === 'intel' && c.carrier === null && c.drop) {
      list.push({
        id: 'drive', kind: 'drive', pos: c.drop, time: tuning.drive, label: 'Take the drive',
        done: (p) => { c.carrier = p.owner; c.drop = null; emit('objective:pickup', { by: p.owner, stage: op.stage }); },
      });
    }
    return list;
  }

  op.objective = startStage();
  emit('mission:start', { id: mission.id, title: mission.title, brief: mission.brief });
  director()?.moment('start');

  /** From the very start (Play again, or the tuning panel's restart). */
  function restart() {
    Object.assign(op, { state: 'active', reason: null, time: 0, stage: 0, cargo: null, checkpoint: null, checkpoints: 0, retries: 0, result: null });
    op.players.clear();
    op.totals = { shots: 0, hits: 0, headshots: 0, kills: 0 };
    op.objective = startStage();
    emit('mission:start', { id: mission.id, title: mission.title, brief: mission.brief });
  }

  // (defineProperties, not Object.assign: Object.assign would run `get view()` once and copy
  // that one answer, a frozen photo, instead of the getter itself. A real bug, lesson 14.)
  return Object.defineProperties(op, Object.getOwnPropertyDescriptors({
    update,
    spots,
    restore,
    restart,
    fail,
    // Score-keeping (game/sim.js calls these, as it does for the encounter).
    onShot(owner) { if (op.state !== 'active') return; op.totals.shots++; stat(owner).shots++; },
    onHit({ owner, headshot = false, killed = false, area = false }) {
      if (op.state !== 'active') return;
      const s = stat(owner);
      if (!area) { op.totals.hits++; s.hits++; }
      if (headshot) { op.totals.headshots++; s.headshots++; }
      if (killed) { op.totals.kills++; s.kills++; }
    },
    onDown(owner) { if (op.state === 'active') stat(owner).downs++; },
    onRevive(owner) { if (op.state === 'active') stat(owner).revives++; },
    /** What the HUD shows, and what snapshots carry (the same on every screen). */
    get view() {
      const o = op.objective;
      const c = op.cargo;
      return {
        state: op.state, reason: op.reason, time: op.time, stage: op.stage,
        kind: o?.kind ?? null, phase: o?.phase ?? 'done', progress: o?.progress ?? 0, timer: o?.timer ?? 0,
        sites: o?.sites ?? [], done: o?.done ?? 0, armed: o?.armed ?? 0, contested: !!o?.contested,
        carrier: c?.kind === 'intel' ? c.carrier : null, drop: c?.kind === 'intel' ? c.drop : null,
        heli: o?.heli ?? { phase: null, t: 0, inbound: 0 }, lz: o?.lz ?? null,
        aboard: o?.aboard ?? 0, checkpoint: op.checkpoints,
      };
    },
  }));
}

export { posOf };
