// Objectives: the jobs a mission is made of (levels/missions.js lists them).
//
// Each one is a small state machine with a PHASE, like a recipe card with
// steps: "find the laptop → download (60 s, defend it) → pick up the drive".
// game/operation.js runs them one after another and hands each a toolbox
// (`ctx`) to do its job: where the sites are, who's standing, how many enemies
// are near, "save a checkpoint", "this stage is done", "the mission failed".
//
// Every objective has:
//   phase, progress (0..1), timer (seconds)  what the HUD shows
//   update(dt)                               the clock part (downloads, fuses)
//   spots()                                  things to hold F at right now (game/interact.js)
//   save() / restore(saved)                  for checkpoints
//
// CONTESTED: a download, or a position you're holding, only makes progress
// while you're there to defend it. Enemies close by and none of you: it stalls.
//
// Simulation only: runs in Node.

import { HELI } from './helicopter.js';

export const OBJECTIVES = {
  free: 2,             // seconds of holding F to untie the hostage
  laptop: 1.5,         // ... to start the download
  download: 60,        // seconds the download takes
  contest: 7,          // metres: enemies this close to the laptop (or inside the area you hold) stall it
  guard: 12,           // ... unless one of you is this close to the laptop
  drive: 1,            // seconds of holding F to take the drive
  plant: 4,            // ... to plant a charge
  fuse: 10,            // seconds from planting to bang
  radio: 2,            // ... to use a radio
  hold: 180,           // seconds to hold the line
  holdRadius: 8,       // metres, unless the site says otherwise
  officerHealth: 2.5,  // the officer you're sent to take down is this much tougher than a rifleman
  guards: 2,           // ...and has this many bodyguards, unless the stage says otherwise
};

// Every phase any objective can be in (snapshots send a phase as its place in this list).
export const PHASES = ['find', 'escort', 'download', 'collect', 'carry', 'plant', 'reach', 'hold', 'call', 'inbound', 'landing', 'landed', 'leaving', 'done'];

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (site) => ({ x: site.at[0], y: site.at[1] ?? 0, z: site.at[2] });

// ------------------------------------------------------------------ rescue

/** Find the hostage (held at one of a few sites), free them: they follow you to the helicopter. */
function rescue(ctx, stage) {
  const [site] = ctx.picks;
  const o = { kind: 'rescue', phase: 'find', progress: 0, timer: 0, sites: [site.index] };
  // Held at the site, tied up (on a fresh start, put back there).
  const held = { pos: { x: site.at[0], y: site.at[1] ?? 0, z: site.at[2] }, yaw: site.yaw };
  if (!ctx.hostage()) ctx.makeHostage({ pos: site.at, yaw: site.yaw });
  else ctx.hostage().restore({ state: 'captive', leader: null, ...held });
  o.update = () => {};
  o.spots = () => {
    const h = ctx.hostage();
    if (o.phase !== 'find' || h?.state !== 'captive') return [];
    return [{
      id: 'hostage', kind: 'free', pos: h.pos, time: ctx.tuning.free, label: 'Free the hostage', range: 1.7,
      done: (p) => {
        h.free(p.owner);
        o.phase = 'done';
        ctx.emit('objective:freed', { by: p.owner, stage: ctx.index });
        ctx.setCargo({ kind: 'hostage' });
        ctx.complete({ checkpoint: site, moment: 'rescue:freed' });
      },
    }];
  };
  o.save = () => ({ phase: o.phase });
  o.restore = (s) => { o.phase = s.phase; };
  void stage;
  return o;
}

// ------------------------------------------------------------------ intel

/** Find the laptop, start the download, defend it, take the drive (someone carries it to the helicopter). */
function intel(ctx, stage) {
  const [site] = ctx.picks;
  const at = posOf(site);
  const T = ctx.tuning;
  const duration = stage.download ?? T.download;
  const o = { kind: 'intel', phase: 'find', progress: 0, timer: duration, sites: [site.index], contested: false };
  o.update = (dt) => {
    if (o.phase !== 'download') return;
    const defended = ctx.playersNear(at, T.guard) > 0;
    o.contested = ctx.enemiesNear(at, T.contest) > 0 && !defended;
    if (o.contested) return;
    o.progress = Math.min(1, o.progress + dt / duration);
    o.timer = duration * (1 - o.progress);
    if (o.progress >= 1) {
      o.phase = 'collect';
      ctx.emit('objective:downloaded', { stage: ctx.index });
      ctx.moment('intel:downloaded');
    }
  };
  o.spots = () => {
    if (o.phase === 'find') {
      return [{
        id: 'laptop', kind: 'laptop', pos: at, time: T.laptop, label: 'Start the download',
        done: (p) => {
          o.phase = 'download';
          ctx.emit('objective:download', { by: p.owner, stage: ctx.index });
          ctx.moment('intel:download');
        },
      }];
    }
    if (o.phase === 'collect') {
      return [{
        id: 'drive', kind: 'drive', pos: at, time: T.drive, label: 'Take the drive',
        done: (p) => {
          o.phase = 'done';
          ctx.setCargo({ kind: 'intel', carrier: p.owner, drop: null });
          ctx.emit('objective:pickup', { by: p.owner, stage: ctx.index });
          ctx.complete({ checkpoint: site, moment: 'intel:pickup' });
        },
      }];
    }
    return [];
  };
  o.save = () => ({ phase: o.phase, progress: o.progress });
  o.restore = (s) => {
    // A download is lost if you fall before it's finished: you start it again.
    o.phase = s.phase === 'download' ? 'find' : s.phase;
    o.progress = s.phase === 'download' ? 0 : s.progress;
    o.timer = duration * (1 - o.progress);
  };
  return o;
}

// ------------------------------------------------------------------ sabotage

/** Plant a charge on each weapons cache (a few, hidden among more possible spots); each one blows after a fuse. */
function sabotage(ctx, stage) {
  const caches = ctx.picks;
  const T = ctx.tuning;
  const o = {
    kind: 'sabotage', phase: 'plant', progress: 0, timer: 0,
    sites: caches.map((c) => c.index),
    done: 0,   // caches destroyed (one bit each)
    armed: 0,  // caches with a charge ticking (one bit each)
  };
  const fuses = caches.map(() => null);
  const bit = (i) => 1 << i;
  o.update = (dt) => {
    let soonest = Infinity;
    caches.forEach((c, i) => {
      if (fuses[i] === null) return;
      fuses[i] -= dt;
      soonest = Math.min(soonest, fuses[i]);
      if (fuses[i] > 0) return;
      fuses[i] = null;
      o.armed &= ~bit(i);
      o.done |= bit(i);
      ctx.explode(posOf(c), { owner: o.planter?.[i] ?? null, kind: 'charge', big: true });
      ctx.emit('objective:destroyed', { index: i, site: c.id, left: caches.length - count(o.done), stage: ctx.index });
      ctx.moment('sabotage:destroyed');
      if (count(o.done) === caches.length) {
        o.phase = 'done';
        ctx.complete({ checkpoint: c, moment: 'sabotage:done' });
      } else {
        ctx.checkpoint(c);
      }
    });
    o.timer = Number.isFinite(soonest) ? Math.max(0, soonest) : 0;
    o.progress = count(o.done) / caches.length;
  };
  o.spots = () => caches.flatMap((c, i) => ((o.done | o.armed) & bit(i) ? [] : [{
    id: `cache${i}`, kind: 'charge', pos: posOf(c), time: T.plant, label: 'Plant a charge', range: 1.9,
    done: (p) => {
      fuses[i] = stage.fuse ?? T.fuse;
      o.armed |= bit(i);
      (o.planter ??= [])[i] = p.owner;
      ctx.emit('objective:planted', { index: i, site: c.id, by: p.owner, fuse: fuses[i], stage: ctx.index });
    },
  }]));
  // A checkpoint keeps the caches already gone; a charge still ticking is lost.
  o.save = () => ({ done: o.done });
  o.restore = (s) => {
    o.done = s.done;
    o.armed = 0;
    fuses.fill(null);
    o.phase = count(o.done) === caches.length ? 'done' : 'plant';
    o.progress = count(o.done) / caches.length;
  };
  return o;
}

const count = (mask) => { let n = 0; for (let m = mask; m; m >>= 1) n += m & 1; return n; };

// ------------------------------------------------------------------ hold the line

/** Reach the position, switch on the radio, and hold the area while it calls the helicopter. */
function hold(ctx, stage) {
  const [site] = ctx.picks;
  const at = posOf(site);
  const T = ctx.tuning;
  const radius = site.radius ?? T.holdRadius;
  const duration = stage.hold ?? T.hold;
  const o = { kind: 'hold', phase: 'reach', progress: 0, timer: duration, sites: [site.index], contested: false, radius };
  o.update = (dt) => {
    if (o.phase !== 'hold') return;
    const ours = ctx.playersNear(at, radius) > 0;
    o.contested = ctx.enemiesNear(at, radius) > 0;
    if (!ours || o.contested) return;
    o.progress = Math.min(1, o.progress + dt / duration);
    o.timer = duration * (1 - o.progress);
    // The second half gets harder: a wave at halfway and another near the end.
    if (o.progress >= 0.5 && !o.half) { o.half = true; ctx.moment('hold:half'); }
    if (o.progress >= 0.85 && !o.late) { o.late = true; ctx.moment('hold:late'); }
    if (o.progress >= 1) {
      o.phase = 'done';
      ctx.emit('objective:held', { stage: ctx.index });
      ctx.complete({ moment: 'hold:done' });
    }
  };
  o.spots = () => (o.phase !== 'reach' ? [] : [{
    id: 'radio', kind: 'radio', pos: at, time: T.radio, label: 'Switch on the radio', range: 1.8,
    done: (p) => {
      o.phase = 'hold';
      ctx.emit('objective:hold', { by: p.owner, stage: ctx.index, duration });
      ctx.checkpoint(site);
      ctx.moment('hold:start');
    },
  }]);
  o.save = () => ({ phase: o.phase });
  o.restore = (s) => { o.phase = s.phase; o.progress = 0; o.timer = duration; o.half = false; o.late = false; };
  return o;
}

// ------------------------------------------------------------------ eliminate

/**
 * Find the officer (at one of a few sites, with bodyguards) and take them
 * down. They're an enemy soldier like any other, only tougher and marked
 * `hvt` (high-value target) so every screen can point them out once found.
 * A checkpoint or restart brings a fresh officer back (reinforcements are
 * never saved, and the officer is one).
 */
function eliminate(ctx, stage) {
  const [site] = ctx.picks;
  const T = ctx.tuning;
  const o = { kind: 'eliminate', phase: 'find', progress: 0, timer: 0, sites: [site.index] };
  // (Beside the site, not on it: a site can have a solid prop, like a crate stack.)
  const spot = (dx, dz) => [site.at[0] + dx, site.at[1] ?? 0, site.at[2] + dz];
  const target = ctx.spawnEnemy({ role: 'rifleman', at: spot(0, 3), yaw: site.yaw ?? 0, squad: `hvt${ctx.index}` });
  if (target) {
    target.hvt = true;
    target.health = target.maxHealth = Math.round(target.maxHealth * T.officerHealth);
  }
  const n = stage.guards ?? T.guards;
  for (let i = 0; i < n; i++) {
    ctx.spawnEnemy({ role: i % 2 ? 'rusher' : 'rifleman', at: spot(i % 2 ? 3 : -3, 3.5 + Math.floor(i / 2)), yaw: site.yaw ?? 0, squad: `hvt${ctx.index}` });
  }
  o.update = () => {
    if (o.phase !== 'find' || !target?.dead) return;
    o.phase = 'done';
    ctx.emit('objective:eliminated', { stage: ctx.index });
    ctx.complete({ checkpoint: site, moment: 'eliminate:done' });
  };
  o.spots = () => [];
  o.save = () => ({ phase: o.phase });
  o.restore = (s) => { if (s.phase === 'done' && target && !target.dead) target.health = 0; };
  return o;
}

// ------------------------------------------------------------------ extraction

/**
 * Call the helicopter from the landing zone's radio, survive until it lands,
 * climb aboard. It leaves when everyone still standing is aboard (with the
 * hostage or the drive, if that's the job) and nobody is bleeding out.
 */
function extract(ctx, stage) {
  const lz = ctx.lz(stage.lz);
  const centre = posOf(lz);
  const inbound = stage.inbound ?? HELI.inbound;
  const o = {
    kind: 'extract', phase: stage.called ? 'inbound' : 'call', progress: 0, timer: stage.called ? inbound : 0,
    sites: [], aboard: 0, heli: { phase: stage.called ? 'inbound' : null, t: 0, inbound }, lz: lz.id,
  };
  const inZone = (pos) => Math.abs(pos.x - centre.x) <= lz.size / 2 + 0.5 && Math.abs(pos.z - centre.z) <= lz.size / 2 + 0.5
    && Math.abs(pos.y - centre.y) < 2.5;
  const setPhase = (phase) => { o.phase = phase; o.heli = { phase, t: 0, inbound }; };
  if (stage.called) ctx.emit('extract:called', { stage: ctx.index, inbound, lz: lz.id });

  o.update = (dt) => {
    o.heli.t += dt;
    if (o.phase === 'inbound') {
      o.timer = Math.max(0, inbound - o.heli.t);
      if (o.timer <= 0) { setPhase('landing'); ctx.emit('extract:landing', { stage: ctx.index }); }
    } else if (o.phase === 'landing') {
      if (o.heli.t >= HELI.landing) { setPhase('landed'); ctx.emit('extract:landed', { stage: ctx.index }); ctx.moment('extract:landed'); }
    } else if (o.phase === 'landed' || o.phase === 'leaving') {
      const up = ctx.standing();
      o.aboard = 0;
      for (const p of up) if (inZone(p.soldier.state.pos)) o.aboard |= 1 << p.owner;
      const everyone = up.length > 0 && up.every((p) => o.aboard & (1 << p.owner));
      const ready = everyone && !ctx.anyoneBleeding() && ctx.cargoAboard(inZone);
      if (o.phase === 'landed' && ready) { setPhase('leaving'); ctx.emit('extract:boarded', { stage: ctx.index }); }
      else if (o.phase === 'leaving' && !ready) setPhase('landed');
      else if (o.phase === 'leaving' && o.heli.t >= HELI.leaving) { o.phase = 'done'; ctx.success(); }
      o.timer = o.phase === 'leaving' ? Math.max(0, HELI.leaving - o.heli.t) : 0;
    }
  };
  o.spots = () => (o.phase !== 'call' ? [] : [{
    id: 'lz-radio', kind: 'radio', pos: { x: lz.radio[0], y: centre.y, z: lz.radio[1] }, time: ctx.tuning.radio, label: 'Call the helicopter',
    done: (p) => {
      setPhase('inbound');
      o.timer = inbound;
      ctx.emit('extract:called', { by: p.owner, stage: ctx.index, inbound, lz: lz.id });
      ctx.moment('extract:called');
    },
  }]);
  o.save = () => ({});
  o.restore = () => {
    setPhase(stage.called ? 'inbound' : 'call');
    if (!stage.called) o.heli.phase = null;
    o.timer = stage.called ? inbound : 0;
    o.aboard = 0;
  };
  return o;
}

export const KINDS = { rescue, intel, sabotage, hold, eliminate, extract };

/** How many sites each kind of objective uses (the rest of a stage's list are decoys). */
export const SITES_USED = { rescue: 1, intel: 1, hold: 1, eliminate: 1, sabotage: (stage) => stage.caches ?? 3, extract: 0 };
