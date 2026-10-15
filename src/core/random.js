// Seeded random numbers: "random" that you can repeat exactly.
//
// Math.random() gives different numbers every time you run the game. That's a
// problem for anything the simulation decides, like where a bullet's spread
// sends it: two computers in a co-op game would disagree about what got hit.
//
// A seeded generator starts from a number (the seed) and scrambles it to get
// the next number, again and again. Same seed in, same sequence out, on every
// computer. Shuffling two decks of cards in exactly the same way gives the
// same order. This one is "mulberry32": tiny, fast, and good enough for games.

/**
 * @param {number} seed any whole number
 */
export function createRandom(seed = 1) {
  let s = seed >>> 0;

  const rng = {
    /** A number from 0 (inclusive) to 1 (exclusive). */
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** A number between a and b. */
    range(a, b) {
      return a + (b - a) * rng.next();
    },
    /** One item from a list. */
    pick(list) {
      return list[Math.floor(rng.next() * list.length)];
    },
    /** The generator's position, so it can be saved and restored (or sent over the network). */
    get state() { return s; },
    set state(v) { s = v >>> 0; },
  };
  return rng;
}
