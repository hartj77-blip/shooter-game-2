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
];

function addSliders(folder, target, rows) {
  for (const [key, min, max, step, label] of rows) folder.add(target, key, min, max, step).name(label);
}

export function createDebugPanel({ scene, world, player, rig, loop, onRespawn, visible = false }) {
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
      loop.timeScale = 1;
      loop.paused = false;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
    async copy() {
      const text = JSON.stringify({ movement: player.tuning, camera: rig.tuning }, null, 2);
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
    update(alpha) {
      const s = player.state;
      readout.speed = s.speed;
      readout.vertical = s.vel.y;
      readout.mode = s.mode + (s.crouched ? ' (crouched)' : '');

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
