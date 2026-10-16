# Lesson 13: Voice, rooms and the internet

**The idea in one sentence:** browsers can talk to each other directly (WebRTC), once a free matchmaking service has introduced them, and we use those direct lines for both the game and your voice.

## WebRTC: video calls, built into every browser

**WebRTC** ("web real-time communication") is the technology behind browser video calls. It gives two browsers a direct line for audio, video and **data channels** (any messages we like). Our game uses all of it: data channels for commands, snapshots and events (lesson 11), and audio for voice. We use it through **PeerJS** (`vendor/peerjs`, pinned at 1.5.5), a small library that hides the fiddly parts. It's loaded only when you host or join (`src/net/peer-loader.js`), so solo players never download it.

## Signalling: swapping phone numbers

Two browsers can't just find each other. Before they can connect, they have to swap a description of themselves (what they can send, how to reach them). Doing that swap is called **signalling**. It's like two people at a party who can only start talking once a friend has introduced them.

PeerJS runs a free matchmaking service ("broker", at `0.peerjs.com`) that does the introducing. The host registers under a name made from the room code (`fireteam-KQXRT`); a friend asks the broker to introduce them to that name. After that, the broker steps out of the way. The game's messages never pass through it.

## NAT, STUN and TURN: why some networks need a relay

Your computer usually doesn't have its own address on the internet. Your home router shares one public address between every device in the house, like a block of flats with one street address and a doorman. That's **NAT** (network address translation). The doorman only lets in replies to conversations someone inside started, so a stranger knocking is turned away.

WebRTC gets round the doorman in steps:

| Step | What it does | Everyday version |
|---|---|---|
| **STUN** | A server tells your browser what your public address looks like from outside | Ringing a friend to ask "what number am I calling from?" |
| **Hole punching** | Both browsers send to each other at the same moment, so each doorman thinks *its* resident started the conversation | Both phoning each other at once |
| **TURN** | If that fails (strict office or school networks, some mobile networks), everything is relayed through a server in the middle | Passing notes through a friend |

PeerJS comes set up with a free STUN server and free TURN servers (`turn.peerjs.com`), so most networks work with no sign-up. Relayed games have a little more lag. If some friends can never connect, that's usually a strict network, and the fix is a paid TURN service (an open question for later).

**Checked for real:** two browsers in this project's test container opened a room on the free broker, joined by code, played (the host saw the friend walk) and talked both ways. `voice.links` reported each link as "connected".

## A star for the game, a mesh for voice

| | Shape | Why |
|---|---|---|
| **Game data** | A **star**: every client connects to the host | The host is the referee; there's one truth |
| **Voice** | A **mesh**: everyone connects to everyone | Voices go straight to each other instead of detouring through the host's internet connection |

With four players, the mesh is six links: 1–2, 1–3, 1–4, 2–3, 2–4, 3–4. Each pair connects exactly once, because the player with the higher slot always makes the call (`connect()` in `src/net/voice.js`).

## Two ways to hear someone

Hold **V** for the **squad radio**: everyone hears you, wherever they are. Otherwise your mic is open for **nearby voice**: teammates close to you hear you from where you stand, fading out by 25 m. Each incoming voice is split two ways, and the mixing rules turn two volume knobs:

```
their voice ─┬─▶ band-pass 300–3400 Hz ─▶ soft distortion ─▶ radio volume ─┐
             └─▶ nearby volume ─▶ 3D panner (where they stand) ─────────────┴─▶ voice volume ─▶ speakers
```

- **The radio sound**: a **band-pass filter** keeps only the middle of the voice (300 to 3,400 Hz), the part an old radio could carry. Then a gentle **distortion** squashes the loud parts, like a small overdriven speaker. Add a click at each end and it sounds like a handset.
- **Nearby voice**: the same 3D **panner** as the gunshots (lesson 7), so a teammate on your left is in your left ear.

The rules live on their own in `src/net/voice-mix.js`: radio beats nearby, distance fades nearby voice, mute and "off" silence everything. They contain no sound at all, so `tests/unit/voice.test.js` can test them in Node, like the rest of the simulation.

| Setting (Settings → Voice chat) | Your mic sends |
|---|---|
| **Radio (hold V) + nearby voice** | Always for nearby voice; to everyone while you hold V |
| **Push-to-talk only** | Only while you hold V |
| **Off** | Nothing, and you hear nothing |

Your own voice is never played back to you. The pause menu can mute anyone. Speaking lights in the lobby and the squad roster show who's talking. They come from an **analyser**, which measures how loud each voice is from moment to moment.

## Echo: why headphones matter

If your teammate's voice comes out of your speakers, your microphone picks it up and sends it straight back: they hear themselves a moment later. Browsers have **echo cancellation** (we turn it on, with noise suppression and automatic volume), but it can't do miracles. **Headphones** fix it completely, and the join screen says so.

### A real quirk: Chrome's silent voices

In Chrome, a WebRTC voice fed into Web Audio (our mixing desk) comes out *silent*, unless the same stream is also playing in an ordinary `<audio>` element. It's a long-standing browser bug. The workaround: each voice also gets a **muted** `<audio>` element (`attach()` in `voice.js`). The element makes Chrome pull the sound in; the mixing desk does the actual playing.

### A testing quirk: the pretend microphone

Browser tests can't speak, so Chromium offers a pretend microphone that beeps (`--use-fake-device-for-media-stream`). The voice test (`tests/smoke/coop.spec.js`) feeds that beep in as a teammate's voice. It checks that the nearby path plays it in the lobby, that pressing "radio" moves it to the radio path, and that mute silences both.

While checking over the real internet with two browsers, the host heard nothing from the friend. Every link said "connected", though, and the friend heard the host fine. It turned out both pages shared one pretend microphone, and the second page mostly got silence. Giving the friend a generated tone as their "microphone" proved the link worked both ways. **When a test fails, check the test's own setup before blaming the code.**

## Try this

1. Host co-op on one computer and join from another (or a phone hotspot, for a different network). Note the ping in the lobby.
2. Set Voice chat to *Push-to-talk only* and watch your speaking light only come on while you hold V.
3. Walk away from a teammate who's talking (without the radio) and listen to them fade out by 25 m.
4. In the browser's console, type `fireteam.voice.links` to see each voice link's state.

## Common mistakes

- **Playing your own voice back.** It's confusing and causes echo. Measure your mic, never play it.
- **Forgetting the `<audio>` workaround.** Silence in Chrome, no error anywhere.
- **Calling twice.** If both players in a pair call each other, you get two links and a doubled voice. Pick a rule (the higher slot calls).
- **Assuming everyone can connect.** Some networks block direct connections. Say so plainly ("The host didn't answer…") rather than spinning forever.
- **Asking for the microphone without a click.** Browsers only allow sound, and asking for the mic, after you've pressed something. We ask when you press Host or Join.
