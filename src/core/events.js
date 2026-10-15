// The event bus: a noticeboard that any system can post to or read from.
//
// Instead of the player code calling the camera, the HUD and the sound system
// directly when you land ("hey camera, dip! hey sound, thud!"), it posts one
// notice: emit('player:land', { speed }). Whoever cares listens for it.
// The player code never needs to know who is listening, so systems stay
// independent and easy to add or remove.
//
// Event names used so far:
//   player:jump    {}
//   player:land    { speed }          speed = how fast you were falling (m/s)
//   player:slide   {}
//   player:mantle  { height }
//   player:crouch-air { feetShift }   crouched or stood up in mid-air, feet moved by this much
//   game:state     { from, to }       the game flow changed state
//   settings:change { key, value }

export function createEvents() {
  const listeners = new Map();
  const everything = new Set(); // listeners for every event (the co-op host forwards them)

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => off(name, fn); // call this to stop listening
  }

  function off(name, fn) {
    listeners.get(name)?.delete(fn);
  }

  function emit(name, data) {
    for (const fn of everything) fn(name, data);
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of set) fn(data);
  }

  /** Hear every event: fn(name, data). Returns a function that stops listening. */
  function onAny(fn) {
    everything.add(fn);
    return () => everything.delete(fn);
  }

  return { on, off, emit, onAny };
}

// One shared noticeboard for the whole game.
export const events = createEvents();
