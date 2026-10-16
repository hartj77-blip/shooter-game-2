// Voice mixing rules: who you hear, how loud, and through which "speaker".
//
// Every teammate's voice can reach you two ways:
//   RADIO   they're holding V: everyone hears them, wherever they are, through
//           a radio filter (thin and a little crackly)
//   NEARBY  their mic is open and they're close: you hear them from where they
//           stand, fading out with distance, like someone talking in the room
//
// Your voice setting:
//   'both'   your mic is open for nearby voice, and V puts you on the radio
//   'radio'  push-to-talk only: your mic only sends while you hold V
//   'off'    no microphone, and no voices
//
// These are plain rules with no sound in them, so the tests can check them
// (tests/unit/voice.test.js). net/voice.js turns them into volume knobs.

export const VOICE = {
  full: 4,    // metres: nearby voice is at full volume this close...
  range: 25,  // ...and silent this far away
};

/**
 * How loud to play one teammate, on each path.
 * @param {object} o
 * @param {'both'|'radio'|'off'} o.mode   your voice setting
 * @param {boolean} [o.muted]   you muted them
 * @param {boolean} [o.radio]   they're holding V
 * @param {number|null} [o.distance] metres between you (null: in the lobby, everyone's "close")
 * @param {number} [o.volume]   your voice volume setting (0..1)
 * @returns {{radio:number, near:number}}
 */
export function voiceMix({ mode, muted = false, radio = false, distance = null, volume = 1 }) {
  if (mode === 'off' || muted) return { radio: 0, near: 0 };
  if (radio) return { radio: volume, near: 0 };
  if (distance === null) return { radio: 0, near: volume };
  if (distance >= VOICE.range) return { radio: 0, near: 0 };
  const k = distance <= VOICE.full ? 1 : 1 - (distance - VOICE.full) / (VOICE.range - VOICE.full);
  return { radio: 0, near: volume * k * k }; // squared: fades like a real voice, quickly at first
}

/** Should your microphone be sending right now? */
export function micOpen({ mode, radioHeld }) {
  if (mode === 'off') return false;
  return mode === 'both' || radioHeld;
}
