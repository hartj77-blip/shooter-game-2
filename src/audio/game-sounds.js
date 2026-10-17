// Connects game events to sounds. The simulation never plays sounds itself; it
// posts events ("weapon:fire", "bullet:impact"...) and this file listens.
// Other soldiers (enemies and teammates) are heard through their `view`
// summaries, so this works the same on a co-op client as on the host.

import { SURFACES } from '../world/surfaces.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { SIGHT } from '../world/groups.js';
import { RAPIER } from '../world/physics.js';

const EYE = 1.6; // roughly where a standing soldier's head is, for placing their sounds

/**
 * @param {Array<{list: Array}>} [opts.others] other soldiers (each with a `view`): their footsteps, gear and lasers
 * @param {object} [opts.health]  player/health.js: the heartbeat when you're badly hurt
 * @param {number} [opts.owner]   your player slot
 * @param {{here:boolean, pos:{x,y,z}}} [opts.helicopter]  render/heli-view.js state: the rotor loop
 */
export function connectGameSounds({ audio, events, soldier, cameraRig, world, registry, others = [], health = null, owner = 0, helicopter = null }) {
  const mine = (e) => (e.owner ?? 0) === owner;
  const viewOf = (who) => {
    for (const src of others) for (const s of src.list) if (s.owner === who) return s.view;
    return null;
  };
  const head = (v) => ({ x: v.pos.x, y: v.pos.y + (v.crouched ? 1 : EYE), z: v.pos.z });

  // A suppressor (weapons/attachments.js) doesn't silence a shot: it makes it a
  // quieter, duller "thup" (the treble cut, a little higher, much softer).
  const SUPPRESSED = { volume: 0.35, rate: 1.12, muffle: 1600 };
  events.on('weapon:fire', (e) => {
    const def = WEAPONS[e.weapon];
    const quiet = e.suppressed ? SUPPRESSED : {};
    if (mine(e)) {
      for (let i = 0; i < e.pulls; i++) audio.play(def.sounds.fire, quiet);
      if (!def.pump) audio.play('casing', { delay: 0.45 });
      return;
    }
    // Someone else's gun: placed where they are, duller the further away.
    for (let i = 0; i < e.pulls; i++) audio.play(def.sounds.fire, { position: e.origin, spatial: true, volume: 1.1 * (quiet.volume ?? 1), rate: quiet.rate, muffle: quiet.muffle });
  });
  events.on('weapon:cue', (e) => {
    if (mine(e)) {
      audio.play(e.sound);
      if (e.pump) audio.play('casing', { delay: 0.5, rate: 0.7 });
      return;
    }
    const v = viewOf(e.owner);
    if (v) audio.play(e.sound, { position: head(v), spatial: true, volume: 0.8 });
  });
  events.on('weapon:dry', (e) => { if (mine(e)) audio.play('dry'); });
  events.on('weapon:switch', (e) => { if (mine(e) && e.stage === 'raise') audio.play('gear'); });
  events.on('weapon:ads', (e) => { if (mine(e) && e.on) audio.play('gear', { volume: 0.5, rate: 1.4 }); });

  // Soldiers.
  events.on('player:hurt', (e) => { if (mine(e) && e.amount > 0) audio.play('hurt', { volume: Math.min(1, 0.5 + e.amount / 30) }); });
  events.on('bullet:nearmiss', (e) => e.victim === owner && audio.play('whizz', { position: e.point, volume: Math.min(1, 1.4 - e.distance * 0.6) }));
  events.on('enemy:down', (e) => audio.play('bodyfall', { position: e.pos, delay: 0.35 }));
  events.on('enemy:bark', (e) => audio.play('radio', { position: { x: e.pos.x, y: e.pos.y + 1.6, z: e.pos.z } }));

  // At most a few impact sounds per tick, so a shotgun blast doesn't turn into a roar.
  let impactsThisTick = 0;
  events.on('bullet:impact', (e) => {
    if (impactsThisTick++ > 3) return;
    const s = SURFACES[e.surface] ?? SURFACES.concrete;
    audio.play(s.sound, { position: e.point });
  });
  events.on('target:hit', (e) => {
    if (!mine(e)) return; // hit-marker sounds are only for your hits
    audio.play(e.killed ? 'kill' : e.headshot ? 'headshot' : 'hitmarker');
  });

  events.on('player:land', (e) => {
    const { speed } = e;
    if (mine(e) && speed > 2) audio.play('land', { volume: Math.min(1, speed / 10) });
  });

  // Missions: bangs, grenades, crates, the big moments.
  events.on('explosion', (e) => {
    const big = e.kind === 'charge';
    audio.play('explosion', { position: e.pos, volume: big ? 1.3 : 1, rate: big ? 0.8 : 1 });
  });
  events.on('grenade:bounce', (e) => audio.play('bounce', { position: e.pos, volume: Math.min(1, e.speed / 8), rate: 0.75 }));
  events.on('grenade:gesture', (e) => { if (mine(e)) audio.play('gear', { volume: 0.5, rate: 1.3 }); });
  events.on('ammo:resupply', (e) => { if (mine(e)) audio.play('gear', { volume: 0.9, rate: 0.8 }); });
  events.on('mission:checkpoint', () => audio.play('chime', { volume: 0.7 }));
  events.on('mission:complete', () => audio.play('chime'));
  events.on('mission:failed', () => audio.play('buzz'));
  events.on('objective:planted', () => audio.play('beep', { rate: 1.4 }));

  events.on('course:ready', () => audio.play('beep'));
  events.on('course:start', () => audio.play('beep', { rate: 1.5 }));
  events.on('course:finish', () => audio.play('chime'));
  events.on('course:penalty', () => audio.play('buzz'));
  events.on('course:blocked', () => audio.play('buzz', { volume: 0.6 }));

  // Footsteps: one each time the head bob dips. Wood sounds different from concrete.
  let lastStep = 0;
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function surfaceUnderfoot() {
    const p = soldier.state.pos;
    ray.origin = { x: p.x, y: p.y + 0.1, z: p.z };
    const hit = world.castRay(ray, 0.4, true, undefined, SIGHT); // the floor only, not your own legs
    return hit ? registry.get(hit.collider).surface : 'concrete';
  }

  // Other soldiers' footsteps (so you can hear someone coming) and the Marksman's laser tone.
  const steps = new Map(); // soldier id -> distance walked since the last footstep
  const lasers = new Set();
  let heartbeat = 0;
  function othersFrame(dt) {
    const me = soldier.state.pos;
    for (const src of others) {
      for (const o of src.list) {
        const v = o.view;
        if (v.dead || v.down) { lasers.delete(o.id); continue; }
        const d = Math.hypot(v.pos.x - me.x, v.pos.z - me.z);
        if (v.grounded && v.speed > 1 && d < 30) {
          const walked = (steps.get(o.id) ?? 0) + v.speed * dt;
          const stride = v.sprinting ? 1.6 : 1.1;
          if (walked >= stride) {
            steps.set(o.id, 0);
            const volume = (v.crouched ? 0.35 : v.sprinting ? 1.3 : 0.9) * 1.6;
            audio.play('step_concrete', { position: v.pos, spatial: true, volume });
          } else steps.set(o.id, walked);
        }
        if (v.laserOn && !lasers.has(o.id)) audio.play('laser', { position: head(v) });
        if (v.laserOn) lasers.add(o.id);
        else lasers.delete(o.id);
      }
    }
    if (health && !health.state.down && health.state.hp < health.tuning.low) {
      heartbeat -= dt;
      if (heartbeat <= 0) {
        heartbeat = 0.55 + 0.6 * (health.state.hp / health.tuning.low);
        audio.play('heartbeat', { volume: 1 - 0.6 * (health.state.hp / health.tuning.low) });
      }
    } else heartbeat = 0;
  }

  // The helicopter's rotor: a loop that follows it while it's in the sky (audio.js loop()).
  let rotor = null;
  function rotorFrame() {
    if (helicopter?.here) {
      rotor ??= audio.loop('rotor');
      rotor.set({ position: helicopter.pos });
    } else if (rotor) {
      rotor.stop();
      rotor = null;
    }
  }

  return {
    /** Call once per tick. */
    tick() {
      impactsThisTick = 0;
    },
    /** Stop anything still playing (the rotor): the mission is ending. */
    dispose() {
      rotor?.stop();
      rotor = null;
    },
    /** Call once per frame. */
    frame(dt = 1 / 60) {
      othersFrame(dt);
      rotorFrame();
      const s = soldier.state;
      const step = Math.floor(cameraRig.bobPhase / Math.PI);
      if (step !== lastStep) {
        lastStep = step;
        if (s.mode === 'ground' && s.speed > 1) {
          const wood = surfaceUnderfoot() === 'wood';
          const volume = s.crouched ? 0.45 : s.sprinting ? 1.2 : 0.85;
          audio.play(wood ? 'step_wood' : 'step_concrete', { volume });
        }
      }
    },
  };
}
