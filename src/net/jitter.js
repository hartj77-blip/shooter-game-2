// A jitter buffer: a small waiting room for one player's commands on the host.
//
// Packets don't arrive evenly. Like buses, they bunch up and leave gaps, even
// though they left every 1/60 s. If the host used each command the instant it
// arrived, some ticks would have none and others two. So it keeps a cushion of
// about two commands waiting (a 33 ms delay nobody notices) and takes one per tick.
//
//   - Nothing waiting (a gap)? Repeat the last command, without its one-off
//     presses (no double jumps). That's a guess; your browser fixes any
//     difference when the next snapshot arrives (net/client.js).
//   - Too many waiting (after a hiccup)? Take two per tick until it catches up.
//
// `ack` is the number of the last real command used. Snapshots carry it back to
// the player, so their browser knows which of its commands the host has seen.
//
// Pure logic: runs in Node, tested on its own.

import { PRESS_FLAGS } from './protocol.js';

export function createJitterBuffer({ target = 2, max = 8 } = {}) {
  const queue = []; // [seq, cmd], oldest first
  let ack = 0;
  let last = null;
  let primed = false;
  const stats = { used: 0, guessed: 0, caughtUp: 0 };

  const guess = (cmd) => {
    const c = { ...cmd };
    for (const k of PRESS_FLAGS) c[k] = false;
    c.slot = 0;
    c.cycle = 0;
    return c;
  };

  return {
    stats,
    get ack() { return ack; },
    get size() { return queue.length; },

    /** A command arrived. Old or repeated ones (from the redundant copies) are ignored. */
    push(seq, cmd) {
      if (seq <= ack || queue.some((q) => q[0] === seq)) return;
      let i = queue.length;
      while (i > 0 && queue[i - 1][0] > seq) i--;
      queue.splice(i, 0, [seq, cmd]);
    },

    /** This tick's command(s): usually one, two when catching up, none before the first arrives. */
    take() {
      if (!primed) {
        if (queue.length < target) return [];
        primed = true;
      }
      if (!queue.length) {
        if (!last) return [];
        stats.guessed++;
        return [guess(last)];
      }
      const n = queue.length > max ? 2 : 1;
      if (n > 1) stats.caughtUp++;
      return queue.splice(0, n).map(([seq, cmd]) => {
        ack = seq;
        last = cmd;
        stats.used++;
        return cmd;
      });
    },
  };
}
