// Assets: the 3D models and textures the game downloads, loaded once and kept.
//
// Like the sounds (audio/audio.js), everything is fetched while the loading
// bar is up, before the first map, and kept for as long as the page is open,
// so changing map never downloads anything again. Each map makes its own
// copies of what it needs (a soldier is a clone of the one loaded model) and
// throws its copies away when it ends; the originals here stay. (A map's
// dispose() may free the graphics card's copy of a shared texture; three.js
// simply uploads it again the next time it's drawn.)
//
// If a file fails to load (a slow connection, a file missing), the game must
// still work: whoever asks gets null, and draws the old code-built version
// instead (a FALLBACK). `failed` lists what went wrong, for the console and the
// browser tests.
//
// Models are glTF ("GL Transmission Format", .glb in one binary file): the
// common format for 3D models on the web, like JPEG for pictures. Our .glb
// files are made from the CC0 packs by tools/build-models.mjs (lesson 18).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = 'assets/';

/** Everything to load: name -> file (under assets/). */
export const MANIFEST = {
  models: {},
  textures: {},
};

export function createAssets({ manifest = MANIFEST, base = BASE } = {}) {
  const models = new Map();   // name -> the loaded glTF ({ scene, animations })
  const textures = new Map(); // name -> THREE.Texture
  const failed = [];
  const gltf = new GLTFLoader();
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const images = new THREE.TextureLoader();

  /** Load everything; reports progress 0..1. Never throws: failures are noted and skipped. */
  async function preload(onProgress = () => {}) {
    const jobs = [
      ...Object.entries(manifest.models).map(([name, file]) => async () => {
        models.set(name, await gltf.loadAsync(base + file));
      }),
      ...Object.entries(manifest.textures).map(([name, file]) => async () => {
        const t = await images.loadAsync(base + file);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        textures.set(name, t);
      }),
    ];
    let done = 0;
    await Promise.all(jobs.map(async (job, i) => {
      try {
        await job();
      } catch (err) {
        const name = [...Object.keys(manifest.models), ...Object.keys(manifest.textures)][i];
        failed.push(name);
        console.warn(`Couldn't load ${name}: using the fallback.`, err?.message ?? err);
      }
      onProgress(++done / Math.max(1, jobs.length));
    }));
  }

  return {
    preload,
    /** A loaded model ({ scene, animations }), or null if it isn't there. Don't change it: clone it. */
    model: (name) => models.get(name) ?? null,
    /** A loaded texture, or null. Shared by every map. */
    texture: (name) => textures.get(name) ?? null,
    failed,
  };
}
