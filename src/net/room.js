// A room: the lobby where up to four players gather, before and during a game.
//
// The host opens a room on a CODE, five letters like KQXRT. Friends join by
// typing it, or by opening the invite link (…?join=KQXRT). The room keeps the
// ROSTER: who's in which slot (0 is the host, 1 to 3 are friends), their
// callsigns (names in game) and their pings (how many milliseconds a message
// takes there and back).
//
// The host picks the map and difficulty and presses Start. Every browser loads
// the map, then says "loaded", and only then does the host's session
// (net/host.js) add that player's soldier. Joining a game already in progress
// works the same way: welcome, start, load, loaded.
//
// Lobby messages (the in-game ones are in net/protocol.js):
//   client → host   hello { callsign, version, peer }   loaded {}   rpong { at }   radio { on }
//   host → client   welcome { slot, code, roster, lobby }   roster { roster }   lobby { lobby }
//                   start { lobby }   bye { reason }   rping { at }   radio { slot, on }
//
// "radio" says someone pressed or let go of V, so every browser plays their
// voice through the radio filter (net/voice.js) and clicks like a handset.
//
// Runs in Node: the tests use the pretend network.

import { createEvents } from '../core/events.js';
import { cleanText } from '../core/settings.js';
import { PROTOCOL_VERSION } from './protocol.js';
import { NetError } from './transport.js';

export const ROOM_SIZE = 4;
// No I, L or O: they're too easy to mistake for 1, 1 and 0 when read out loud.
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 5;
// Each slot's colour, used in the roster, on name tags and on map markers.
export const SLOT_COLORS = ['#e8b14a', '#5ec8ff', '#8fdc6a', '#e07ad8'];

const PING_EVERY = 2000; // ms between lobby pings

/** A fresh room code. */
export function makeCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}

/** A typed or pasted code (or a whole invite link) as a proper code, or null if it can't be one. */
export function cleanCode(text) {
  let s = String(text ?? '');
  const fromLink = s.match(/[?&]join=([A-Za-z]+)/);
  if (fromLink) s = fromLink[1];
  const code = s.toUpperCase().replace(/[^A-Z]/g, '');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_LETTERS.includes(c)) ? code : null;
}

/** A callsign as shown to everyone: tidy, short, never empty. */
export const cleanCallsign = (text, fallback = 'Player') => cleanText(text, 16) || fallback;

const BYE = {
  full: 'That game is full (4 players).',
  version: 'That game is running a different version of Fireteam. Both of you reload the page and try again.',
  ended: 'The host ended the game.',
  left: 'The host left the game.',
};

// Timers that shouldn't keep a Node test running.
const later = (fn, ms) => {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return t;
};
const every = (fn, ms) => {
  const t = setInterval(fn, ms);
  t.unref?.();
  return t;
};

/**
 * Open a room as its host.
 * @param {object} opts
 * @param {object} opts.net         net/transport.js
 * @param {string} opts.callsign
 * @param {string} [opts.code]
 * @param {object} [opts.lobby]     { map, difficulty }
 */
export async function hostRoom({ net, callsign, code = makeCode(), lobby: start = {}, clock = () => performance.now() }) {
  const listener = await net.listen(code);
  const events = createEvents();
  const members = new Map();
  members.set(0, { slot: 0, callsign: cleanCallsign(callsign, 'Player 1'), ping: 0, link: null, peer: listener.id, loaded: true });
  const lobby = { map: 'compound', difficulty: 'regular', started: false, ...start };
  let open = true;

  const roster = () => [...members.values()]
    .sort((a, b) => a.slot - b.slot)
    .map(({ slot, callsign: name, ping, peer, loaded }) => ({ slot, callsign: name, ping, peer, loaded }));
  const broadcast = (msg) => { for (const m of members.values()) m.link?.send(msg); };
  const tell = () => {
    broadcast({ t: 'roster', roster: roster() });
    events.emit('change', {});
  };
  const freeSlot = () => {
    for (let s = 1; s < ROOM_SIZE; s++) if (!members.has(s)) return s;
    return null;
  };
  const goodbye = (link, reason) => {
    link.send({ t: 'bye', reason });
    later(() => link.close(), 1000); // give the message a moment to arrive first
  };

  listener.onLink((link) => {
    let member = null;
    link.onMessage((msg) => {
      if (!member) {
        if (msg.t !== 'hello') return;
        if (msg.version !== PROTOCOL_VERSION) return goodbye(link, 'version');
        const slot = freeSlot();
        if (slot === null || !open) return goodbye(link, 'full');
        member = { slot, callsign: cleanCallsign(msg.callsign, `Player ${slot + 1}`), ping: null, link, peer: msg.peer ?? null, loaded: false };
        members.set(slot, member);
        link.send({ t: 'welcome', slot, code, roster: roster(), lobby });
        if (lobby.started) link.send({ t: 'start', lobby }); // a game in progress: load it and join in
        events.emit('join', member);
        tell();
        return;
      }
      if (msg.t === 'loaded') {
        member.loaded = true;
        events.emit('loaded', member);
        tell();
      } else if (msg.t === 'rpong') {
        member.ping = Math.round(clock() - msg.at);
      } else if (msg.t === 'radio') {
        member.radio = !!msg.on;
        for (const m of members.values()) if (m !== member) m.link?.send({ t: 'radio', slot: member.slot, on: member.radio });
        events.emit('radio', { slot: member.slot, on: member.radio });
      }
    });
    link.onClose(() => {
      if (!member || members.get(member.slot) !== member) return;
      members.delete(member.slot);
      events.emit('leave', member);
      tell();
    });
  });

  // Ping everyone now and then, and share the numbers.
  const pinger = every(() => {
    for (const m of members.values()) m.link?.send({ t: 'rping', at: clock() }, { reliable: false });
    if (members.size > 1) tell();
  }, PING_EVERY);

  return {
    role: 'host',
    code,
    me: 0,
    lobby,
    members,
    get roster() { return roster(); },
    on: events.on,
    /** Change the map or difficulty (the lobby updates everywhere). */
    setLobby(patch) {
      Object.assign(lobby, patch);
      broadcast({ t: 'lobby', lobby });
      events.emit('change', {});
    },
    /** You pressed or let go of V. */
    setRadio(on) {
      broadcast({ t: 'radio', slot: 0, on: !!on });
    },
    /** Everyone load the map and play. */
    start() {
      lobby.started = true;
      for (const m of members.values()) if (m.link) m.loaded = false;
      broadcast({ t: 'start', lobby });
      tell();
    },
    /** Back to the lobby (the host ended the mission). */
    stop() {
      lobby.started = false;
      broadcast({ t: 'lobby', lobby });
      tell();
    },
    /** Close the room: everyone is sent back to the title screen. */
    close(reason = 'ended') {
      if (!open) return;
      open = false;
      clearInterval(pinger);
      for (const m of members.values()) if (m.link) goodbye(m.link, reason);
      listener.close();
    },
  };
}

/**
 * Join a friend's room.
 * @param {object} opts
 * @param {object} opts.net
 * @param {string} opts.code      as typed (or the invite link)
 * @param {string} opts.callsign
 * @param {string} [opts.peer]    your peer id, so teammates can call you for voice
 */
export async function joinRoom({ net, code, callsign, peer = null }) {
  const clean = cleanCode(code);
  if (!clean) throw new NetError('code', `Room codes are ${CODE_LENGTH} letters, like KQXRT.`);
  const link = await net.connect(clean);
  const events = createEvents();
  return new Promise((resolve, reject) => {
    let joined = false;
    let reason = 'left';
    const timer = later(() => {
      if (joined) return;
      link.close();
      reject(new NetError('timeout', "The host didn't answer. Try again in a moment."));
    }, 10000);
    const room = {
      role: 'client',
      code: clean,
      me: null,
      lobby: null,
      roster: [],
      link,
      on: events.on,
      /** Tell the host this browser has built the map and is ready to play. */
      loaded() { link.send({ t: 'loaded' }); },
      /** You pressed or let go of V. */
      setRadio(on) { link.send({ t: 'radio', on: !!on }); },
      /** Leave (back to the title screen). */
      close() { reason = 'you'; link.close(); },
    };
    link.onMessage((msg) => {
      if (msg.t === 'welcome') {
        joined = true;
        clearTimeout(timer);
        Object.assign(room, { me: msg.slot, roster: msg.roster, lobby: msg.lobby });
        resolve(room);
      } else if (msg.t === 'roster') {
        room.roster = msg.roster;
        events.emit('change', {});
      } else if (msg.t === 'lobby') {
        const wasPlaying = room.lobby?.started;
        room.lobby = msg.lobby;
        events.emit('change', {});
        if (wasPlaying && !msg.lobby.started) events.emit('stop', {});
      } else if (msg.t === 'start') {
        room.lobby = msg.lobby;
        events.emit('start', msg.lobby);
      } else if (msg.t === 'rping') {
        link.send({ t: 'rpong', at: msg.at }, { reliable: false });
      } else if (msg.t === 'radio') {
        events.emit('radio', { slot: msg.slot, on: msg.on });
      } else if (msg.t === 'bye') {
        reason = msg.reason;
        if (!joined) {
          clearTimeout(timer);
          reject(new NetError(msg.reason, BYE[msg.reason] ?? 'The host turned us away.'));
        }
        link.close();
      }
    });
    link.onClose(() => {
      if (!joined) {
        clearTimeout(timer);
        reject(new NetError('closed', 'The connection closed before we got in.'));
        return;
      }
      if (reason !== 'you') events.emit('closed', { reason, message: BYE[reason] ?? BYE.left });
    });
    // (An empty callsign is fine: the host calls you "Player 2" and so on.)
    link.send({ t: 'hello', callsign: cleanText(callsign, 16), version: PROTOCOL_VERSION, peer });
  });
}
