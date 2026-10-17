// Controllers (gamepads): turning sticks and buttons into the same actions the
// keyboard and mouse make.
//
// The browser's Gamepad API gives us a snapshot of every connected controller
// whenever we ask: each stick as two numbers from -1 to 1, each button as
// pressed or not (triggers as 0 to 1). Nothing tells us when a button goes
// down, so we ask every frame ("polling") and compare with last frame, like
// checking a letterbox instead of waiting for the doorbell.
//
// Sticks need a little care:
//   - DEAD ZONE: a stick at rest never reads exactly 0 (springs wear, sensors
//     drift), so small values are ignored, or you'd slowly turn forever.
//   - RESPONSE CURVE: small tilts should turn you slowly (for fine aim), big
//     tilts fast. Squaring the tilt does that: half way gives a quarter speed.
//   - TURN BOOST: held all the way over for a moment, turning speeds up, so
//     you can spin round without making fine aim twitchy.
// Aim assist (in src/mission.js) gently slows the turning while your sights
// are over an enemy: a stick is much less precise than a mouse.
//
// This file is plain logic (no DOM): the browser's getGamepads() is handed in,
// so the tests can feed it pretend controllers.

export const GAMEPAD = {
  deadzone: 0.15,     // tilt ignored below this (0..1)
  outer: 0.95,        // ...and anything past this counts as all the way
  curve: 2.0,         // response curve: tilt to the power of this
  yawSpeed: 260,      // degrees per second, stick all the way over, sensitivity 1
  pitchSpeed: 170,
  boost: 0.7,         // extra turn speed after holding the stick all the way over...
  boostAfter: 0.3,    // ...for this many seconds
  boostRamp: 0.45,    // ...reaching it over this many seconds
  trigger: 0.35,      // a trigger pulled further than this counts as pressed
  holdUse: 0.25,      // seconds: holding X longer than this is "use" (revive, take ammo); a tap reloads
  assistSlow: 0.45,   // aim assist: turning speed while your sights are over an enemy
};

// The "standard" layout every modern controller reports (Xbox names; on a
// PlayStation pad: A = cross, B = circle, X = square, Y = triangle).
export const PAD_BUTTONS = {
  0: 'jump',      // A
  1: 'crouch',    // B
  2: 'reload',    // X (tap) / use (hold): see holdUse
  3: 'last',      // Y: swap to your last gun
  4: 'ping',      // LB
  5: 'grenade',   // RB
  6: 'ads',       // LT
  7: 'fire',      // RT
  9: 'menu',      // Start / Options: pause
  10: 'sprint',   // L3 (click the left stick)
  12: 'radio',    // D-pad up: squad radio (hold)
  13: 'nightvision', // D-pad down
  14: 'prev',     // D-pad left: previous gun
  15: 'next',     // D-pad right: next gun
};

// What to call each action on screen, by device ("Hold F" or "Hold X").
export const GLYPHS = {
  keyboard: { interact: 'F', reload: 'R', grenade: 'G', ping: 'Z', radio: 'V', nightvision: 'N', fire: 'Click' },
  pad: { interact: 'X', reload: 'X', grenade: 'RB', ping: 'LB', radio: 'D-pad up', nightvision: 'D-pad down', fire: 'RT' },
};

/** A stick's tilt with the dead zone, outer zone and response curve applied. Keeps the direction. */
export function shapeStick(x, y, tuning = GAMEPAD) {
  const len = Math.hypot(x, y);
  if (len < tuning.deadzone) return { x: 0, y: 0, amount: 0 };
  const t = Math.min(1, (len - tuning.deadzone) / (tuning.outer - tuning.deadzone));
  const k = Math.pow(t, tuning.curve) / len;
  return { x: x * k, y: y * k, amount: t };
}

/** For moving: the same dead zone, but straight (no curve), so half-tilt walks at half speed. */
export function moveStick(x, y, tuning = GAMEPAD) {
  const len = Math.hypot(x, y);
  if (len < tuning.deadzone) return { x: 0, y: 0 };
  const t = Math.min(1, (len - tuning.deadzone) / (tuning.outer - tuning.deadzone));
  return { x: (x / len) * t, y: (y / len) * t };
}

/**
 * Reads controllers each frame and reports what changed.
 * @param {() => Array} getPads  navigator.getGamepads (or a stand-in in tests)
 */
export function createGamepadReader(getPads, tuning = GAMEPAD) {
  let was = new Set();      // buttons down last frame (actions)
  let useTimer = -1;        // seconds X has been held (-1: not held)
  let fullTilt = 0;         // seconds the look stick has been all the way over
  let active = null;        // the pad last used

  function first() {
    const pads = getPads?.() ?? [];
    let best = null;
    for (const p of pads) if (p && p.connected !== false && (!best || p.timestamp > best.timestamp)) best = p;
    return best;
  }

  /**
   * One frame of controller.
   * @returns {null | { move, look, down: Set, pressed: Set, released: Set, used: boolean, pad }}
   *   `look` is in radians to turn this frame (before sensitivity and aim scaling).
   */
  function read(dt) {
    const pad = first();
    if (!pad) { was = new Set(); return null; }
    active = pad;
    const button = (i) => {
      const b = pad.buttons[i];
      if (!b) return false;
      return i === 6 || i === 7 ? b.value > tuning.trigger : b.pressed;
    };
    const down = new Set();
    for (const [i, action] of Object.entries(PAD_BUTTONS)) if (button(+i)) down.add(action);

    // X: a tap reloads, a hold "uses" (revive, take ammo, plant a charge...).
    const pressed = new Set();
    const released = new Set();
    if (down.has('reload')) {
      useTimer = useTimer < 0 ? 0 : useTimer + dt;
      down.delete('reload');
      if (useTimer >= tuning.holdUse) down.add('interact');
    } else if (useTimer >= 0) {
      if (useTimer < tuning.holdUse) pressed.add('reload');
      useTimer = -1;
    }
    for (const a of down) if (!was.has(a)) pressed.add(a);
    for (const a of was) if (!down.has(a)) released.add(a);
    was = down;

    const move = moveStick(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0), tuning);
    const aim = shapeStick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, tuning);
    fullTilt = aim.amount > 0.98 ? fullTilt + dt : 0;
    const boost = 1 + tuning.boost * Math.min(1, Math.max(0, (fullTilt - tuning.boostAfter) / tuning.boostRamp));
    const DEG = Math.PI / 180;
    const look = {
      yaw: -aim.x * tuning.yawSpeed * DEG * boost * dt,
      pitch: -aim.y * tuning.pitchSpeed * DEG * boost * dt,
    };
    const used = down.size > 0 || useTimer >= 0 || Math.hypot(move.x, move.y) > 0 || aim.amount > 0;
    return { move, look, down, pressed, released, used, pad };
  }

  return {
    read,
    /** Shake the controller (if it can): strong and weak motors 0..1, for `ms` milliseconds. */
    rumble(strong, weak, ms) {
      active?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
    },
    get connected() { return !!first(); },
  };
}
