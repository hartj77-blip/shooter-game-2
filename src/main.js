// Fireteam: the starting point. This file wires every system together.
//
// Boot order:
//   1. load the physics engine, fonts and sounds (with a loading bar)
//   2. build the renderer, the level (and, if it has enemies, map it for them),
//      the targets, you, the enemies, input, camera, the gun on screen,
//      effects, sound, HUD and menus
//   3. start the game loop
//
// The game flow is a state machine (core/fsm.js):
//
//     title --Deploy--> playing <--Esc / Resume--> paused --Quit--> title
//
// Handy URL options (add them after the address, like ?map=compound&debug):
//   ?map=NAME   which map: proving-ground (default) or compound (the title screen sets this)
//   ?debug      open the tuning panel straight away
//   ?autostart  skip the title screen (the automated browser test uses this)

import { initPhysics, createPhysicsWorld } from './world/physics.js';
import { buildLevel } from './world/level.js';
import { createSurfaceRegistry } from './world/surfaces.js';
import { createTargets } from './world/targets.js';
import { createLoop } from './core/loop.js';
import { createInput, idleCommand } from './core/input.js';
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
import { createEnemiesView } from './render/enemies-view.js';
import { createRagdolls } from './render/ragdolls.js';
import { createAiDebug } from './render/ai-debug.js';
import { createSoldier } from './player/soldier.js';
import { createHealth } from './player/health.js';
import { createCameraRig } from './player/camera.js';
import { buildNavGrid } from './ai/nav-grid.js';
import { buildCover } from './ai/cover.js';
import { createNoiseBoard } from './ai/noise.js';
import { createEnemies } from './ai/enemies.js';
import { createCourse, createRecords } from './game/course.js';
import { createEncounter } from './game/encounter.js';
import { createAudio } from './audio/audio.js';
import { connectGameSounds } from './audio/game-sounds.js';
import { createHud } from './ui/hud.js';
import { createMenus } from './ui/menus.js';
import provingGround from '../levels/proving-ground.js';
import compound from '../levels/compound.js';

const LEVELS = { 'proving-ground': provingGround, compound };
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

/** The map from the address bar, or the one you picked last time. */
function pickMap() {
  const asked = params.get('map');
  if (LEVELS[asked]) return asked;
  try {
    const saved = localStorage.getItem('fireteam.map');
    if (LEVELS[saved]) return saved;
  } catch {
    // Storage blocked: use the default.
  }
  return 'proving-ground';
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function boot() {
  const mapId = pickMap();
  const def = LEVELS[mapId];
  const settings = createSettings();
  const menus = createMenus(settings);
  const audio = createAudio({ settings: settings.values });
  menus.setLoading(0.1, 'Loading the physics engine…');
  await initPhysics();
  menus.setLoading(0.4, 'Loading sounds…');
  await Promise.all([loadFonts(), audio.preload((k) => menus.setLoading(0.4 + k * 0.3, 'Loading sounds…'))]);
  menus.setLoading(0.72, `Building ${def.name}…`);
  await nextFrame();

  // ---------------------------------------------------------------- world
  const view = createRenderer(canvas, settings.values);
  const world = createPhysicsWorld();
  const registry = createSurfaceRegistry();
  const level = buildLevel(def, world, registry);
  view.scene.add(buildLevelView(level.expanded, createMaterials(view.renderer)));
  view.setSun(def.sun);
  const targets = createTargets(world, registry, level.expanded.targets);
  const trigger = (id) => level.expanded.triggers.find((t) => t.id === id);
  const records = createRecords();
  const course = trigger('killhouse:start')
    ? createCourse({ id: 'killhouse', start: trigger('killhouse:start'), finish: trigger('killhouse:finish'), targets, records, emit: events.emit })
    : null;

  // Maps with enemies get mapped for them: where they can walk, where they can hide.
  let nav = null, cover = null;
  const noise = createNoiseBoard();
  if (level.expanded.enemies.length) {
    menus.setLoading(0.82, 'Mapping the level for the enemies…');
    await nextFrame();
    nav = buildNavGrid(world, level.nav);
    cover = buildCover(world, nav);
  }

  // ---------------------------------------------------------------- you, and them
  const seed = (Math.random() * 2 ** 31) | 0;
  const health = createHealth({ events });
  let enemies = null;
  // Who gets hurt when one of your bullets hits something.
  const damage = (victim, amount, hit) => {
    if (victim.kind === 'enemy') return enemies.damage(victim, amount, hit);
    if (victim.kind === 'player') return { killed: false };
    return targets.damage(victim, amount);
  };
  const soldier = createSoldier({
    world, registry, targets, damage, seed,
    noise: nav ? noise : null, // only maps with enemies need to hear you (nothing would clear the board otherwise)
    flatZones: true, // enemies don't get headshot bonuses on you
    spawn: level.spawn,
    options: { infiniteAmmo: true }, // spare magazines are unlimited for now (see the design doc's open questions)
  });
  const player = soldier.body;
  if (nav) {
    enemies = createEnemies({
      world, registry, nav, cover, noise, events, seed,
      specs: level.expanded.enemies,
      player: { soldier, health },
      difficulty: settings.values.difficulty,
    });
  }
  const encounter = enemies
    ? createEncounter({ id: mapId, start: trigger('compound:start'), enemies, health, records, emit: events.emit })
    : null;

  const input = createInput({ target: window, doc: document, settings: settings.values });
  input.setLook(level.spawn.yaw);
  input.requireLock = !params.has('autostart');
  const aim = () => ({ amount: soldier.arsenal.state.ads, zoom: soldier.arsenal.current.def.ads.zoom });
  const rig = createCameraRig({ camera: view.camera, player, input, settings: settings.values, aim });

  // ---------------------------------------------------------------- what you see and hear
  const viewmodel = createViewmodel({ soldier, input, settings: settings.values, cameraRig: rig, worldCamera: view.camera, sunDir: view.sunDir });
  const effects = createEffects(view.scene);
  const targetsView = createTargetsView(view.scene, targets, level.expanded.racks);
  const ragdolls = enemies ? createRagdolls(view.scene, def) : null;
  const enemiesView = enemies ? createEnemiesView({ scene: view.scene, enemies, effects, ragdolls, world, camera: view.camera, events }) : null;
  const aiDebug = enemies ? createAiDebug(view.scene, { enemies, nav, cover, noise }) : null;
  const sounds = connectGameSounds({ audio, events, soldier, cameraRig: rig, world, registry, enemies, health });

  const mine = (e) => (e.owner ?? 0) === 0;
  events.on('weapon:fire', (e) => {
    if (!mine(e)) return; // enemies' muzzle flashes and tracers: render/enemies-view.js
    const muzzle = viewmodel.muzzleWorld();
    effects.muzzleLight(muzzle);
    for (const s of e.shots) {
      if (s.tracer) effects.tracer(muzzle, s.end);
      if (effects.options.showPaths) effects.path(e.origin, s.end);
    }
    for (let i = 0; i < e.pulls; i++) {
      course?.onShot();
      encounter?.onShot();
    }
  });
  events.on('bullet:impact', (hit) => effects.impact(hit));
  events.on('target:hit', (e) => {
    if (!mine(e)) return;
    if (e.kind === 'enemy') encounter?.onHit({ headshot: e.headshot, killed: e.killed });
    else if (e.kind !== 'player') course?.onHit(e.target, { headshot: e.headshot });
  });

  function respawn() {
    soldier.teleport(level.spawn.pos, level.spawn.yaw);
    input.setLook(level.spawn.yaw);
    health.reset();
    rig.snap();
  }

  /** Start the fight again: everyone back where they began. */
  function restart() {
    if (enemies) {
      enemies.reset();
      enemiesView.reset();
    }
    respawn();
    encounter?.reset();
  }

  // ---------------------------------------------------------------- loop
  const loop = createLoop({
    update(dt) {
      if (!flow.is('playing')) return;
      let cmd = input.sample();
      if (health.state.down) {
        // You're down: no moving or shooting. R starts again.
        if (cmd.reload && health.state.downTime > 0.8) {
          restart();
          return;
        }
        cmd = idleCommand(cmd.yaw, cmd.pitch);
      }
      soldier.move(cmd, dt);
      enemies?.move(dt);
      targets.update(dt);
      world.step();
      const out = soldier.act(cmd, dt);
      input.addLook(out.look.yaw, out.look.pitch); // recoil moves your aim
      enemies?.playerShots(out.shots);
      enemies?.think(dt);
      enemies?.act(dt);
      health.update(dt);
      course?.update(dt, soldier.state.pos);
      encounter?.update(dt, soldier.state.pos);
      sounds.tick();
    },
    render(alpha, dt) {
      // While aiming, slow the mouse down to match the zoom.
      const ads = soldier.arsenal.state.ads;
      input.lookScale = 1 + ((settings.values.adsSensitivity / aim().zoom) - 1) * ads;
      rig.downTarget = health.state.down ? 1 : 0;
      rig.update(alpha, dt);
      view.followWithShadows(view.camera.position);
      viewmodel.update(dt);
      effects.update(dt);
      targetsView.update(dt);
      enemiesView?.update(dt, alpha);
      ragdolls?.update(dt);
      aiDebug?.update();
      audio.update(view.camera);
      sounds.frame(dt);
      hud.update(dt, { playing: flow.is('playing') });
      debug.update(alpha);
      // No gun in your face in the debug third-person view, or once you're down.
      view.render(rig.tuning.thirdPerson || health.state.down ? null : viewmodel);
    },
  });

  const hud = createHud({ soldier, settings: settings.values, loop, input, camera: view.camera, course, encounter, enemies, health, events });
  const debug = createDebugPanel({
    scene: view.scene, world, player, rig, loop,
    arsenal: soldier.arsenal, effects, hud, enemies, aiDebug, health,
    onRespawn: enemies ? restart : respawn,
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

  // The map picker: choosing a different map reloads the page with it. (Simpler
  // and safer than tearing down a running world; milestone 5 adds a proper loader.)
  for (const button of document.querySelectorAll('.map')) {
    button.setAttribute('aria-checked', String(button.dataset.map === mapId));
    button.addEventListener('click', () => {
      const chosen = button.dataset.map;
      try { localStorage.setItem('fireteam.map', chosen); } catch { /* not remembered, that's all */ }
      if (chosen === mapId) return;
      const next = new URLSearchParams(location.search);
      next.set('map', chosen);
      location.search = next.toString();
    });
  }

  const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  on('btnDeploy', play);
  on('btnResume', play);
  on('btnRespawn', () => { (enemies ? restart : respawn)(); play(); });
  on('btnMaps', () => { restart(); flow.go('title'); });
  on('btnQuit', () => { restart(); flow.go('title'); });
  on('btnSettingsT', () => menus.openSettings());
  on('btnSettingsP', () => menus.openSettings());
  on('btnSettingsDone', () => menus.closeSettings());
  on('btnSettingsReset', () => { settings.reset(); menus.refresh(); });
  if (enemies) document.getElementById('btnRespawn').textContent = 'Restart the fight';

  events.on('settings:change', ({ key, value }) => {
    if (key === 'quality') view.applyQuality(value);
    if (key === 'masterVolume' || key === 'sfxVolume') audio.applyVolumes();
    if (key === 'difficulty') enemies?.setDifficulty(value);
  });

  if (matchMedia('(pointer: coarse)').matches) document.getElementById('touchNote').hidden = false;

  menus.setLoading(1, 'Ready');
  menus.hide('loading');
  loop.start();
  if (params.has('autostart')) flow.go('playing');
  else flow.go('title');

  // A handle for poking at the game from the browser's developer console, e.g.
  //   fireteam.player.tuning.gravity = 5
  //   fireteam.enemies.options.freeze = true
  window.fireteam = {
    map: mapId, player, soldier, health, targets, course, encounter, enemies, nav, cover, noise,
    input, loop, world, view, flow, settings, rig, debug, events, audio, effects, viewmodel,
    enemiesView, ragdolls, aiDebug, respawn, restart, ready: true,
  };
}

boot().catch(showFatal);
