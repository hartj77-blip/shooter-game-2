// Outlines: a dark edge round the soldiers, so they stand out from the world
// (the "clean toon" look).
//
// The trick is called an INVERTED HULL. Each soldier gets a second copy of its
// body, puffed out a centimetre or so along its surface, drawn in flat dark
// colour, and with only its INSIDE faces drawn (three.js `BackSide`). Where the
// copy is behind the real body you can't see it; round the edges, the puffed
// out rim peeks past, and that rim is the outline. Like a sticker with a white
// border, except the border is drawn by the back of a slightly bigger sticker.
//
// It works on animated (skinned) bodies too, and costs one more draw per mesh:
// much cheaper than finding edges in the finished picture. The copies share
// their originals' shapes and skeletons; only the material is new.
//
// Medium and high quality only (render/renderer.js QUALITY.outlines).

import * as THREE from 'three';

export const OUTLINE = {
  width: 0.014,     // metres the hull is puffed out by
  color: '#16181a',
};

let material = null;

/** The one material every outline shares (so one switch turns them all on or off). */
export function outlineMaterial() {
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: OUTLINE.color, side: THREE.BackSide, fog: true });
    const width = { value: OUTLINE.width };
    material.userData.width = width;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.outlineWidth = width;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
        // Push each corner out along its surface direction, before the
        // skeleton moves it (so the puff follows the animation).
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
    };
  }
  return material;
}

/** Outlines on or off, everywhere (quality settings). */
export function setOutlines(on) {
  outlineMaterial().visible = on;
}

/** Live tuning (the tuning panel). */
export function setOutlineWidth(w) {
  OUTLINE.width = w;
  outlineMaterial().userData.width.value = w;
}

/**
 * The outline copy of a mesh: same shape (and skeleton, if it's animated),
 * outline material, added beside it. Returns the copy.
 */
export function addOutline(mesh) {
  const hull = mesh.isSkinnedMesh
    ? new THREE.SkinnedMesh(mesh.geometry, outlineMaterial())
    : new THREE.Mesh(mesh.geometry, outlineMaterial());
  if (mesh.isSkinnedMesh) {
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.boundingSphere = mesh.boundingSphere;
  }
  hull.position.copy(mesh.position);
  hull.quaternion.copy(mesh.quaternion);
  hull.scale.copy(mesh.scale);
  hull.frustumCulled = mesh.frustumCulled;
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.name = `${mesh.name}_outline`;
  mesh.parent.add(hull);
  return hull;
}
