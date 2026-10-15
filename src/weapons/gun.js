// One gun: its ammo, fire rate, reloads, spread "bloom" and recoil.
//
// A gun is a small state machine (see lesson 4):
//
//   stowed --raise--> raising --> ready <--> reloading
//                                   |
//                                lowering --> stowed
//
// It only fires while `ready`. This file decides *when* shots happen and how
// much they kick. Where the bullets go is decided in arsenal.js, and what they
// hit in hitscan.js. All of it is simulation: no drawing, no sound. It posts
// events (weapon:reload, weapon:cue, weapon:dry...) that the presentation
// code turns into animation and sound.

const RAD = Math.PI / 180;
const SEMI_BUFFER = 0.12; // a click slightly too early still fires when the gun is ready

export function createGun(def, { emit = () => {}, rng, owner = 0 } = {}) {
  const gun = {
    def,
    mag: def.mag,
    reserve: def.reserve,
    status: 'stowed',
    timer: 0,          // seconds left while raising or lowering
    cooldown: 0,       // seconds until the next shot is allowed
    reload: null,      // details of the reload in progress
    bloom: 0,          // extra spread from firing, in degrees
    sinceShot: 99,
    burst: 0,          // shots in the current burst (indexes the recoil pattern)
    queued: 0,         // a semi-auto click waiting for the gun to be ready
    pumpIn: -1,        // shotgun: seconds until the pump sound
    totalShots: 0,
    debt: { pitch: 0, yaw: 0 }, // recoil that will drift back by itself
  };

  const interval = () => 60 / def.rpm;
  const say = (name, data = {}) => emit(name, { owner, weapon: def.id, ...data });

  // ------------------------------------------------------------ raising and lowering

  gun.raise = () => {
    gun.status = 'raising';
    gun.timer = def.swap.raise;
    say('weapon:switch', { stage: 'raise', time: def.swap.raise });
  };

  gun.lower = () => {
    if (gun.reload) gun.cancelReload();
    gun.status = 'lowering';
    gun.timer = def.swap.lower;
    say('weapon:switch', { stage: 'lower', time: def.swap.lower });
  };

  // ------------------------------------------------------------ reloading

  gun.canReload = () => gun.status === 'ready' && gun.mag < def.mag && gun.reserve > 0;

  gun.startReload = () => {
    if (!gun.canReload()) return false;
    const r = def.reload;
    const empty = gun.mag === 0;
    if (r.shellByShell) {
      gun.reload = { shells: true, phase: 'start', timer: r.start, wasEmpty: empty, elapsed: 0 };
    } else {
      const kind = empty ? 'empty' : 'tactical';
      gun.reload = { shells: false, kind, elapsed: 0, duration: r[kind], cues: r.cues[kind], cue: 0 };
    }
    gun.status = 'reloading';
    say('weapon:reload', { stage: 'start', kind: empty ? 'empty' : 'tactical', shells: !!r.shellByShell, time: gun.reload.duration ?? null });
    return true;
  };

  gun.cancelReload = () => {
    if (!gun.reload) return;
    gun.reload = null;
    gun.status = 'ready';
    say('weapon:reload', { stage: 'cancel' });
  };

  /** True if the reload is far enough along that sprinting shouldn't cancel it. */
  gun.reloadCommitted = () => !!gun.reload && !gun.reload.shells && gun.reload.elapsed >= gun.reload.duration * def.reload.commit;

  function takeAmmo(count) {
    const take = Math.min(count, gun.reserve);
    gun.reserve -= take;
    gun.mag += take;
  }

  function updateReload(dt, firePressed) {
    const r = gun.reload;
    r.elapsed += dt;
    if (!r.shells) {
      while (r.cue < r.cues.length && r.elapsed >= r.cues[r.cue][0]) say('weapon:cue', { sound: r.cues[r.cue++][1] });
      if (r.elapsed >= r.duration) {
        takeAmmo(def.mag - gun.mag);
        gun.reload = null;
        gun.status = 'ready';
        say('weapon:reload', { stage: 'end' });
      }
      return;
    }
    // Shell by shell: start, then one shell at a time, then (if it was empty) a pump.
    if (firePressed && gun.mag > 0 && r.phase === 'shell') {
      gun.reload = null; // firing interrupts a shotgun reload
      gun.status = 'ready';
      say('weapon:reload', { stage: 'interrupt' });
      return;
    }
    r.timer -= dt;
    if (r.timer > 0) return;
    const sr = def.reload;
    if (r.phase === 'start') {
      r.phase = 'shell';
      r.timer += sr.perShell;
    } else if (r.phase === 'shell') {
      takeAmmo(1);
      say('weapon:cue', { sound: sr.cues.shell });
      say('weapon:reload', { stage: 'shell' });
      if (gun.mag >= def.mag || gun.reserve <= 0) {
        r.phase = 'end';
        r.timer += sr.end + (r.wasEmpty ? sr.rack : 0);
        if (r.wasEmpty) say('weapon:cue', { sound: sr.cues.rack });
      } else {
        r.timer += sr.perShell;
      }
    } else {
      gun.reload = null;
      gun.status = 'ready';
      say('weapon:reload', { stage: 'end' });
    }
  }

  // ------------------------------------------------------------ firing

  /**
   * Fires one shot: spends ammo, adds bloom and recoil.
   * @param {{pitch:number, yaw:number}} look  recoil to apply to the view, in radians (added to)
   * @param {number} adsAmount 0 (hip) to 1 (aiming)
   */
  function shoot(look, adsAmount) {
    gun.mag--;
    gun.totalShots++;
    gun.sinceShot = 0;
    gun.bloom = Math.min(gun.bloom + def.spread.perShot, def.spread.max);

    const rc = def.recoil;
    const k = 1 - adsAmount * (1 - rc.adsScale);
    const pitch = rc.pitch * k * rng.range(0.9, 1.1);
    const yaw = (rc.pattern[gun.burst % rc.pattern.length] + rng.range(-rc.yawRandom, rc.yawRandom)) * k;
    gun.burst++;
    look.pitch += pitch * RAD;
    look.yaw -= yaw * RAD; // positive pattern values kick to the right
    gun.debt.pitch += pitch * rc.recover;
    gun.debt.yaw += yaw * rc.recover;

    if (def.pump) gun.pumpIn = def.pump.at;
  }

  /**
   * Advances the gun by one tick.
   * @param {object} input  { fire, firePressed, reload, canFire, ads }
   * @param {number} dt
   * @param {{pitch:number, yaw:number}} look  recoil deltas are added to this
   * @param {{infiniteAmmo?:boolean}} options
   * @returns {number} how many shots were fired this tick
   */
  gun.update = (input, dt, look, options = {}) => {
    gun.sinceShot += dt;
    if (options.infiniteAmmo) gun.reserve = def.reserve;

    // Recoil drifts back once you stop shooting.
    if (gun.sinceShot > 0.1) {
      const step = def.recoil.recoverSpeed * dt;
      const dp = Math.min(gun.debt.pitch, step);
      gun.debt.pitch -= dp;
      look.pitch -= dp * RAD;
      const dy = Math.sign(gun.debt.yaw) * Math.min(Math.abs(gun.debt.yaw), step);
      gun.debt.yaw -= dy;
      look.yaw += dy * RAD;
    }
    if (gun.sinceShot > interval() * 2.5) gun.burst = 0;
    if (gun.sinceShot > interval() * 1.5) gun.bloom = Math.max(0, gun.bloom - def.spread.recovery * dt);

    if (gun.pumpIn >= 0) {
      gun.pumpIn -= dt;
      if (gun.pumpIn < 0) say('weapon:cue', { sound: def.pump.sound, pump: true });
    }

    if (gun.status === 'raising' || gun.status === 'lowering') {
      gun.timer -= dt;
      if (gun.timer <= 0) gun.status = gun.status === 'raising' ? 'ready' : 'stowed';
      gun.cooldown = Math.max(gun.cooldown - dt, 0);
      return 0;
    }
    if (gun.status === 'stowed') return 0;

    if (gun.status === 'reloading') {
      updateReload(dt, input.firePressed);
      gun.cooldown = Math.max(gun.cooldown - dt, 0);
      if (gun.status === 'reloading') return 0;
    }

    if (input.reload && gun.startReload()) return 0;

    // Firing.
    gun.cooldown -= dt;
    if (input.firePressed) gun.queued = SEMI_BUFFER;
    else gun.queued = Math.max(0, gun.queued - dt);

    const auto = def.fireMode === 'auto';
    const wants = auto ? input.fire : gun.queued > 0;
    if (!wants) {
      gun.cooldown = Math.max(gun.cooldown, 0);
      return 0;
    }
    if (gun.mag <= 0) {
      if (input.firePressed) {
        say('weapon:dry');
        gun.queued = 0;
        gun.startReload();
      }
      gun.cooldown = Math.max(gun.cooldown, 0);
      return 0;
    }
    if (!input.canFire) {
      gun.cooldown = Math.max(gun.cooldown, 0);
      return 0;
    }

    let shots = 0;
    while (gun.cooldown <= 0 && gun.mag > 0) {
      shoot(look, input.ads ?? 0);
      shots++;
      gun.cooldown += interval();
      if (!auto) {
        gun.queued = 0;
        break;
      }
    }
    return shots;
  };

  return gun;
}
