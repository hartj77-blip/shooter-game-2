// The helicopter that takes you home.
//
// It isn't a physics object: it flies a SCRIPTED PATH, a fixed route worked
// out from the clock, like a train on rails. Where it is depends only on its
// phase and how long it's been in it, so the host and every co-op client draw
// it in exactly the same place without sending its position (heliPath below).
//
//   inbound   flying in from far away (the countdown on the HUD)
//   landing   slowing down and settling onto the landing zone
//   landed    waiting for you to climb aboard
//   leaving   everyone's in: lift off and away (the mission is won)
//
// Simulation only: no model here (render/heli-view.js draws it).

export const HELI = {
  inbound: 60,     // seconds from the call to arriving over the LZ (a mission can change it)
  landing: 6,      // seconds to settle onto the pad
  leaving: 4,      // seconds from "everyone aboard" to wheels up
  far: 220,        // metres away it starts from
  cruise: 45,      // metres up while flying in
  hover: 14,       // metres up when it starts to settle
  board: 4.5,      // metres from the middle of the pad that count as aboard
};

const ease = (t) => t * t * (3 - 2 * t); // smooth start and stop

/**
 * Where the helicopter is, which way it faces, and how much it leans.
 * @param {object} lz     the landing zone (world/kit.js lz): { at, approach }
 * @param {string} phase  'inbound' | 'landing' | 'landed' | 'leaving' (anything else: not here)
 * @param {number} t      seconds in that phase
 * @param {number} [inbound] how long this mission's inbound flight takes
 * @returns {{ pos: {x,y,z}, yaw: number, lean: number, here: boolean }}
 */
export function heliPath(lz, phase, t, inbound = HELI.inbound, tuning = HELI) {
  const [x, y = 0, z] = lz.at;
  // "From the north" means it starts north of the pad and flies south.
  const dx = -Math.sin(lz.approach ?? 0), dz = -Math.cos(lz.approach ?? 0);
  const yaw = lz.approach ?? 0;
  const at = (dist, height) => ({ x: x + dx * dist, y: y + height, z: z + dz * dist });
  if (phase === 'inbound') {
    // The last 30 s of the flight are the visible part: far off, then closing in.
    const k = Math.min(1, Math.max(0, 1 - (inbound - t) / Math.min(30, inbound)));
    const dist = tuning.far * (1 - ease(k)) + 30 * (1 - k);
    const height = tuning.cruise + (tuning.hover - tuning.cruise) * ease(k);
    return { pos: at(dist, height), yaw, lean: 0.12 * (1 - k), here: k > 0 };
  }
  if (phase === 'landing') {
    const k = Math.min(1, t / tuning.landing);
    return { pos: at(30 * (1 - ease(Math.min(1, k * 1.6))), tuning.hover * (1 - ease(k))), yaw, lean: -0.08 * (1 - k), here: true };
  }
  if (phase === 'landed') return { pos: at(0, 0), yaw, lean: 0, here: true };
  if (phase === 'leaving') {
    const k = Math.min(1, t / tuning.leaving);
    const climb = ease(k) * 30;
    return { pos: { x: x - dx * k * k * 60, y: y + climb, z: z - dz * k * k * 60 }, yaw, lean: 0.15 * k, here: true };
  }
  return { pos: at(tuning.far, tuning.cruise), yaw, lean: 0, here: false };
}
