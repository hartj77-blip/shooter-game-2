// Fireteam: the starting point. This file wires every system together.
//
// Boot order:
//   1. load the physics engine and fonts (with a loading bar)
//   2. build the renderer, the level, the player, input, camera, HUD, menus
//   3. start the game loop
//
// The game flow is a state machine (core/fsm.js):
//
//     title --Deploy--> playing <--Esc / Resume--> paused --Quit--> title
//
// Handy URL options (add them after the address, like ?debug&autostart):
//   ?debug      open the tuning panel straight away
//   ?autostart  skip the title screen (the automated browser test uses this)

import { initPhysics, createPhysicsWorld } from './world/physics.js';
import { buildLevel } from './world/level.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createSettings } from './core/settings.js';
import { createStateMachine } from './core/fsm.js';
import { events } from './core/events.js';
import { createDebugPanel } from './core/debug.js';
import { createRenderer } from './render/renderer.js';
import { createMaterials } from './render/materials.js';
import { buildLevelView } from './render/level-view.js';
import { createPlayer } from './player/controller.js';
import { createCameraRig } from './player/camera.js';
import { createHud } from './ui/hud.js';
import { createMenus } from './ui/menus.js';
import provingGround from '../levels/proving-ground.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');

function showFatal(err) {
  console.error(err);
  const text = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  document.getElementById('errorText').textContent = text.slice(0, 2000);
  document.getElementById('error').hidden = false;
}
addEventListener('error', (e) => showFatal(e.error ?? e.message));
addEventListener('unhandledrejection', (e) => showFatal(e.reason));

async function loadFonts() {
  // Signs are drawn with these fonts, so wait for them (but never more than 3 s).
  const fonts = ['700 64px "Barlow Condensed"', '500 64px "Barlow Condensed"'];
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), timeout]).catch(() => {});
}

async function boot() {
  const settings = createSettings();
  const menus = createMenus(settings);
  menus.setLoading(0.15, 'Loading the physics engine…');
  await initPhysics();
  menus.setLoading(0.6, 'Loading fonts…');
  await loadFonts();
  menus.setLoading(0.8, 'Building the Proving Ground…');

  // ---------------------------------------------------------------- world
  const view = createRenderer(canvas, settings.values);
  const world = createPhysicsWorld();
  const level = buildLevel(provingGround, world);
  view.scene.add(buildLevelView(level.expanded, createMaterials(view.renderer)));
  view.setSun(provingGround.sun);

  // ---------------------------------------------------------------- player
  const player = createPlayer({ world, spawn: level.spawn });
  const input = createInput({ target: window, doc: document, settings: settings.values });
  input.setLook(level.spawn.yaw);
  const rig = createCameraRig({ camera: view.camera, player, input, settings: settings.values });

  function respawn() {
    player.teleport(level.spawn.pos, level.spawn.yaw);
    input.setLook(level.spawn.yaw);
    rig.snap();
  }

  // ---------------------------------------------------------------- loop
  const loop = createLoop({
    update(dt) {
      if (!flow.is('playing')) return;
      player.update(input.sample(), dt);
      world.step();
    },
    render(alpha, dt) {
      rig.update(alpha, dt);
      view.followWithShadows(view.camera.position);
      hud.update(dt, { playing: flow.is('playing') });
      debug.update(alpha);
      view.render();
    },
  });

  const hud = createHud({ player, settings: settings.values, loop, input });
  const debug = createDebugPanel({
    scene: view.scene, world, player, rig, loop,
    onRespawn: respawn,
    visible: params.has('debug'),
  });

  // ---------------------------------------------------------------- game flow
  const flow = createStateMachine({
    title: {
      enter() {
        input.enabled = false;
        input.clear();
        input.unlockPointer();
        hud.show(false);
        menus.only('title');
        document.body.classList.remove('playing');
      },
    },
    playing: {
      enter() {
        input.enabled = true;
        menus.only();
        hud.show(true);
        document.body.classList.add('playing');
      },
    },
    paused: {
      enter() {
        input.enabled = false;
        input.clear();
        menus.only('pause');
        document.body.classList.remove('playing');
      },
    },
  }, (from, to) => events.emit('game:state', { from, to }));

  async function play() {
    flow.go('playing');
    await input.lockPointer(canvas);
  }

  // Pressing Esc while the mouse is captured makes the browser release it.
  document.addEventListener('pointerlockchange', () => {
    if (!input.isLocked() && flow.is('playing')) flow.go('paused');
  });
  canvas.addEventListener('click', () => {
    if (flow.is('playing') && !input.isLocked()) input.lockPointer(canvas);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && flow.is('playing')) flow.go('paused');
  });

  addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      debug.toggle();
      // The panel needs the mouse, so opening it pauses the game.
      if (debug.visible && flow.is('playing')) {
        input.unlockPointer();
        flow.go('paused');
      }
    } else if (e.code === 'Escape' && !input.isLocked()) {
      if (menus.isOpen('settings')) menus.closeSettings();
      else if (flow.is('playing')) flow.go('paused');
    }
  });

  const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  on('btnDeploy', play);
  on('btnResume', play);
  on('btnRespawn', () => { respawn(); play(); });
  on('btnQuit', () => { respawn(); flow.go('title'); });
  on('btnSettingsT', () => menus.openSettings());
  on('btnSettingsP', () => menus.openSettings());
  on('btnSettingsDone', () => menus.closeSettings());
  on('btnSettingsReset', () => { settings.reset(); menus.refresh(); });

  events.on('settings:change', ({ key, value }) => {
    if (key === 'quality') view.applyQuality(value);
  });

  if (matchMedia('(pointer: coarse)').matches) document.getElementById('touchNote').hidden = false;

  menus.setLoading(1, 'Ready');
  menus.hide('loading');
  loop.start();
  if (params.has('autostart')) flow.go('playing');
  else flow.go('title');

  // A handle for poking at the game from the browser's developer console, e.g.
  //   fireteam.player.tuning.gravity = 5
  window.fireteam = { player, input, loop, world, view, flow, settings, rig, debug, events, respawn, ready: true };
}

boot().catch(showFatal);
