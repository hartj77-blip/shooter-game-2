// The player's movement: walking, sprinting, jumping, crouching, sliding, mantling.
//
// This is "simulation" code. It never draws anything and never reads the
// keyboard. Each tick it gets a command (see core/input.js), moves the player's
// invisible capsule through the physics world, and updates `player.state`.
// The camera (player/camera.js) then reads that state to decide where to look from.
//
// The player's body is an invisible upright cylinder with slightly rounded edges.
// The flat bottom stands firmly on stair steps; the rounded rim lets it slide
// smoothly along walls without snagging. (Many games use a capsule, a cylinder
// with fully round ends, but a round bottom perched on a stair edge slides back off.)
//
// How movement feels is decided almost entirely by the numbers in TUNING.
// Open the tuning panel in-game (press `) and drag them around.
// See docs/lessons/03-movement.md.

import { RAPIER, IDENTITY_ROTATION } from '../world/physics.js';
import { events as gameEvents } from '../core/events.js';
import { MOVE, CHARACTER_GROUPS } from '../world/groups.js';

const deg = (d) => (d * Math.PI) / 180;

// The player's body. Changing these needs a restart, so they're not in the tuning panel.
export const BODY = {
  radius: 0.35,
  rim: 0.08,             // how rounded the body's edges are
  standHeight: 1.8,
  crouchHeight: 1.15,
  eyeBelowTop: 0.12,     // eyes are a little below the top of your head
  stepHeight: 0.35,      // steps up to this tall are climbed automatically
  maxSlope: deg(46),     // steepest walkable slope
  skin: 0.02,            // tiny gap kept between you and walls so you never get stuck in them
};

// Everything that shapes how movement feels. Speeds in metres per second.
export const DEFAULT_TUNING = {
  walkSpeed: 5.0,
  sprintSpeed: 7.5,
  crouchSpeed: 2.6,
  backwardScale: 0.85,   // walking backwards is a little slower
  groundAccel: 11,       // how fast you reach full speed (higher = snappier)
  friction: 7,           // how fast you stop when you let go of the keys
  stopSpeed: 2,          // friction acts at least this strongly, so you stop crisply instead of creeping
  airAccel: 2.5,         // how much you can steer in the air
  gravity: 20,           // stronger than real life (9.8): real gravity feels floaty in games
  jumpHeight: 1.05,
  maxFallSpeed: 40,
  coyoteTime: 0.12,      // seconds after running off an edge when you can still jump
  jumpBuffer: 0.15,      // a jump pressed this long before landing still counts
  slideMinSpeed: 6.0,    // you must be going this fast to start a slide
  slideBoost: 2.0,       // extra speed when a slide starts
  slideMaxSpeed: 10.5,
  slideDecel: 4.5,       // how quickly a slide slows down on flat ground (m/s lost per second)
  slideSlopeAccel: 1.0,  // how much downhill slopes speed up a slide (1 = full gravity)
  slideTopSpeed: 14,     // even downhill, a slide never goes faster than this
  slideMaxTime: 1.1,     // on flat ground a slide ends after this long
  slideEndSpeed: 3.2,    // ... or when you slow down to this
  slideCooldown: 0.5,
  mantleMin: 0.4,        // ledges lower than this aren't worth a climb animation
  mantleReach: 1.35,     // highest ledge you can climb, measured from your feet
  mantleTime: 0.38,      // seconds a full-height climb takes
};

const GROUND_STICK = -1.5; // small downward push while grounded, so we notice the moment the floor disappears

// How the gun in your hands changes movement this tick (see weapons/arsenal.js).
// Aiming slows you down; pressing fire or aiming stops a sprint.
export const NO_MODS = Object.freeze({ speedScale: 1, canSprint: true });

/**
 * @param {object} opts
 * @param {RAPIER.World} opts.world
 * @param {{pos:number[], yaw:number}} opts.spawn
 * @param {object} [opts.tuning]  defaults to a copy of DEFAULT_TUNING
 * @param {object} [opts.events]  event bus, defaults to the shared one
 * @param {number|string} [opts.owner] who this body belongs to (0 = you); added to every event
 */
export function createPlayer({ world, spawn, tuning = { ...DEFAULT_TUNING }, events = gameEvents, owner = 0 }) {
  // Every event says whose body it was, so the camera only dips when *you* land.
  const emit = (name, data) => events.emit(name, { owner, ...data });
  const r = BODY.radius;
  const rim = BODY.rim;
  // Rapier measures a rounded cylinder without its rounded rim, so subtract it.
  const halfOf = (height) => height / 2 - rim;

  const collider = world.createCollider(
    RAPIER.ColliderDesc.roundCylinder(halfOf(BODY.standHeight), r - rim, rim).setCollisionGroups(CHARACTER_GROUPS),
  );

  // Rapier's kinematic character controller: it moves our capsule and handles
  // sliding along walls, climbing slopes and stepping up stairs.
  const kcc = world.createCharacterController(BODY.skin);
  // We climb steps ourselves (see tryStepUp below), so Rapier's own auto-step stays off.
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.enableSnapToGround(BODY.stepHeight);
  kcc.setMaxSlopeClimbAngle(BODY.maxSlope);
  kcc.setMinSlopeSlideAngle(BODY.maxSlope);
  kcc.setSlideEnabled(true);

  // Shapes for "would I fit here?" checks. Slightly thinner than the real body
  // so that touching a wall doesn't count as being stuck in it.
  const standProbe = new RAPIER.Cylinder(BODY.standHeight / 2 - 0.02, r - 0.03);
  const crouchProbe = new RAPIER.Cylinder(BODY.crouchHeight / 2 - 0.02, r - 0.03);

  // Everything about the player's movement, as plain data. Plain data is easy
  // to inspect, to save, to compare in tests, and (later) to send over the network.
  const state = {
    pos: { x: 0, y: 0, z: 0 },  // feet position
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    mode: 'air',                // 'ground' | 'air' | 'slide' | 'mantle'
    grounded: false,
    crouched: false,
    sprinting: false,
    standBlocked: false,        // you let go of crouch but there's no room to stand
    speed: 0,                   // horizontal speed, for the HUD
    coyote: 0,
    jumpBuffer: 0,
    slideTime: 0,
    slideCooldown: 0,
    takeoffSpeed: 0,
    airTime: 0,
    mantle: null,
  };
  const prev = { x: 0, y: 0, z: 0 }; // feet position one tick ago, for smooth drawing

  const height = () => (state.crouched ? BODY.crouchHeight : BODY.standHeight);
  const centerAt = (feet, h) => ({ x: feet.x, y: feet.y + h / 2, z: feet.z });
  const horizSpeed = () => Math.hypot(state.vel.x, state.vel.z);

  function syncCollider() {
    collider.setTranslation(centerAt(state.pos, height()));
  }

  /** Puts the player somewhere instantly (spawning, restarting). */
  function teleport(pos, yaw = state.yaw) {
    state.pos = { x: pos[0], y: pos[1] + 0.05, z: pos[2] };
    state.vel = { x: 0, y: 0, z: 0 };
    state.yaw = yaw;
    state.pitch = 0;
    state.mode = 'air';
    state.grounded = false;
    state.mantle = null;
    setCrouched(false, true);
    Object.assign(prev, state.pos);
    syncCollider();
  }

  /** Is anything (other than us) in the way of this capsule at this position? */
  function blocked(probe, center) {
    return world.intersectionWithShape(center, IDENTITY_ROTATION, probe, undefined, MOVE, collider) !== null;
  }

  function setCrouched(on, force = false) {
    if (state.crouched === on) return true;
    const from = height();
    const to = on ? BODY.crouchHeight : BODY.standHeight;
    // On the ground your feet stay put. In the air you pull your legs up, so your head stays put.
    const feetShift = state.grounded || state.mode === 'mantle' ? 0 : from - to;
    const feet = { x: state.pos.x, y: state.pos.y + feetShift, z: state.pos.z };
    if (!on && !force) {
      const probeCenter = centerAt(feet, to);
      probeCenter.y += 0.03; // don't count touching the floor as blocked
      if (blocked(standProbe, probeCenter)) return false;
    }
    state.crouched = on;
    state.pos = feet;
    if (feetShift) emit('player:crouch-air', { feetShift });
    collider.setHalfHeight(halfOf(to));
    syncCollider();
    return true;
  }

  // ---------------------------------------------------------------- acceleration
  // These two functions are the classic shooter movement model (from Quake,
  // still used in Source and Call of Duty). Friction slows you down every tick;
  // acceleration pushes you towards the speed you want. The balance between the
  // two is what makes movement feel heavy or snappy.

  // `stopSpeed` makes friction act at least that strongly, so you stop crisply
  // instead of creeping. It only applies when you've let go of the keys: while
  // you're pushing, a slow walk (a gamepad stick half-pushed, an enemy on patrol)
  // would otherwise be cancelled out by it and barely move at all.
  function applyFriction(friction, stopSpeed, dt, pushing = false) {
    const speed = horizSpeed();
    if (speed < 1e-4) {
      state.vel.x = state.vel.z = 0;
      return;
    }
    const drop = (pushing ? speed : Math.max(speed, stopSpeed)) * friction * dt;
    const scale = Math.max(speed - drop, 0) / speed;
    state.vel.x *= scale;
    state.vel.z *= scale;
  }

  // Slides use a steady brake instead (like a sled on snow): the same slow-down
  // at any speed. That's what lets a downhill slope out-push it and speed you up.
  function applyDecel(decel, dt) {
    const speed = horizSpeed();
    if (speed < 1e-4) return;
    const scale = Math.max(speed - decel * dt, 0) / speed;
    state.vel.x *= scale;
    state.vel.z *= scale;
  }

  function accelerate(dirX, dirZ, wishSpeed, accel, dt) {
    const current = state.vel.x * dirX + state.vel.z * dirZ; // speed already going that way
    const add = wishSpeed - current;
    if (add <= 0) return;
    const step = Math.min(accel * wishSpeed * dt, add);
    state.vel.x += dirX * step;
    state.vel.z += dirZ * step;
  }

  // ---------------------------------------------------------------- mantling
  // Finds a ledge in front of us that we could climb onto. Imagine three
  // invisible sticks held out at different distances, each dropped straight down
  // from just above your reach. If one lands on a flat top at a climbable height,
  // with room for your body up there, it's a ledge.

  function findLedge(dirX, dirZ) {
    const t = tuning;
    const feetY = state.pos.y;
    const top = feetY + t.mantleReach + 0.05;
    const center = centerAt(state.pos, height());

    for (const probe of [r + 0.12, r + 0.35, r + 0.6]) {
      const ox = state.pos.x + dirX * probe;
      const oz = state.pos.z + dirZ * probe;
      const down = world.castRayAndGetNormal(
        new RAPIER.Ray({ x: ox, y: top, z: oz }, { x: 0, y: -1, z: 0 }),
        top - (feetY + t.mantleMin), true, undefined, MOVE, collider,
      );
      if (!down) continue;
      if (down.timeOfImpact < 1e-3) return null; // the stick started inside a wall: too tall to climb
      if (down.normal.y < 0.9) continue;         // a slope, not a flat ledge
      const ledgeY = top - down.timeOfImpact;
      const h = ledgeY - feetY;

      // There must be an actual wall face in front of us, just below the ledge.
      const wall = world.castRay(
        new RAPIER.Ray({ x: center.x, y: ledgeY - 0.12, z: center.z }, { x: dirX, y: 0, z: dirZ }),
        probe + 0.05, true, undefined, MOVE, collider,
      );
      if (!wall) continue;

      // Stand just past the edge, fully on top.
      const reach = wall.timeOfImpact + r + 0.05;
      let tx = center.x + dirX * reach;
      let tz = center.z + dirZ * reach;
      let ty = ledgeY;
      const onTop = world.castRay(
        new RAPIER.Ray({ x: tx, y: ledgeY + 0.3, z: tz }, { x: 0, y: -1, z: 0 }),
        0.45, true, undefined, MOVE, collider,
      );
      if (onTop) ty = ledgeY + 0.3 - onTop.timeOfImpact;
      else { tx = ox; tz = oz; } // thin wall: land where the stick touched instead

      // Is there room up there? Try standing, then crouched.
      const feet = { x: tx, y: ty + 0.03, z: tz };
      let crouch = false;
      if (blocked(standProbe, centerAt(feet, BODY.standHeight))) {
        if (blocked(crouchProbe, centerAt(feet, BODY.crouchHeight))) continue;
        crouch = true;
      }
      // Nothing above our head on the way up?
      const headroom = ty + (crouch ? BODY.crouchHeight : BODY.standHeight) - (feetY + height());
      if (headroom > 0) {
        const up = world.castRay(
          new RAPIER.Ray({ x: center.x, y: feetY + height() - 0.05, z: center.z }, { x: 0, y: 1, z: 0 }),
          headroom + 0.05, true, undefined, MOVE, collider,
        );
        if (up) continue;
      }
      return { to: { x: tx, y: ty + BODY.skin, z: tz }, height: h, crouch };
    }
    return null;
  }

  function startMantle(ledge, dirX, dirZ) {
    if (ledge.crouch) setCrouched(true, true);
    const t = tuning;
    state.mantle = {
      from: { ...state.pos },
      to: ledge.to,
      t: 0,
      duration: t.mantleTime * (0.55 + 0.45 * Math.min(1, ledge.height / t.mantleReach)),
      exitSpeed: Math.min(Math.max(horizSpeed(), 2.5), t.walkSpeed),
      dirX, dirZ,
      height: ledge.height,
    };
    state.mode = 'mantle';
    state.vel = { x: 0, y: 0, z: 0 };
    state.jumpBuffer = 0;
    emit('player:mantle', { height: ledge.height });
  }

  const easeOut = (k) => 1 - (1 - k) ** 3;
  const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
  const clamp01 = (k) => Math.min(1, Math.max(0, k));

  function updateMantle(dt) {
    const m = state.mantle;
    m.t = Math.min(1, m.t + dt / m.duration);
    // Lift first, then move forward over the edge, overlapping a little.
    const up = easeOut(clamp01(m.t / 0.7));
    const fwd = easeInOut(clamp01((m.t - 0.3) / 0.7));
    state.pos = {
      x: m.from.x + (m.to.x - m.from.x) * fwd,
      y: m.from.y + (m.to.y - m.from.y) * up,
      z: m.from.z + (m.to.z - m.from.z) * fwd,
    };
    syncCollider();
    if (m.t >= 1) {
      state.mode = 'ground';
      state.grounded = true;
      state.mantle = null;
      state.vel = { x: m.dirX * m.exitSpeed, y: 0, z: m.dirZ * m.exitSpeed };
    }
  }

  // ---------------------------------------------------------------- sliding

  function startSlide(withBoost) {
    const speed = horizSpeed();
    const target = withBoost ? Math.min(speed + tuning.slideBoost, tuning.slideMaxSpeed) : speed;
    const k = target / speed;
    state.vel.x *= k;
    state.vel.z *= k;
    state.mode = 'slide';
    state.slideTime = 0;
    setCrouched(true, true);
    emit('player:slide', {});
  }

  function endSlide() {
    state.mode = state.grounded ? 'ground' : 'air';
    state.slideCooldown = tuning.slideCooldown;
  }

  /** The surface under our feet, for sliding downhill. */
  function groundNormal() {
    const hit = world.castRayAndGetNormal(
      new RAPIER.Ray({ x: state.pos.x, y: state.pos.y + 0.2, z: state.pos.z }, { x: 0, y: -1, z: 0 }),
      0.6, true, undefined, MOVE, collider,
    );
    return hit ? hit.normal : { x: 0, y: 1, z: 0 };
  }

  // ---------------------------------------------------------------- one tick

  /**
   * Moves the player forward by one tick.
   * @param {ReturnType<import('../core/input.js').idleCommand>} cmd
   * @param {number} dt seconds (always SIM_DT in the game)
   * @param {{speedScale:number, canSprint:boolean}} [mods] what the gun allows this tick
   */
  function update(cmd, dt, mods = NO_MODS) {
    const t = tuning;
    Object.assign(prev, state.pos);
    state.yaw = cmd.yaw;
    state.pitch = cmd.pitch;

    state.coyote = Math.max(0, state.coyote - dt);
    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
    state.slideCooldown = Math.max(0, state.slideCooldown - dt);
    if (cmd.jump) state.jumpBuffer = t.jumpBuffer;

    if (state.mode === 'mantle') {
      updateMantle(dt);
      return;
    }

    // Which way do the keys want to go, in the world? (yaw 0 faces -Z.)
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw); // forward
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);  // right
    let wx = fx * cmd.moveZ + rx * cmd.moveX;
    let wz = fz * cmd.moveZ + rz * cmd.moveX;
    const wishLen = Math.hypot(wx, wz);
    if (wishLen > 1e-6) { wx /= wishLen; wz /= wishLen; }
    const moving = wishLen > 1e-6;
    // How hard the stick is pushed: keys are always "all the way" (1); a gamepad
    // stick, or an enemy strolling on patrol, can ask for less.
    const pace = Math.min(1, Math.hypot(cmd.moveX, cmd.moveZ));

    // Crouching. Sliding keeps you crouched. Standing up needs headroom.
    const wantCrouch = cmd.crouch || state.mode === 'slide';
    if (wantCrouch && !state.crouched) setCrouched(true);
    else if (!wantCrouch && state.crouched) setCrouched(false);
    state.standBlocked = state.crouched && !wantCrouch;

    // Sprinting only works going forwards, standing up.
    state.sprinting = cmd.sprint && mods.canSprint && cmd.moveZ > 0 && !state.crouched && state.mode === 'ground';

    // Start a slide: press crouch while running fast on the ground.
    if (state.mode === 'ground' && cmd.crouchPressed && state.slideCooldown <= 0 && horizSpeed() >= t.slideMinSpeed) {
      startSlide(true);
    }

    // Jump (or climb, if there's a ledge in front of us).
    const onGround = state.mode === 'ground' || state.mode === 'slide';
    if (state.jumpBuffer > 0 && (onGround || state.coyote > 0)) {
      const dirX = moving ? wx : fx;
      const dirZ = moving ? wz : fz;
      const ledge = onGround && findLedge(dirX, dirZ);
      if (ledge) {
        startMantle(ledge, dirX, dirZ);
        return;
      }
      if (state.mode === 'slide') endSlide();
      if (state.crouched && !cmd.crouch) setCrouched(false);
      state.vel.y = Math.sqrt(2 * t.gravity * t.jumpHeight);
      state.mode = 'air';
      state.grounded = false;
      state.coyote = 0;
      state.jumpBuffer = 0;
      state.takeoffSpeed = horizSpeed();
      emit('player:jump', {});
    }

    if (state.mode === 'ground') {
      let wishSpeed = state.crouched ? t.crouchSpeed : state.sprinting ? t.sprintSpeed : t.walkSpeed;
      if (cmd.moveZ < 0) wishSpeed *= t.backwardScale;
      wishSpeed *= mods.speedScale * pace;
      applyFriction(t.friction, t.stopSpeed, dt, moving);
      if (moving) accelerate(wx, wz, wishSpeed, t.groundAccel, dt);
      state.vel.y = GROUND_STICK;
    } else if (state.mode === 'slide') {
      state.slideTime += dt;
      applyDecel(t.slideDecel, dt);
      // Downhill pushes you along: the part of gravity that runs along the slope.
      const n = groundNormal();
      const push = t.gravity * t.slideSlopeAccel * n.y;
      state.vel.x += n.x * push * dt;
      state.vel.z += n.z * push * dt;
      const speed = horizSpeed();
      if (speed > t.slideTopSpeed) {
        state.vel.x *= t.slideTopSpeed / speed;
        state.vel.z *= t.slideTopSpeed / speed;
      }
      state.vel.y = GROUND_STICK;
      const downhill = n.y < 0.98;
      const tooSlow = horizSpeed() < t.slideEndSpeed;
      const tooLong = state.slideTime > t.slideMaxTime && !downhill;
      if (tooSlow || tooLong || !cmd.crouch) endSlide();
    } else {
      // In the air: a little steering, but no speeding up beyond your take-off speed.
      state.airTime += dt;
      const cap = Math.max(state.takeoffSpeed, t.walkSpeed);
      if (moving) accelerate(wx, wz, cap, t.airAccel, dt);
      const speed = horizSpeed();
      if (speed > cap) {
        state.vel.x *= cap / speed;
        state.vel.z *= cap / speed;
      }
      state.vel.y = Math.max(state.vel.y - t.gravity * dt, -t.maxFallSpeed);

      // Grab a ledge in mid-air if we're pushing into it and not still flying upwards fast.
      if (cmd.moveZ > 0 && state.vel.y < 2.5) {
        const ledge = findLedge(fx, fz);
        if (ledge) {
          startMantle(ledge, fx, fz);
          return;
        }
      }
    }

    move(cmd, dt);
  }

  /**
   * Stair stepping, the way Quake and Half-Life do it: if something blocks us,
   * pretend to lift up by one step height, move forward, then drop back down.
   * If that got us further and we landed on flat enough ground, it was a step.
   * Returns the movement to use instead, or null if it wasn't a step.
   */
  function tryStepUp(desired) {
    const base = centerAt(state.pos, height());
    const c = { ...base };
    const go = (d) => {
      collider.setTranslation(c);
      kcc.computeColliderMovement(collider, d, undefined, MOVE);
      const m = kcc.computedMovement();
      c.x += m.x; c.y += m.y; c.z += m.z;
      return m;
    };
    let result = null;
    const lifted = go({ x: 0, y: BODY.stepHeight, z: 0 }).y;
    if (lifted > 0.05) {
      // Reach forward at least 10 cm, so slow walking can still find the top of the step.
      const len = Math.hypot(desired.x, desired.z);
      const reach = Math.max(len, 0.1) / len;
      go({ x: desired.x * reach, y: 0, z: desired.z * reach });
      go({ x: 0, y: -(lifted + 0.02), z: 0 });
      // Landed on something flat? (Stops "stepping" up slopes too steep to walk.)
      let flat = false;
      for (let i = 0; i < kcc.numComputedCollisions(); i++) {
        const n = kcc.computedCollision(i)?.normal1;
        if (n && n.y >= Math.cos(BODY.maxSlope)) flat = true;
      }
      const rise = c.y - base.y;
      if (kcc.computedGrounded() && flat && rise > 0.02) {
        result = { x: c.x - base.x, y: rise, z: c.z - base.z };
      }
    }
    collider.setTranslation(base);
    return result;
  }

  // Asks the physics engine to move our capsule, then reacts to what it hit.
  function move(cmd, dt) {
    const t = tuning;
    const desired = { x: state.vel.x * dt, y: state.vel.y * dt, z: state.vel.z * dt };
    kcc.computeColliderMovement(collider, desired, undefined, MOVE);
    let moved = { ...kcc.computedMovement() };
    let grounded = kcc.computedGrounded();
    const normals = [];
    for (let i = 0; i < kcc.numComputedCollisions(); i++) {
      const n = kcc.computedCollision(i)?.normal1; // points out of the thing we hit, towards us
      if (n) normals.push({ ...n });
    }

    const wanted = Math.hypot(desired.x, desired.z);
    const got = Math.hypot(moved.x, moved.z);
    let heldBack = wanted > 1e-6 && got < wanted * 0.9;

    // Blocked while walking? Maybe it's a stair step we can climb.
    if (heldBack && state.grounded && state.vel.y <= 0) {
      const stepped = tryStepUp(desired);
      if (stepped && Math.hypot(stepped.x, stepped.z) > got + 1e-4) {
        moved = stepped;
        grounded = true;
        heldBack = false;
      }
    }

    // Hit a wall? Remove the part of our velocity going into it, keep the part
    // going along it. That's what lets you slide along walls instead of sticking.
    for (const n of normals) {
      if (heldBack && Math.abs(n.y) < 0.7) {
        const len = Math.hypot(n.x, n.z);
        const nx = n.x / len, nz = n.z / len;
        const into = state.vel.x * nx + state.vel.z * nz;
        if (into < 0) {
          state.vel.x -= nx * into;
          state.vel.z -= nz * into;
        }
      } else if (n.y < -0.7 && state.vel.y > 0) {
        state.vel.y = 0; // bumped our head
      }
    }

    state.pos = { x: state.pos.x + moved.x, y: state.pos.y + moved.y, z: state.pos.z + moved.z };
    syncCollider();

    const wasGrounded = state.grounded;
    if (grounded && !wasGrounded && state.vel.y <= 0) {
      // Landed.
      const impact = -state.vel.y;
      state.vel.y = 0;
      state.airTime = 0;
      const fast = horizSpeed() >= t.slideMinSpeed;
      if (cmd.crouch && fast && state.slideCooldown <= 0) {
        state.grounded = true;
        startSlide(false); // land in a slide and keep your speed
      } else {
        state.mode = 'ground';
      }
      emit('player:land', { speed: impact });
    } else if (!grounded && wasGrounded) {
      // Walked or slid off an edge.
      if (state.mode === 'ground' || state.mode === 'slide') {
        if (state.mode === 'slide') state.slideCooldown = t.slideCooldown;
        state.mode = 'air';
        state.coyote = t.coyoteTime;
        state.takeoffSpeed = horizSpeed();
        state.vel.y = 0;
      }
    }
    state.grounded = grounded;
    if (!grounded && state.mode !== 'air') state.mode = 'air';
    state.speed = horizSpeed();
  }

  teleport(spawn.pos, spawn.yaw);

  /** Takes the body out of the physics world for good. */
  function remove() {
    world.removeCharacterController(kcc);
    world.removeCollider(collider, false);
  }

  return {
    state,
    prev,
    tuning,
    collider,
    owner,
    update,
    teleport,
    remove,
    height,
    eyeHeight: () => height() - BODY.eyeBelowTop,
  };
}
