// Connects game events to sounds. The simulation never plays sounds itself; it
// posts events ("weapon:fire", "bullet:impact"...) and this file listens.

import { SURFACES } from '../world/surfaces.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { SIGHT } from '../world/groups.js';
import { RAPIER } from '../world/physics.js';

/**
 * @param {object} [opts.enemies] ai/enemies.js: their footsteps, voices and lasers
 * @param {object} [opts.health]  player/health.js: the heartbeat when you're badly hurt
 */
export function connectGameSounds({ audio, events, soldier, cameraRig, world, registry, enemies = null, health = null }) {
  const mine = (e) => (e.owner ?? 0) === 0;
  const enemyAt = (owner) => enemies?.list.find((e) => e.owner === owner) ?? null;

  events.on('weapon:fire', (e) => {
    const def = WEAPONS[e.weapon];
    if (mine(e)) {
      for (let i = 0; i < e.pulls; i++) audio.play(def.sounds.fire);
      if (!def.pump) audio.play('casing', { delay: 0.45 });
      return;
    }
    // Someone else's gun: placed where they are, duller the further away.
    for (let i = 0; i < e.pulls; i++) audio.play(def.sounds.fire, { position: e.origin, spatial: true, volume: 1.1 });
  });
  events.on('weapon:cue', (e) => {
    if (mine(e)) {
      audio.play(e.sound);
      if (e.pump) audio.play('casing', { delay: 0.5, rate: 0.7 });
      return;
    }
    const en = enemyAt(e.owner);
    if (en) audio.play(e.sound, { position: en.eye(), spatial: true, volume: 0.8 });
  });
  events.on('weapon:dry', (e) => { if (mine(e)) audio.play('dry'); });
  events.on('weapon:switch', (e) => { if (mine(e) && e.stage === 'raise') audio.play('gear'); });
  events.on('weapon:ads', (e) => { if (mine(e) && e.on) audio.play('gear', { volume: 0.5, rate: 1.4 }); });

  // Soldiers.
  events.on('player:hurt', (e) => { if (mine(e) && e.amount > 0) audio.play('hurt', { volume: Math.min(1, 0.5 + e.amount / 30) }); });
  events.on('bullet:nearmiss', (e) => audio.play('whizz', { position: e.point, volume: Math.min(1, 1.4 - e.distance * 0.6) }));
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

  // Enemy footsteps (so you can hear someone coming) and the Marksman's laser tone.
  const steps = new Map(); // enemy -> distance walked since the last footstep
  const lasers = new Set();
  let heartbeat = 0;
  function enemyFrame(dt) {
    if (!enemies) return;
    const me = soldier.state.pos;
    for (const e of enemies.alive) {
      const s = e.soldier.state;
      const d = Math.hypot(s.pos.x - me.x, s.pos.z - me.z);
      if (s.grounded && s.speed > 1 && d < 30) {
        const walked = (steps.get(e) ?? 0) + s.speed * dt;
        const stride = s.sprinting ? 1.6 : 1.1;
        if (walked >= stride) {
          steps.set(e, 0);
          const volume = (s.crouched ? 0.35 : s.sprinting ? 1.3 : 0.9) * 1.6;
          audio.play('step_concrete', { position: s.pos, spatial: true, volume });
        } else steps.set(e, walked);
      }
      if (e.motor.laserOn && !lasers.has(e)) audio.play('laser', { position: e.eye() });
      if (e.motor.laserOn) lasers.add(e);
      else lasers.delete(e);
    }
    if (health && !health.state.down && health.state.hp < health.tuning.low) {
      heartbeat -= dt;
      if (heartbeat <= 0) {
        heartbeat = 0.55 + 0.6 * (health.state.hp / health.tuning.low);
        audio.play('heartbeat', { volume: 1 - 0.6 * (health.state.hp / health.tuning.low) });
      }
    } else heartbeat = 0;
  }

  return {
    /** Call once per tick. */
    tick() {
      impactsThisTick = 0;
    },
    /** Call once per frame. */
    frame(dt = 1 / 60) {
      enemyFrame(dt);
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
