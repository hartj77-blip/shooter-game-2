// A finite state machine: something that is always in exactly one "state",
// with clear rules for moving between states.
//
// A traffic light is a state machine: green -> amber -> red -> green.
// Our game flow is one too: loading -> title -> playing <-> paused.
// Later, every enemy's brain will be one (patrol -> alert -> attack -> cover).
//
// Each state can have three optional functions:
//   enter(data)  runs once when we arrive in the state
//   exit()       runs once when we leave it
//   update(dt)   runs every tick while we're in it

/**
 * @param {Record<string, {enter?:Function, exit?:Function, update?:Function}>} states
 * @param {(from:string|null, to:string)=>void} [onChange]
 */
export function createStateMachine(states, onChange) {
  let current = null;

  return {
    get state() { return current; },

    is(...names) { return names.includes(current); },

    go(name, data) {
      if (!states[name]) throw new Error(`Unknown state "${name}"`);
      if (name === current) return;
      const from = current;
      if (from) states[from].exit?.();
      current = name;
      states[name].enter?.(data);
      onChange?.(from, name);
    },

    update(dt) {
      if (current) states[current].update?.(dt);
    },
  };
}
