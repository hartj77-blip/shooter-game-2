// The level's materials: what each kind of surface looks like.
//
// Every surface has a colour from PALETTE. Colours carry meaning: orange ledges
// can be climbed, red means "too much", blue ramps, green stairs.
//
// With the textures loaded (assets/textures/, made by tools/build-textures.py
// from Poly Haven's CC0 photos), each colour is painted over a real surface:
// concrete, plaster, brick, corrugated iron... The photo only brings its light
// and dark detail (it's grey); the colour still comes from PALETTE, like
// painting a white plaster cast. A second picture, the "normal map", tells the
// light which way each tiny bit faces, so grooves and cracks catch the sun.
// A faint line every metre stays in the textures, so distances still read.
//
// Without them (a file didn't load, or before M6), the old grey-box look: a plain
// grid drawn by code, exactly 1 metre per square, so you can judge sizes and
// speeds at a glance ("that wall is 3 squares tall, I cover 5 squares a second").

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
  plank:    { base: '#9a7a4e', line: '#a3835a', edge: '#b39468' },
  steel:    { base: '#4e5358', line: '#565b60', edge: '#62676c' },
  // The Compound (milestone 3).
  container:      { base: '#5d6b4c', line: '#667456', edge: '#738263' },
  container_red:  { base: '#7d3f30', line: '#874839', edge: '#985747' },
  container_blue: { base: '#3e5a72', line: '#47637b', edge: '#55728a' },
  sandbag:  { base: '#9b8a66', line: '#a3926e', edge: '#b0a07c' },
  floor:    { base: '#7f7a6e', line: '#888378', edge: '#959084' },
  roof:     { base: '#5e5a52', line: '#66625a', edge: '#726e65' },
  // The Harbour (milestone 5).
  asphalt:   { base: '#45474a', line: '#4c4e51', edge: '#56585b' },
  quay:      { base: '#7d7a72', line: '#86837b', edge: '#939088' },
  whitewash: { base: '#c9c3b4', line: '#d0cabc', edge: '#dad4c6' },
  brick:     { base: '#7a4f3e', line: '#835847', edge: '#926453' },
  roof_red:  { base: '#8a4a35', line: '#93533e', edge: '#a2604a' },
};

// Which real surface each palette colour is painted on.
export const SURFACE_OF = {
  ground: 'ground', concrete: 'concrete', wall: 'plaster', ledge: 'concrete', hazard: 'concrete',
  ramp: 'concrete', stairs: 'concrete', crate: 'wood', post: 'concrete', plank: 'wood', steel: 'plate',
  container: 'metal', container_red: 'metal', container_blue: 'metal', sandbag: 'ground',
  floor: 'concrete', roof: 'metal', asphalt: 'asphalt', quay: 'concrete', whitewash: 'plaster',
  brick: 'brick', roof_red: 'tiles',
};

// The surfaces: how many metres one picture covers (tools/build-textures.py
// SURFACES says the same), and how shiny it is.
export const SURFACES = {
  concrete: { metres: 2, roughness: 0.9 },
  ground: { metres: 2, roughness: 0.95 },
  plaster: { metres: 4, roughness: 0.9 },
  brick: { metres: 2, roughness: 0.9 },
  metal: { metres: 3, roughness: 0.6, metalness: 0.25 },
  tiles: { metres: 4, roughness: 0.85 },
  wood: { metres: 2, roughness: 0.85 },
  asphalt: { metres: 3, roughness: 0.95 },
  plate: { metres: 1, roughness: 0.55, metalness: 0.4 },
};

/** The texture files the game loads (render/assets.js). */
export const SURFACE_TEXTURES = Object.fromEntries(Object.keys(SURFACES).flatMap((name) => [
  [`${name}_color`, `textures/${name}_color.jpg`],
  [`${name}_normal`, `textures/${name}_normal.jpg`],
]));

// The colour textures average this bright (0..1, as stored): the colour is
// divided by it, so a painted surface comes out the palette's colour on average.
const DETAIL_MEAN = 0.8;
const UNDO_DETAIL = 1 / new THREE.Color().setRGB(DETAIL_MEAN, DETAIL_MEAN, DETAIL_MEAN, THREE.SRGBColorSpace).r;

const SIZE = 256; // pixels per 1 m square (the grey-box grid)

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

/** A surface's two loaded textures, ready to tile (1 UV = 1 m), or null if either is missing. */
function surfaceTextures(assets, name, aniso) {
  const map = assets?.texture(`${name}_color`), normalMap = assets?.texture(`${name}_normal`);
  if (!map || !normalMap) return null;
  const k = 1 / SURFACES[name].metres;
  map.colorSpace = THREE.SRGBColorSpace;
  normalMap.colorSpace = THREE.NoColorSpace; // directions, not colours: no colour conversion
  for (const t of [map, normalMap]) {
    t.repeat.set(k, k);
    t.anisotropy = aniso; // keeps floors crisp at shallow angles
  }
  return { map, normalMap };
}

/**
 * A painted area on the floor (a road, a lane, a start zone): any colour, on
 * the concrete surface when the textures loaded. Its geometry's UVs must be in
 * metres, like the level's.
 */
export function paintMaterial(color, materials) {
  const concrete = materials.concrete;
  const textured = !!concrete.normalMap;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(textured ? UNDO_DETAIL : 1),
    map: textured ? concrete.map : null,
    normalMap: textured ? concrete.normalMap : null,
    roughness: 0.95,
    polygonOffset: true, // drawn just above the ground it lies on, so they don't flicker
    polygonOffsetFactor: -1,
  });
}

/**
 * One material per palette colour.
 * @param {object} renderer  for the graphics card's sharpest texture filtering
 * @param {object} [assets]  render/assets.js: the loaded textures (else the grey-box grid)
 */
export function createMaterials(renderer, assets = null) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const materials = {};
  for (const [name, colors] of Object.entries(PALETTE)) {
    const surface = SURFACE_OF[name];
    const tex = surfaceTextures(assets, surface, aniso);
    materials[name] = tex
      ? new THREE.MeshStandardMaterial({
        ...tex,
        color: new THREE.Color(colors.base).multiplyScalar(UNDO_DETAIL),
        roughness: SURFACES[surface].roughness,
        metalness: SURFACES[surface].metalness ?? 0,
      })
      : new THREE.MeshStandardMaterial({
        map: gridTexture(colors, aniso),
        roughness: name === 'ramp' ? 0.75 : 0.9,
        metalness: 0,
      });
  }
  return materials;
}
