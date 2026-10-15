// Grey-box materials: the "prototype grid" look.
//
// Before real art exists, studios cover everything in a plain grid texture.
// The grid is exactly 1 metre per square, so you can judge sizes, distances and
// speeds at a glance ("that wall is 3 squares tall, I cover 5 squares a second").
// Colours carry meaning: orange ledges can be climbed, red means "too much",
// blue ramps, green stairs.
//
// The textures are drawn by code onto a canvas, so there are no image files to load.

import * as THREE from 'three';

export const PALETTE = {
  ground:   { base: '#4b5046', line: '#565c50', edge: '#666d5f' },
  concrete: { base: '#8f8b80', line: '#99958a', edge: '#a8a497' },
  wall:     { base: '#6b6a62', line: '#74736b', edge: '#807f76' },
  ledge:    { base: '#c4702f', line: '#cc7b3b', edge: '#dc8f4f' },
  hazard:   { base: '#983a31', line: '#a2443a', edge: '#b4544a' },
  ramp:     { base: '#4f6f8f', line: '#587999', edge: '#6a8aa8' },
  stairs:   { base: '#6c7e57', line: '#758760', edge: '#86986f' },
  crate:    { base: '#7c5e3c', line: '#856744', edge: '#977852' },
  post:     { base: '#5a5e53', line: '#61655a', edge: '#6d7165' },
};

const SIZE = 256; // pixels per 1 m square

function gridTexture({ base, line, edge }, maxAnisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, SIZE, SIZE);
  // Faint quarter-metre lines.
  g.fillStyle = line;
  for (let i = 1; i < 4; i++) {
    const p = (i * SIZE) / 4;
    g.fillRect(p - 1, 0, 2, SIZE);
    g.fillRect(0, p - 1, SIZE, 2);
  }
  // Strong 1 m lines at the tile edge (half on each side, so they meet when tiled).
  g.fillStyle = edge;
  g.fillRect(0, 0, 3, SIZE);
  g.fillRect(SIZE - 3, 0, 3, SIZE);
  g.fillRect(0, 0, SIZE, 3);
  g.fillRect(0, SIZE - 3, SIZE, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy; // keeps the floor grid crisp at shallow angles
  return tex;
}

export function createMaterials(renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const materials = {};
  for (const [name, colors] of Object.entries(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      map: gridTexture(colors, aniso),
      roughness: name === 'ramp' ? 0.75 : 0.9,
      metalness: 0,
    });
  }
  return materials;
}
