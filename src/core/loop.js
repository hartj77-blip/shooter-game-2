// The game loop: the heartbeat of the game.
//
// Two jobs, kept separate on purpose:
//   update(dt)   moves the world forward by exactly SIM_DT seconds (1/60 s)
//   render(...)  draws a picture of the world, as often as the screen allows
//
// Real time is poured into a "bucket" (the accumulator). Every time the bucket
// holds at least one SIM_DT, we take that much out and run one update. Whatever
// is left over (less than one step) becomes `alpha`, which tells the renderer
// how far we are between the last update and the next one so it can blend
// smoothly. See docs/lessons/01-the-game-loop.md.

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

// If a frame takes longer than this (the tab was hidden, the laptop slept),
// pretend it only took this long, so the game doesn't try to catch up on
// minutes of missed time in one go.
export const MAX_FRAME_TIME = 0.25;

// Never run more than this many updates in one frame. If the computer is too
// slow to keep up, the game slows down instead of freezing (the "spiral of death").
export const MAX_STEPS_PER_FRAME = 8;

/**
 * Pure accumulator math, kept separate so it can be unit tested.
 * @param {number} acc      seconds already waiting in the bucket
 * @param {number} elapsed  real seconds since the last frame (already time-scaled)
 * @returns {{acc:number, steps:number, alpha:number}}
 */
export function advance(acc, elapsed, dt = SIM_DT, maxSteps = MAX_STEPS_PER_FRAME) {
  acc += Math.min(Math.max(elapsed, 0), MAX_FRAME_TIME);
  let steps = 0;
  while (acc >= dt && steps < maxSteps) {
    acc -= dt;
    steps++;
  }
  // Still behind after the maximum number of steps: drop the backlog.
  if (acc >= dt) acc %= dt;
  return { acc, steps, alpha: acc / dt };
}

/**
 * Starts calling update() and render() using requestAnimationFrame.
 * @param {{update:(dt:number)=>void, render:(alpha:number, frameDt:number)=>void}} hooks
 */
export function createLoop({ update, render }) {
  const loop = {
    timeScale: 1,      // 0.25 = slow motion. Handy for studying movement in the debug panel.
    paused: false,     // when true, the world stops but we keep drawing
    tick: 0,           // how many updates have run since the start
    stats: { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0, steps: 0 },
    start, stop,
  };

  let acc = 0;
  let last = 0;
  let raf = 0;
  let fpsFrames = 0;
  let fpsClock = 0;

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    const now = nowMs / 1000;
    const real = last ? now - last : 0;
    last = now;

    const t0 = performance.now();
    let steps = 0;
    let alpha = 1;
    if (!loop.paused) {
      const r = advance(acc, real * loop.timeScale);
      acc = r.acc;
      steps = r.steps;
      alpha = r.alpha;
      for (let i = 0; i < steps; i++) {
        update(SIM_DT);
        loop.tick++;
      }
    }
    const t1 = performance.now();
    render(alpha, Math.min(real, MAX_FRAME_TIME));
    const t2 = performance.now();

    const s = loop.stats;
    s.updateMs = t1 - t0;
    s.renderMs = t2 - t1;
    s.frameMs = real * 1000;
    s.steps = steps;
    fpsFrames++;
    fpsClock += real;
    if (fpsClock >= 0.5) {
      s.fps = Math.round(fpsFrames / fpsClock);
      fpsFrames = 0;
      fpsClock = 0;
    }
  }

  function start() {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  return loop;
}
