// The hostage: someone you rescue and bring home (the Lifeline mission).
//
// Not a soldier: no gun, no brain for fighting. They have a body that moves
// like yours (player/controller.js), hitboxes that enemy bullets can hit, and
// health that bleeds out like a teammate's (player/health.js). Their "brain"
// is a FOLLOWER: once freed, they stay a few metres behind whoever freed them
// (or the nearest teammate standing), run to catch up, and wait when they're
// left too far behind.
//
// Following uses the enemies' own steering (steer() in ai/enemy.js): the same
// route-finding, the same "don't bunch up", the same unsticking. Only the
// destination is different: a moving person instead of a cover spot.
//
// Fairness and friendly fire:
//   - enemies never aim at them, but stray bullets meant for you can hit them
//   - your bullets pass through them (friendly fire is off)
//   - you walk through them too: their body is in the ESCORT collision group
//     (world/groups.js), so a follower at your heels never blocks a doorway
//
// Their health events are hostage:hurt, hostage:down, hostage:revive and
// hostage:dead (with `id`), so nothing mistakes them for a player.
//
// Simulation only: runs in Node. Drawn by render/soldiers-view.js (orange, unarmed).

import { createPlayer, NO_MODS } from '../player/controller.js';
import { createHitboxes } from '../player/hitboxes.js';
import { createHealth, DEFAULT_HEALTH } from '../player/health.js';
import { ESCORT_GROUPS } from '../world/groups.js';
import { idleCommand } from '../core/input.js';
import { route } from './astar.js';
import { steer, keysFor } from './enemy.js';

export const HOSTAGE = {
  health: 100,
  bleedOut: 45,      // seconds: a little longer than a player gets
  reviveHealth: 50,
  damage: 0.5,       // enemy bullets do this fraction of their damage (they're keeping their head down)
  follow: 3.2,       // metres behind their leader they like to be
  sprintAt: 8,       // further than this: run to catch up
  waitAt: 28,        // further than this: wait where they are ("Wait for me!")
  pace: { walk: 0.5, run: 0.95 }, // fractions of the 5 m/s walking speed (enemy-data.js style)
  routeEvery: 0.5,   // seconds between route searches
  turn: 220,         // degrees per second
};

const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const standing = (h) => !h.state.down && !h.state.bleeding && !h.state.dead;

/**
 * @param {object} opts
 * @param {object} opts.world, opts.registry
 * @param {object} opts.nav     the nav grid (ai/nav-grid.js)
 * @param {object} opts.events
 * @param {{pos:number[], yaw:number}} opts.spawn where they're held
 * @param {string} [opts.id]
 */
export function createHostage({ world, registry, nav, events, spawn, id = 'h0', tuning = HOSTAGE }) {
  // Health events, renamed: 'player:down' becomes 'hostage:down'.
  const hostageEvents = {
    ...events,
    emit: (name, data) => events.emit(name.replace(/^player:/, 'hostage:'), { ...data, id }),
  };
  const body = createPlayer({ world, spawn, events: { emit() {} }, owner: id, collisionGroups: ESCORT_GROUPS });
  const health = createHealth({
    events: hostageEvents, owner: id, revivable: true,
    tuning: { ...DEFAULT_HEALTH, max: tuning.health, bleedOut: tuning.bleedOut, reviveHealth: tuning.reviveHealth, regenDelay: 6, regenRate: 12 },
  });
  const entity = {
    kind: 'civilian', id, owner: id,
    // Enemy bullets that hit them come here (ai/enemies.js hurt).
    damage: (amount, from) => health.damage(amount * tuning.damage, from),
  };
  const hitboxes = createHitboxes(world, registry, entity, { flatZones: true });

  const h = {
    id, owner: id, kind: 'civilian', entity, body, health, hitboxes,
    state: 'captive',   // 'captive' | 'following' | 'aboard'
    leader: null,       // the player they follow
    def: { pace: tuning.pace },
    intent: { dest: null, pace: 'walk', strafe: 0, avoid: null },
    path: { dest: null, points: [], index: 0, pending: false, failed: false, avoidKey: '' },
    motor: { yaw: spawn.yaw, stuckTimer: 0, stuckFrom: { x: 0, y: 0, z: 0 }, stuckCount: 0 },
    arrived: false,
    pathFailed: false,
    waiting: false,
    nextRoute: 0,
    time: 0,
    // The same shape as a teammate, so reviving them works the same way (game/revive.js).
    soldier: { state: body.state },
    reviving: 0,
    reviver: null,
  };
  Object.defineProperty(h, 'pos', { get: () => body.state.pos });
  hitboxes.sync(body.state.pos, body.state.yaw, true);

  // steer() asks for a route; we find it ourselves (not in the enemies' queue), a couple of times a second.
  const ctx = {
    crowd: [],
    requestPath(agent) { agent.path.pending = true; },
  };

  function findRoute() {
    const p = h.path;
    p.pending = false;
    if (!h.intent.dest || !nav) return;
    p.dest = { ...h.intent.dest };
    const points = route(nav, h.pos, h.intent.dest);
    p.points = points ?? [];
    p.index = points ? Math.min(1, points.length - 1) : 0;
    p.failed = !points;
    h.pathFailed = !points;
    h.nextRoute = h.time + tuning.routeEvery;
  }

  /** Who to follow: whoever freed them while they're standing, else the nearest teammate standing. */
  function leaderOf(players) {
    const up = players.filter((p) => standing(p.health));
    if (h.leader !== null) {
      const l = up.find((p) => p.owner === h.leader);
      if (l) return l;
    }
    let best = null, bestD = Infinity;
    for (const p of up) {
      const d = flat(p.soldier.state.pos, h.pos);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  /**
   * One tick of movement: decide where to go, steer, move.
   * @param {Array} players  sim.team values
   * @param {Array} others   enemies still standing (to keep clear of)
   */
  function move(dt, players, others = []) {
    h.time += dt;
    const out = !standing(health);
    let cmd = idleCommand(h.motor.yaw, 0);
    if (h.state === 'captive' || h.state === 'aboard' || out) {
      cmd.crouch = h.state === 'captive';
      h.intent.dest = null;
    } else {
      const l = leaderOf(players);
      const lp = l?.soldier.state.pos;
      const d = lp ? flat(lp, h.pos) : 0;
      const wasWaiting = h.waiting;
      h.waiting = !!l && d > tuning.waitAt;
      if (h.waiting && !wasWaiting) events.emit('hostage:wait', { id, pos: { ...h.pos } });
      if (!l || d <= tuning.follow || h.waiting) {
        h.intent.dest = null;
      } else {
        h.intent.dest = { x: lp.x, y: lp.y, z: lp.z };
        h.intent.pace = d > tuning.sprintAt ? 'sprint' : d > tuning.follow * 2 ? 'run' : 'walk';
      }
      ctx.crowd = [...players.map((p) => ({ pos: p.soldier.state.pos })), ...others];
      if (h.path.pending && h.time >= h.nextRoute) findRoute();
      const { wx, wz, pace, sprint } = steer(h, ctx, dt);
      // Face where they walk (or their leader, standing still), at a person's speed.
      const moving = Math.hypot(wx, wz) > 0.1 && pace > 0;
      const want = moving ? Math.atan2(-wx, -wz) : lp ? Math.atan2(-(lp.x - h.pos.x), -(lp.z - h.pos.z)) : h.motor.yaw;
      const turn = tuning.turn * DEG * dt;
      h.motor.yaw = wrap(h.motor.yaw + Math.max(-turn, Math.min(turn, wrap(want - h.motor.yaw))));
      cmd = { ...idleCommand(h.motor.yaw, 0), ...keysFor(h.motor.yaw, wx, wz, pace), sprint: sprint && moving };
    }
    body.update(cmd, dt, NO_MODS);
    const s = body.state;
    hitboxes.sync(s.pos, s.yaw, s.crouched);
    hitboxes.setEnabled(!health.state.dead);
  }

  /** Untie them: from now on they follow `by`. */
  function free(by) {
    if (h.state !== 'captive') return;
    h.state = 'following';
    h.leader = by;
    events.emit('hostage:freed', { id, by, pos: { ...h.pos } });
  }

  // (defineProperties, not Object.assign: Object.assign would run `get view()` once and copy
  // that one answer, a frozen photo, instead of the getter itself. A real bug, lesson 14.)
  return Object.defineProperties(h, Object.getOwnPropertyDescriptors({
    move,
    free,
    /** In the helicopter: they stop where they are. */
    board() { h.state = 'aboard'; h.intent.dest = null; },
    unboard() { if (h.state === 'aboard') h.state = 'following'; },
    /** What a checkpoint needs to put them back. */
    save: () => ({ state: h.state, leader: h.leader, pos: { ...h.pos }, yaw: h.motor.yaw }),
    restore(saved) {
      h.state = saved.state === 'aboard' ? 'following' : saved.state;
      h.leader = saved.leader;
      body.teleport([saved.pos.x, saved.pos.y, saved.pos.z], saved.yaw);
      h.motor.yaw = saved.yaw;
      health.reset(true);
      h.intent.dest = null;
      h.path.points = [];
      h.path.dest = null;
      h.waiting = false;
      hitboxes.sync(h.pos, saved.yaw, h.state === 'captive');
    },
    /** What drawing code and snapshots need (the same shape as a soldier's view). */
    get view() {
      const s = body.state;
      const hs = health.state;
      return {
        id, owner: id, role: 'hostage', weapon: null, pos: s.pos, prev: body.prev, yaw: h.motor.yaw, pitch: 0,
        crouched: s.crouched, speed: s.speed, sprinting: s.sprinting, grounded: s.grounded, ready: false, reloading: false,
        hp: hs.hp, down: !!(hs.down || hs.bleeding), dead: !!hs.dead, bleeding: !!hs.bleeding, bleedLeft: hs.bleedLeft ?? 0,
        reviving: h.reviving, reviver: h.reviver, captive: h.state === 'captive', aboard: h.state === 'aboard',
        waiting: h.waiting,
      };
    },
    remove() {
      hitboxes.remove();
      body.remove();
    },
  }));
}
