// Loads PeerJS (vendor/peerjs, pinned 1.5.5) only when someone hosts or joins a
// co-op game, so solo players never download it.
//
// PeerJS is an old-style script rather than an ES module: it puts `Peer` on
// `window` when it runs. So we add a <script> tag and wait for it to load.

let loading = null;

/** @returns {Promise<Function>} the PeerJS `Peer` constructor */
export function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../../vendor/peerjs/peerjs.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.Peer);
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the networking library (vendor/peerjs)."));
    };
    document.head.append(script);
  });
  return loading;
}
