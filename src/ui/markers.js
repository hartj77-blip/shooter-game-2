// Markers in the world, and the hold-F progress ring: shared by the squad HUD
// (teammates, pings, "revive") and the objective HUD (the laptop, the caches,
// the landing zone), in solo play and co-op alike.
//
// A marker is a label pinned to a point in the 3D world. Each frame the point
// is "projected" onto the screen (where would it appear in the picture?). If
// it's off the screen, the marker sticks to the nearest edge, so you can
// always tell which way to go. Markers are pooled: the same few elements are
// reused every frame rather than made and thrown away.
//
// One frame goes: begin(), then mark(...) as many times as needed, then end()
// (which hides the elements nobody used this frame).

import * as THREE from 'three';

const EDGE = 60;    // px: markers off screen stay this far inside the sides...
const TOP = 112;    // ...below the objective panel at the top...
const BOTTOM = 130; // ...and clear of the speed readout and gun panel at the bottom

/**
 * @param {HTMLElement} layer   where the markers live (#marks)
 * @param {THREE.Camera} camera
 */
export function createMarkers(layer, camera) {
  const pool = [];
  let used = 0;
  const v3 = new THREE.Vector3();

  /**
   * A marker at a world position.
   * @param {string} cls      its kind, for the style ('revive', 'ping enemy', 'objective'...)
   * @param {string} [sub]    a second, smaller line (a distance, a countdown)
   * @param {string|null} [color] a CSS colour for it (a teammate's slot colour)
   * @param {boolean} [stick] off screen: hold it at the edge (otherwise hide it)
   */
  function mark(cls, pos, text, sub = '', color = null, stick = true) {
    let m = pool[used];
    if (!m) {
      const d = document.createElement('div');
      const label = document.createElement('span');
      const small = document.createElement('small');
      d.append(label, small);
      layer.append(d);
      m = { d, label, small, key: '' };
      pool.push(m);
    }
    used++;
    v3.set(pos.x, pos.y, pos.z).project(camera);
    const behind = v3.z > 1;
    let x = (v3.x + 1) / 2;
    let y = (1 - v3.y) / 2;
    if (behind) { x = 1 - x; y = 1; } // behind you: along the bottom edge, on the side it's on
    const w = innerWidth, h = innerHeight;
    const off = behind || x < 0 || x > 1 || y < 0 || y > 1;
    if (off && !stick) { used--; return; }
    const px = Math.min(w - EDGE, Math.max(EDGE, x * w));
    const py = Math.min(h - BOTTOM, Math.max(TOP, y * h));
    const key = `${cls}|${text}|${sub}|${color}|${off}`;
    if (m.key !== key) {
      m.key = key;
      m.d.className = `mark ${cls}${off ? ' edge' : ''}`;
      m.label.textContent = text;
      m.small.textContent = sub;
      if (color) m.d.style.setProperty('--c', color);
      else m.d.style.removeProperty('--c');
    }
    m.d.hidden = false;
    m.d.style.transform = `translate(${px.toFixed(0)}px, ${py.toFixed(0)}px) translate(-50%, -100%)`;
  }

  return {
    begin() { used = 0; },
    mark,
    end() { for (let i = used; i < pool.length; i++) pool[i].d.hidden = true; },
    /** How far a point is from the camera, as text. */
    metres: (p) => `${Math.round(camera.position.distanceTo(v3.set(p.x, p.y, p.z)))} m`,
    dispose() { layer.replaceChildren(); pool.length = 0; },
  };
}

/**
 * The progress ring in the middle of the screen (hold F to revive, to plant a
 * charge...). Several things may want it in a frame: the fullest one wins.
 */
export function createRing({ ring, fill, label }) {
  let best = null;
  return {
    begin() { best = null; },
    /** Something is in progress: 0..1, and what to call it. */
    want(progress, text) {
      if (progress > 0 && (!best || progress > best.progress)) best = { progress, text };
    },
    end() {
      ring.hidden = !best;
      if (!best) return;
      fill.style.strokeDashoffset = String(176 * (1 - best.progress));
      label.textContent = best.text;
    },
    dispose() { ring.hidden = true; },
  };
}
