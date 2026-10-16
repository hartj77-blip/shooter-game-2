// Freeing graphics memory when a mission ends.
//
// Shapes (geometries), materials and pictures (textures) live on the graphics
// card, and the browser's garbage collector can't see them there. If we simply
// forgot about a level's meshes, their memory would stay used until the page
// closed. So when a mission ends we walk through everything it drew and hand
// it back with dispose().
//
// Some shapes and materials are shared between missions (soldier parts are
// built once and reused). Disposing one of those is still safe: three.js
// quietly uploads it again the next time something draws with it.

/** Dispose every geometry, material, texture and skeleton under `root`. */
export function disposeTree(root) {
  const seen = new Set();
  const once = (thing) => {
    if (!thing || seen.has(thing)) return;
    seen.add(thing);
    thing.dispose();
  };
  root.traverse((o) => {
    once(o.geometry);
    // An animated character's skeleton keeps its bones' positions in a small texture
    // of its own for the graphics card: one per soldier, so it adds up fast.
    if (o.isSkinnedMesh) once(o.skeleton);
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) {
      if (!m) continue;
      for (const value of Object.values(m)) if (value?.isTexture) once(value);
      once(m);
    }
  });
}
