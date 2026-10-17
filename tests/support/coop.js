// Test helper: a co-op game in one program. A host and up to three clients,
// connected by the pretend network (net/transport.js createLoopbackNet), all
// ticking in step at 60 Hz. Nothing is drawn; everything else is the real code.

import { initPhysics } from '../../src/world/physics.js';
import { createSim } from '../../src/game/sim.js';
import { createHost } from '../../src/net/host.js';
import { createClient } from '../../src/net/client.js';
import { createLoopbackNet } from '../../src/net/transport.js';
import { createEvents } from '../../src/core/events.js';
import { idleCommand } from '../../src/core/input.js';
import { SIM_DT } from '../../src/core/loop.js';

/**
 * @param {object} opts
 * @param {object} opts.def        level definition
 * @param {number} [opts.clients]  how many friends join (1 to 3)
 * @param {object} [opts.net]      { delay, jitter, loss } for the pretend network (ms, ms, 0..1)
 * @param {object} [opts.loadouts] { slot: loadout } each friend's guns (weapons/attachments.js); missing = the default
 * @param {object} [opts.callins]  { slot: kind } each friend's call-in (game/callins.js); missing = supply
 */
export async function makeCoop({ def, clients = 1, net: netOpts = {}, seed = 3, difficulty = 'regular', loadouts = {}, callins = {} }) {
  await initPhysics();
  const net = createLoopbackNet({ seed, ...netOpts });
  const sim = createSim({ def, id: 'test', seed, difficulty, coop: true });
  const host = createHost({ sim, coop: true, clock: () => net.now });
  const listener = await net.listen('TESTS');
  const pending = [];
  listener.onLink((link) => pending.push(link));

  const game = {
    net, sim, host, clients: [], logs: new Map(), hostLog: [],
    time: 0,
    /** Another friend joins, right now. */
    async join(slot = game.clients.length + 1, loadout = loadouts[slot]) {
      const link = await net.connect('TESTS');
      host.addClient({ slot, link: pending.shift(), callsign: `Friend ${slot}`, loadout, callin: callins[slot] });
      const events = createEvents();
      const log = [];
      events.onAny((name, data) => log.push({ name, ...data }));
      const client = createClient({ def, me: slot, link, events, clock: () => net.now, roster: [{ slot: 0, callsign: 'Host' }], loadout, callin: callins[slot] });
      client.link = link;
      game.clients.push(client);
      game.logs.set(slot, log);
      return client;
    },
    /**
     * Run for `seconds`. `make(slot, tick)` gives each player's command (default: stand still).
     * `each(tick)` runs after every tick.
     */
    run(seconds, make = () => null, each = () => {}) {
      const ticks = Math.round(seconds / SIM_DT);
      for (let i = 0; i < ticks; i++) {
        const me = host.local.soldier.state;
        const out = host.step(SIM_DT, make(0, i) ?? idleCommand(me.yaw, me.pitch));
        void out;
        for (const c of game.clients) {
          const s = c.local.soldier.state;
          c.step(SIM_DT, make(c.me, i) ?? idleCommand(s.yaw, s.pitch));
        }
        net.advance(SIM_DT * 1000);
        game.time += SIM_DT;
        each(i);
      }
    },
    client: (slot) => game.clients.find((c) => c.me === slot),
    /** Where the host has player `slot`, and where their own browser has them. */
    gap(slot) {
      const a = sim.player(slot).soldier.state.pos;
      const b = game.client(slot).local.soldier.state.pos;
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    },
    dispose() {
      for (const c of game.clients) c.dispose();
      host.dispose();
    },
  };
  sim.events.onAny((name, data) => game.hostLog.push({ name, ...data }));
  for (let i = 1; i <= clients; i++) await game.join(i);
  return game;
}

/** A command that walks: forward, strafe right, both, with jumps and crouches thrown in. */
export function wander(yaw0 = 0) {
  return (slot, i) => {
    const phase = Math.floor(i / 50) % 6;
    return {
      ...idleCommand(yaw0 + Math.sin(i / 40) * 0.6, 0),
      moveZ: phase === 3 ? 0 : phase === 5 ? -1 : 1,
      moveX: phase === 1 ? 1 : phase === 2 ? -1 : 0,
      sprint: phase === 0,
      jump: i % 97 === 0,
      jumpHeld: i % 97 < 5,
      crouch: phase === 4,
    };
  };
}
