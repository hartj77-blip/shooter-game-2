// Level view: builds the meshes you see from the same shape descriptions the
// physics uses (src/world/kit.js), so the picture always matches the colliders.
//
// BATCHING. Every separate mesh costs a DRAW CALL: the computer stops and tells
// the graphics card "now draw this one, with this material". That's like a
// shopping trip per item: the travel, not the shopping, takes the time. So the
// level's pieces are joined into a few big meshes, one per material...
// but not one for the whole map: per 32 m TILE. A tile behind you, or off to
// the side, is skipped entirely (CULLING: three.js checks each mesh against
// what the camera can see), which a single map-wide mesh never could be.
// The Harbour's 328 pieces become about a hundred meshes this way.

import * as THREE from 'three';
import { wedgePoints, WEDGE_TRIANGLES } from '../world/kit.js';
import { signTexture } from './signs.js';
import { mergeTextured } from './merge.js';
import { paintMaterial } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);
export const TILE = 32; // metres: the size of a batch

/**
 * Gives every triangle "planar" texture coordinates measured in world metres,
 * so the 1 m grid texture lines up across neighbouring pieces and never stretches,
 * even on ramps. (Texture coordinates, or UVs, say which part of the image goes
 * on which part of a surface.)
 */
function worldGridUVs(geometry, position, rotY) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), p = new THREE.Vector3();
  const toWorld = (vec, i) => vec.fromBufferAttribute(pos, i).applyAxisAngle(UP, rotY).add(position);

  for (let i = 0; i < pos.count; i += 3) {
    toWorld(a, i); toWorld(b, i + 1); toWorld(c, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    if (Math.abs(n.y) > 0.99) u.set(1, 0, 0);       // floors and ceilings: x across
    else u.crossVectors(UP, n).normalize();          // walls and slopes: horizontal across
    v.crossVectors(n, u);
    for (let k = 0; k < 3; k++) {
      toWorld(p, i + k);
      uv[(i + k) * 2] = p.dot(u);
      uv[(i + k) * 2 + 1] = p.dot(v);
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function wedgeGeometry(width, length, height) {
  const pts = wedgePoints(width, length, height);
  const positions = WEDGE_TRIANGLES.flatMap((tri) => tri.flatMap((k) => pts[k]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

export function buildLevelView(expanded, materials) {
  const group = new THREE.Group();
  group.name = 'level';

  // Each piece is built where it stands in the world, then put in its batch:
  // same material, same tile (by where its middle is).
  const batches = new Map(); // 'material|tileX|tileZ' -> geometries
  for (const solid of expanded.solids) {
    if (solid.hidden) continue; // invisible walls at the map's edge: felt, not seen
    const geometry = solid.kind === 'box'
      ? new THREE.BoxGeometry(...solid.size).toNonIndexed()
      : wedgeGeometry(solid.width, solid.length, solid.height);
    const position = new THREE.Vector3(...solid.center);
    worldGridUVs(geometry, position, solid.rotY);
    geometry.computeVertexNormals();
    geometry.rotateY(solid.rotY);
    geometry.translate(position.x, position.y, position.z);
    const mat = materials[solid.mat] ? solid.mat : 'concrete';
    // (The ground is one huge piece: it gets a batch of its own, whatever tile its middle is in.)
    const key = mat === 'ground' ? 'ground' : `${mat}|${Math.floor(position.x / TILE)}|${Math.floor(position.z / TILE)}`;
    if (!batches.has(key)) batches.set(key, { mat, list: [] });
    batches.get(key).list.push(geometry);
  }
  for (const [key, { mat, list }] of batches) {
    const geometry = mergeTextured(list);
    for (const g of list) g.dispose();
    const mesh = new THREE.Mesh(geometry, materials[mat]);
    mesh.name = key;
    mesh.castShadow = mat !== 'ground';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const paint of expanded.paint) {
    const geometry = new THREE.PlaneGeometry(paint.size[0], paint.size[1]);
    // UVs in metres (a plane's run 0..1 across it), so the surface keeps its real size.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * paint.size[0], uv.getY(i) * paint.size[1]);
    const mesh = new THREE.Mesh(geometry, paintMaterial(paint.color, materials));
    mesh.position.set(...paint.center);
    mesh.rotation.set(-Math.PI / 2, paint.rotY, 0, 'YXZ');
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const sign of expanded.signs) {
    const map = signTexture(sign);
    const material = new THREE.MeshStandardMaterial({
      map,
      transparent: !!sign.plain,
      depthWrite: !sign.plain,
      roughness: 0.8,
      // A little self-lighting keeps signs readable in shadow.
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: sign.plain ? 0.15 : 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sign.size[0], sign.size[1]), material);
    mesh.position.set(...sign.at);
    if (sign.floor) {
      mesh.position.y += 0.012;
      mesh.rotation.set(-Math.PI / 2, sign.rotY, 0, 'YXZ');
    } else {
      mesh.rotation.y = sign.rotY;
    }
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
