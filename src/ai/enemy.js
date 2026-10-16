// One enemy soldier: a soldier (the same body and guns you have) plus senses
// and a brain, plus the "motor" code that turns the brain's wishes into a
// command each tick, the same kind of command your keyboard and mouse make.
//
// The motor does the hands-and-feet jobs:
//   - walking the path towards the brain's destination (with A*, via enemies.js)
//   - not bunching up with squad-mates, and getting unstuck
//   - turning to face or aim, at a human speed (no instant 180° snaps)
//   - aiming like a person: tracking you with a little delay, an error that's
//     large at first and settles while they keep you in sight, deliberate
//     warning shots, and the Marksman's laser warning before each shot
//   - bursts, pauses, reloads, and only firing while holding an attack token
//
// See docs/lessons/08-how-enemies-think.md.

import { createSoldier } from '../player/soldier.js';
import { idleCommand } from '../core/input.js';
import { createRandom } from '../core/random.js';
import { ROLES } from './enemy-data.js';
import { createSenseState } from './senses.js';
import { createBrain } from './brain.js';

const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {object} spec  the level piece: { role, at, yaw, squad, patrol, guard, perch, id }
 * @param {number} index
 * @param {object} ai    shared context (ai/enemies.js)
 */
export function createEnemy(spec, index, ai) {
  const def = ROLES[spec.role];
  if (!def) throw new Error(`Unknown enemy role "${spec.role}"`);
  const rng = createRandom(ai.seed * 7919 + index * 104729 + 1);
  const yaw = spec.yaw ?? 0;
  const spawnPos = { x: spec.at[0], y: spec.at[1] ?? 0, z: spec.at[2] };

  const e = {
    id: spec.id ?? `e${index}`,
    kind: 'enemy',
    role: spec.role,
    def,
    index,
    owner: `e${index}`,
    squadId: spec.squad ?? null,
    rng,
    spawn: { pos: spawnPos, yaw },
    patrol: (spec.patrol ?? []).map(([x, z, y = spawnPos.y]) => ({ x, y, z })),
    patrolIndex: 0,
    perch: !!spec.perch,
    health: def.health,
    maxHealth: def.health,
    pain: 0,               // recent damage, fading over a couple of seconds
    dead: false,
    death: null,
    inCombat: false,
    alert: 'calm',         // 'calm' | 'suspicious' | 'combat' (for the HUD's ? and ! icons)
    brainState: null,
    senses: createSenseState(),
    intent: { dest: null, pace: 'walk', stance: 'stand', look: null, aim: false, fireOk: false, ads: false, strafe: 0, reload: false, avoid: null },
    path: { dest: null, points: [], index: 0, pending: false, failed: false, avoidKey: '' },
    arrived: false,
    pathFailed: false,
    coverSpot: null,
    motor: {
      yaw, pitch: 0,
      track: null,         // where they think your chest is (lags behind the real thing)
      exposure: 0,         // seconds they've had you in sight (their aim settles with it)
      err: { yaw: 0, pitch: 0 }, errGoal: { yaw: 0, pitch: 0 }, errTimer: 0,
      reaction: 0,         // seconds since they first saw you this time
      reacquire: false,
      warning: 0,          // warning bursts still to fire
      warnDir: 1,
      burstLeft: 0,
      pause: 0,
      laser: 0,            // Marksman: seconds the laser has been on you
      laserOn: false,
      lastFired: -Infinity,
      stuckTimer: 0, stuckFrom: { ...spawnPos }, stuckCount: 0,
      firing: false,
    },
    cmd: idleCommand(yaw, 0),
    home: () => (e.patrol.length > 1 ? 'patrol' : 'guard'),
  };

  e.soldier = createSoldier({
    world: ai.world,
    registry: ai.registry,
    events: ai.events,
    owner: e.owner,
    entity: e,
    seed: ai.seed * 31 + index * 7 + 3,
    spawn: { pos: [spawnPos.x, spawnPos.y, spawnPos.z], yaw },
    loadout: [def.weapon],
    options: { infiniteAmmo: true },
    damage: (victim, amount, hit) => ai.hurt(e, victim, amount, hit),
  });
  Object.defineProperty(e, 'pos', { get: () => e.soldier.state.pos });
  e.eye = () => {
    const s = e.soldier.state;
    return { x: s.pos.x, y: s.pos.y + e.soldier.body.eyeHeight(), z: s.pos.z };
  };
  e.brain = createBrain(e, ai);
  Object.defineProperty(e, 'view', { get: () => viewOf(e, ai) });
  return e;
}

/**
 * What the drawing, HUD and sound code may know about an enemy: a small, plain
 * summary. A co-op client builds the same summary from snapshots (net/proxies.js),
 * so the presentation code works the same on the host and on clients.
 */
export function viewOf(e, ai) {
  const s = e.soldier.state;
  const m = e.motor;
  return {
    id: e.id, owner: e.owner, role: e.role, weapon: e.def.weapon,
    pos: s.pos, prev: e.soldier.body.prev,
    yaw: m.yaw, pitch: m.pitch,
    crouched: s.crouched, speed: s.speed, sprinting: s.sprinting, grounded: s.grounded,
    ready: e.intent.aim || e.inCombat || e.alert === 'suspicious', // gun raised
    reloading: e.soldier.arsenal.current.status === 'reloading',
    alert: e.alert,
    awareness: e.senses.awareness,
    inCombat: e.inCombat,
    fresh: e.inCombat && ai.time - (e.engagedAt ?? -Infinity) < 1.2, // just spotted someone
    target: e.target?.owner ?? null, // which player it's after
    sees: e.senses.visible,          // ... and whether it can see them right now
    laserOn: m.laserOn,
    laserCharge: e.def.telegraph ? Math.min(1, m.laser / e.def.telegraph) : 0,
    dead: e.dead,
  };
}

// ------------------------------------------------------------------ the motor

/** This tick's command for enemy `e`, from its intent. */
export function command(e, ai, dt) {
  const I = e.intent;
  const m = e.motor;
  const S = e.senses;
  const def = e.def;
  const s = e.soldier.state;
  const pos = s.pos;

  // ---- 1. Where to walk.
  let wx = 0, wz = 0, pace = 0, sprint = false;
  e.arrived = false;
  if (I.dest) {
    followPath(e, ai);
    const wp = e.path.points[e.path.index];
    if (wp) {
      const dx = wp.x - pos.x, dz = wp.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) { wx = dx / d; wz = dz / d; }
      sprint = I.pace === 'sprint';
      pace = I.pace === 'walk' ? def.pace.walk : def.pace.run;
      // Slow down for the last metre so they stop on the spot instead of overshooting.
      if (e.path.index === e.path.points.length - 1) pace *= clamp(d / 1.2, 0.35, 1);
    } else if (!e.path.pending) {
      e.arrived = !e.path.failed;
    }
  } else if (I.strafe) {
    // Side-step across the line of fire.
    wx = Math.cos(m.yaw) * I.strafe;
    wz = -Math.sin(m.yaw) * I.strafe;
    pace = def.pace.walk * 1.2;
  }

  // Don't bunch up: a gentle push away from anyone standing too close.
  let px = 0, pz = 0;
  for (const o of ai.alive) {
    if (o === e) continue;
    const dx = pos.x - o.pos.x, dz = pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.1 && d > 1e-4 && Math.abs(pos.y - o.pos.y) < 1.5) {
      px += (dx / d) * (1.1 - d) * 1.6;
      pz += (dz / d) * (1.1 - d) * 1.6;
    }
  }
  if (px || pz) {
    wx += px; wz += pz;
    const l = Math.hypot(wx, wz);
    if (l > 1) { wx /= l; wz /= l; }
    pace = Math.max(pace, def.pace.walk * Math.min(1, l));
  }

  // Stuck? (Pushing against a squad-mate in a doorway, a corner the grid missed.)
  if (pace > 0 && I.dest) {
    m.stuckTimer += dt;
    if (m.stuckTimer > 1) {
      const moved = Math.hypot(pos.x - m.stuckFrom.x, pos.z - m.stuckFrom.z);
      m.stuckCount = moved < 0.25 ? m.stuckCount + 1 : 0;
      if (m.stuckCount >= 1 && !e.path.pending) e.path.dest = null; // ask for a fresh route
      if (m.stuckCount >= 3) { e.path.failed = true; e.pathFailed = true; m.stuckCount = 0; }
      m.stuckTimer = 0;
      m.stuckFrom = { ...pos };
    }
  } else {
    m.stuckTimer = 0;
    m.stuckFrom = { ...pos };
  }

  // ---- 2. Where to look and aim.
  const eye = e.eye();
  const p = e.target; // the player this enemy is fighting (null until it picks one)
  if (S.visible && p) {
    // Track you with a little delay: strafing really does make you harder to hit.
    if (!m.track) m.track = { ...p.chest };
    const k = 1 - Math.exp(-dt / def.aim.lag);
    m.track.x += (p.chest.x - m.track.x) * k;
    m.track.y += (p.chest.y - m.track.y) * k;
    m.track.z += (p.chest.z - m.track.z) * k;
    m.exposure += dt;
  } else {
    m.exposure = Math.max(0, m.exposure - dt * 2);
    if (!m.track && e.squad.knowledge) {
      const k = e.squad.knowledge.pos;
      m.track = { x: k.x, y: k.y + 1.2, z: k.z };
    }
  }

  let desiredYaw = m.yaw, desiredPitch = 0;
  const lookAt = (pt) => {
    const dx = pt.x - eye.x, dy = pt.y - eye.y, dz = pt.z - eye.z;
    desiredYaw = Math.atan2(-dx, -dz);
    desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  const moving = Math.hypot(wx, wz) > 0.1 && pace > 0;
  if (sprint && moving) {
    desiredYaw = Math.atan2(-wx, -wz); // sprinting means facing where you run
  } else if (I.aim && m.track) {
    lookAt(m.track);
    // Aim error, in degrees: large at first, settling while they keep you in sight.
    const settle = clamp(m.exposure / def.aim.settle, 0, 1);
    let err = (def.aim.start + (def.aim.end - def.aim.start) * settle) * ai.difficulty.aim;
    if (moving) err *= 1.35;
    if (p?.sprinting) err *= 1.2;
    m.errTimer -= dt;
    if (m.errTimer <= 0) {
      m.errTimer = 0.3;
      const a = e.rng.range(0, Math.PI * 2), r = Math.sqrt(e.rng.next()) * err;
      m.errGoal = { yaw: Math.cos(a) * r, pitch: Math.sin(a) * r * 0.7 };
    }
    const step = 14 * dt;
    m.err.yaw += clamp(m.errGoal.yaw - m.err.yaw, -step, step);
    m.err.pitch += clamp(m.errGoal.pitch - m.err.pitch, -step, step);
    let offYaw = m.err.yaw, offPitch = m.err.pitch;
    if (m.warning > 0) {
      // A warning burst: just over your head, about a metre above your chest (plus the
      // gun's spread, so it can't hit by luck). You hear the crack and know where it
      // came from. High rather than wide, so side-stepping can't walk you into it.
      const dist = Math.hypot(m.track.x - eye.x, m.track.z - eye.z);
      const spread = e.soldier.arsenal.state.spread;
      offYaw = m.warnDir * 0.6 * spread;
      offPitch = Math.atan2(1.05, Math.max(dist, 1)) / DEG + spread;
    }
    desiredYaw += offYaw * DEG;
    desiredPitch += offPitch * DEG;
  } else if (I.look) {
    lookAt(I.look);
    desiredPitch *= 0.5;
  } else if (moving) {
    desiredYaw = Math.atan2(-wx, -wz);
  }
  // Turn at a human speed.
  const turn = (I.aim ? def.aim.turn : 200) * DEG * dt;
  m.yaw = wrap(m.yaw + clamp(wrap(desiredYaw - m.yaw), -turn, turn));
  m.pitch += clamp(desiredPitch - m.pitch, -turn, turn);
  m.pitch = clamp(m.pitch, -1.2, 1.2);
  const aimedWithin = Math.abs(wrap(desiredYaw - m.yaw)) + Math.abs(desiredPitch - m.pitch);

  // ---- 3. Walking, as keys: world direction -> forward/sideways for the current facing.
  const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw);
  const rx = Math.cos(m.yaw), rz = -Math.sin(m.yaw);
  const moveZ = (wx * fx + wz * fz) * pace;
  const moveX = (wx * rx + wz * rz) * pace;

  // ---- 4. The trigger.
  const { fire, firePressed } = trigger(e, ai, dt, aimedWithin, sprint && moving);

  return {
    ...idleCommand(m.yaw, m.pitch),
    moveX,
    moveZ,
    sprint: sprint && moving,
    crouch: I.stance === 'crouch',
    ads: I.ads && !(sprint && moving),
    fire,
    firePressed,
    reload: I.reload,
  };
}

/** Decide whether to pull the trigger this tick. */
function trigger(e, ai, dt, aimedWithin, sprinting) {
  const m = e.motor;
  const S = e.senses;
  const def = e.def;
  const I = e.intent;
  const p = e.target;
  const gun = e.soldier.arsenal.current;
  const off = { fire: false, firePressed: false };

  // Reaction time: counts while they can see you; a quick glance back after
  // losing you for a moment needs less.
  if (S.visible) m.reaction += dt;
  else if (S.unseenFor > 2.5 && m.reaction > 0) { m.reaction = 0; m.reacquire = true; }
  const needed = def.reaction * ai.difficulty.reaction * (m.reacquire ? 0.4 : 1);

  const canSee = S.visible && S.clearShot;
  const suppressing = !S.visible && S.unseenFor < def.suppress && m.track && e.inCombat;
  const want = I.fireOk && I.aim && (canSee || suppressing) && !!p && !p.down && !sprinting && gun.status === 'ready';
  const ready = m.reaction >= needed || (suppressing && m.reaction > 0);
  const aimed = aimedWithin < 6 * DEG;

  if (m.pause > 0) {
    m.pause -= dt;
    m.laserOn = false;
    if (m.pause <= 0.25) ai.release(e); // hand the ticket back a moment after the burst
    return off;
  }
  if (!want || !ready || !aimed) {
    m.laser = Math.max(0, m.laser - dt * 2);
    m.laserOn = m.laser > 0 && want;
    if (m.burstLeft <= 0 && ai.time - m.lastFired > 0.6) ai.release(e);
    return off;
  }
  if (!ai.takeToken(e)) {
    m.laserOn = false;
    return off;
  }

  if (def.telegraph) {
    // The Marksman: the laser sits on you for a moment first. Move!
    m.laserOn = true;
    m.laser += dt;
    if (m.laser < def.telegraph * ai.difficulty.reaction) return off;
    m.laser = 0;
    m.burstLeft = 1;
    return { fire: true, firePressed: true };
  }
  if (m.burstLeft <= 0) m.burstLeft = Math.round(e.rng.range(def.burst[0], def.burst[1] + 0.99) - 0.49);
  if (gun.def.fireMode === 'auto') return { fire: true, firePressed: false };
  return { fire: true, firePressed: true };
}

/** After the gun has fired: count the burst down, and pause when it's done. */
export function afterShots(e, ai, pulls) {
  const m = e.motor;
  if (pulls <= 0) return;
  m.lastFired = ai.time;
  m.burstLeft -= pulls;
  if (m.burstLeft <= 0) {
    m.burstLeft = 0;
    m.pause = e.rng.range(e.def.pause[0], e.def.pause[1]);
    m.laserOn = false;
    if (m.warning > 0) {
      m.warning--;
      m.warnDir = e.rng.next() < 0.5 ? -1 : 1;
    }
  }
}

/** Keep the route to the brain's destination up to date, and move along it. */
function followPath(e, ai) {
  const I = e.intent;
  const path = e.path;
  const avoidKey = I.avoid ? `${Math.round(I.avoid.x)},${Math.round(I.avoid.z)}` : '';
  const stale = !path.dest
    || Math.hypot(I.dest.x - path.dest.x, I.dest.z - path.dest.z) > 0.6
    || Math.abs(I.dest.y - path.dest.y) > 1
    || avoidKey !== path.avoidKey;
  if (stale && !path.pending) {
    path.dest = { ...I.dest };
    path.avoidKey = avoidKey;
    path.failed = false;
    e.pathFailed = false;
    ai.requestPath(e);
  }
  // Tick off waypoints we've reached.
  const pos = e.pos;
  while (path.index < path.points.length) {
    const wp = path.points[path.index];
    const last = path.index === path.points.length - 1;
    const d = Math.hypot(wp.x - pos.x, wp.z - pos.z);
    if (d < (last ? 0.3 : 0.45) && Math.abs(wp.y - pos.y) < 1.2) path.index++;
    else break;
  }
}
