// The co-op protocol: every message the host and the clients send each other,
// in one place.
//
// Think of two people playing chess by post. They agree on a notation ("Nf3")
// so a move fits on a postcard and both sides read it the same way. This file
// is our notation.
//
// Client → host
//   hello  { callsign, version }        "can I join?" (net/room.js)
//   cmd    { c: [[seq, ...], ...] }     your newest commands, the last 3 repeated in
//                                       case a packet goes missing (unreliable: fast, may be lost)
//   fire   { ... }                      shots you fired this tick: where they went, what they hit
//                                       ("hit claims", checked by the host before it applies them)
//   throw  { id, origin, vel }          a grenade left your hand (your browser flies it at once;
//                                       the host checks it and flies its own copy, which decides the blast)
//   ping   { at }                       for measuring the round trip ("ping" in the latency sense)
//
// Host → client
//   welcome, roster, start, bye        the lobby (net/room.js)
//   snap   { ... }                      a snapshot of the world, 20 times a second (unreliable)
//   ev     { list: [[name, data]] }     things that happened (reliable, in order)
//   pong   { at }
//
// QUANTIZATION: numbers are rounded before sending, positions to the centimetre
// and angles to the thousandth of a radian, then sent as whole numbers. "12.3456789"
// becomes 1235: shorter to send, and nobody can see a millimetre. The one
// exception is your own soldier's movement state in a snapshot ("you"): your
// browser compares its prediction against it, so it's sent exactly.
//
// Runs in Node (the tests check that encode/decode round-trips and that a
// snapshot stays small).

import { LOADOUT } from '../weapons/weapons-data.js';
import { ROLES } from '../ai/enemy-data.js';
import { USE_KINDS } from '../game/interact.js';
export { PRESS_FLAGS } from '../core/input.js';

export const PROTOCOL_VERSION = 2;
export const SNAPSHOT_EVERY = 3;   // ticks between snapshots: 60 / 3 = 20 a second
export const INTERP_DELAY = 6;     // others are drawn this many ticks (0.1 s) in the past
export const CMD_REDUNDANCY = 3;   // each command packet carries the last 3 commands
export const SNAPSHOT_BUDGET = 2500; // bytes: a 4-player Compound snapshot must fit (tests check)

const cm = (v) => Math.round(v * 100);
const mrad = (v) => Math.round(v * 1000);
const fromCm = (v) => v / 100;
const fromMrad = (v) => v / 1000;

// ---------------------------------------------------------------- commands

// On/off buttons packed into one number, one bit each (like a row of light switches).
const CMD_BITS = ['jump', 'jumpHeld', 'crouch', 'crouchPressed', 'sprint', 'fire', 'firePressed', 'ads', 'reload', 'lastWeapon', 'interact', 'ping', 'grenade'];

const ANGLE = 1e4; // command angles: a tenth of a milliradian (aim must stay precise)

/** A command as a short list of whole numbers. */
export function encodeCommand(seq, cmd) {
  let bits = 0;
  CMD_BITS.forEach((k, i) => { if (cmd[k]) bits |= 1 << i; });
  return [seq, Math.round(cmd.moveX * 100), Math.round(cmd.moveZ * 100), Math.round(cmd.yaw * ANGLE), Math.round(cmd.pitch * ANGLE), bits, cmd.slot | 0, cmd.cycle | 0];
}

/** Back to a command object. Returns [seq, cmd]. */
export function decodeCommand(a) {
  const [seq, mx, mz, yaw, pitch, bits, slot, cycle] = a;
  const cmd = { moveX: mx / 100, moveZ: mz / 100, yaw: yaw / ANGLE, pitch: pitch / ANGLE, slot, cycle };
  CMD_BITS.forEach((k, i) => { cmd[k] = (bits & (1 << i)) !== 0; });
  return [seq, cmd];
}

/**
 * The command exactly as the host will see it. Your browser predicts with this
 * rounded copy, so its guess and the host's answer start from the same numbers.
 */
export const roundCommand = (cmd) => decodeCommand(encodeCommand(0, cmd))[1];

// ---------------------------------------------------------------- snapshots

const P_FLAGS = ['crouched', 'sprinting', 'grounded', 'ready', 'reloading', 'down', 'dead', 'bleeding'];
const E_FLAGS = ['crouched', 'sprinting', 'grounded', 'ready', 'reloading', 'inCombat', 'fresh', 'sees', 'laserOn', 'dead'];
const ALERTS = ['calm', 'suspicious', 'combat'];
const ROLE_LIST = Object.keys(ROLES);
const ENC_STATES = ['ready', 'running', 'cleared', 'down'];
const TARGET_STATES = ['up', 'falling', 'down', 'rising'];

const packFlags = (names, v) => names.reduce((bits, k, i) => (v[k] ? bits | (1 << i) : bits), 0);
const unpackFlags = (names, bits, into) => { names.forEach((k, i) => { into[k] = (bits & (1 << i)) !== 0; }); return into; };

/**
 * One player, as seen by everyone else: where, how, their bleed-out clock, how
 * far a revive is, and what they're holding F at (a crate, a laptop...).
 */
export function encodePlayer(v) {
  return [
    v.owner, cm(v.pos.x), cm(v.pos.y), cm(v.pos.z), mrad(v.yaw), mrad(v.pitch), packFlags(P_FLAGS, v), cm(v.speed),
    Math.max(0, LOADOUT.indexOf(v.weapon)), Math.round(v.hp), Math.ceil((v.bleedLeft ?? 0) * 10),
    Math.round((v.reviving ?? 0) * 100), v.reviver ?? -1,
    v.using ? USE_KINDS.indexOf(v.using) : -1, Math.round((v.useProgress ?? 0) * 100),
  ];
}
export function decodePlayer(a) {
  const [owner, x, y, z, yaw, pitch, flags, speed, gun, hp, bleed = 0, reviving = 0, reviver = -1, use = -1, useProgress = 0] = a;
  return unpackFlags(P_FLAGS, flags, {
    owner, pos: { x: fromCm(x), y: fromCm(y), z: fromCm(z) }, yaw: fromMrad(yaw), pitch: fromMrad(pitch),
    speed: fromCm(speed), weapon: LOADOUT[gun] ?? LOADOUT[0], hp,
    bleedLeft: bleed / 10, reviving: reviving / 100, reviver: reviver < 0 ? null : reviver,
    using: USE_KINDS[use] ?? null, useProgress: useProgress / 100,
  });
}

/**
 * One enemy, by its number: its place in the host's list. Enemies can arrive in
 * the middle of a mission (reinforcements), so each row also says what kind of
 * soldier it is, and a client makes a stand-in the first time it sees a number.
 */
export function encodeEnemy(index, v, hp) {
  return [
    index, Math.max(0, ROLE_LIST.indexOf(v.role)),
    cm(v.pos.x), cm(v.pos.y), cm(v.pos.z), mrad(v.yaw), mrad(v.pitch), packFlags(E_FLAGS, v), cm(v.speed),
    Math.max(0, ALERTS.indexOf(v.alert)), Math.round(v.awareness * 100), v.target ?? -1, Math.round(v.laserCharge * 100), Math.max(0, Math.round(hp)),
  ];
}
export function decodeEnemy(a) {
  const [index, role, x, y, z, yaw, pitch, flags, speed, alert, awareness, target, laser, hp] = a;
  return unpackFlags(E_FLAGS, flags, {
    index, role: ROLE_LIST[role] ?? ROLE_LIST[0], pos: { x: fromCm(x), y: fromCm(y), z: fromCm(z) }, yaw: fromMrad(yaw), pitch: fromMrad(pitch),
    speed: fromCm(speed), alert: ALERTS[alert], awareness: awareness / 100, target: target < 0 ? null : target,
    laserCharge: laser / 100, hp,
  });
}

/**
 * An enemy's name, worked out the same way on the host (ai/enemy.js) and on a
 * client, so it never needs sending: the level's own name for it, or "e" and its number.
 */
export const enemyIdFor = (specs, index) => specs[index]?.id ?? `e${index}`;

// A fallen enemy stays in snapshots this long, so every client sees it fall,
// then leaves them: a long mission's dead don't make every snapshot bigger.
export const DEAD_KEPT = 1;

/** A practice target: only the things that change (state, tilt, where it is on its rail). */
export function encodeTarget(index, t) {
  return [index, TARGET_STATES.indexOf(t.state), mrad(t.tilt), cm(t.pos.x), cm(t.pos.z), Number.isFinite(t.health) ? Math.round(t.health) : -1];
}
export function decodeTarget(a) {
  const [index, state, tilt, x, z, health] = a;
  return { index, state: TARGET_STATES[state], tilt: fromMrad(tilt), x: fromCm(x), z: fromCm(z), health: health < 0 ? Infinity : health };
}

/** The encounter's scoreboard (the Compound): state, clock, hostiles left. */
export function encodeEncounter(enc) {
  return enc ? [ENC_STATES.indexOf(enc.state), Math.round(enc.time * 100), enc.remaining, enc.total] : null;
}
export function decodeEncounter(a) {
  return a ? { state: ENC_STATES[a[0]], time: a[1] / 100, remaining: a[2], total: a[3] } : null;
}

// ---------------------------------------------------------------- events

// Events the host passes on to clients. Anything else stays on the host
// (each browser makes its own footstep, landing and gun-handling feedback).
const SHARED_EVENTS = new Set([
  'weapon:fire', 'weapon:cue', 'bullet:impact', 'target:hit', 'bullet:nearmiss', 'player:hurt', 'player:down',
  'player:dead', 'player:revive', 'enemy:down', 'enemy:bark', 'mission:restart', 'ping:mark', 'player:joined', 'player:left',
  'ammo:resupply', 'grenade:throw', 'grenade:explode',
]);
// Events about your own soldier that your browser already showed when you did it.
const OWN_ECHO = new Set(['weapon:fire', 'weapon:cue', 'bullet:impact', 'target:hit', 'grenade:throw']);
// Events only the player they're about needs.
const PERSONAL = { 'player:hurt': 'owner', 'bullet:nearmiss': 'victim' };

/** Should this event go to player `slot`? */
export function eventFor(name, data, slot) {
  if (name.startsWith('encounter:') || name.startsWith('course:')) return true;
  if (!SHARED_EVENTS.has(name)) return false;
  // (Your own grenade's blast is the host's to decide, so its hits come back to you.)
  if (OWN_ECHO.has(name) && data.owner === slot && !data.area) return false;
  if (PERSONAL[name]) return data[PERSONAL[name]] === slot;
  return true;
}

/**
 * An event made safe to send: plain numbers and text only. Objects that only
 * make sense on the host (the enemy itself, a target) become their names.
 */
export function wireEvent(name, data) {
  const out = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === 'enemy') continue;
    if (k === 'target' && v && typeof v === 'object') { out.target = { id: v.id, kind: v.kind }; continue; }
    if (typeof v === 'function') continue;
    out[k] = v;
  }
  return [name, out];
}
