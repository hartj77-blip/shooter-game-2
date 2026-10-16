// The tuning panel and debug views. Press ` (the key under Esc) in game.
//
// Every number that shapes how movement feels gets a slider here. Game
// designers spend a huge amount of time doing exactly this: change a number,
// play for ten seconds, change it again. Tuning isn't saved on purpose, so
// a reload always brings back the defaults. Use "Copy tuning" to keep a set you like.

import GUI from 'lil-gui';
import * as THREE from 'three';
import { DEFAULT_TUNING, BODY } from '../player/controller.js';
import { DEFAULT_CAMERA_TUNING } from '../player/camera.js';
import { WEAPONS } from '../weapons/weapons-data.js';
import { ROLES, AWARENESS } from '../ai/enemy-data.js';
import { NOISE } from '../ai/noise.js';
import { GRENADE } from '../weapons/grenades.js';
import { SUPPLY } from '../game/supply.js';
import { OBJECTIVES } from '../game/objectives.js';

// Copies of the tables as they were at the start, for "Reset everything".
const DEFAULT_WEAPONS = structuredClone(WEAPONS);
const DEFAULT_ROLES = structuredClone(ROLES);
const DEFAULT_AWARENESS = { ...AWARENESS };
const DEFAULT_NOISE = { ...NOISE };
const DEFAULT_GRENADE = { ...GRENADE };
const DEFAULT_SUPPLY = { ...SUPPLY };
const DEFAULT_OBJECTIVES = { ...OBJECTIVES };

// Enemy role sliders: [path inside the role row, min, max, step, label]
const ROLE_ROWS = [
  ['reaction', 0, 2, 0.01, 'Reaction time (s)'],
  ['aim.start', 0, 15, 0.1, 'Aim error at first (°)'],
  ['aim.end', 0, 10, 0.05, 'Aim error settled (°)'],
  ['aim.settle', 0.1, 6, 0.05, 'Aim settles over (s)'],
  ['aim.lag', 0.02, 1, 0.01, 'Tracking delay (s)'],
  ['aim.turn', 30, 720, 5, 'Turn speed (°/s)'],
  ['sight.range', 5, 150, 1, 'Sight range (m)'],
  ['sight.fov', 30, 180, 1, 'Vision cone (°)'],
  ['hearing', 0, 3, 0.05, 'Hearing (x)'],
  ['range.ideal', 2, 80, 1, 'Favourite range (m)'],
  ['flank', 0, 1, 0.01, 'Keen to flank'],
  ['rush', 0, 1, 0.01, 'Keen to charge'],
  ['fireOnMove', 0, 1, 0.01, 'Shoots while moving'],
  ['telegraph', 0.2, 3, 0.05, 'Laser warning (s)'],
];
const AWARENESS_ROWS = [
  ['rate', 0.1, 6, 0.05, 'Noticing speed (/s)'],
  ['instant', 0, 12, 0.25, 'Spotted at once within (m)'],
  ['crouched', 0, 1, 0.01, 'Crouched counts'],
  ['still', 0, 1, 0.01, 'Standing still counts'],
  ['peripheral', 0, 1, 0.01, 'Corner of the eye counts'],
  ['decay', 0, 1, 0.01, 'Forgets at (/s)'],
];
const NOISE_ROWS = [
  ['gunshot', 0, 150, 1, 'Gunshot (m)'],
  ['sprintStep', 0, 40, 0.5, 'Sprinting steps (m)'],
  ['walkStep', 0, 30, 0.5, 'Walking steps (m)'],
  ['crouchStep', 0, 20, 0.5, 'Crouching steps (m)'],
];

// Missions (milestone 5). The director's sliders change the running director's own
// copy of its settings (the mission may have changed some), so they act at once.
const DIRECTOR_ROWS = [
  ['calm', 0, 120, 1, 'Quiet at the start (s)'],
  ['gap.0', 5, 120, 1, 'Wave gap, shortest (s)'],
  ['gap.1', 5, 180, 1, 'Wave gap, longest (s)'],
  ['crescendoGap', 3, 60, 1, 'Crescendo wave gap (s)'],
  ['peak', 0.1, 2, 0.01, 'Peak at intensity'],
  ['relaxBelow', 0, 1, 0.01, 'Relax below intensity'],
  ['relax.0', 0, 90, 1, 'Breather, shortest (s)'],
  ['relax.1', 0, 120, 1, 'Breather, longest (s)'],
  ['minDistance', 10, 80, 1, 'Spawn at least (m) away'],
  ['hurt', 0, 0.05, 0.001, 'Intensity per damage'],
  ['fadeAfter', 0, 20, 0.5, 'Intensity fades after (s)'],
  ['fade', 0, 0.5, 0.01, 'Intensity fade (/s)'],
];
// (Co-op: these change only this browser. Grenades fly on every computer, so tune them solo.)
const GRENADE_ROWS = [
  ['fuse', 0.5, 8, 0.1, 'Fuse (s)'],
  ['speed', 4, 30, 0.5, 'Throw speed (m/s)'],
  ['radius', 1, 15, 0.25, 'Blast radius (m)'],
  ['inner', 0, 6, 0.25, 'Full damage within (m)'],
  ['damage', 10, 400, 5, 'Damage'],
  ['bounce', 0, 1, 0.01, 'Bounciness'],
  ['grip', 0, 1, 0.01, 'Slide kept per bounce'],
  ['roll', 0, 40, 0.5, 'Rolling slow-down (m/s²)'],
];
const SUPPLY_ROWS = [
  ['useTime', 0.2, 5, 0.1, 'Crate: hold F (s)'],
];
const OBJECTIVE_ROWS = [
  ['free', 0.2, 8, 0.1, 'Untie the hostage (s)'],
  ['download', 5, 180, 1, 'Download takes (s)'],
  ['contest', 0, 20, 0.5, 'Enemies stall it within (m)'],
  ['plant', 0.5, 10, 0.1, 'Plant a charge (s)'],
  ['fuse', 2, 30, 0.5, 'Charge fuse (s)'],
  ['hold', 10, 300, 5, 'Hold the line (s)'],
];

// Weapon sliders: [path inside the weapon row, min, max, step, label]
const WEAPON_ROWS = [
  ['rpm', 30, 1500, 5, 'Rounds per minute'],
  ['damage.near', 1, 150, 1, 'Damage close'],
  ['damage.far', 1, 150, 1, 'Damage far'],
  ['damage.nearRange', 1, 100, 1, 'Drop-off starts (m)'],
  ['damage.farRange', 1, 200, 1, 'Drop-off ends (m)'],
  ['spread.hip', 0, 10, 0.05, 'Hip spread (°)'],
  ['spread.ads', 0, 6, 0.01, 'Aimed spread (°)'],
  ['spread.perShot', 0, 2, 0.01, 'Bloom per shot (°)'],
  ['spread.max', 0, 10, 0.1, 'Max bloom (°)'],
  ['spread.recovery', 0, 40, 0.5, 'Bloom recovery (°/s)'],
  ['recoil.pitch', 0, 6, 0.02, 'Recoil up (°)'],
  ['recoil.yawRandom', 0, 2, 0.01, 'Recoil sideways jitter (°)'],
  ['recoil.recover', 0, 1, 0.05, 'Recoil drift back (share)'],
  ['ads.zoom', 1, 3, 0.05, 'Aim zoom'],
  ['ads.time', 0.05, 0.6, 0.01, 'Aim time (s)'],
  ['ads.move', 0.2, 1, 0.01, 'Aimed move speed'],
  ['penetration', 0, 2, 0.05, 'Penetration (m of wood)'],
];

function holder(obj, path) {
  const keys = path.split('.');
  const last = keys.pop();
  return [keys.reduce((o, k) => o[k], obj), last];
}

// [key, min, max, step, label]
const MOVEMENT = [
  ['walkSpeed', 1, 12, 0.1, 'Walk speed (m/s)'],
  ['sprintSpeed', 1, 16, 0.1, 'Sprint speed (m/s)'],
  ['crouchSpeed', 0.5, 8, 0.1, 'Crouch speed (m/s)'],
  ['groundAccel', 1, 40, 0.5, 'Acceleration'],
  ['friction', 0, 20, 0.5, 'Friction'],
  ['stopSpeed', 0, 6, 0.1, 'Stop speed'],
];
const JUMPING = [
  ['jumpHeight', 0.2, 3, 0.05, 'Jump height (m)'],
  ['gravity', 2, 50, 0.5, 'Gravity (m/s²)'],
  ['airAccel', 0, 20, 0.5, 'Air control'],
  ['coyoteTime', 0, 0.5, 0.01, 'Coyote time (s)'],
  ['jumpBuffer', 0, 0.5, 0.01, 'Jump buffer (s)'],
];
const SLIDING = [
  ['slideMinSpeed', 0, 12, 0.1, 'Min speed to slide'],
  ['slideBoost', 0, 6, 0.1, 'Start boost (m/s)'],
  ['slideMaxSpeed', 4, 20, 0.5, 'Max start speed'],
  ['slideDecel', 0, 20, 0.5, 'Slow-down (m/s²)'],
  ['slideSlopeAccel', 0, 2, 0.05, 'Downhill pull'],
  ['slideMaxTime', 0.2, 4, 0.05, 'Max time on flat (s)'],
  ['slideEndSpeed', 0, 8, 0.1, 'End below speed'],
  ['slideCooldown', 0, 3, 0.05, 'Cooldown (s)'],
];
const MANTLING = [
  ['mantleMin', 0.1, 1, 0.05, 'Lowest ledge (m)'],
  ['mantleReach', 0.5, 2.5, 0.05, 'Highest ledge (m)'],
  ['mantleTime', 0.1, 1.5, 0.02, 'Climb time (s)'],
];
const CAMERA = [
  ['bobAmount', 0, 0.2, 0.005, 'Head bob (m)'],
  ['bobStride', 0.5, 4, 0.05, 'Stride length (m)'],
  ['strafeTilt', 0, 5, 0.1, 'Strafe lean (°)'],
  ['slideTilt', 0, 15, 0.5, 'Slide lean (°)'],
  ['landDip', 0, 3, 0.05, 'Landing dip'],
  ['sprintFovKick', 0, 25, 0.5, 'Sprint FOV kick (%)'],
  ['slideFovKick', 0, 30, 0.5, 'Slide FOV kick (%)'],
  ['crouchSmoothing', 2, 40, 1, 'Crouch smoothing'],
  ['shotPunch', 0, 3, 0.05, 'Shot jolt'],
  ['shake', 0, 3, 0.05, 'Camera shake'],
];

function addSliders(folder, target, rows) {
  for (const [path, min, max, step, label] of rows) {
    const [obj, key] = holder(target, path);
    folder.add(obj, key, min, max, step).name(label);
  }
}

/**
 * @param {object} [opts.director] game/director.js (the host's, in a mission): its readout and sliders
 */
export function createDebugPanel({ scene, world, player, rig, loop, onRespawn, arsenal, effects, hud, enemies = null, aiDebug = null, health = null, director = null, visible = false }) {
  const gui = new GUI({ title: 'Tuning panel  ·  ` to hide' });
  gui.domElement.classList.add('tuning');

  const live = gui.addFolder('Live');
  const readout = { speed: 0, vertical: 0, mode: '' };
  live.add(readout, 'mode').name('Mode').listen().disable();
  live.add(readout, 'speed').name('Speed (m/s)').decimals(2).listen().disable();
  live.add(readout, 'vertical').name('Vertical (m/s)').decimals(2).listen().disable();

  const time = gui.addFolder('Time');
  time.add(loop, 'timeScale', 0.05, 2, 0.05).name('Game speed (slow-mo)');
  time.add(loop, 'paused').name('Freeze world').listen();

  addSliders(gui.addFolder('Movement'), player.tuning, MOVEMENT);
  addSliders(gui.addFolder('Jumping').close(), player.tuning, JUMPING);
  addSliders(gui.addFolder('Sliding').close(), player.tuning, SLIDING);
  addSliders(gui.addFolder('Mantling').close(), player.tuning, MANTLING);
  const cam = gui.addFolder('Camera feel').close();
  addSliders(cam, rig.tuning, CAMERA);

  // ---- debug views
  const views = { colliders: false };
  const viewsFolder = gui.addFolder('Debug views').close();
  viewsFolder.add(rig.tuning, 'thirdPerson').name('Third-person camera');
  viewsFolder.add(views, 'colliders').name('Show colliders');

  // ---- weapons
  const weapons = gui.addFolder('Weapons').close();
  if (arsenal) weapons.add(arsenal.options, 'infiniteAmmo').name('Infinite spare ammo');
  if (effects) weapons.add(effects.options, 'showPaths').name('Show bullet paths');
  if (hud) weapons.add(hud.options, 'damageNumbers').name('Show damage numbers');
  for (const def of Object.values(WEAPONS)) {
    const f = weapons.addFolder(def.name).close();
    for (const [path, min, max, step, label] of WEAPON_ROWS) {
      const [obj, key] = holder(def, path);
      f.add(obj, key, min, max, step).name(label);
    }
  }

  // ---- enemies
  const ai = gui.addFolder('AI').close();
  if (enemies) ai.add(enemies.options, 'freeze').name('Freeze enemies');
  if (health) ai.add(health, 'godMode').name("God mode (you can't be hurt)");
  if (aiDebug) {
    ai.add(aiDebug.options, 'senses').name('Show vision and brain state');
    ai.add(aiDebug.options, 'paths').name('Show routes');
    ai.add(aiDebug.options, 'cover').name('Show cover points');
    ai.add(aiDebug.options, 'nav').name('Show the nav grid');
    ai.add(aiDebug.options, 'noise').name('Show noises');
  }
  for (const [id, role] of Object.entries(ROLES)) {
    const f = ai.addFolder(role.name).close();
    for (const [path, min, max, step, label] of ROLE_ROWS) {
      const [obj, key] = holder(role, path);
      if (obj[key] !== undefined) f.add(obj, key, min, max, step).name(label);
    }
    f.domElement.dataset.role = id;
  }
  addSliders(ai.addFolder('Noticing').close(), AWARENESS, AWARENESS_ROWS);
  addSliders(ai.addFolder('Hearing').close(), NOISE, NOISE_ROWS);

  // ---- missions: what the director is up to, and the numbers behind missions
  const missions = gui.addFolder('Missions').close();
  const dirRead = { phase: '', next: 0, alive: 0, squad: 0, waves: 0, last: '' };
  let directorDefaults = null;
  if (director) {
    const r = missions.addFolder('Director (live)');
    r.add(dirRead, 'phase').name('Phase').listen().disable();
    r.add(dirRead, 'next').name('Next wave in (s)').decimals(0).listen().disable();
    r.add(dirRead, 'alive').name('Enemies standing').listen().disable();
    r.add(dirRead, 'squad').name('Squad intensity').decimals(2).listen().disable();
    r.add(dirRead, 'waves').name('Waves sent').listen().disable();
    r.add(dirRead, 'last').name('Last decision').listen().disable();
    directorDefaults = structuredClone(director.tuning);
    addSliders(missions.addFolder('Director').close(), director.tuning, DIRECTOR_ROWS);
  }
  addSliders(missions.addFolder('Objectives').close(), OBJECTIVES, OBJECTIVE_ROWS);
  addSliders(missions.addFolder('Grenades').close(), GRENADE, GRENADE_ROWS);
  addSliders(missions.addFolder('Ammo crates').close(), SUPPLY, SUPPLY_ROWS);

  // What the physics engine sees: every collider drawn as lines.
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.8 }),
  );
  lines.renderOrder = 10;
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);

  // Your own body, for the third-person view.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(BODY.radius, BODY.radius, 1, 24),
    new THREE.MeshStandardMaterial({ color: '#e8b14a', transparent: true, opacity: 0.55 }),
  );
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: '#1b1f17' }));
  nose.position.z = -0.4;
  body.add(nose);
  body.visible = false;
  scene.add(body);

  // ---- actions
  const actions = {
    reset() {
      Object.assign(player.tuning, DEFAULT_TUNING);
      Object.assign(rig.tuning, DEFAULT_CAMERA_TUNING);
      for (const [id, def] of Object.entries(WEAPONS)) {
        for (const [path] of WEAPON_ROWS) {
          const [obj, key] = holder(def, path);
          const [orig] = holder(DEFAULT_WEAPONS[id], path);
          obj[key] = orig[key];
        }
      }
      for (const [id, role] of Object.entries(ROLES)) {
        for (const [path] of ROLE_ROWS) {
          const [obj, key] = holder(role, path);
          const [orig] = holder(DEFAULT_ROLES[id], path);
          if (key in orig) obj[key] = orig[key];
        }
      }
      Object.assign(AWARENESS, DEFAULT_AWARENESS);
      Object.assign(NOISE, DEFAULT_NOISE);
      Object.assign(GRENADE, DEFAULT_GRENADE);
      Object.assign(SUPPLY, DEFAULT_SUPPLY);
      Object.assign(OBJECTIVES, DEFAULT_OBJECTIVES);
      if (director) Object.assign(director.tuning, structuredClone(directorDefaults));
      loop.timeScale = 1;
      loop.paused = false;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
    async copy() {
      const guns = {};
      for (const [id, def] of Object.entries(WEAPONS)) {
        guns[id] = Object.fromEntries(WEAPON_ROWS.map(([path]) => {
          const [obj, key] = holder(def, path);
          return [path, obj[key]];
        }));
      }
      const text = JSON.stringify({
        movement: player.tuning, camera: rig.tuning, weapons: guns, roles: ROLES, awareness: AWARENESS, noise: NOISE,
        director: director?.tuning, objectives: OBJECTIVES, grenade: GRENADE, supply: SUPPLY,
      }, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        copyButton.name('Copied!');
      } catch {
        console.log(text);
        copyButton.name('Copy failed: printed in console');
      }
      setTimeout(() => copyButton.name('Copy tuning as text'), 1500);
    },
    respawn: onRespawn,
  };
  gui.add(actions, 'respawn').name('Back to spawn');
  gui.add(actions, 'reset').name('Reset everything to defaults');
  const copyButton = gui.add(actions, 'copy').name('Copy tuning as text');

  gui.show(visible);

  const tmp = new THREE.Vector3();
  return {
    gui,
    get visible() { return !gui._hidden; },
    toggle() { gui.show(gui._hidden); },
    /** Take the panel off the page (the mission is ending; the next one builds its own). */
    destroy() {
      gui.destroy();
      lines.removeFromParent();
      body.removeFromParent();
      lines.geometry.dispose();
    },
    update(alpha) {
      const s = player.state;
      readout.speed = s.speed;
      readout.vertical = s.vel.y;
      readout.mode = s.mode + (s.crouched ? ' (crouched)' : '');
      if (director && !missions._closed) {
        const d = director.view;
        dirRead.phase = d.phase;
        dirRead.next = d.next;
        dirRead.alive = d.alive;
        dirRead.squad = d.squad;
        dirRead.waves = d.waves;
        dirRead.last = d.log.at(-1)?.text ?? '';
      }

      lines.visible = views.colliders;
      if (views.colliders) {
        const { vertices, colors } = world.debugRender();
        lines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        lines.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      }

      body.visible = rig.tuning.thirdPerson;
      if (body.visible) {
        const p = player.prev;
        tmp.set(p.x + (s.pos.x - p.x) * alpha, p.y + (s.pos.y - p.y) * alpha, p.z + (s.pos.z - p.z) * alpha);
        const h = player.height();
        body.scale.set(1, h, 1);
        nose.scale.set(1, 1 / h, 1);
        nose.position.y = (h / 2 - BODY.eyeBelowTop) / h; // at eye height
        body.position.set(tmp.x, tmp.y + h / 2, tmp.z);
        body.rotation.y = s.yaw;
      }
    },
  };
}
