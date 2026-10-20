// Automatic graphics quality: if the game stays slow, step the quality down.
//
// Like a car's automatic gearbox: it watches the engine (the frame rate) and,
// if it keeps labouring, changes down a gear. It waits a few seconds first, so
// one slow moment (a map loading, a big explosion) doesn't change anything,
// and it only ever steps down: stepping back up would make it hunt between
// two settings, flickering. You can always raise it again in Settings.
//
// No DOM: plain arithmetic, tested in Node.

export const PERF = {
  slowFps: 40,    // below this many frames a second counts as slow...
  hold: 5,        // ...for this many seconds in a row before stepping down
};

const ORDER = ['low', 'medium', 'high'];

export function createQualityGovernor(tuning = PERF) {
  let slowFor = 0;
  return {
    /**
     * @param {number} dt       seconds since the last frame
     * @param {number} fps      the measured frame rate
     * @param {string} quality  the current setting
     * @returns {string|null}   a lower quality to switch to, or null
     */
    update(dt, fps, quality) {
      slowFor = fps < tuning.slowFps ? slowFor + dt : 0;
      const i = ORDER.indexOf(quality);
      if (slowFor < tuning.hold || i <= 0) return null;
      slowFor = 0;
      return ORDER[i - 1];
    },
    reset() { slowFor = 0; },
  };
}
