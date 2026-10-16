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
// Three ways to play one: solo (a host session for one), hosting co-op (the
// same, plus friends' browsers connected through the room, net/room.js), or
// joining (a client session, net/client.js, that predicts you and shows the
// host's world).
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
import { createClient } from './net/client.js';
import { cleanCallsign } from './net/room.js';
import { createCameraRig } from './player/camera.js';
import { createMaterials } from './render/materials.js';
import { buildLevelView } from './render/level-view.js';
import { createViewmodel } from './render/viewmodel.js';
import { moodFor } from './render/moods.js';
import { createEffects } from './render/effects.js';
import { createTargetsView } from './render/targets-view.js';
import { createSoldiersView } from './render/soldiers-view.js';
import { SOLDIER_COLORS } from './render/soldier-model.js';
import { createRagdolls } from './render/ragdolls.js';
import { createAiDebug } from './render/ai-debug.js';
import { disposeTree } from './render/dispose.js';
import { connectGameSounds } from './audio/game-sounds.js';
import { createHud } from './ui/hud.js';
import { createSquadHud } from './ui/squad-hud.js';
import { createObjectiveHud } from './ui/objective-hud.js';
import { createMarkers, createRing } from './ui/markers.js';
import { createPropsView } from './render/props-view.js';
import { createHeliView } from './render/heli-view.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Build a mission.
 * @param {object} opts
 * @param {object} opts.app     the app shell: { view, audio, input, settings, loop, debugOpen }
 * @param {string} opts.mapId   e.g. 'compound'
 * @param {object} opts.def     the level definition (levels/*.js)
 * @param {object} [opts.room]  co-op: the room (net/room.js) we're hosting or have joined
 * @param {(fraction:number, text:string) => void} [opts.onProgress] for the loading bar
 */
export async function loadMission({ app, mapId, def, room = null, onProgress = () => {} }) {
  const { view, audio, input, settings, loop } = app;
  const joining = room?.role === 'client';
  const mapping = def.nav && !joining; // only the host's enemies need the map of where they can walk
  onProgress(0.75, mapping ? `Building ${def.name} and mapping it for the enemies…` : `Building ${def.name}…`);
  await nextFrame(); // let the loading bar show before the (slow-ish) build

  // ---------------------------------------------------------------- the session
  const events = createEvents();
  const offs = []; // room listeners, removed when the mission ends
  let session;
  if (joining) {
    session = createClient({ def, me: room.me, link: room.link, roster: room.roster, events });
  } else {
    const sim = createSim({
      def, id: mapId, events, coop: !!room,
      seed: (Math.random() * 2 ** 31) | 0,
      difficulty: room?.lobby.difficulty ?? settings.values.difficulty,
      records: createRecords(), // best times, saved in this browser
      players: [{ owner: 0, callsign: cleanCallsign(settings.values.callsign, 'Player 1') }],
    });
    session = createHost({ sim, me: 0, coop: !!room });
    if (room) {
      // A friend's browser has built the map: add their soldier. A friend left: remove it.
      offs.push(room.on('loaded', (m) => session.addClient({ slot: m.slot, link: m.link, callsign: m.callsign })));
      offs.push(room.on('leave', (m) => session.removeClient(m.slot)));
      for (const m of room.members.values()) if (m.link && m.loaded) session.addClient({ slot: m.slot, link: m.link, callsign: m.callsign });
    }
  }
  const sim = session.sim ?? null; // only the host has the real simulation
  const me = session.me;
  const { soldier, health } = session.local;
  const player = soldier.body;
  const { world, registry } = session;
  // (A co-op client meets its enemies through snapshots, so ask the level, not the list.)
  const hasEnemies = session.level.expanded.enemies.length > 0 || !!def.mission;

  // ---------------------------------------------------------------- what you see and hear
  const root = new THREE.Group();
  root.name = `mission:${mapId}`;
  view.scene.add(root);
  view.setMood(moodFor(def), def.sun);
  root.add(buildLevelView(session.level.expanded, createMaterials(view.renderer)));

  input.setLook(player.state.yaw);
  const aim = () => ({ amount: soldier.arsenal.state.ads, zoom: soldier.arsenal.current.def.ads.zoom });
  const rig = createCameraRig({ camera: view.camera, player, input, settings: settings.values, aim, events, owner: me });
  const viewmodel = createViewmodel({
    soldier, input, settings: settings.values, cameraRig: rig, worldCamera: view.camera, sunDir: view.sunDir, mood: () => view.mood, events, owner: me,
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
  // The hostage: an orange, unarmed soldier. (They can come back at a checkpoint, so no ragdoll.)
  const hostages = { get list() { return session.hostage ? [session.hostage] : []; } };
  const hostageView = def.mission
    ? createSoldiersView({
      scene: root, source: hostages, effects, world, registry, camera, events,
      colors: SOLDIER_COLORS.hostage, icons: false, downEvent: null, name: 'hostage',
    })
    : null;
  // Mission props (laptop, caches, radios, grenades in flight) and the helicopter.
  const props = createPropsView({ scene: root, session });
  const heli = session.operation ? createHeliView({ scene: root, session }) : null;
  const aiDebug = sim?.enemies ? createAiDebug(root, { enemies: sim.enemies, nav: sim.nav, cover: sim.cover, noise: sim.noise }) : null;
  const sounds = connectGameSounds({
    audio, events, soldier, cameraRig: rig, world, registry, health, owner: me,
    others: [session.enemies, session.teammates, hostages], helicopter: heli?.state ?? null,
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
  events.on('explosion', (e) => effects.explosion(e.pos, e));

  const nameOf = (owner) => (owner === me ? session.local.callsign : session.teammates.list.find((m) => m.owner === owner)?.view.callsign) ?? `Player ${owner + 1}`;
  const hud = createHud({
    soldier, settings: settings.values, loop, input, camera, events, owner: me, health,
    course: session.course, encounter: session.encounter, threats: hasEnemies ? session.enemies : null,
    coop: !!room, nameOf,
  });
  // Markers in the world and the hold-F ring are shared by the squad HUD and the objective HUD.
  const markers = createMarkers(document.getElementById('marks'), camera);
  const ring = createRing({ ring: document.getElementById('ring'), fill: document.getElementById('ringFill'), label: document.getElementById('ringText') });
  const hosting = !joining;
  const squadHud = room ? createSquadHud({ session, camera, events, hud, hosting, markers, ring, voice: () => app.voice }) : null;
  const objectiveHud = session.operation ? createObjectiveHud({ session, events, hud, markers, ring, hosting, nameOf, audio }) : null;

  // SPECTATING: once you're out (co-op), the camera rides over a teammate's
  // shoulder. Click to switch to someone else.
  let watchIndex = 0;
  let watching = null;
  const over = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  function spectate(alpha, dt) {
    const mates = session.teammates.list.filter((m) => !m.view.dead && !m.view.down);
    if (!mates.length) { watching = null; return false; }
    const v = mates[watchIndex % mates.length].view;
    watching = v.callsign ?? 'a teammate';
    const p = v.prev ?? v.pos;
    const x = p.x + (v.pos.x - p.x) * alpha, y = p.y + (v.pos.y - p.y) * alpha, z = p.z + (v.pos.z - p.z) * alpha;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    over.set(x - fx * 2.6 + fz * 0.6, y + 2.1, z - fz * 2.6 - fx * 0.6); // behind and a little to the right
    camera.position.lerp(over, 1 - Math.exp(-10 * dt));
    ahead.set(x + fx * 10, y + 1.5 + Math.sin(v.pitch) * 10, z + fz * 10);
    camera.lookAt(ahead);
    return true;
  }

  /** Just you, back to your spawn. */
  function respawn() {
    session.respawn();
    input.setLook(player.state.yaw);
    rig.snap();
  }

  /** Everyone on screen is new after a restart or a retry. */
  function resetViews() {
    enemiesView?.reset();
    teammatesView.reset();
    hostageView?.reset();
    props.reset();
  }

  /** Start the fight again: everyone back where they began. */
  function restart() {
    session.restart();
    resetViews();
    input.setLook(player.state.yaw);
    rig.snap();
  }

  /** A mission: back to the last checkpoint. */
  let failedFor = 0;
  function retry() {
    session.retry();
    resetViews();
    input.setLook(player.state.yaw);
    rig.snap();
  }

  const debug = createDebugPanel({
    scene: root, world, player, rig, loop,
    arsenal: soldier.arsenal, effects, hud, enemies: sim?.enemies ?? null, aiDebug, health, director: sim?.director ?? null,
    onRespawn: hasEnemies ? restart : respawn,
    visible: app.debugOpen,
  });

  // A co-op game restarting (the host pressed it): rebuild the soldiers on screen.
  events.on('mission:restart', () => resetViews());

  /** One fixed step of the game. */
  function update(dt, playing) {
    // Paused: a solo game stops, a co-op game carries on without you.
    if (!playing && session.pausable) return;
    const cmd = playing ? input.sample() : idleCommand(input.yaw, input.pitch);
    if (health.state.dead && cmd.firePressed) watchIndex++; // spectating: watch someone else
    // Down in a solo fight (or the whole squad down, if you're the co-op host): R starts again.
    // A mission retries from its last checkpoint instead, and "failed" includes the
    // hostage bleeding out while you're still standing.
    const failed = session.operation?.state === 'failed';
    if (failed) failedFor += dt; else failedFor = 0;
    const allDown = session.pausable || session.encounter?.state === 'down';
    if (session.role === 'host' && cmd.reload && (failed ? failedFor > 0.8 : health.state.down && health.state.downTime > 0.8 && allDown)) {
      if (session.operation) retry();
      else restart();
      return;
    }
    const out = session.step(dt, cmd);
    input.addLook(out.look.yaw, out.look.pitch); // recoil moves your aim
    sounds.tick();
    // A co-op client runs a touch faster or slower to keep the host's command cushion right.
    if (joining) loop.timeScale = session.rate;
  }

  /** Draw a frame. `alpha` is how far we are between the last two ticks. */
  function render(alpha, dt, playing) {
    // While aiming, slow the mouse down to match the zoom.
    const ads = soldier.arsenal.state.ads;
    input.lookScale = 1 + ((settings.values.adsSensitivity / aim().zoom) - 1) * ads;
    rig.downTarget = health.state.down ? 1 : 0;
    if (session.correction) {
      // The host corrected our prediction: glide the camera over the gap rather than jump.
      const c = session.correction;
      const k = Math.exp(-12 * dt);
      c.x *= k; c.y *= k; c.z *= k;
      rig.offset = c;
    }
    const spectating = health.state.dead && spectate(alpha, dt);
    if (!spectating) rig.update(alpha, dt);
    view.followWithShadows(view.camera.position);
    viewmodel.update(dt);
    effects.update(dt);
    targetsView.update(dt);
    enemiesView?.update(dt, alpha);
    teammatesView.update(dt, alpha);
    hostageView?.update(dt, alpha);
    props.update(dt, alpha);
    heli?.update(dt);
    ragdolls?.update(dt);
    aiDebug?.update();
    sounds.frame(dt);
    hud.update(dt, { playing });
    markers.begin();
    ring.begin();
    squadHud?.update(dt, { watching: spectating ? watching : null });
    objectiveHud?.update(dt);
    markers.end();
    ring.end();
    debug.update(alpha);
    // No gun in your face in the debug third-person view, or once you're down.
    view.render(rig.tuning.thirdPerson || health.state.down ? null : viewmodel);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    app.debugOpen = debug.visible; // the next mission's panel opens the same way
    for (const off of offs) off();
    if (joining) loop.timeScale = 1;
    hud.dispose();
    squadHud?.dispose();
    objectiveHud?.dispose();
    markers.dispose();
    ring.dispose();
    sounds.dispose();
    effects.dispose();
    debug.destroy();
    ragdolls?.dispose();
    session.dispose();
    root.removeFromParent();
    disposeTree(root);
    disposeTree(viewmodel.scene);
  }

  if (joining) room.loaded(); // tell the host we're ready for our soldier

  /** Where teammate `owner`'s head is (for nearby voice), or null if they're not here. */
  function positionOf(owner) {
    const v = session.teammates.list.find((m) => m.owner === owner)?.view;
    if (!v) return null;
    return { x: v.pos.x, y: v.pos.y + (v.down ? 0.5 : v.crouched ? 1.0 : 1.6), z: v.pos.z };
  }

  return {
    positionOf, nameOf,
    mapId, def, room, events, session, sim, world, registry,
    soldier, player, health, rig, viewmodel, effects, hud, debug,
    enemiesView, teammatesView, hostageView, props, heli, ragdolls, aiDebug, sounds, root,
    hasEnemies,
    get enemies() { return sim?.enemies ?? null; },
    get targets() { return session.targets; },
    get course() { return session.course; },
    get encounter() { return session.encounter; },
    get operation() { return session.operation; },
    nav: sim?.nav ?? null, cover: sim?.cover ?? null, noise: sim?.noise ?? null,
    update, render, respawn, restart, retry, dispose,
    setDifficulty(value) { if (!room) sim?.enemies?.setDifficulty(value); }, // co-op: the host's lobby choice
  };
}
