// Voice chat: your microphone, your teammates' voices, and the two ways you hear them.
//
// THE MESH. Game data goes through the host (a star), but voices go straight
// from each player to each other player: four players make six direct links.
// That way nobody's voice takes a detour through the host's internet
// connection. PeerJS sets up each link as a "call" (the same WebRTC technology
// browsers use for video calls). The player with the higher slot number makes
// the call, so each pair connects exactly once.
//
// EACH VOICE splits two ways, and net/voice-mix.js decides how loud each is:
//
//   their voice ─┬─▶ band-pass 300–3400 Hz ─▶ soft distortion ─▶ radio volume ──┐
//                └─▶ nearby volume ─▶ 3D panner (where they stand) ───────────────┴─▶ voice bus ─▶ master
//
// The band-pass keeps only the middle of the voice, the part an old radio could
// carry; the distortion adds a little crunch. The 3D panner puts a nearby voice
// on your left or right, like the gunshots in audio/audio.js.
//
// Two browser quirks handled here:
//   - Chrome only feeds a WebRTC voice into Web Audio if the stream is also
//     playing in an <audio> element. So each voice gets one, muted (the sound we
//     hear comes out of the graph above).
//   - The microphone asks for echo cancellation, noise suppression and automatic
//     gain. Headphones still help most: without them, teammates hear themselves.
//
// Your own voice is never played back to you. Presentation only: it never
// touches the simulation.

import { voiceMix, micOpen } from './voice-mix.js';

const TALKING = 0.015; // loudness (RMS) that counts as talking, for the speaking indicators

/**
 * @param {object} opts
 * @param {object} opts.audio     audio/audio.js (its context and master volume)
 * @param {object} opts.settings  settings.values (voiceMode, voiceVolume)
 * @param {object} opts.room      net/room.js
 * @param {object|null} opts.peer the PeerJS peer (null over ?net=local: no voice links, just your mic)
 */
export function createVoice({ audio, settings, room, peer = null }) {
  const talkers = new Map(); // slot -> { stream, el, graph, level }
  const calls = new Map();   // slot -> PeerJS call
  const radioOn = new Map(); // slot -> holding V?
  const muted = new Set();
  let mic = null;
  let micGraph = null;
  let myLevel = 0;
  let radioHeld = false;
  let bus = null;
  let problem = null;
  let stopped = false;

  const ctx = () => audio.context;
  const voiceBus = () => {
    if (!bus && ctx()) {
      bus = ctx().createGain();
      bus.connect(audio.master);
    }
    return bus;
  };

  /** What we send in a call: the microphone, or silence if there isn't one. */
  function outgoing() {
    if (mic) return mic;
    const c = ctx();
    return c ? c.createMediaStreamDestination().stream : new MediaStream();
  }

  async function start() {
    if (settings.voiceMode === 'off') return;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      problem = err?.name === 'NotAllowedError'
        ? "Microphone blocked: you'll hear your squad, but they won't hear you."
        : "No microphone found: you'll hear your squad, but they won't hear you.";
    }
    if (stopped) { mic?.getTracks().forEach((t) => t.stop()); return; }
    applyMic();
    peer?.on('call', answer);
    connect();
  }

  // ---------------------------------------------------------------- the mesh

  /** Call everyone with a lower slot than ours; hang up on anyone who left. */
  function connect() {
    if (!peer || stopped || settings.voiceMode === 'off') return;
    for (const m of room.roster) {
      if (m.slot === room.me || !m.peer || calls.has(m.slot) || room.me < m.slot) continue;
      watch(m.slot, peer.call(m.peer, outgoing(), { metadata: { slot: room.me } }));
    }
    for (const [slot, call] of calls) {
      if (!room.roster.some((m) => m.slot === slot)) {
        call.close();
        hangUp(slot);
      }
    }
  }

  function answer(call) {
    const slot = call.metadata?.slot ?? room.roster.find((m) => m.peer === call.peer)?.slot;
    if (slot == null || stopped || settings.voiceMode === 'off') { call.close(); return; }
    call.answer(outgoing());
    watch(slot, call);
  }

  function watch(slot, call) {
    calls.get(slot)?.close();
    calls.set(slot, call);
    call.on('stream', (stream) => attach(slot, stream));
    const gone = () => { if (calls.get(slot) === call) hangUp(slot); };
    call.on('close', gone);
    call.on('error', gone);
  }

  function hangUp(slot) {
    calls.delete(slot);
    silence(slot);
  }

  /** Stop playing a teammate's voice (the call itself may carry on). */
  function silence(slot) {
    const t = talkers.get(slot);
    if (!t) return;
    t.el.srcObject = null;
    if (t.graph) for (const node of Object.values(t.graph)) node.disconnect?.();
    talkers.delete(slot);
  }

  // ---------------------------------------------------------------- sound

  /** A teammate's voice arrived: give it a (muted) <audio> element and, once sound is on, a mixing graph. */
  function attach(slot, stream) {
    silence(slot);
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    el.play().catch(() => {});
    talkers.set(slot, { stream, el, graph: null, level: 0 });
  }

  /** A softly-clipping curve: loud parts get squashed, like an overdriven radio speaker. */
  function crunch() {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 3) / Math.tanh(3);
    }
    return curve;
  }

  function build(stream) {
    const c = ctx();
    const src = c.createMediaStreamSource(stream);
    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const low = c.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 300;
    const high = c.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = 3400;
    const shaper = c.createWaveShaper();
    shaper.curve = crunch();
    const radio = c.createGain();
    radio.gain.value = 0;
    src.connect(low).connect(high).connect(shaper).connect(radio).connect(voiceBus());
    const near = c.createGain();
    near.gain.value = 0;
    const panner = c.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0; // voice-mix.js does the fading; the panner only gives direction
    src.connect(near).connect(panner).connect(voiceBus());
    return { src, analyser, low, high, shaper, radio, near, panner, buf: new Float32Array(analyser.fftSize) };
  }

  const loudness = (g) => {
    g.analyser.getFloatTimeDomainData(g.buf);
    let sum = 0;
    for (const v of g.buf) sum += v * v;
    return Math.sqrt(sum / g.buf.length);
  };

  function applyMic() {
    const open = micOpen({ mode: settings.voiceMode, radioHeld });
    for (const t of mic?.getAudioTracks() ?? []) t.enabled = open;
  }

  return {
    start,
    /** The roster changed: call newcomers, hang up on leavers. */
    connect,
    get problem() { return problem; },
    get hasMic() { return !!mic; },
    get linked() { return peer !== null; },
    get radioHeld() { return radioHeld; },

    /** You're holding V (or not). Tells everyone, with a radio click. */
    setRadio(on) {
      if (on === radioHeld) return;
      radioHeld = on;
      if (mic && settings.voiceMode !== 'off') {
        room.setRadio(on);
        audio.play('radio', { volume: 0.5 });
      }
      applyMic();
    },
    /** A teammate pressed or let go of V. */
    setTalkerRadio(slot, on) {
      if (radioOn.get(slot) === on) return;
      radioOn.set(slot, on);
      if (!muted.has(slot) && settings.voiceMode !== 'off') audio.play('radio', { volume: on ? 0.45 : 0.3, rate: on ? 1 : 1.2 });
    },
    /** Play `stream` as teammate `slot`'s voice (calls do this; so does the browser test). */
    hear: attach,
    /** What one voice is doing right now: loudness and its two volume knobs (for tests and curious people). */
    levels(slot) {
      const t = talkers.get(slot);
      if (!t?.graph) return null;
      return { level: t.level, radio: t.graph.radio.gain.value, near: t.graph.near.gain.value };
    },
    mute(slot, on) { if (on) muted.add(slot); else muted.delete(slot); },
    isMuted: (slot) => muted.has(slot),
    /** Is this player talking right now? (For the speaking indicators.) */
    talking(slot) {
      if (slot === room.me) return micOpen({ mode: settings.voiceMode, radioHeld }) && myLevel > TALKING;
      return (talkers.get(slot)?.level ?? 0) > TALKING && !muted.has(slot);
    },

    /**
     * Once a frame: loudness for the indicators, and each voice's volumes.
     * @param {object} opts
     * @param {(slot:number) => {x,y,z}|null} [opts.positionOf] where a teammate's head is (null in the lobby)
     * @param {{x,y,z}} opts.listener  where your ears are (the camera)
     */
    update(dt, { positionOf = null, listener }) {
      const c = ctx();
      if (!c || stopped) return;
      applyMic();
      if (mic && !micGraph) {
        micGraph = { analyser: c.createAnalyser(), buf: null };
        micGraph.analyser.fftSize = 512;
        micGraph.buf = new Float32Array(512);
        micGraph.src = c.createMediaStreamSource(mic);
        micGraph.src.connect(micGraph.analyser); // measured only, never played back to you
      }
      const fade = Math.exp(-dt * 6);
      if (micGraph) myLevel = Math.max(loudness(micGraph), myLevel * fade);
      voiceBus();
      for (const [slot, t] of talkers) {
        t.graph ??= build(t.stream);
        const g = t.graph;
        t.level = Math.max(loudness(g), t.level * fade);
        const at = positionOf?.(slot) ?? null;
        const distance = at ? Math.hypot(at.x - listener.x, at.y - listener.y, at.z - listener.z) : null;
        const mix = voiceMix({ mode: settings.voiceMode, muted: muted.has(slot), radio: radioOn.get(slot), distance, volume: settings.voiceVolume });
        g.radio.gain.setTargetAtTime(mix.radio, c.currentTime, 0.04);
        g.near.gain.setTargetAtTime(mix.near, c.currentTime, 0.08);
        const p = at ?? listener; // in the lobby: right where you are, so straight ahead
        if (g.panner.positionX) {
          g.panner.positionX.value = p.x;
          g.panner.positionY.value = p.y;
          g.panner.positionZ.value = p.z;
        } else g.panner.setPosition(p.x, p.y, p.z);
      }
    },

    /** Hang up on everyone and let go of the microphone. */
    dispose() {
      stopped = true;
      peer?.off('call', answer);
      for (const call of calls.values()) call.close();
      for (const slot of [...talkers.keys()]) silence(slot);
      calls.clear();
      micGraph?.src.disconnect();
      mic?.getTracks().forEach((t) => t.stop());
      bus?.disconnect();
    },
  };
}
