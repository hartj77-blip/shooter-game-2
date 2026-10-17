// Input: turns keyboard and mouse activity into "commands".
//
// The rest of the game never reads the keyboard directly. Once per tick it
// asks for a command: a small plain object such as
//   { moveX: 0, moveZ: 1, yaw: 1.2, pitch: -0.1, jump: true, fire: true, ads: false, ... }
// That one rule pays off later: in co-op, commands from a friend's computer
// arrive over the network and drive their character with exactly the same code.
//
// Keys use `event.code`, the physical key position, so WASD stays in the
// same place on French or German keyboards. Mouse buttons get made-up codes
// ('Mouse0' = left, 'Mouse2' = right) so they live in the same bindings table.
//
// Controllers (core/gamepad.js) feed the very same actions: pollPad() is
// called every frame, its buttons press and release actions, its left stick
// adds to the movement and its right stick turns the view. The command that
// comes out looks exactly the same, so nothing else in the game (not even
// co-op) needs to know which you're holding. In menus, the pad moves the focus
// instead (onPadMenu).

import { createGamepadReader, GLYPHS } from './gamepad.js';

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back:    ['KeyS', 'ArrowDown'],
  left:    ['KeyA', 'ArrowLeft'],
  right:   ['KeyD', 'ArrowRight'],
  jump:    ['Space'],
  sprint:  ['ShiftLeft', 'ShiftRight'],
  // Not Ctrl: Ctrl+W closes the browser tab, which is a bad way to crouch.
  crouch:  ['KeyC'],
  fire:    ['Mouse0'],
  ads:     ['Mouse2'],
  reload:  ['KeyR'],
  last:    ['KeyQ'],
  slot1:   ['Digit1'],
  slot2:   ['Digit2'],
  slot3:   ['Digit3'],
  slot4:   ['Digit4'],
  slot5:   ['Digit5'],
  grenade: ['KeyG'],             // throw a grenade
  // Co-op and missions.
  interact: ['KeyF'],            // hold next to a downed teammate to revive them (or a crate, a laptop...)
  ping:    ['KeyZ', 'Mouse1'],   // Mouse1 = the middle button (the wheel, pressed)
  callin:  ['KeyT'],             // call in your support (game/callins.js) where you're looking
  radio:   ['KeyV'],             // hold to talk on the squad radio
  nightvision: ['KeyN'],         // night-vision goggles on and off (night missions; only your screen changes)
};

// Classic shooter sensitivity scale: at sensitivity 1, one mouse "count"
// turns you 0.022 degrees (the number Quake, Source and CS use).
const DEGREES_PER_COUNT = 0.022;
const RAD_PER_COUNT = (DEGREES_PER_COUNT * Math.PI) / 180;
const PITCH_LIMIT = (89 * Math.PI) / 180;

/**
 * @param {object} opts
 * @param {EventTarget} [opts.target]  where keyboard/mouse events come from
 * @param {Document|object} [opts.doc]  for pointer lock state
 * @param {object} [opts.settings]      settings.values (sensitivity, invertY, crouchMode, sprintMode, aimMode)
 */
export function createInput({
  target = globalThis, doc = globalThis.document, settings = {},
  getPads = () => globalThis.navigator?.getGamepads?.() ?? [],
} = {}) {
  const bindings = structuredClone(DEFAULT_BINDINGS);
  const actionOf = new Map();          // 'KeyW' -> 'forward'
  const held = new Set();              // actions currently held down
  const pressed = new Set();           // actions pressed since the last command
  let lockedAt = 0;
  let wheel = 0;                       // mouse wheel steps since the last command
  const pad = createGamepadReader(getPads);
  const padMove = { x: 0, y: 0 };      // the left stick, after its dead zone
  const menuRepeat = { dir: null, t: 0 }; // holding a direction in a menu repeats it

  const input = {
    enabled: false,     // only true while playing; menus don't move the player
    requireLock: true,  // mouse buttons only count while the pointer is captured (off for automated tests)
    yaw: 0,             // left/right look angle in radians (0 = facing -Z, "north")
    pitch: 0,           // up/down look angle in radians (positive = up)
    lookScale: 1,       // mouse speed multiplier, lowered while aiming down the sights
    crouchToggled: false,
    sprintToggled: false,
    adsToggled: false,
    padSprint: false,   // L3 sprints until you stop moving forward
    device: 'keyboard', // what was used last: 'keyboard' (and mouse) or 'pad'
    assist: 1,          // aim assist: controller turn speed multiplier, set each frame by the mission
    /** Called with 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'start' when the pad is used in menus (and 'start' in game). */
    onPadMenu: null,
    pollPad,
    /** What to call an action's button right now ("F" on a keyboard, "X" on a controller). */
    glyph: (action) => GLYPHS[input.device]?.[action] ?? GLYPHS.keyboard[action] ?? action,
    /** Shake the controller, if one is in use and rumble is on. */
    rumble(strong, weak, ms) {
      if (input.device === 'pad' && settings.rumble !== false) pad.rumble(strong, weak, ms);
    },
    sample,
    setLook,
    addLook,
    clear,
    isLocked,
    lockPointer,
    unlockPointer,
    bindings,
    /** Is this action held right now? (For things outside the simulation, like push-to-talk.) */
    isHeld: (action) => input.enabled && held.has(action),
  };

  function rebuild() {
    actionOf.clear();
    for (const [action, codes] of Object.entries(bindings)) for (const code of codes) actionOf.set(code, action);
  }
  rebuild();

  function press(action) {
    if (held.has(action)) return;
    held.add(action);
    pressed.add(action);
    if (action === 'crouch' && settings.crouchMode === 'toggle') input.crouchToggled = !input.crouchToggled;
    if (action === 'sprint' && settings.sprintMode === 'toggle') input.sprintToggled = !input.sprintToggled;
    if (action === 'sprint') {
      input.crouchToggled = false; // sprinting stands you up
      input.adsToggled = false;    // ...and lowers the sights
    }
    if (action === 'ads' && settings.aimMode === 'toggle') input.adsToggled = !input.adsToggled;
    if (action.startsWith('slot') || action === 'last') input.adsToggled = false;
    // Not a command (nothing in the simulation changes): the mission listens for it.
    if (action === 'nightvision') input.onNightVision?.();
  }

  function onKeyDown(e) {
    input.device = 'keyboard';
    const action = actionOf.get(e.code);
    if (!action || !input.enabled) return;
    e.preventDefault?.(); // stop Space from scrolling the page, etc.
    if (e.repeat) return; // holding a key fires repeats; we only want the first press
    press(action);
  }

  function onKeyUp(e) {
    const action = actionOf.get(e.code);
    if (action) held.delete(action);
  }

  const mouseAllowed = () => input.enabled && (isLocked() || !input.requireLock);

  function onMouseDown(e) {
    const action = actionOf.get(`Mouse${e.button}`);
    if (!action || !mouseAllowed()) return;
    e.preventDefault?.();
    press(action);
  }

  function onMouseUp(e) {
    const action = actionOf.get(`Mouse${e.button}`);
    if (action) held.delete(action);
  }

  function onWheel(e) {
    if (!mouseAllowed() || !e.deltaY) return;
    wheel += Math.sign(e.deltaY);
    input.adsToggled = false;
  }

  function onMouseMove(e) {
    if (!input.enabled || !isLocked()) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    if (Math.abs(dx) + Math.abs(dy) > 2) input.device = 'keyboard';
    // Some browsers report one huge jump right after the pointer locks. Ignore it.
    if (performance.now() - lockedAt < 80 && (Math.abs(dx) > 200 || Math.abs(dy) > 200)) return;
    const k = (settings.sensitivity ?? 2) * RAD_PER_COUNT * input.lookScale;
    addLook(-dx * k, -dy * k * (settings.invertY ? -1 : 1));
  }

  // If the window loses focus while you hold W, we never see the key-up.
  // Forget everything so you don't keep running forever.
  function clear() {
    held.clear();
    pressed.clear();
    wheel = 0;
    input.adsToggled = false;
    input.padSprint = false;
    padMove.x = padMove.y = 0;
  }

  /**
   * Read the controller (once a frame). Playing: its buttons press actions, its
   * sticks move and turn you. In menus: it moves the focus (onPadMenu).
   */
  function pollPad(dt) {
    const r = pad.read(dt);
    if (!r) { padMove.x = padMove.y = 0; return; }
    if (r.used) input.device = 'pad';
    if (!input.enabled) {
      padMove.x = padMove.y = 0;
      menuFromPad(r, dt);
      return;
    }
    for (const a of r.pressed) {
      if (a === 'menu') input.onPadMenu?.('start');
      else if (a === 'prev' || a === 'next') { wheel += a === 'next' ? 1 : -1; input.adsToggled = false; }
      else if (a === 'sprint') {
        input.padSprint = !input.padSprint;
        if (input.padSprint) { input.crouchToggled = false; input.adsToggled = false; }
      } else press(a);
    }
    for (const a of r.released) held.delete(a);
    padMove.x = r.move.x;
    padMove.y = r.move.y;
    const k = (settings.padSensitivity ?? 1) * input.lookScale * input.assist;
    addLook(r.look.yaw * k, r.look.pitch * k * (settings.invertY ? -1 : 1));
  }

  // Menus: the D-pad or left stick moves between buttons (held, it repeats),
  // A clicks, B goes back, Start is Start.
  function menuFromPad(r, dt) {
    const names = { jump: 'accept', crouch: 'back', menu: 'start' };
    for (const a of r.pressed) if (names[a]) input.onPadMenu?.(names[a]);
    const { x, y } = r.move;
    const stick = Math.abs(x) > 0.5 || Math.abs(y) > 0.5 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'up' : 'down')) : null;
    const dpad = r.down.has('radio') ? 'up' : r.down.has('nightvision') ? 'down' : r.down.has('prev') ? 'left' : r.down.has('next') ? 'right' : null;
    const dir = dpad ?? stick;
    if (dir !== menuRepeat.dir) {
      menuRepeat.dir = dir;
      menuRepeat.t = 0.4; // the first repeat waits a little longer
      if (dir) input.onPadMenu?.(dir);
    } else if (dir) {
      menuRepeat.t -= dt;
      if (menuRepeat.t <= 0) { menuRepeat.t = 0.12; input.onPadMenu?.(dir); }
    }
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('wheel', onWheel, { passive: true });
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('blur', clear);
  // Right-click is "aim", so the browser's right-click menu must stay away.
  target.addEventListener('contextmenu', (e) => { if (input.enabled) e.preventDefault?.(); });

  function setLook(yaw, pitch = 0) {
    input.yaw = yaw;
    input.pitch = pitch;
  }

  /** Turns the view. Used by the mouse and by recoil. */
  function addLook(dyaw, dpitch) {
    input.yaw += dyaw;
    input.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, input.pitch + dpitch));
  }

  /** Builds this tick's command and resets the "pressed" flags. */
  function sample() {
    const on = (a) => held.has(a);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const moveX = clamp((on('right') ? 1 : 0) - (on('left') ? 1 : 0) + padMove.x);
    const moveZ = clamp((on('forward') ? 1 : 0) - (on('back') ? 1 : 0) + padMove.y);

    // Toggle sprint (and the controller's L3 sprint) switches itself off when you stop running forward.
    if (moveZ <= 0) input.sprintToggled = false;
    if (moveZ <= 0.3) input.padSprint = false;

    let slot = 0;
    for (let i = 1; i <= 5; i++) if (pressed.has(`slot${i}`)) slot = i;

    const cmd = {
      moveX,
      moveZ,
      yaw: input.yaw,
      pitch: input.pitch,
      jump: pressed.has('jump'),          // pressed since last tick (a tap is never missed)
      jumpHeld: on('jump'),
      crouch: settings.crouchMode === 'toggle' ? input.crouchToggled : on('crouch'),
      crouchPressed: pressed.has('crouch'),
      sprint: (settings.sprintMode === 'toggle' ? input.sprintToggled : on('sprint')) || input.padSprint,
      fire: on('fire') || pressed.has('fire'),
      firePressed: pressed.has('fire'),
      ads: settings.aimMode === 'toggle' ? input.adsToggled : on('ads'),
      reload: pressed.has('reload'),
      slot,
      cycle: Math.sign(wheel),
      lastWeapon: pressed.has('last'),
      interact: on('interact'),
      ping: pressed.has('ping'),
      grenade: pressed.has('grenade'),
      callin: pressed.has('callin'),
    };
    pressed.clear();
    wheel = 0;
    return cmd;
  }

  function isLocked() {
    return !!doc?.pointerLockElement;
  }

  // Pointer lock hides the cursor and gives us raw mouse movement, which is what
  // every PC shooter needs. Browsers only allow it right after a click or key press.
  async function lockPointer(el) {
    if (!el?.requestPointerLock) return false;
    try {
      // unadjustedMovement asks for raw mouse counts, without the operating
      // system's mouse acceleration. Not every browser supports it.
      await el.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await el.requestPointerLock();
      } catch {
        return false;
      }
    }
    lockedAt = performance.now();
    return true;
  }

  function unlockPointer() {
    if (isLocked()) doc.exitPointerLock?.();
  }

  return input;
}

/** An empty command: standing still, not shooting. Used for tests and when nobody is controlling a player. */
export function idleCommand(yaw = 0, pitch = 0) {
  return {
    moveX: 0, moveZ: 0, yaw, pitch,
    jump: false, jumpHeld: false, crouch: false, crouchPressed: false, sprint: false,
    fire: false, firePressed: false, ads: false, reload: false, slot: 0, cycle: 0, lastWeapon: false,
    interact: false, ping: false, grenade: false, callin: false,
  };
}

// The one-off parts of a command: "pressed this tick" rather than "held".
export const PRESS_FLAGS = ['jump', 'crouchPressed', 'firePressed', 'reload', 'lastWeapon', 'ping', 'grenade', 'callin'];

/**
 * The same command without its one-off presses: what to repeat when a new one
 * hasn't arrived (keep walking, keep the trigger held, but don't jump again).
 */
export function heldOnly(cmd) {
  const c = { ...cmd, slot: 0, cycle: 0 };
  for (const k of PRESS_FLAGS) c[k] = false;
  return c;
}
