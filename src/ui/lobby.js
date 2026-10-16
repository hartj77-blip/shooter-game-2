// The lobby screen: the room code, who's in, the host's choices, Start.
//
// It only shows a room (net/room.js) and reports button presses; main.js
// decides what they do. Callsigns come from other players, so they're only
// ever put on the page as text (textContent), never as HTML.

import { SLOT_COLORS, ROOM_SIZE } from '../net/room.js';

export function createLobbyUi() {
  const el = (id) => document.getElementById(id);
  const code = el('roomCode');
  const roster = el('roster');
  const map = el('lobbyMap');
  const difficulty = el('lobbyDifficulty');
  const info = el('lobbyInfo');
  const error = el('lobbyError');
  const start = el('btnStart');
  const copy = el('btnCopyLink');

  function row(slot, member, room) {
    const li = document.createElement('li');
    li.style.setProperty('--c', SLOT_COLORS[slot]);
    const dot = document.createElement('i');
    dot.className = 'dot';
    const name = document.createElement('b');
    const who = document.createElement('span');
    who.className = 'who';
    const ping = document.createElement('span');
    ping.className = 'ping';
    if (member) {
      name.textContent = member.callsign;
      who.textContent = [slot === 0 ? 'Host' : '', slot === room.me ? 'You' : ''].filter(Boolean).join(' · ');
      if (slot !== 0 && member.ping != null) {
        ping.textContent = `${member.ping} ms`;
        ping.classList.toggle('bad', member.ping > 150);
        ping.title = 'Ping: how long a message takes to the host and back';
      }
      if (slot !== 0 && !member.loaded && room.lobby?.started) ping.textContent = 'loading…';
    } else {
      li.className = 'empty';
      name.textContent = 'Waiting for a friend…';
    }
    li.append(dot, name, who, ping);
    return li;
  }

  return {
    /**
     * @param {object|null} room
     * @param {object} [opts] { info, error } shown while there's no room yet (connecting, failed)
     */
    render(room, { info: note = null, error: problem = null } = {}) {
      code.textContent = room?.code ?? '· · · · ·';
      copy.disabled = !room;
      const members = room?.roster ?? [];
      roster.replaceChildren(...Array.from({ length: ROOM_SIZE }, (_, slot) => row(slot, members.find((m) => m.slot === slot), room)));
      const host = room?.role === 'host';
      if (room?.lobby) {
        map.value = room.lobby.map;
        difficulty.value = room.lobby.difficulty;
      }
      map.disabled = difficulty.disabled = !host;
      start.hidden = !host;
      let text = note ?? '';
      if (room && !note) {
        if (host) text = members.length < 2 ? 'Share the room code or the invite link. You can also start on your own and friends can join in later.' : 'Everyone in? Press Start.';
        else text = room.lobby?.started ? 'Joining the game in progress…' : 'Waiting for the host to start…';
      }
      info.textContent = text;
      error.textContent = problem ?? '';
      error.hidden = !problem;
    },
  };
}
