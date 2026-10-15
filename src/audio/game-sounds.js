// Connects game events to sounds. The simulation never plays sounds itself; it
// posts events ("weapon:fire", "bullet:impact"...) and this file listens.

import { SURFACES } from '../world/surfaces.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { RAPIER } from '../world/physics.js';

export function connectGameSounds({ audio, events, soldier, cameraRig, world, registry }) {
  const mine = (e) => (e.owner ?? 0) === 0;

  events.on('weapon:fire', (e) => {
    const def = WEAPONS[e.weapon];
    for (let i = 0; i < e.pulls; i++) audio.play(def.sounds.fire);
    if (!def.pump && mine(e)) audio.play('casing', { delay: 0.45 });
  });
  events.on('weapon:cue', (e) => {
    audio.play(e.sound);
    if (e.pump) audio.play('casing', { delay: 0.5, rate: 0.7 });
  });
  events.on('weapon:dry', () => audio.play('dry'));
  events.on('weapon:switch', (e) => { if (e.stage === 'raise') audio.play('gear'); });
  events.on('weapon:ads', (e) => { if (e.on) audio.play('gear', { volume: 0.5, rate: 1.4 }); });

  // At most a few impact sounds per tick, so a shotgun blast doesn't turn into a roar.
  let impactsThisTick = 0;
  events.on('bullet:impact', (e) => {
    if (impactsThisTick++ > 3) return;
    const s = SURFACES[e.surface] ?? SURFACES.concrete;
    audio.play(s.sound, { position: e.point });
  });
  events.on('target:hit', (e) => {
    audio.play(e.killed ? 'kill' : e.headshot ? 'headshot' : 'hitmarker');
  });

  events.on('player:land', ({ speed }) => {
    if (speed > 2) audio.play('land', { volume: Math.min(1, speed / 10) });
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
    const hit = world.castRay(ray, 0.4, true, undefined, undefined, soldier.body.collider);
    return hit ? registry.get(hit.collider).surface : 'concrete';
  }

  return {
    /** Call once per tick. */
    tick() {
      impactsThisTick = 0;
    },
    /** Call once per frame. */
    frame() {
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
