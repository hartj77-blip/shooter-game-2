// The renderer: turns the 3D scene into the picture on your screen.
//
// three.js does the heavy lifting. This file sets up the parts every 3D game
// needs: a camera, a sky, fog, a sun that casts shadows, soft light from the
// sky, and "tone mapping" (squeezing very bright and very dark light into the
// range a screen can show, like a camera's auto-exposure).

import * as THREE from 'three';

const SKY_TOP = new THREE.Color('#5d86b8');
const SKY_HORIZON = new THREE.Color('#c9d3d2');
const GROUND_BOUNCE = new THREE.Color('#5a5544');

// Graphics quality presets. "Pixel ratio" is how many real screen pixels each
// CSS pixel gets: 2 is sharp on high-DPI screens but four times the work of 1.
export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 0 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024 },
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048 },
};

const SHADOW_RANGE = 36; // metres around you that get sharp shadows

export function createRenderer(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON, 70, 260);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
  scene.add(camera); // so things attached to the camera (later: your gun) get drawn

  // Sky: a huge ball around the camera, coloured from horizon to zenith.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
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

  // Soft light from the whole sky (blue-ish from above, warm bounce from the ground).
  scene.add(new THREE.HemisphereLight(SKY_TOP.clone().lerp(SKY_HORIZON, 0.4), GROUND_BOUNCE, 2.4));

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
  }
  addEventListener('resize', resize);

  applyQuality(settings.quality);

  return {
    renderer,
    scene,
    camera,
    setSun,
    followWithShadows,
    applyQuality,
    render: () => renderer.render(scene, camera),
  };
}
