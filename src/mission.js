// A mission: one map, built and ready to play, and torn down again without
// reloading the page.
//
// main.js (the "app shell") lives as long as the page: the renderer, sound,
// input, settings and menus. A mission is everything that belongs to one map:
//   - its own event bus, so when it ends every listener goes with it
//   - the session it plays through (net/host.js runs the real simulation)
//   - everything it draws, under one group in the scene (`root`)
//   - the camera rig, the gun in your hands, game sounds, HUD and tuning panel
//
// dispose() undoes all of it: takes the group out of the scene, frees its
// graphics memory and the physics engine's memory, empties the HUD and closes
// the tuning panel. Like striking the set between two plays: the theatre
// stays, the scenery goes. Co-op needs this, because reloading the page to
// change map would drop everyone's connection.

import * as THREE from 'three';
import { createEvents } from './core/events.js';
import { idleCommand } from './core/input.js';
import { createDebugPanel } from './core/debug.js';
import { createSim } from './game/sim.js';
import { createRecords } from './game/course.js';
import { createHost } from './net/host.js';
import { createCameraRig } from './player/camera.js';
import { createMaterials } from './render/materials.js';
import { buildLevelView } from './render/level-view.js';
import { createViewmodel } from './render/viewmodel.js';
import { createEffects } from './render/effects.js';
import { createTargetsView } from './render/targets-view.js';
import { createSoldiersView } from './render/soldiers-view.js';
import { SOLDIER_COLORS } from './render/soldier-model.js';
import { createRagdolls } from './render/ragdolls.js';
import { createAiDebug } from './render/ai-debug.js';
import { disposeTree } from './render/dispose.js';
import { connectGameSounds } from './audio/game-sounds.js';
import { createHud } from './ui/hud.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Build a mission.
 * @param {object} opts
 * @param {object} opts.app     the app shell: { view, audio, input, settings, loop, debugOpen }
 * @param {string} opts.mapId   e.g. 'compound'
 * @param {object} opts.def     the level definition (levels/*.js)
 * @param {(fraction:number, text:string) => void} [opts.onProgress] for the loading bar
 */
export async function loadMission({ app, mapId, def, onProgress = () => {} }) {
  const { view, audio, input, settings, loop } = app;
  onProgress(0.75, def.nav ? `Building ${def.name} and mapping it for the enemies…` : `Building ${def.name}…`);
  await nextFrame(); // let the loading bar show before the (slow-ish) build

  // ---------------------------------------------------------------- the simulation
  const events = createEvents();
  const sim = createSim({
    def, id: mapId, events,
    seed: (Math.random() * 2 ** 31) | 0,
    difficulty: settings.values.difficulty,
    records: createRecords(), // best times, saved in this browser
  });
  const session = createHost({ sim, me: 0 });
  const me = session.me;
  const { soldier, health } = session.local;
  const player = soldier.body;
  const { world, registry } = session;
  const hasEnemies = !!sim.enemies;

  // ---------------------------------------------------------------- what you see and hear
  const root = new THREE.Group();
  root.name = `mission:${mapId}`;
  view.scene.add(root);
  view.setSun(def.sun);
  root.add(buildLevelView(session.level.expanded, createMaterials(view.renderer)));

  input.setLook(player.state.yaw);
  const aim = () => ({ amount: soldier.arsenal.state.ads, zoom: soldier.arsenal.current.def.ads.zoom });
  const rig = createCameraRig({ camera: view.camera, player, input, settings: settings.values, aim, events, owner: me });
  const viewmodel = createViewmodel({
    soldier, input, settings: settings.values, cameraRig: rig, worldCamera: view.camera, sunDir: view.sunDir, events, owner: me,
  });
  const effects = createEffects(root);
  const targetsView = createTargetsView(root, session.targets, session.level.expanded.racks);
  const ragdolls = hasEnemies ? createRagdolls(root, def) : null;
  const camera = view.camera;
  const enemiesView = hasEnemies
    ? createSoldiersView({ scene: root, source: session.enemies, effects, ragdolls, world, registry, camera, events })
    : null;
  // Teammates: the same block soldiers in friendly colours, with no "?" or "!".
  const teammatesView = createSoldiersView({
    scene: root, source: session.teammates, effects, ragdolls, world, registry, camera, events,
    colors: SOLDIER_COLORS.friend, icons: false, downEvent: 'player:dead',
  });
  const aiDebug = hasEnemies ? createAiDebug(root, { enemies: sim.enemies, nav: sim.nav, cover: sim.cover, noise: sim.noise }) : null;
  const sounds = connectGameSounds({
    audio, events, soldier, cameraRig: rig, world, registry, health, owner: me,
    others: [session.enemies, session.teammates],
  });

  // Your own shots: the flash and tracers start at the gun on screen.
  // (Everyone else's: render/soldiers-view.js.)
  events.on('weapon:fire', (e) => {
    if (e.owner !== me) return;
    const muzzle = viewmodel.muzzleWorld();
    effects.muzzleLight(muzzle);
    for (const s of e.shots) {
      if (s.tracer) effects.tracer(muzzle, s.end);
      if (effects.options.showPaths) effects.path(e.origin, s.end);
    }
  });
  events.on('bullet:impact', (hit) => effects.impact(hit));

  const hud = createHud({
    soldier, settings: settings.values, loop, input, camera, events, owner: me, health,
    course: session.course, encounter: session.encounter, threats: hasEnemies ? session.enemies : null,
  });

  /** Just you, back to your spawn. */
  function respawn() {
    session.respawn();
    input.setLook(player.state.yaw);
    rig.snap();
  }

  /** Start the fight again: everyone back where they began. */
  function restart() {
    session.restart();
    enemiesView?.reset();
    teammatesView.reset();
    input.setLook(player.state.yaw);
    rig.snap();
  }

  const debug = createDebugPanel({
    scene: root, world, player, rig, loop,
    arsenal: soldier.arsenal, effects, hud, enemies: sim.enemies, aiDebug, health,
    onRespawn: hasEnemies ? restart : respawn,
    visible: app.debugOpen,
  });

  /** One fixed step of the game. */
  function update(dt, playing) {
    // Paused: a solo game stops, a co-op game carries on without you.
    if (!playing && session.pausable) return;
    const cmd = playing ? input.sample() : idleCommand(input.yaw, input.pitch);
    // Down in a solo fight: R starts again.
    if (health.state.down && cmd.reload && health.state.downTime > 0.8 && session.role === 'host') {
      restart();
      return;
    }
    const out = session.step(dt, cmd);
    input.addLook(out.look.yaw, out.look.pitch); // recoil moves your aim
    sounds.tick();
  }

  /** Draw a frame. `alpha` is how far we are between the last two ticks. */
  function render(alpha, dt, playing) {
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
    teammatesView.update(dt, alpha);
    ragdolls?.update(dt);
    aiDebug?.update();
    sounds.frame(dt);
    hud.update(dt, { playing });
    debug.update(alpha);
    // No gun in your face in the debug third-person view, or once you're down.
    view.render(rig.tuning.thirdPerson || health.state.down ? null : viewmodel);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    app.debugOpen = debug.visible; // the next mission's panel opens the same way
    hud.dispose();
    debug.destroy();
    ragdolls?.dispose();
    session.dispose();
    root.removeFromParent();
    disposeTree(root);
    disposeTree(viewmodel.scene);
  }

  return {
    mapId, def, events, session, sim, world, registry,
    soldier, player, health, rig, viewmodel, effects, hud, debug,
    enemiesView, teammatesView, ragdolls, aiDebug, sounds, root,
    hasEnemies,
    get enemies() { return sim.enemies; },
    get targets() { return session.targets; },
    get course() { return session.course; },
    get encounter() { return session.encounter; },
    nav: sim.nav, cover: sim.cover, noise: sim.noise,
    update, render, respawn, restart, dispose,
    setDifficulty(value) { sim.enemies?.setDifficulty(value); },
  };
}
