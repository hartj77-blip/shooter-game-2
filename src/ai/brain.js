// The brain: what one enemy decides to do.
//
// A brain is a state machine (core/fsm.js), like a guard dog's moods:
//
//   calm      patrol / guard ─(noise, glimpse)─▶ suspicious ─▶ investigate ─▶ search ─▶ back to calm
//                 │                                    │
//                 └──────────(spotted you, shot at)────┴──▶ combat
//
//   combat    engage (decide) ─▶ toCover ─▶ inCover (peek and shoot / hide and reload)
//                         ├──▶ flank   (circle round to a side, then inCover)
//                         ├──▶ rush    (charge and fire: Rushers)
//                         ├──▶ perch   (hold a high spot: Marksmen)
//                         └──▶ fight   (no cover nearby: strafe and shoot)
//             lost you for a while ─▶ hunt (go where you were last seen) ─▶ search
//
// The brain only decides INTENT: where to go, how fast, which stance, what to
// look at, whether shooting is OK. ai/enemy.js turns that into a command each
// tick (walking the path, turning, pulling the trigger), the same kind of
// command your keyboard makes. The brain thinks every 0.1 s, not every tick.
//
// The numbers that make roles differ live in ai/enemy-data.js.

import { createStateMachine } from '../core/fsm.js';
import { AWARENESS } from './enemy-data.js';
import { squadMates } from './squad.js';

const DEG = Math.PI / 180;

/**
 * @param {object} e   the enemy
 * @param {object} ai  shared context: cover, player, time, tokens, report(), bark(), claim()...
 */
export function createBrain(e, ai) {
  const def = e.def;
  const S = e.senses;
  const I = e.intent;
  const rng = e.rng;
  let t = 0;          // seconds in the current state
  let pending = null; // a state change asked for while thinking; applied at the end of think()

  const go = (name, data) => { pending = { name, data }; };
  const knowledge = () => e.squad.knowledge;
  const knowAge = () => (knowledge() ? ai.time - knowledge().time : Infinity);
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const threatEye = () => {
    const k = knowledge();
    return k ? { x: k.pos.x, y: k.pos.y + 1.6, z: k.pos.z } : null;
  };
  const range = (pair) => rng.range(pair[0], pair[1]);

  function calmIntent() {
    I.aim = false; I.fireOk = false; I.ads = false; I.strafe = 0; I.stance = 'stand'; I.reload = false; I.avoid = null;
  }

  /** Into the fight. */
  function enterCombat({ seen = S.visible } = {}) {
    if (!e.inCombat) {
      e.inCombat = true;
      e.engagedAt = ai.time;
      e.motor.warning = 1; // the first burst is a warning shot
      ai.bark(e, seen ? 'spotted' : 'hit');
    }
    e.alert = 'combat';
    if (S.visible && e.target) ai.report(e, e.target.pos, true);
    go('engage');
  }

  /** Things that interrupt any calm state. Returns true if it changed state. */
  function calmChecks() {
    if (S.awareness >= 1 || ai.time - S.underFire < 0.5) { enterCombat(); return true; }
    if (e.squad.alert === 'combat' && knowledge()) { enterCombat({ seen: false }); return true; }
    const h = S.heard;
    if (h && !h.handled) {
      h.handled = true;
      if (h.alarm) {
        ai.report(e, h.pos, false, h.owner);
        enterCombat({ seen: false });
        return true;
      }
      if (!fsmIs('investigate') || flat(h.pos, I.dest ?? e.pos) > 4) { go('suspicious', { point: h.pos, heard: true }); return true; }
    }
    if (S.awareness >= AWARENESS.suspicious && S.seenPos && !fsmIs('suspicious', 'investigate')) {
      go('suspicious', { point: S.seenPos });
      return true;
    }
    return false;
  }

  /** Things every combat state keeps an eye on. Returns true if it changed state. */
  function combatChecks() {
    if (S.visible && e.target) ai.report(e, e.target.pos, true);
    if (ai.time - S.underFire < 0.2 && S.shotFrom && !S.visible) ai.report(e, S.shotFrom, false);
    if (knowAge() > 30 && !S.visible) { calmDown(); return true; }
    return false;
  }

  function calmDown() {
    e.inCombat = false;
    e.alert = 'calm';
    S.awareness = 0;
    if (e.squad.alert === 'combat' && squadMates(e).every((m) => !m.inCombat)) {
      e.squad.alert = 'calm';
      e.squad.knowledge = null;
    }
    ai.bark(e, 'calm');
    go(e.home());
  }

  const lowAmmo = () => {
    const g = e.soldier.arsenal.current;
    return g.mag <= Math.ceil(g.def.mag * 0.4);
  };

  // ------------------------------------------------------------------ the states
  const states = {
    // ---- calm
    patrol: {
      enter() {
        calmIntent();
        e.alert = 'calm';
        I.pace = 'walk';
        I.look = null;
        I.dest = e.patrol[e.patrolIndex];
        this.wait = 0;
      },
      update(dt) {
        if (calmChecks()) return;
        if (this.wait > 0) {
          this.wait -= dt;
          if (this.wait <= 0) {
            e.patrolIndex = (e.patrolIndex + 1) % e.patrol.length;
            I.dest = e.patrol[e.patrolIndex];
            I.look = null;
          }
        } else if (e.arrived) {
          this.wait = range([1.5, 3.5]);
          const yaw = e.motor.yaw + rng.range(-1.2, 1.2);
          I.look = { x: e.pos.x - Math.sin(yaw) * 5, y: e.pos.y + 1.5, z: e.pos.z - Math.cos(yaw) * 5 };
        }
      },
    },

    guard: {
      enter() {
        calmIntent();
        e.alert = 'calm';
        I.pace = 'walk';
        I.dest = flat(e.pos, e.spawn.pos) > 1 ? { ...e.spawn.pos } : null;
        this.sweep = 0;
      },
      update(dt) {
        if (calmChecks()) return;
        if (e.arrived) I.dest = null;
        this.sweep -= dt;
        if (this.sweep <= 0) {
          this.sweep = range([2.5, 5]);
          const yaw = e.spawn.yaw + rng.range(-50, 50) * DEG;
          I.look = { x: e.pos.x - Math.sin(yaw) * 5, y: e.pos.y + 1.5, z: e.pos.z - Math.cos(yaw) * 5 };
        }
      },
    },

    suspicious: {
      enter({ point, heard = false }) {
        calmIntent();
        e.alert = 'suspicious';
        this.point = point;
        I.dest = null;
        I.look = { x: point.x, y: point.y + 1, z: point.z };
        I.ads = true;
        ai.bark(e, heard ? 'heard' : 'glimpse');
      },
      update() {
        if (calmChecks()) return;
        if (t > 1.4) go(e.perch && flat(this.point, e.pos) > 20 ? 'guard' : 'investigate', { point: this.point });
      },
    },

    investigate: {
      enter({ point }) {
        calmIntent();
        e.alert = 'suspicious';
        I.dest = { ...point };
        I.pace = 'walk';
        I.ads = true;
        I.look = null;
        if (rng.next() < 0.5) ai.bark(e, 'investigate');
      },
      update() {
        if (calmChecks()) return;
        if (e.arrived || e.pathFailed || t > 15) go('search', { center: I.dest ?? e.pos, time: 6 });
      },
    },

    // Look around an area: a few spots near `center`, a glance in each.
    search: {
      enter({ center, time = 8 }) {
        this.center = center;
        this.until = time;
        this.spots = 3;
        this.glance = 0;
        I.pace = 'walk';
        I.ads = true;
        I.aim = false;
        I.fireOk = false;
        I.stance = 'stand';
        I.dest = null;
        if (e.inCombat) ai.bark(e, 'search');
      },
      update(dt) {
        if (e.inCombat) {
          if (S.visible || ai.time - S.underFire < 0.5) { go('engage'); return; }
          if (combatChecks()) return;
        } else if (calmChecks()) return;
        this.glance -= dt;
        if (this.glance <= 0 && (e.arrived || !I.dest)) {
          if (this.spots-- <= 0 || t > this.until + 6) {
            if (e.inCombat) calmDown();
            else go(e.home());
            return;
          }
          this.glance = range([1.2, 2.2]);
          const a = rng.range(0, Math.PI * 2), r = rng.range(2, 6);
          I.dest = ai.nearestWalkable({ x: this.center.x + Math.cos(a) * r, y: this.center.y, z: this.center.z + Math.sin(a) * r });
          const yaw = rng.range(-Math.PI, Math.PI);
          I.look = { x: e.pos.x - Math.sin(yaw) * 5, y: e.pos.y + 1.4, z: e.pos.z - Math.cos(yaw) * 5 };
        }
      },
    },

    // ---- combat
    engage: {
      enter() {
        I.look = null;
        I.avoid = null;
        I.strafe = 0;
        const k = knowledge();
        if (!k) { go('hunt'); return; }
        const d = flat(k.pos, e.pos);
        const mates = squadMates(e).filter((m) => m.inCombat).length;
        if (e.perch && e.role === 'marksman' && d > def.range.min * 0.6) go('perch');
        else if (def.rush > 0 && d > def.range.ideal && rng.next() < def.rush) go('rush');
        else if (!e.squad.flanker && mates >= 1 && rng.next() < def.flank * 0.5) go('flank');
        else go('toCover');
      },
    },

    toCover: {
      enter(data = {}) {
        const eye = threatEye();
        if (!eye) { go('hunt'); return; }
        const found = ai.cover.find({
          from: e.pos, eye, range: def.range, taken: ai.taken(e), mates: squadMates(e).map((m) => m.pos),
          exclude: data.exclude ?? -1, maxTravel: data.maxTravel ?? 22,
        });
        if (!found) { go('fight'); return; }
        ai.claim(e, found.point.id);
        e.coverSpot = found;
        I.dest = { ...found.point.pos };
        I.pace = def.sprint && !S.visible ? 'sprint' : 'run';
        I.stance = 'stand';
        I.aim = true;
        I.ads = false;
        I.fireOk = rng.next() < def.fireOnMove;
        if (data.moving) ai.bark(e, 'move');
        this.check = 0.5;
      },
      update(dt) {
        if (combatChecks()) return;
        if (e.arrived) { go('inCover'); return; }
        if (e.pathFailed || t > 8) { go('engage'); return; }
        this.check -= dt;
        if (this.check <= 0 && e.coverSpot) {
          this.check = 1;
          const eye = threatEye();
          if (eye && !ai.cover.evaluate(e.coverSpot.point, eye).safe) go('toCover', { exclude: e.coverSpot.point.id });
        }
      },
    },

    inCover: {
      enter() {
        this.phase = 'hide';
        this.timer = range(def.cover.hide) * 0.6;
        this.check = 0;
        this.flankCheck = range([3, 5]);
        this.blind = 0;
        I.dest = { ...e.coverSpot.point.pos };
        I.aim = true;
        I.pace = 'run';
        this.peek = e.coverSpot.peek;
      },
      update(dt) {
        if (combatChecks()) return;
        const spot = e.coverSpot;
        const p = spot.point;
        const eye = threatEye();
        // Has the player moved round so this cover doesn't hide us any more?
        this.check -= dt;
        if (this.check <= 0 && eye) {
          this.check = 0.5;
          const ev = ai.cover.evaluate(p, eye);
          if (!ev.safe) { go('toCover', { exclude: p.id, moving: true }); return; }
          this.peek = ev.peek;
          spot.canShoot = ev.canShoot;
        }
        this.timer -= dt;
        if (this.phase === 'hide') {
          I.stance = p.high ? 'stand' : 'crouch';
          I.dest = { ...p.pos };
          I.fireOk = false;
          I.ads = false;
          if (lowAmmo() && !I.reload) { I.reload = true; ai.bark(e, 'reload'); }
          const reloading = e.soldier.arsenal.current.status === 'reloading';
          if (this.timer <= 0 && !reloading) {
            I.reload = false;
            this.phase = 'peek';
            this.timer = range(def.cover.peek);
          }
        } else {
          I.stance = 'stand';
          if (p.high && this.peek >= 0) I.dest = ai.cellPos(this.peek);
          I.fireOk = true;
          I.ads = def.ads;
          this.blind = S.visible ? 0 : this.blind + dt;
          if (this.timer <= 0) {
            this.phase = 'hide';
            this.timer = range(def.cover.hide);
          }
        }
        if (!S.visible && knowAge() > 4 && this.blind > 2) { go('hunt'); return; }
        if (def.rush > 0 && t > 3 && rng.next() < def.rush * dt) { go('rush'); return; }
        this.flankCheck -= dt;
        if (this.flankCheck <= 0) {
          this.flankCheck = range([3, 6]);
          const mates = squadMates(e).filter((m) => m.inCombat).length;
          if (!e.squad.flanker && mates >= 1 && rng.next() < def.flank) go('flank');
        }
        // Out of reach of the player? (A Rusher stuck far away, a Rifleman with no shot.)
        if (!spot.canShoot && t > 6) go('toCover', { exclude: p.id, moving: true });
      },
      exit() { I.reload = false; },
    },

    fight: {
      enter() {
        I.dest = null;
        I.strafe = rng.next() < 0.5 ? -1 : 1;
        this.flip = range([0.7, 1.5]);
        this.retry = range([2, 3]);
        I.stance = 'stand';
        I.aim = true;
        I.fireOk = true;
        I.ads = def.ads && rng.next() < 0.5;
      },
      update(dt) {
        if (combatChecks()) return;
        this.flip -= dt;
        if (this.flip <= 0) {
          this.flip = range([0.7, 1.5]);
          I.strafe = -I.strafe;
          if (e.role === 'rifleman') I.stance = rng.next() < 0.3 ? 'crouch' : 'stand';
        }
        const k = knowledge();
        if (def.rush > 0 && k && flat(k.pos, e.pos) > def.range.max) { go('rush'); return; }
        if (!S.visible && knowAge() > 3) { go('hunt'); return; }
        this.retry -= dt;
        if (this.retry <= 0) go('toCover');
      },
      exit() { I.strafe = 0; },
    },

    flank: {
      enter() {
        const eye = threatEye();
        if (!eye) { go('hunt'); return; }
        const mates = squadMates(e);
        const from = mates.length
          ? { x: mates.reduce((s, m) => s + m.pos.x, 0) / mates.length, z: mates.reduce((s, m) => s + m.pos.z, 0) / mates.length }
          : e.pos;
        const found = ai.cover.find({
          from: e.pos, eye, range: def.range, flankFrom: from, maxTravel: 36,
          taken: ai.taken(e), mates: mates.map((m) => m.pos),
        });
        if (!found) { go('toCover'); return; }
        e.squad.flanker = e.id;
        ai.claim(e, found.point.id);
        e.coverSpot = found;
        ai.bark(e, 'flank');
        I.dest = { ...found.point.pos };
        I.pace = def.sprint ? 'sprint' : 'run';
        I.stance = 'stand';
        I.avoid = { x: eye.x, z: eye.z, radius: 12, weight: 6 };
        I.aim = false;
        I.fireOk = false;
      },
      update() {
        if (combatChecks()) return;
        // Caught in the open close up: fight back.
        if (S.visible && e.target && flat(e.target.pos, e.pos) < def.range.ideal) {
          I.aim = true; I.fireOk = true; I.pace = 'run';
        }
        if (e.arrived) { go('inCover'); return; }
        if (e.pathFailed || t > 14) go('engage');
      },
      exit() {
        if (e.squad.flanker === e.id) e.squad.flanker = null;
        I.avoid = null;
      },
    },

    rush: {
      enter() {
        ai.bark(e, 'rush');
        ai.release(e);
        I.aim = true;
        I.fireOk = true;
        I.ads = false;
        I.stance = 'stand';
        this.painAtStart = e.pain;
      },
      update() {
        if (combatChecks()) return;
        const k = knowledge();
        if (!k) { go('hunt'); return; }
        I.dest = { ...k.pos };
        I.pace = S.visible ? 'run' : 'sprint';
        const d = flat(k.pos, e.pos);
        if (S.visible && d < def.range.ideal) { go('fight'); return; }
        if (e.pain - this.painAtStart > 35) { go('toCover', { moving: true }); return; }
        if (!S.visible && knowAge() > 3 && d < 3) { go('hunt'); return; }
        if (t > 10 || e.pathFailed) go('engage');
      },
    },

    perch: {
      enter() {
        I.dest = flat(e.pos, e.spawn.pos) > 0.6 ? { ...e.spawn.pos } : null;
        I.aim = true;
        I.fireOk = true;
        I.ads = true;
        I.stance = 'stand';
        this.blind = 0;
      },
      update(dt) {
        if (combatChecks()) return;
        if (e.arrived) I.dest = null;
        const k = knowledge();
        if (k && flat(k.pos, e.pos) < def.range.min * 0.5) { go('toCover', { moving: true }); return; }
        // Duck while you can't see them; stand up to look again.
        this.blind = S.visible ? 0 : this.blind + dt;
        I.stance = this.blind > 1.5 && this.blind % 4 < 2.5 ? 'crouch' : 'stand';
        if (this.blind > 12) go('hunt');
      },
    },

    hunt: {
      enter() {
        ai.bark(e, 'lost');
        ai.release(e);
        const k = knowledge();
        I.dest = k ? { ...k.pos } : null;
        I.pace = 'run';
        I.ads = true;
        I.aim = false;
        I.fireOk = false;
        I.stance = 'stand';
        I.look = k ? { x: k.pos.x, y: k.pos.y + 1.4, z: k.pos.z } : null;
      },
      update() {
        if (S.visible || ai.time - S.underFire < 0.5) { go('engage'); return; }
        if (combatChecks()) return;
        if (e.arrived) I.look = null;
        if (e.arrived || e.pathFailed || !I.dest || t > 12) go('search', { center: I.dest ?? e.pos, time: 10 });
      },
    },

    dead: {
      enter() {
        I.dest = null; I.fireOk = false; I.aim = false;
      },
    },
  };

  const fsm = createStateMachine(states, (from, to) => { t = 0; e.brainState = to; });
  const fsmIs = (...names) => fsm.is(...names);

  return {
    get state() { return fsm.state; },
    start() {
      fsm.go(e.home());
      flush();
    },
    /** Think for `dt` seconds (called about every 0.1 s). */
    think(dt) {
      if (e.dead) return;
      t += dt;
      fsm.update(dt);
      flush();
    },
    /** Something big happened (shot, or the squad says so): fight now. */
    alarm() {
      if (!e.dead && !e.inCombat) {
        enterCombat({ seen: false });
        flush();
      }
    },
    kill() {
      pending = null;
      fsm.go('dead');
    },
  };

  // Apply state changes asked for while thinking (a few in a row at most, so
  // "engage" can decide and hand over in the same think).
  function flush() {
    for (let i = 0; i < 4 && pending; i++) {
      const { name, data } = pending;
      pending = null;
      if (fsm.state === name && name !== 'toCover' && name !== 'search') continue;
      if (fsm.state === name) {
        // Re-entering the same state (picking new cover): leave and come back.
        states[name].exit?.();
        t = 0;
        states[name].enter?.call(states[name], data);
        continue;
      }
      fsm.go(name, data);
    }
  }
}
