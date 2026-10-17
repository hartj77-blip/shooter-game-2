// Post-processing: work done on the finished picture, like a photo filter.
//
// Without it (low quality), three.js draws the world straight onto the screen.
// With it, the world is drawn into a hidden picture first (a "render target"),
// then a chain of PASSES each take the picture so far and change it:
//
//   1. the world                        (RenderPass)
//   2. soft shadows in corners and      (GTAOPass, high quality: "ambient
//      creases, where light can't reach  occlusion", like dust settling in corners)
//   3. the gun in your hands, on top    (RenderPass, keeping the colours, clearing
//                                        the depth, as before)
//   4. a glow round bright things:      (UnrealBloomPass, high quality)
//      muzzle flashes, lamps, explosions
//   5. tone mapping and screen colours  (OutputPass: what three.js does itself
//                                        when drawing straight to the screen)
//   6. the colour grade, the vignette,  (GRADE, below: our own little shader)
//      and night vision
//
// The hidden pictures hold light brighter than white ("half float"), so bloom
// knows what's really bright, and are drawn with 4x multisampling, the same
// smoothing of jagged edges the screen gets on low quality.
//
// The grade comes from the map's mood (render/moods.js `grade`): saturation,
// contrast, a tint and how dark the corners get. A colourist's job on a film.
// Presentation only: nothing here touches the simulation.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Feel numbers (the tuning panel's Graphics folder has sliders for them).
export const POST = {
  bloomStrength: 0.35,  // how strong the glow is
  bloomRadius: 0.4,     // how far it spreads
  bloomThreshold: 0.9,  // only light brighter than this glows (1 = white)
  aoIntensity: 0.8,     // how dark the ambient occlusion gets
  aoRadius: 0.5,        // metres: how far it looks for nearby surfaces
  nvgGain: 2.6,         // night vision: how much it brightens
  nvgGrain: 0.14,       // ...and how grainy it is
};

/**
 * The grade, the vignette and night vision, in one pass over the screen (after
 * tone mapping, so it works on the colours you see).
 */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    contrast: { value: 1 },
    tint: { value: new THREE.Color('#ffffff') },
    vignette: { value: 0.2 },
    nvg: { value: 0 },        // 0 off .. 1 goggles fully down
    nvgGain: { value: POST.nvgGain },
    nvgGrain: { value: POST.nvgGrain },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, vignette, nvg, nvgGain, nvgGrain, time;
    uniform vec3 tint;
    uniform vec2 resolution;
    varying vec2 vUv;
    // A cheap random number per pixel (changes every frame: film grain).
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, saturation);       // saturation: towards grey or away
      col = (col - 0.5) * contrast + 0.5;          // contrast: darks darker, lights lighter
      col *= tint;
      // Night vision: one brightness, amplified, grainy, in phosphor green.
      if (nvg > 0.0) {
        float g = lum * nvgGain + 0.03;
        g += (hash(floor(vUv * resolution) + fract(time) * 97.0) - 0.5) * nvgGrain;
        col = mix(col, vec3(0.32, 1.0, 0.42) * g, nvg);
      }
      // Vignette: the corners darken (goggles darken them much more).
      vec2 d = vUv - 0.5;
      d.x *= resolution.x / resolution.y;
      float edge = smoothstep(0.35, 1.0, length(d) * 1.25);
      col *= 1.0 - edge * clamp(vignette + nvg * 0.7, 0.0, 1.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene   the world
 * @param {THREE.Camera} camera
 * @param {{ao:boolean, bloom:boolean}} tier  which of the optional passes are on
 */
export function createPost(renderer, scene, camera, tier) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.isWebGL2 === false ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, target);

  composer.addPass(new RenderPass(scene, camera));

  let ao = null;
  if (tier.ao) {
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.blendIntensity = POST.aoIntensity;
    ao.updateGtaoMaterial({ radius: POST.aoRadius });
    composer.addPass(ao);
  }

  // The gun in your hands: drawn over the world, never into it.
  const hands = new RenderPass(new THREE.Scene(), camera);
  hands.clear = false;
  hands.clearDepth = true;
  composer.addPass(hands);

  let bloom = null;
  if (tier.bloom) {
    bloom = new UnrealBloomPass(size.clone(), POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  const u = grade.uniforms;

  return {
    composer,
    /** The colour grade for a mood (render/moods.js). */
    setGrade(g) {
      u.saturation.value = g.saturation;
      u.contrast.value = g.contrast;
      u.tint.value.set(g.tint);
      u.vignette.value = g.vignette;
    },
    /** Night vision, 0 (off) .. 1 (goggles fully down). */
    set nvg(v) { u.nvg.value = v; },
    get nvg() { return u.nvg.value; },
    /**
     * Draw a frame. `overlay` is the gun in your hands ({ scene, camera }) or null.
     * @param {number} dt seconds since the last frame (for the grain)
     */
    render(overlay, dt) {
      hands.enabled = !!overlay;
      if (overlay) { hands.scene = overlay.scene; hands.camera = overlay.camera; }
      u.time.value = (u.time.value + dt) % 1000;
      u.nvgGain.value = POST.nvgGain;
      u.nvgGrain.value = POST.nvgGrain;
      if (bloom) {
        bloom.strength = POST.bloomStrength;
        bloom.radius = POST.bloomRadius;
        bloom.threshold = POST.bloomThreshold;
      }
      if (ao) ao.blendIntensity = POST.aoIntensity;
      composer.render(dt);
    },
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      u.resolution.value.set(w * pixelRatio, h * pixelRatio);
    },
    dispose() {
      ao?.dispose();
      bloom?.dispose();
      grade.dispose?.();
      composer.dispose();
      target.dispose();
    },
  };
}
