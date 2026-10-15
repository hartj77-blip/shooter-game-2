// Fireteam: the starting point, and the "app shell" that lives as long as the page.
//
// Boot order:
//   1. load the physics engine, fonts and sounds (with a loading bar)
//   2. build what every map shares: the renderer, sound, input, settings, menus
//   3. load a mission (src/mission.js): one map with everything in it
//   4. start the game loop
//
// Choosing a different map unloads the current mission and loads the next one,
// without reloading the page (which would drop a co-op game's connections).
//
// The game flow is a state machine (core/fsm.js):
//
//     title --Deploy--> playing <--Esc / Resume--> paused --Quit--> title
//
// Handy URL options (add them after the address, like ?map=compound&debug):
//   ?map=NAME   which map: proving-ground (default) or compound
//   ?debug      open the tuning panel straight away
//   ?autostart  skip the title screen (the automated browser test uses this)

import { initPhysics } from './world/physics.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createSettings } from './core/settings.js';
import { createStateMachine } from './core/fsm.js';
import { events as appEvents } from './core/events.js';
import { createRenderer } from './render/renderer.js';
import { createAudio } from './audio/audio.js';
import { createMenus } from './ui/menus.js';
import { loadMission } from './mission.js';
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

async function boot() {
  const settings = createSettings();
  const menus = createMenus(settings);
  const audio = createAudio({ settings: settings.values });
  menus.setLoading(0.1, 'Loading the physics engine…');
  await initPhysics();
  menus.setLoading(0.4, 'Loading sounds…');
  await Promise.all([loadFonts(), audio.preload((k) => menus.setLoading(0.4 + k * 0.3, 'Loading sounds…'))]);

  const view = createRenderer(canvas, settings.values);
  const input = createInput({ target: window, doc: document, settings: settings.values });
  input.requireLock = !params.has('autostart');

  let mission = null; // the map being played (src/mission.js)
  const loop = createLoop({
    update(dt) {
      mission?.update(dt, flow.is('playing'));
    },
    render(alpha, dt) {
      if (!mission) return;
      mission.render(alpha, dt, flow.is('playing'));
      audio.update(view.camera);
    },
  });
  const app = { view, audio, input, settings, loop, debugOpen: params.has('debug') };

  // ---------------------------------------------------------------- game flow
  const flow = createStateMachine({
    title: {
      enter() {
        input.enabled = false;
        input.clear();
        input.unlockPointer();
        mission?.hud.show(false);
        menus.only('title');
        document.body.classList.remove('playing');
      },
    },
    playing: {
      enter() {
        input.enabled = true;
        menus.only();
        mission?.hud.show(true);
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
  }, (from, to) => appEvents.emit('game:state', { from, to }));

  // ---------------------------------------------------------------- loading maps
  let busy = Promise.resolve();
  /** Swap to map `id`: unload the current mission, build the new one. One at a time. */
  function openMap(id) {
    busy = busy.then(async () => {
      if (mission?.mapId === id) return;
      menus.only('loading');
      menus.setLoading(0.72, `Loading ${LEVELS[id].name}…`);
      const old = mission;
      mission = null; // the loop stops touching it straight away
      old?.dispose();
      mission = await loadMission({ app, mapId: id, def: LEVELS[id], onProgress: (k, text) => menus.setLoading(k, text) });
      try { localStorage.setItem('fireteam.map', id); } catch { /* not remembered, that's all */ }
      if (params.get('map') !== id) {
        params.set('map', id);
        history.replaceState(null, '', `?${params}`); // a reload stays on this map
      }
      for (const b of document.querySelectorAll('.map')) b.setAttribute('aria-checked', String(b.dataset.map === id));
      document.getElementById('btnRespawn').textContent = mission.hasEnemies ? 'Restart the fight' : 'Back to spawn';
      menus.setLoading(1, 'Ready');
      menus.hide('loading');
      if (flow.is('title')) menus.show('title'); // back to where you picked the map
    });
    return busy;
  }

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
      if (!mission) return;
      mission.debug.toggle();
      // The panel needs the mouse, so opening it pauses the game.
      if (mission.debug.visible && flow.is('playing')) {
        input.unlockPointer();
        flow.go('paused');
      }
    } else if (e.code === 'Escape' && !input.isLocked()) {
      if (menus.isOpen('settings')) menus.closeSettings();
      else if (flow.is('playing')) flow.go('paused');
    }
  });

  // The map picker on the title screen.
  for (const button of document.querySelectorAll('.map')) {
    button.addEventListener('click', () => openMap(button.dataset.map));
  }

  const restartOrRespawn = () => (mission.hasEnemies ? mission.restart() : mission.respawn());
  const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  on('btnDeploy', () => busy.then(play));
  on('btnResume', play);
  on('btnRespawn', () => { restartOrRespawn(); play(); });
  on('btnMaps', () => { mission.restart(); flow.go('title'); });
  on('btnQuit', () => { mission.restart(); flow.go('title'); });
  on('btnSettingsT', () => menus.openSettings());
  on('btnSettingsP', () => menus.openSettings());
  on('btnSettingsDone', () => menus.closeSettings());
  on('btnSettingsReset', () => { settings.reset(); menus.refresh(); });

  appEvents.on('settings:change', ({ key, value }) => {
    if (key === 'quality') view.applyQuality(value);
    if (key === 'masterVolume' || key === 'sfxVolume') audio.applyVolumes();
    if (key === 'difficulty') mission?.setDifficulty(value);
  });

  if (matchMedia('(pointer: coarse)').matches) document.getElementById('touchNote').hidden = false;

  await openMap(pickMap());
  loop.start();
  if (params.has('autostart')) flow.go('playing');
  else flow.go('title');

  // A handle for poking at the game from the browser's developer console, e.g.
  //   fireteam.player.tuning.gravity = 5
  //   fireteam.enemies.options.freeze = true
  // Everything after `mission` belongs to the map being played, so it changes when the map does.
  window.fireteam = {
    input, loop, view, flow, settings, audio, app, openMap, ready: true,
    get mission() { return mission; },
    get map() { return mission?.mapId; },
    get events() { return mission?.events; },
    get player() { return mission?.player; },
    get soldier() { return mission?.soldier; },
    get health() { return mission?.health; },
    get targets() { return mission?.targets; },
    get course() { return mission?.course; },
    get encounter() { return mission?.encounter; },
    get enemies() { return mission?.enemies; },
    get nav() { return mission?.nav; },
    get cover() { return mission?.cover; },
    get noise() { return mission?.noise; },
    get world() { return mission?.world; },
    get rig() { return mission?.rig; },
    get debug() { return mission?.debug; },
    get effects() { return mission?.effects; },
    get viewmodel() { return mission?.viewmodel; },
    get enemiesView() { return mission?.enemiesView; },
    get ragdolls() { return mission?.ragdolls; },
    get aiDebug() { return mission?.aiDebug; },
    respawn: () => mission?.respawn(),
    restart: () => mission?.restart(),
  };
}

boot().catch(showFatal);
