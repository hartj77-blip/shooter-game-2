// The renderer: turns the 3D scene into the picture on your screen.
//
// three.js does the heavy lifting. This file sets up the parts every 3D game
// needs: a camera, a sky, fog, a sun that casts shadows, soft light from the
// sky, and "tone mapping" (squeezing very bright and very dark light into the
// range a screen can show, like a camera's auto-exposure).
//
// The colours and strengths of all that light come from the map's MOOD
// (render/moods.js): midday, haze, golden hour, night. setMood() applies one.
// On medium and high quality the picture then goes through post-processing
// (render/post.js): the mood's colour grade, outlines, and on high, ambient
// occlusion and bloom.

import * as THREE from 'three';
import { MOODS, DEFAULT_MOOD } from './moods.js';
import { createPost } from './post.js';
import { setOutlines } from './outline.js';

// Graphics quality presets. "Pixel ratio" is how many real screen pixels each
// CSS pixel gets: 2 is sharp on high-DPI screens but four times the work of 1.
//   post      the colour grade (render/post.js); off, the world goes straight to the screen
//   outlines  dark edges round soldiers (render/outline.js)
//   ao, bloom ambient occlusion and glow (render/post.js)
export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 0, post: false, outlines: false, ao: false, bloom: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, post: true, outlines: true, ao: false, bloom: false },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, post: true, outlines: true, ao: true, bloom: true },
};

const SHADOW_RANGE = 36; // metres around you that get sharp shadows
// Low quality has no grade, even when night vision borrows the chain.
const NO_GRADE = { saturation: 1, contrast: 1, tint: '#ffffff', vignette: 0 };

export function createRenderer(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c9d3d2', 70, 260);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
  scene.add(camera); // so things attached to the camera (later: your gun) get drawn

  // Sky: a huge ball around the camera, coloured from horizon to zenith.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 top;
        uniform vec3 horizon;
        varying vec3 vDir;
        void main() {
          float t = pow(clamp(vDir.y, 0.0, 1.0), 0.55);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Soft light from the whole sky (from above) and bounced off the ground (from below).
  const hemi = new THREE.HemisphereLight('#9fb8d6', '#5a5544', 2.4);
  scene.add(hemi);

  // The sun: one strong light from far away, casting shadows.
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_RANGE;
  sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_RANGE;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.75, 0.5).normalize();

  function setSun({ azimuth, elevation }) {
    sunDir.set(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth),
    );
  }

  /**
   * Light the world for a map: its mood (render/moods.js) and which way its sun is.
   * @param {object} mood   a MOODS entry (or moodFor(level))
   * @param {{azimuth:number, elevation:number}} [sunAngles] the level's `sun`
   */
  let mood = MOODS[DEFAULT_MOOD];
  let post = null;      // the post-processing chain for this quality (null on low)
  let tier = null;
  let nvg = 0;          // night vision, 0..1 (render/post.js)
  function setMood(m, sunAngles = { azimuth: 0.4, elevation: 0.9 }) {
    mood = m;
    sky.material.uniforms.top.value.set(m.skyTop);
    sky.material.uniforms.horizon.value.set(m.skyHorizon);
    scene.fog.color.set(m.fog);
    scene.fog.near = m.fogNear;
    scene.fog.far = m.fogFar;
    sun.color.set(m.sun);
    sun.intensity = m.sunIntensity;
    hemi.color.set(m.hemiSky);
    hemi.groundColor.set(m.hemiGround);
    hemi.intensity = m.hemiIntensity;
    renderer.toneMappingExposure = m.exposure;
    setSun({ azimuth: sunAngles.azimuth, elevation: m.elevation ?? sunAngles.elevation });
    post?.setGrade(m.grade);
  }
  setMood(mood);

  // The shadow map only covers SHADOW_RANGE around you, so it follows you around.
  // Moving it in whole shadow-pixel steps stops shadow edges from shimmering.
  const snapped = new THREE.Vector3();
  function followWithShadows(focus) {
    const texel = (SHADOW_RANGE * 2) / Math.max(sun.shadow.mapSize.x, 1);
    snapped.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(sunDir, 120);
    sky.position.copy(focus);
  }

  function applyQuality(name) {
    const q = QUALITY[name] ?? QUALITY.high;
    tier = q;
    post?.dispose();
    post = null;
    setOutlines(q.outlines);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
    renderer.shadowMap.enabled = q.shadows;
    sun.castShadow = q.shadows;
    if (q.shadows && sun.shadow.mapSize.x !== q.shadowSize) {
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    // Materials have to be rebuilt when shadows are switched on or off.
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / Math.max(innerHeight, 1);
    camera.updateProjectionMatrix();
    post?.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
  }

  /** The chain, made when first needed: on medium and high, or on low with night vision on. */
  function chain() {
    if (!post) {
      post = createPost(renderer, scene, camera, tier);
      post.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
      post.setGrade(tier.post ? mood.grade : NO_GRADE);
    }
    return post;
  }
  addEventListener('resize', resize);

  applyQuality(settings.quality);

  /**
   * Draws the world, then (optionally) the gun in your hands on top of it.
   * The gun has its own scene and camera; clearing the depth in between means
   * it's always drawn in front, so it can never poke through a wall.
   * @param {{scene, camera}|null} overlay  the gun in your hands
   * @param {number} [dt] seconds since the last frame
   */
  function render(overlay, dt = 1 / 60) {
    if (tier.post || nvg > 0) {
      const p = chain();
      p.nvg = nvg;
      p.render(overlay, dt);
      return;
    }
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    if (overlay) {
      renderer.clearDepth();
      renderer.render(overlay.scene, overlay.camera);
    }
  }

  return {
    renderer,
    scene,
    camera,
    sunDir,
    setSun,
    setMood,
    /** The mood being shown (the gun in your hands is lit to match). */
    get mood() { return mood; },
    followWithShadows,
    applyQuality,
    render,
    /** Night vision, 0 (off) .. 1 (goggles fully down): drawn by render/post.js, even on low. */
    set nvg(v) { nvg = v; },
    get nvg() { return nvg; },
    /** The post-processing chain in use (render/post.js), or null. For the tests and the tuning panel. */
    get post() { return post; },
  };
}
