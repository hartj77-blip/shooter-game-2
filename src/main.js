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
//     title --Play solo--> playing <--Esc / Resume--> paused --Quit--> title
//       │                     ▲  │
//       ├─Host co-op──> lobby ┘  └─mission complete──> debrief --Play again--> playing
//       └─Join co-op──> join ──> lobby                         (or back to the lobby / title)
//
// Co-op: a ROOM (net/room.js) is the lobby; the mission plays through a host
// or client session (net/host.js, net/client.js). Solo play needs none of it.
//
// Handy URL options (add them after the address, like ?map=compound&debug):
//   ?map=NAME   which map: proving-ground (default), compound, or a mission (harbour-rescue...)
//   ?debug      open the tuning panel straight away
//   ?autostart  skip the title screen (the automated browser test uses this)
//   ?join=CODE  open the "join" screen with this room code (invite links)
//   ?net=local  co-op between tabs of this browser, without the internet
//   ?nolock     don't capture the mouse (automated tests)

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
import { hostRoom, joinRoom, cleanCode } from './net/room.js';
import { createPeerNet, createLocalNet } from './net/transport.js';
import { loadPeer } from './net/peer-loader.js';
import { createLobbyUi } from './ui/lobby.js';
import { fillDebrief } from './ui/debrief.js';
import { createVoice } from './net/voice.js';
import provingGround from '../levels/proving-ground.js';
import compound from '../levels/compound.js';
import harbour from '../levels/harbour.js';
import { missionLevels } from '../levels/missions.js';

// Every map you can pick: the practice maps, and each mission (a map with a job attached).
const LEVELS = { 'proving-ground': provingGround, compound, ...missionLevels({ harbour }) };
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
  input.requireLock = !params.has('autostart') && !params.has('nolock');

  let mission = null; // the map being played (src/mission.js)
  const loop = createLoop({
    update(dt) {
      mission?.update(dt, flow.is('playing'));
    },
    render(alpha, dt) {
      if (mission) {
        mission.render(alpha, dt, flow.is('playing'));
        audio.update(view.camera);
      }
      if (voice) {
        // Hold V for the squad radio (only while playing: the keys are menus' otherwise).
        voice.setRadio(input.isHeld('radio'));
        voice.update(dt, { positionOf: mission?.room ? mission.positionOf : null, listener: view.camera.position });
        if (flow.is('lobby')) lobbyUi.talking((slot) => voice.talking(slot));
      }
    },
  });
  const app = { view, audio, input, settings, loop, debugOpen: params.has('debug') };

  // ---------------------------------------------------------------- game flow
  /** A menu screen over the 3D view (the game stops listening to the keyboard). */
  const menuState = (screen, after = () => {}) => ({
    enter() {
      input.enabled = false;
      input.clear();
      input.unlockPointer();
      mission?.hud.show(false);
      menus.only(screen);
      document.body.classList.remove('playing');
      after();
    },
  });
  const el = (id) => document.getElementById(id);
  const flow = createStateMachine({
    title: menuState('title'),
    join: menuState('join', () => el('joinCode').focus()),
    lobby: menuState('lobby'),
    debrief: menuState('debrief'),
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
        setUpPauseMenu();
        menus.only('pause');
        document.body.classList.remove('playing');
      },
    },
  }, (from, to) => appEvents.emit('game:state', { from, to }));

  // ---------------------------------------------------------------- loading maps
  let busy = Promise.resolve();
  // Which menu screen goes with each state, to bring back after loading.
  const SCREEN = { title: 'title', join: 'join', lobby: 'lobby', paused: 'pause' };
  /**
   * Swap to map `id`: unload the current mission, build the new one. One at a time.
   * @param {object} [opts.room] co-op: play it with this room (otherwise solo)
   */
  function openMap(id, { room: withRoom = null } = {}) {
    busy = busy.then(async () => {
      if (mission?.mapId === id && (mission.room ?? null) === withRoom) return;
      menus.only('loading');
      menus.setLoading(0.72, `Loading ${LEVELS[id].name}…`);
      const old = mission;
      mission = null; // the loop stops touching it straight away
      clearTimeout(debriefTimer);
      old?.dispose();
      mission = await loadMission({ app, mapId: id, def: LEVELS[id], room: withRoom, onProgress: (k, text) => menus.setLoading(k, text) });
      watchMission(mission);
      try { localStorage.setItem('fireteam.map', id); } catch { /* not remembered, that's all */ }
      if (params.get('map') !== id) {
        params.set('map', id);
        history.replaceState(null, '', `?${params}`); // a reload stays on this map
      }
      for (const b of document.querySelectorAll('.map')) b.setAttribute('aria-checked', String(b.dataset.map === id));
      document.getElementById('btnRespawn').textContent = mission.def.mission ? 'Restart the mission' : mission.hasEnemies ? 'Restart the fight' : 'Back to spawn';
      menus.setLoading(1, 'Ready');
      menus.hide('loading');
      const screen = SCREEN[flow.state];
      if (screen) menus.show(screen); // back to where you were
    });
    return busy;
  }

  // ---------------------------------------------------------------- the debrief
  // A mission won: give the helicopter a moment to lift off, then show how it went.
  let debriefTimer = 0;
  function watchMission(m) {
    if (!m.def.mission) return;
    m.events.on('mission:complete', (r) => {
      clearTimeout(debriefTimer);
      debriefTimer = setTimeout(() => {
        if (mission !== m || !(flow.is('playing') || flow.is('paused'))) return;
        const role = !m.room ? 'solo' : m.room.role === 'host' ? 'host' : 'client';
        fillDebrief(r, m.def.mission, { nameOf: m.nameOf, role });
        flow.go('debrief');
      }, 2500);
    });
    // Co-op: the host chose "Play again", so a friend's debrief closes and they're back in.
    m.events.on('mission:restart', () => {
      clearTimeout(debriefTimer);
      if (mission === m && m.room?.role === 'client' && flow.is('debrief')) play();
    });
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

  // ---------------------------------------------------------------- co-op
  let net = null;  // how we reach other players (made when first needed)
  let room = null; // the lobby we're hosting or have joined
  let voice = null; // voice chat while in a room (net/voice.js)
  const local = params.get('net') === 'local';
  const lobbyUi = createLobbyUi();

  async function getNet() {
    if (!net) net = local ? createLocalNet() : createPeerNet(await loadPeer());
    return net;
  }
  function dropNet() {
    if (local) return; // the tab-to-tab channel can stay
    net?.close?.();
    net = null;
  }
  /** Voice chat: from the moment you're in a lobby until you leave it. */
  function startVoice(r) {
    voice = createVoice({ audio, settings: settings.values, room: r, peer: local ? null : net?.peer ?? null });
    app.voice = voice;
    r.on('radio', ({ slot, on }) => voice?.setTalkerRadio(slot, on));
    r.on('change', () => voice?.connect());
    voice.start().then(() => { if (room === r && flow.is('lobby')) lobbyUi.render(r, { voice: voiceStatus() }); });
  }
  function stopVoice() {
    voice?.dispose();
    voice = null;
    app.voice = null;
  }
  function voiceStatus() {
    if (!voice || settings.values.voiceMode === 'off') return 'Voice chat is off (Settings).';
    if (voice.problem) return voice.problem;
    if (!voice.linked) return 'Voice chat needs the online game (not ?net=local).';
    return voice.hasMic ? 'Voice on: hold V for the squad radio; teammates close by hear you anyway.' : 'Asking for your microphone…';
  }

  /** A message on the title screen ("The host left the game."). */
  function notice(text) {
    el('notice').textContent = text ?? '';
    el('notice').hidden = !text;
  }
  const inviteLink = () => `${location.origin}${location.pathname}?join=${room.code}${local ? '&net=local' : ''}`;

  async function hostCoop() {
    audio.unlock(); // voice chat needs sound on, and this click allows it
    notice(null);
    flow.go('lobby');
    lobbyUi.render(null, { info: local ? 'Opening a room for other tabs…' : 'Opening a room on the matchmaking service…' });
    try {
      room = await hostRoom({
        net: await getNet(), callsign: settings.values.callsign,
        lobby: { map: mission?.mapId ?? pickMap(), difficulty: settings.values.difficulty },
      });
      watchRoom(room);
      startVoice(room);
      lobbyUi.render(room, { voice: voiceStatus() });
    } catch (err) {
      dropNet();
      lobbyUi.render(null, { error: err.message });
    }
  }

  async function joinCoop(text) {
    const error = el('joinError');
    error.hidden = true;
    const code = cleanCode(text);
    if (!code) {
      error.textContent = 'Room codes are 5 letters, like KQXRT.';
      error.hidden = false;
      return;
    }
    el('btnJoinGo').disabled = true;
    audio.unlock();
    try {
      const n = await getNet();
      room = await joinRoom({ net: n, code, callsign: settings.values.callsign, peer: n.id ?? null });
      watchRoom(room);
      startVoice(room);
      notice(null);
      flow.go('lobby');
      lobbyUi.render(room, { voice: voiceStatus() });
      if (room.lobby.started) playCoop(); // a game in progress: straight in
    } catch (err) {
      dropNet();
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      el('btnJoinGo').disabled = false;
    }
  }

  function watchRoom(r) {
    r.on('change', () => { if (room === r && flow.is('lobby')) lobbyUi.render(r, { voice: voiceStatus() }); });
    if (r.role !== 'client') return;
    r.on('start', () => { if (room === r) playCoop(); });
    r.on('stop', () => { if (room === r) backToLobby(); });
    r.on('closed', ({ message }) => { if (room === r) leaveCoop(message); });
  }

  /** Into the game: the host builds it first, then tells everyone; a client follows. */
  async function playCoop() {
    const r = room;
    await openMap(r.lobby.map, { room: r });
    if (room !== r) return;
    if (r.role === 'host') r.start();
    play();
  }

  /** The mission ends but the room stays (the host chose "End game"). */
  async function backToLobby() {
    if (room?.role === 'host') room.stop();
    flow.go('lobby');
    await openMap(mission?.mapId ?? room.lobby.map); // a solo copy, as the backdrop
    if (room) lobbyUi.render(room, { voice: voiceStatus() });
  }

  /** Leave the room altogether (or it closed under us), back to the title screen. */
  async function leaveCoop(message = null) {
    const r = room;
    room = null;
    stopVoice();
    r?.close();
    dropNet();
    flow.go('title');
    notice(message);
    if (mission?.room) await openMap(mission.mapId);
  }

  /** The pause menu's buttons depend on how you're playing. */
  function setUpPauseMenu() {
    const coop = !!mission?.room;
    const hosting = mission?.room?.role === 'host';
    el('btnRespawn').hidden = coop && !hosting;
    el('btnMaps').hidden = coop;
    el('btnQuit').textContent = !coop ? 'Quit to title' : hosting ? 'End game (back to lobby)' : 'Leave game';
    el('pauseCoop').hidden = !coop;
    // Mute anyone (voice chat).
    const list = el('muteList');
    const others = coop && voice ? room.roster.filter((m) => m.slot !== room.me) : [];
    list.hidden = !others.length;
    list.replaceChildren(...others.map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      const label = () => {
        const on = voice.isMuted(m.slot);
        b.textContent = `${on ? 'Unmute' : 'Mute'} ${m.callsign}`;
        b.setAttribute('aria-pressed', String(on));
      };
      label();
      b.addEventListener('click', () => { voice.mute(m.slot, !voice.isMuted(m.slot)); label(); });
      return b;
    }));
  }

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
      else if (flow.is('join')) flow.go('title');
    }
  });

  // The map picker on the title screen.
  for (const button of document.querySelectorAll('.map')) {
    button.addEventListener('click', () => openMap(button.dataset.map));
  }

  const restartOrRespawn = () => (mission.hasEnemies ? mission.restart() : mission.respawn());
  const on = (id, fn) => el(id).addEventListener('click', fn);
  on('btnDeploy', () => { notice(null); busy.then(play); });
  on('btnResume', play);
  on('btnRespawn', () => { restartOrRespawn(); play(); });
  on('btnMaps', () => { mission.restart(); flow.go('title'); });
  on('btnQuit', () => {
    if (!mission.room) { mission.restart(); flow.go('title'); } else if (mission.room.role === 'host') backToLobby(); else leaveCoop();
  });

  // Debrief buttons.
  on('btnAgain', () => { mission.restart(); play(); });
  on('btnDebriefLobby', () => { if (mission.room?.role === 'host') backToLobby(); else leaveCoop(); });
  on('btnDebriefTitle', () => { mission.restart(); flow.go('title'); });

  // Co-op buttons.
  on('btnHost', hostCoop);
  on('btnJoin', () => { notice(null); flow.go('join'); });
  on('btnJoinBack', () => flow.go('title'));
  el('joinForm').addEventListener('submit', (e) => { e.preventDefault(); joinCoop(el('joinCode').value); });
  on('btnStart', () => { if (room?.role === 'host') playCoop(); });
  on('btnLeave', () => leaveCoop());
  on('btnCopyLink', async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(inviteLink());
      el('btnCopyLink').textContent = 'Copied!';
    } catch {
      el('btnCopyLink').textContent = inviteLink(); // can't copy: show it so it can be copied by hand
    }
    setTimeout(() => { el('btnCopyLink').textContent = 'Copy invite link'; }, 2500);
  });
  el('lobbyMap').addEventListener('change', (e) => room?.role === 'host' && room.setLobby({ map: e.target.value }));
  el('lobbyDifficulty').addEventListener('change', (e) => room?.role === 'host' && room.setLobby({ difficulty: e.target.value }));
  const callsign = el('callsign');
  callsign.value = settings.values.callsign;
  callsign.addEventListener('change', () => { settings.set('callsign', callsign.value); callsign.value = settings.values.callsign; });
  on('btnSettingsT', () => menus.openSettings());
  on('btnSettingsP', () => menus.openSettings());
  on('btnSettingsDone', () => menus.closeSettings());
  on('btnSettingsReset', () => { settings.reset(); menus.refresh(); });

  appEvents.on('settings:change', ({ key, value }) => {
    if (key === 'callsign') callsign.value = value;
    if (key === 'quality') view.applyQuality(value);
    if (key === 'masterVolume' || key === 'sfxVolume') audio.applyVolumes();
    if (key === 'difficulty') mission?.setDifficulty(value);
  });

  if (matchMedia('(pointer: coarse)').matches) document.getElementById('touchNote').hidden = false;

  await openMap(pickMap());
  loop.start();
  if (params.has('autostart')) flow.go('playing');
  else if (params.has('join')) {
    // An invite link: the code is filled in, ready to press Join.
    el('joinCode').value = params.get('join');
    params.delete('join');
    history.replaceState(null, '', `?${params}`);
    flow.go('join');
  } else flow.go('title');

  // A handle for poking at the game from the browser's developer console, e.g.
  //   fireteam.player.tuning.gravity = 5
  //   fireteam.enemies.options.freeze = true
  // Everything after `mission` belongs to the map being played, so it changes when the map does.
  window.fireteam = {
    input, loop, view, flow, settings, audio, app, openMap, hostCoop, joinCoop, ready: true,
    get mission() { return mission; },
    get room() { return room; },
    get voice() { return voice; },
    get session() { return mission?.session; },
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
