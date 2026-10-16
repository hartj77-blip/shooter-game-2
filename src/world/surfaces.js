// Surfaces: what each collider in the world is made of, and what it belongs to.
//
// The physics engine only knows shapes. When a bullet hits collider number 42,
// we need to know "that's concrete" (dust and a crack sound, stops the bullet)
// or "that's the head of target 7" (double damage). This file keeps that
// lookup table, keyed by Rapier's collider handle.

// `resistance`: how hard the material is to shoot through, in "metres of wood"
// per metre. Infinity means bullets never get through.
export const SURFACES = {
  dirt:     { resistance: Infinity, sound: 'hit_dirt',     dust: '#8a7a5c', sparks: false },
  concrete: { resistance: Infinity, sound: 'hit_concrete', dust: '#b7b2a6', sparks: false },
  metal:    { resistance: Infinity, sound: 'hit_metal',    dust: '#9aa0a6', sparks: true },
  steel:    { resistance: Infinity, sound: 'ding',         dust: '#c9ccd0', sparks: true },
  wood:     { resistance: 1,        sound: 'hit_wood',     dust: '#a0794a', sparks: false },
  target:   { resistance: Infinity, sound: 'hit_paper',    dust: '#e9e2cf', sparks: false },
  // A soldier's hitboxes. Stylized: a puff of uniform fabric, not gore.
  flesh:    { resistance: Infinity, sound: 'hit_flesh',    dust: '#5a4a3e', sparks: false },
  sandbag:  { resistance: Infinity, sound: 'hit_dirt',     dust: '#a89470', sparks: false },
};

// Which surface each level material is made of.
export const MATERIAL_SURFACE = {
  ground: 'dirt',
  concrete: 'concrete',
  wall: 'concrete',
  ledge: 'concrete',
  hazard: 'concrete',
  stairs: 'concrete',
  post: 'metal',
  ramp: 'metal',
  crate: 'wood',
  plank: 'wood',
  steel: 'steel',
  container: 'metal',
  sandbag: 'sandbag',
  roof: 'concrete',
  floor: 'concrete',
  asphalt: 'concrete',
  quay: 'concrete',
  whitewash: 'concrete',
  brick: 'concrete',
  roof_red: 'concrete',
};

export function createSurfaceRegistry() {
  const byHandle = new Map();
  return {
    /** Remember what a collider is. `info` is { surface, target?, zone? }. */
    set(collider, info) {
      byHandle.set(collider.handle, info);
    },
    get(collider) {
      return byHandle.get(collider.handle) ?? { surface: 'concrete' };
    },
    delete(collider) {
      byHandle.delete(collider.handle);
    },
    get size() { return byHandle.size; },
  };
}
