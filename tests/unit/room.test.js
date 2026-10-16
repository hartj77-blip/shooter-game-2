// The lobby (src/net/room.js): room codes, callsigns, joining, leaving and starting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostRoom, joinRoom, makeCode, cleanCode, cleanCallsign, CODE_LETTERS, CODE_LENGTH } from '../../src/net/room.js';
import { createLoopbackNet } from '../../src/net/transport.js';
import { createRandom } from '../../src/core/random.js';
import { sanitize } from '../../src/core/settings.js';

/** Join, letting the pretend network deliver the welcome. */
async function join(net, code, callsign) {
  const pending = joinRoom({ net, code, callsign });
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    net.advance(20);
  }
  return pending;
}

test('room codes: five letters, none that look like numbers, and typing them is forgiving', () => {
  const rng = createRandom(9);
  for (let i = 0; i < 200; i++) {
    const code = makeCode(() => rng.next());
    assert.equal(code.length, CODE_LENGTH);
    assert.ok([...code].every((c) => CODE_LETTERS.includes(c)));
  }
  assert.ok(!/[ILO]/.test(CODE_LETTERS), 'no I, L or O');
  assert.equal(cleanCode(' kqx-rt '), 'KQXRT');
  assert.equal(cleanCode('https://example.com/game/?join=kqxrt&net=local'), 'KQXRT', 'a pasted invite link works too');
  assert.equal(cleanCode('KQXR'), null, 'too short');
  assert.equal(cleanCode('KQXRO'), null, 'O is never used');
});

test('callsigns are tidied: no markup, no control characters, short, never empty', () => {
  assert.equal(cleanCallsign('  Viper   27  '), 'Viper 27');
  assert.equal(cleanCallsign('<b>Hacker</b>'), 'bHacker/b');
  assert.equal(cleanCallsign('a\u0000b\nc'), 'abc');
  assert.equal(cleanCallsign('x'.repeat(40)).length, 16);
  assert.equal(cleanCallsign('   ', 'Player 2'), 'Player 2');
  assert.equal(sanitize('callsign', 42), '', 'a saved callsign that is not text falls back to the default');
  assert.equal(sanitize('callsign', ' Ghost '), 'Ghost');
});

test('friends join into the next free slot, and everyone sees the roster', async () => {
  const net = createLoopbackNet({ delay: 10 });
  const host = await hostRoom({ net, callsign: 'Host', code: 'ABCDE', lobby: { map: 'compound' }, clock: () => net.now });
  const a = await join(net, 'abcde', 'Alpha');
  const b = await join(net, 'ABCDE', 'Bravo');
  net.advance(50);
  assert.equal(a.me, 1);
  assert.equal(b.me, 2);
  assert.deepEqual(host.roster.map((r) => r.callsign), ['Host', 'Alpha', 'Bravo']);
  assert.deepEqual(a.roster.map((r) => r.callsign), ['Host', 'Alpha', 'Bravo'], 'the first friend heard about the second');
  assert.equal(a.lobby.map, 'compound');
  host.setLobby({ map: 'proving-ground' });
  net.advance(50);
  assert.equal(b.lobby.map, 'proving-ground');
  host.close();
});

test('a wrong code, a full room and a different version are all explained', async () => {
  const net = createLoopbackNet();
  const host = await hostRoom({ net, callsign: 'Host', code: 'FGHJK' });
  await assert.rejects(join(net, 'MNPQR', 'Lost'), /No game with that code/);
  await assert.rejects(join(net, 'MNP', 'Lost'), /5 letters/);
  for (const name of ['A', 'B', 'C']) await join(net, 'FGHJK', name);
  await assert.rejects(join(net, 'FGHJK', 'Fifth'), /full/);
  // An older (or newer) game version is turned away politely.
  const link = await net.connect('FGHJK');
  const said = [];
  link.onMessage((m) => said.push(m));
  link.send({ t: 'hello', callsign: 'Old', version: -1 });
  net.advance(10);
  assert.equal(said[0]?.reason, 'version');
  host.close();
});

test('start: everyone is told; a late joiner is told straight away; "loaded" reaches the host', async () => {
  const net = createLoopbackNet({ delay: 5 });
  const host = await hostRoom({ net, callsign: 'Host', code: 'STUVW' });
  const a = await join(net, 'STUVW', 'Alpha');
  const starts = [];
  a.on('start', (lobby) => starts.push(lobby.map));
  const loaded = [];
  host.on('loaded', (m) => loaded.push(m.slot));
  host.setLobby({ map: 'compound' });
  host.start();
  net.advance(20);
  assert.deepEqual(starts, ['compound']);
  a.loaded();
  net.advance(20);
  assert.deepEqual(loaded, [1]);
  // Joining mid-game: the start comes with the welcome.
  const room = await join(net, 'STUVW', 'Late');
  assert.equal(room.lobby.started, true, 'they know a game is on, so they load it');
  host.close();
});

test('leaving: the host hears about it; the host closing sends everyone home with a reason', async () => {
  const net = createLoopbackNet({ delay: 5 });
  const host = await hostRoom({ net, callsign: 'Host', code: 'XYZAB' });
  const a = await join(net, 'XYZAB', 'Alpha');
  const b = await join(net, 'XYZAB', 'Bravo');
  const left = [];
  host.on('leave', (m) => left.push(m.callsign));
  a.close();
  net.advance(20);
  assert.deepEqual(left, ['Alpha']);
  assert.deepEqual(host.roster.map((r) => r.slot), [0, 2]);
  const closed = [];
  b.on('closed', (e) => closed.push(e.message));
  host.close('ended');
  net.advance(20);
  assert.deepEqual(closed, ['The host ended the game.']);
  // The freed slot is reused by the next friend.
  const host2 = await hostRoom({ net, callsign: 'Host', code: 'CDEFG' });
  await join(net, 'CDEFG', 'One');
  host2.close();
});
