// Transports: how messages get from one player's browser to another's.
//
// The rest of the game only ever sees a LINK: a connection to one other player.
//   link.remote                    who's at the other end
//   link.send(msg, { reliable })   reliable (the default): arrives, in order, like a
//                                  recorded letter. Unreliable: faster, but may be lost
//                                  or overtaken, like shouting across a room. Snapshots and
//                                  commands are shouts (a newer one is coming anyway);
//                                  everything else is a letter.
//   link.onMessage(fn)             fn(msg)
//   link.onClose(fn)
//   link.close()
//
// A NET makes links. The host listens on a room code; clients connect to it.
//   net.listen(code) → Promise<{ id, onLink(fn), close() }>
//   net.connect(code) → Promise<link>
//
// Three nets, same shape:
//   createPeerNet       the real internet, through WebRTC (PeerJS; see net/peer-loader.js)
//   createLocalNet      two tabs on one computer (BroadcastChannel). Add ?net=local to try co-op alone
//   createLoopbackNet   a pretend network for the tests, with adjustable delay, jitter and loss

import { createRandom } from '../core/random.js';

export const peerIdFor = (code) => `fireteam-${code}`;

/** Friendly words for what went wrong, for the lobby screen. */
export class NetError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** The part every link shares: listeners, and turning "it closed" into one call. */
function linkBase(remote) {
  const onMsg = new Set();
  const onClose = new Set();
  const link = {
    remote,
    open: true,
    onMessage(fn) { onMsg.add(fn); return () => onMsg.delete(fn); },
    onClose(fn) { onClose.add(fn); return () => onClose.delete(fn); },
    deliver(msg) { if (link.open) for (const fn of [...onMsg]) fn(msg); },
    closed() {
      if (!link.open) return;
      link.open = false;
      for (const fn of [...onClose]) fn();
    },
  };
  return link;
}

// ------------------------------------------------------------------ loopback (tests)

/**
 * A pretend network that lives in one program. Time only moves when the test
 * says so (advance), so tests are exact and repeatable.
 * @param {object} [opts]
 * @param {number} [opts.delay]  milliseconds each way
 * @param {number} [opts.jitter] extra random delay, 0 to this many milliseconds
 * @param {number} [opts.loss]   share of unreliable messages that vanish (0 to 1)
 */
export function createLoopbackNet({ delay = 0, jitter = 0, loss = 0, seed = 1 } = {}) {
  const rng = createRandom(seed);
  const queue = [];
  const hosts = new Map();
  let order = 0;
  let nextId = 1;

  const net = {
    delay, jitter, loss,
    now: 0,
    sent: 0,       // messages sent, and bytes (as JSON), for bandwidth checks
    bytes: 0,
    lost: 0,

    /** Move time forward and deliver everything that has arrived by then. */
    advance(ms) {
      net.now += ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at || a.order - b.order);
        if (!queue.length || queue[0].at > net.now) break;
        queue.shift().fn();
      }
    },

    async listen(code) {
      const id = peerIdFor(code);
      if (hosts.has(id)) throw new NetError('taken', 'That room code is already in use.');
      const onLink = new Set();
      hosts.set(id, { onLink });
      return {
        id,
        onLink(fn) { onLink.add(fn); },
        close() { hosts.delete(id); },
      };
    },

    async connect(code) {
      const host = hosts.get(peerIdFor(code));
      if (!host) throw new NetError('missing', 'No game with that code. Check the code and that the host is still in the lobby.');
      const [mine, theirs] = pair(`loop-${nextId++}`, peerIdFor(code));
      for (const fn of host.onLink) fn(theirs);
      return mine;
    },
  };

  function pair(clientId, hostId) {
    const a = end(hostId);
    const b = end(clientId);
    a.other = b;
    b.other = a;
    return [a, b];
  }

  function end(remote) {
    const link = linkBase(remote);
    let lastReliable = 0;
    const schedule = (at, fn) => queue.push({ at, order: order++, fn });
    link.send = (msg, { reliable = true } = {}) => {
      if (!link.open) return;
      const text = JSON.stringify(msg); // what a wire does: only data crosses, never shared objects
      net.sent++;
      net.bytes += text.length;
      if (!reliable && rng.next() < net.loss) { net.lost++; return; }
      let at = net.now + net.delay + rng.range(0, net.jitter);
      if (reliable) { at = Math.max(at, lastReliable); lastReliable = at; } // letters stay in order
      schedule(at, () => link.other.deliver(JSON.parse(text)));
    };
    link.close = () => {
      if (!link.open) return;
      link.closed();
      schedule(net.now + net.delay, () => link.other.closed());
    };
    return link;
  }

  return net;
}

// ------------------------------------------------------------------ BroadcastChannel (two tabs)

/**
 * Co-op between tabs of the same browser on one computer: no internet needed.
 * Every tab hears every message on the channel and keeps the ones addressed to it.
 */
export function createLocalNet(channelName = 'fireteam-local') {
  const me = `tab-${Math.random().toString(36).slice(2, 10)}`;
  const channel = new BroadcastChannel(channelName);
  const links = new Map(); // link id -> link
  const listening = new Map(); // host id -> onLink listeners
  const waiting = new Map(); // link id -> resolve, while connecting
  const post = (m) => channel.postMessage(m);

  function makeLink(id, remote, remoteTab) {
    const link = linkBase(remote);
    link.send = (msg) => { if (link.open) post({ kind: 'msg', link: id, to: remoteTab, msg }); };
    link.close = () => {
      if (!link.open) return;
      post({ kind: 'close', link: id, to: remoteTab });
      link.closed();
      links.delete(id);
    };
    links.set(id, link);
    return link;
  }

  channel.onmessage = ({ data: m }) => {
    if (m.kind === 'connect' && listening.has(m.host)) {
      const link = makeLink(m.link, m.from, m.from);
      post({ kind: 'accept', link: m.link, to: m.from, from: me });
      for (const fn of listening.get(m.host)) fn(link);
      return;
    }
    if (m.to !== me) return;
    if (m.kind === 'accept') waiting.get(m.link)?.(m.from);
    else if (m.kind === 'msg') links.get(m.link)?.deliver(m.msg);
    else if (m.kind === 'close') { links.get(m.link)?.closed(); links.delete(m.link); }
  };
  // Closing the tab closes its links, so the others notice straight away.
  addEventListener('pagehide', () => { for (const link of [...links.values()]) link.close(); });

  return {
    id: me,
    async listen(code) {
      const id = peerIdFor(code);
      const onLink = new Set();
      listening.set(id, onLink);
      return { id, onLink(fn) { onLink.add(fn); }, close() { listening.delete(id); } };
    },
    connect(code) {
      const id = `${me}:${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new NetError('missing', 'No game with that code in another tab. Host one in another tab first.'));
        }, 3000);
        waiting.set(id, (hostTab) => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve(makeLink(id, peerIdFor(code), hostTab));
        });
        post({ kind: 'connect', host: peerIdFor(code), link: id, from: me });
      });
    },
  };
}

// ------------------------------------------------------------------ PeerJS (the internet)

const PEER_ERRORS = {
  'unavailable-id': ['taken', 'That room code is already in use. Try hosting again for a new one.'],
  'peer-unavailable': ['missing', 'No game with that code. Check the code and that the host is still in the lobby.'],
  network: ['offline', "Couldn't reach the matchmaking service. Check your internet connection."],
  'server-error': ['offline', "The free matchmaking service isn't answering. Try again in a minute."],
  'socket-error': ['offline', 'Lost the connection to the matchmaking service.'],
  'browser-incompatible': ['browser', "This browser can't do peer-to-peer connections (WebRTC)."],
};
const toNetError = (err) => {
  const [kind, message] = PEER_ERRORS[err?.type] ?? ['unknown', `Connection problem: ${err?.message ?? err}`];
  return new NetError(kind, message);
};

/**
 * The real thing: WebRTC between browsers, introduced by PeerJS's free broker.
 * @param {Function} Peer  the PeerJS constructor (net/peer-loader.js)
 */
export function createPeerNet(Peer, { debug = 0 } = {}) {
  let peer = null;

  /** Wait for a fresh Peer to register with the broker. */
  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new Peer(id, { debug }) : new Peer({ debug });
      const fail = (err) => { p.destroy(); reject(toNetError(err)); };
      p.once('open', () => { p.off('error', fail); resolve(p); });
      p.once('error', fail);
    });
  }

  /**
   * Wrap a PeerJS data connection as a link. Besides PeerJS's own (reliable)
   * channel, both ends open a second, truly unreliable one: unordered and never
   * resent. "negotiated" with an agreed number means neither side has to ask.
   */
  function wrap(conn) {
    const link = linkBase(conn.peer);
    let fast = null;
    try {
      fast = conn.peerConnection.createDataChannel('fireteam-fast', { negotiated: true, id: 64, ordered: false, maxRetransmits: 0 });
      fast.onmessage = (e) => link.deliver(JSON.parse(e.data));
    } catch {
      fast = null; // fall back to the reliable channel for everything
    }
    conn.on('data', (msg) => link.deliver(msg));
    conn.on('close', () => link.closed());
    conn.on('error', () => link.closed());
    link.send = (msg, { reliable = true } = {}) => {
      if (!link.open) return;
      if (!reliable && fast?.readyState === 'open') fast.send(JSON.stringify(msg));
      else if (conn.open) conn.send(msg);
    };
    link.close = () => { conn.close(); link.closed(); };
    link.peer = peer;
    return link;
  }

  const net = {
    get peer() { return peer; },
    get id() { return peer?.id ?? null; },

    async listen(code) {
      peer = await openPeer(peerIdFor(code));
      const onLink = new Set();
      peer.on('connection', (conn) => conn.on('open', () => {
        const link = wrap(conn);
        for (const fn of onLink) fn(link);
      }));
      return { id: peer.id, onLink(fn) { onLink.add(fn); }, close() { peer?.destroy(); peer = null; } };
    },

    async connect(code) {
      peer ??= await openPeer(null);
      return new Promise((resolve, reject) => {
        const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
        const fail = (err) => { clearTimeout(timer); reject(err?.type ? toNetError(err) : err); };
        const timer = setTimeout(() => fail(new NetError('timeout', "The host didn't answer. Their network may block direct connections.")), 20000);
        peer.once('error', fail);
        conn.on('open', () => {
          clearTimeout(timer);
          peer.off('error', fail);
          resolve(wrap(conn));
        });
      });
    },

    close() { peer?.destroy(); peer = null; },
  };
  return net;
}
