// Fireteam: the starting point. This file wires every system together.
//
// Boot order:
//   1. load the physics engine, fonts and sounds (with a loading bar)
//   2. build the renderer, the level, the targets, the soldier (you), input,
//      camera, the gun on screen, effects, sound, HUD and menus
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
import { createSurfaceRegistry } from './world/surfaces.js';
import { createTargets } from './world/targets.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createSettings } from './core/settings.js';
import { createStateMachine } from './core/fsm.js';
import { events } from './core/events.js';
import { createDebugPanel } from './core/debug.js';
import { createRenderer } from './render/renderer.js';
import { createMaterials } from './render/materials.js';
import { buildLevelView } from './render/level-view.js';
import { createViewmodel } from './render/viewmodel.js';
import { createEffects } from './render/effects.js';
import { createTargetsView } from './render/targets-view.js';
import { createSoldier } from './player/soldier.js';
import { createCameraRig } from './player/camera.js';
import { createCourse, createRecords } from './game/course.js';
import { createAudio } from './audio/audio.js';
import { connectGameSounds } from './audio/game-sounds.js';
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
  const audio = createAudio({ settings: settings.values });
  menus.setLoading(0.1, 'Loading the physics engine…');
  await initPhysics();
  menus.setLoading(0.45, 'Loading sounds…');
  await Promise.all([loadFonts(), audio.preload((k) => menus.setLoading(0.45 + k * 0.35, 'Loading sounds…'))]);
  menus.setLoading(0.85, 'Building the Proving Ground…');

  // ---------------------------------------------------------------- world
  const view = createRenderer(canvas, settings.values);
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  const level = buildLevel(provingGround, world, registry);
  view.scene.add(buildLevelView(level.expanded, createMaterials(view.renderer)));
  view.setSun(provingGround.sun);
  const targets = createTargets(world, registry, level.expanded.targets);
  const trigger = (id) => level.expanded.triggers.find((t) => t.id === id);
  const course = createCourse({
    id: 'killhouse',
    start: trigger('killhouse:start'),
    finish: trigger('killhouse:finish'),
    targets,
    records: createRecords(),
    emit: events.emit,
  });

  // ---------------------------------------------------------------- you
  const soldier = createSoldier({
    world, registry, targets,
    spawn: level.spawn,
    seed: (Math.random() * 2 ** 31) | 0,
    options: { infiniteAmmo: true }, // the training ground never runs out of spare magazines
  });
  const player = soldier.body;
  const input = createInput({ target: window, doc: document, settings: settings.values });
  input.setLook(level.spawn.yaw);
  input.requireLock = !params.has('autostart');
  const aim = () => ({ amount: soldier.arsenal.state.ads, zoom: soldier.arsenal.current.def.ads.zoom });
  const rig = createCameraRig({ camera: view.camera, player, input, settings: settings.values, aim });

  // ---------------------------------------------------------------- what you see and hear
  const viewmodel = createViewmodel({ soldier, input, settings: settings.values, cameraRig: rig, worldCamera: view.camera, sunDir: view.sunDir });
  const effects = createEffects(view.scene);
  const targetsView = createTargetsView(view.scene, targets, level.expanded.racks);
  const sounds = connectGameSounds({ audio, events, soldier, cameraRig: rig, world, registry });

  events.on('weapon:fire', (e) => {
    const muzzle = viewmodel.muzzleWorld();
    effects.muzzleLight(muzzle);
    for (const s of e.shots) {
      if (s.tracer) effects.tracer(muzzle, s.end);
      if (effects.options.showPaths) effects.path(e.origin, s.end);
    }
    for (let i = 0; i < e.pulls; i++) course.onShot();
  });
  events.on('bullet:impact', (hit) => effects.impact(hit));
  events.on('target:hit', (e) => course.onHit(e.target, { headshot: e.headshot }));

  function respawn() {
    player.teleport(level.spawn.pos, level.spawn.yaw);
    input.setLook(level.spawn.yaw);
    rig.snap();
  }

  // ---------------------------------------------------------------- loop
  const loop = createLoop({
    update(dt) {
      if (!flow.is('playing')) return;
      const cmd = input.sample();
      soldier.move(cmd, dt);
      targets.update(dt);
      world.step();
      const out = soldier.act(cmd, dt);
      input.addLook(out.look.yaw, out.look.pitch); // recoil moves your aim
      course.update(dt, soldier.state.pos);
      sounds.tick();
    },
    render(alpha, dt) {
      // While aiming, slow the mouse down to match the zoom.
      const ads = soldier.arsenal.state.ads;
      input.lookScale = 1 + ((settings.values.adsSensitivity / aim().zoom) - 1) * ads;
      rig.update(alpha, dt);
      view.followWithShadows(view.camera.position);
      viewmodel.update(dt);
      effects.update(dt);
      targetsView.update(dt);
      audio.update(view.camera);
      sounds.frame();
      hud.update(dt, { playing: flow.is('playing') });
      debug.update(alpha);
      view.render(rig.tuning.thirdPerson ? null : viewmodel); // no gun in your face in the debug third-person view
    },
  });

  const hud = createHud({ soldier, settings: settings.values, loop, input, camera: view.camera, course, events });
  const debug = createDebugPanel({
    scene: view.scene, world, player, rig, loop,
    arsenal: soldier.arsenal, effects, hud,
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
    audio.unlock(); // browsers only allow sound after a click
    flow.go('playing');
    await input.lockPointer(canvas);
  }

  // Pressing Esc while the mouse is captured makes the browser release it.
  document.addEventListener('pointerlockchange', () => {
    if (!input.isLocked() && flow.is('playing') && input.requireLock) flow.go('paused');
  });
  canvas.addEventListener('click', () => {
    audio.unlock();
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
    if (key === 'masterVolume' || key === 'sfxVolume') audio.applyVolumes();
  });

  if (matchMedia('(pointer: coarse)').matches) document.getElementById('touchNote').hidden = false;

  menus.setLoading(1, 'Ready');
  menus.hide('loading');
  loop.start();
  if (params.has('autostart')) flow.go('playing');
  else flow.go('title');

  // A handle for poking at the game from the browser's developer console, e.g.
  //   fireteam.player.tuning.gravity = 5
  //   fireteam.soldier.arsenal.current.def.rpm = 1200
  window.fireteam = {
    player, soldier, targets, course, input, loop, world, view, flow, settings, rig, debug, events,
    audio, effects, viewmodel, respawn, ready: true,
  };
}

boot().catch(showFatal);
