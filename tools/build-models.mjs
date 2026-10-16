#!/usr/bin/env node
// Builds the game's 3D models in assets/models/ from free (CC0) packs.
//
// The packs are big: the animation library alone is two 8 MB files with 86
// animations, most of which we'll never play (dancing, sword fights, farming).
// This keeps only what the game uses, joins the two libraries (they share one
// skeleton), and squeezes out repeated data, so the browser downloads a
// fraction of it. Like build-sounds.py: run it once on your computer, and
// commit what it writes. Nothing here runs when you play.
//
// Sources (all CC0, see CREDITS.md):
//   --ual1  UAL1_Standard.glb from Quaternius' Universal Animation Library (Standard)
//           https://quaternius.itch.io/universal-animation-library
//   --ual2  UAL2_Standard.glb from Universal Animation Library 2 (Standard)
//           https://quaternius.itch.io/universal-animation-library-2
//   --guns  the OBJ folder from Quaternius' Ultimate Gun Pack
//           https://quaternius.itch.io/50-lowpoly-guns
//
// Usage:
//   node tools/build-models.mjs --ual1 PATH --ual2 PATH --guns DIR [--out assets/models]
//
// Needs the dev dependencies (npm install): @gltf-transform/core and /functions,
// and meshoptimizer (for the soldier's simplified far-away copy).

import { NodeIO, Document } from '@gltf-transform/core';
import { prune, dedup, resample, weld, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

// The animations the soldiers play (render/character.js), and where each comes from.
export const SOLDIER_CLIPS = {
  ual1: [
    'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', // moving
    'Crouch_Idle_Loop', 'Crouch_Fwd_Loop',                    // crouched
    'Hit_Chest', 'Hit_Head',                                  // flinches
  ],
  ual2: [
    'LayToIdle',     // its first moment: lying on the ground (downed)
    'OverhandThrow', // grenades
  ],
};

const { values: args } = parseArgs({
  options: {
    ual1: { type: 'string' },
    ual2: { type: 'string' },
    guns: { type: 'string' },
    out: { type: 'string', default: path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'models') },
  },
});
if (!args.ual1 || !args.ual2) {
  console.error('Usage: node tools/build-models.mjs --ual1 UAL1_Standard.glb --ual2 UAL2_Standard.glb');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(args.ual1);
const extra = await io.read(args.ual2);
const root = doc.getRoot();

// 1. Keep only our animations from the first library.
// (Its keyframes too: removing an animation leaves its data behind otherwise.)
const drop = (a) => {
  for (const s of a.listSamplers()) {
    const data = [s.getInput(), s.getOutput()];
    s.dispose();
    for (const d of data) if (d && d.listParents().every((p) => p === root)) d.dispose();
  }
  a.dispose();
};
for (const a of root.listAnimations()) if (!SOLDIER_CLIPS.ual1.includes(a.getName())) drop(a);

// 2. Copy ours from the second library across, aimed at the bones with the same names.
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const copyAccessor = (a) => doc.createAccessor(a.getName())
  .setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
for (const src of extra.getRoot().listAnimations()) {
  if (!SOLDIER_CLIPS.ual2.includes(src.getName())) continue;
  const anim = doc.createAnimation(src.getName());
  for (const ch of src.listChannels()) {
    const target = byName.get(ch.getTargetNode()?.getName());
    if (!target) continue;
    const s = ch.getSampler();
    const sampler = doc.createAnimationSampler()
      .setInput(copyAccessor(s.getInput())).setOutput(copyAccessor(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler);
    anim.addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}

const missing = [...SOLDIER_CLIPS.ual1, ...SOLDIER_CLIPS.ual2].filter((n) => !root.listAnimations().some((a) => a.getName() === n));
if (missing.length) throw new Error(`Missing animations: ${missing.join(', ')}`);

// 3. Squeeze: drop keyframes that a straight line between their neighbours
//    would give anyway, then anything nothing uses, then duplicates.
await doc.transform(resample({ tolerance: 1e-4 }), prune(), dedup(), prune());
// Anything still left over with nothing using it goes too.
for (const a of root.listAccessors()) if (a.listParents().every((p) => p === root)) a.dispose();

// 4. A simpler copy of the body for soldiers far away ("level of detail"): about
//    a quarter of the triangles, on the same skeleton, so the same animations
//    move it. Nobody can tell the difference 20 m away; the graphics card can.
//    (render/character.js shows one or the other.)
export const FAR_RATIO = 0.25;
await MeshoptSimplifier.ready;
for (const node of root.listNodes().filter((n) => n.getMesh() && n.getSkin())) {
  const near = node.getMesh();
  const far = doc.createMesh(`${near.getName()}_far`);
  for (const prim of near.listPrimitives()) {
    const copy = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode());
    for (const semantic of prim.listSemantics()) copy.setAttribute(semantic, copyAccessor(prim.getAttribute(semantic)));
    copy.setIndices(copyAccessor(prim.getIndices()));
    simplifyPrimitive(copy, { simplifier: MeshoptSimplifier, ratio: FAR_RATIO, error: 0.01 });
    far.addPrimitive(copy);
  }
  const farNode = doc.createNode(`${node.getName()}_far`).setMesh(far).setSkin(node.getSkin());
  for (const parent of node.listParents()) if (parent.propertyType === 'Node' || parent.propertyType === 'Scene') parent.addChild(farNode);
  const tris = (m) => m.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
  console.log(`${node.getName()}: ${tris(near)} triangles near, ${tris(far)} far`);
}
await doc.transform(prune());

fs.mkdirSync(args.out, { recursive: true });
const file = path.join(args.out, 'soldier.glb');
await io.write(file, doc);
console.log(`${file}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${root.listAnimations().length} animations`);

// ---------------------------------------------------------------- guns
// The gun pack comes as OBJ files (a simple text format: corners, then the
// triangles between them, each group in a named colour). Each gun becomes one
// mesh in guns.glb, named after our gun, turned to point along -Z (forwards in
// the game), scaled to its real length, and sitting on the floor of its own
// box, centred. Its colours are painted onto its corners ("vertex colours"), so
// every gun shares one material: one draw call each. render/gun-models.js
// knows where the grip, the sights and the muzzle are on each.
//
// `paint`: [pack colour name, our colour, box?] rules, first match wins. The
// pack's own colours are near-black; ours are the code-built guns' palette
// (GUN_COLORS in weapons/weapons-data.js), so the look stays the same. A box
// ([[x, y, z], [x, y, z]], in the finished gun's metres) limits a rule to the
// triangles whose middles are inside it.
// `parts`: pieces that move on their own (the magazine drops out on a reload,
// the shotgun's pump slides, the pistol's slide snaps back), picked out the same
// way; each becomes its own child node, `<gun>_<part>`.
const C = { body: '#5b6052', dark: '#383b33', olive: '#7a8a5a', tan: '#b89c6c', metal: '#8c8f88', wood: '#7a5a40', glass: '#1d3346' };
const ANY = 9;
export const GUNS = {
  carbine: {
    file: 'AssaultRifle2_2', length: 0.86,
    paint: [['Main', C.olive, [[-ANY, -ANY, -0.075], [ANY, 0.205, 0.07]]], ['Main', C.body], ['MainDark', C.dark], ['MainLight', C.dark]],
    parts: { mag: ['Main', [[-ANY, -ANY, -0.075], [ANY, 0.205, 0.07]]] },
  },
  smg: {
    file: 'SubmachineGun_2', length: 0.62,
    paint: [['Black', C.dark], ['DarkMetal', C.body], ['Grey', C.metal], ['Metal', C.olive]],
    parts: { mag: ['DarkMetal', [[-ANY, -ANY, -0.14], [ANY, 0.15, -0.05]]] },
  },
  shotgun: {
    file: 'Shotgun_1', length: 1.0,
    paint: [['Black', C.tan, [[-ANY, 0.06, -0.32], [ANY, 0.15, -0.08]]], ['Black', C.dark], ['DarkMetal', C.dark], ['LightMetal', C.tan], ['Metal', C.body]],
    parts: { pump: ['Black', [[-ANY, 0.06, -0.32], [ANY, 0.15, -0.08]]] },
  },
  pistol: {
    file: 'Pistol_1', length: 0.21,
    paint: [['Black', C.body], ['Black2', C.dark], ['DarkMetal', C.dark], ['DarkWood', C.wood], ['Metal', C.metal]],
    parts: { slide: ['Black', [[-ANY, 0.098, -ANY], [ANY, ANY, ANY]]] },
  },
  dmr: {
    file: 'SniperRifle_4', length: 1.16,
    paint: [['Black', C.dark, [[-ANY, 0.185, -ANY], [ANY, ANY, ANY]]], ['Black', C.tan], ['DarkMetal', C.dark], ['Grey', C.metal], ['Metal', C.dark], ['Glass', C.glass]],
  },
};

/** '#rrggbb' to the linear 0..1 numbers glTF stores colours in. */
const linear = (hex) => [1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const inside = (p, box) => !box || [0, 1, 2].every((i) => p[i] >= box[0][i] && p[i] <= box[1][i]);

function readObj(dir, name) {
  const colours = {};
  let current = null;
  for (const line of fs.readFileSync(path.join(dir, `${name}.mtl`), 'utf8').split('\n')) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === 'newmtl') current = v[0];
    if (k === 'Kd') colours[current] = v.map(Number);
  }
  const vs = [], ns = [], pos = [], nor = [], mat = [];
  let colour = null;
  for (const line of fs.readFileSync(path.join(dir, `${name}.obj`), 'utf8').split('\n')) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === 'v') vs.push(v.map(Number));
    else if (k === 'vn') ns.push(v.map(Number));
    else if (k === 'usemtl') colour = v[0];
    else if (k === 'f') {
      const corners = v.map((c) => c.split('/').map((n) => parseInt(n, 10)));
      for (let i = 1; i < corners.length - 1; i++) { // a polygon is a fan of triangles
        for (const c of [corners[0], corners[i], corners[i + 1]]) {
          pos.push(...vs[c[0] - 1]);
          nor.push(...(c[2] ? ns[c[2] - 1] : [0, 1, 0]));
        }
        mat.push(colour); // one per triangle
      }
    }
  }
  return { pos, nor, mat };
}

/** Builds one mesh from the triangles `keep(i)` says yes to. */
function gunMesh(gunsDoc, buf, material, name, P, N, colours, keep) {
  const p = [], n = [], c = [];
  for (let t = 0; t < P.length / 9; t++) {
    if (!keep(t)) continue;
    p.push(...P.subarray(t * 9, t * 9 + 9));
    n.push(...N.subarray(t * 9, t * 9 + 9));
    for (let j = 0; j < 3; j++) c.push(...colours[t]);
  }
  const prim = gunsDoc.createPrimitive()
    .setAttribute('POSITION', gunsDoc.createAccessor().setType('VEC3').setArray(new Float32Array(p)).setBuffer(buf))
    .setAttribute('NORMAL', gunsDoc.createAccessor().setType('VEC3').setArray(new Float32Array(n)).setBuffer(buf))
    .setAttribute('COLOR_0', gunsDoc.createAccessor().setType('VEC3').setArray(new Float32Array(c)).setBuffer(buf))
    .setMaterial(material);
  return gunsDoc.createMesh(name).addPrimitive(prim);
}

if (args.guns) {
  const gunsDoc = new Document();
  const buf = gunsDoc.createBuffer();
  const scene = gunsDoc.createScene('guns');
  const material = gunsDoc.createMaterial('gun').setRoughnessFactor(0.55).setMetallicFactor(0.25);
  for (const [id, spec] of Object.entries(GUNS)) {
    const { pos, nor, mat } = readObj(args.guns, spec.file);
    // Turn (+X becomes -Z: the barrel points forwards), then measure, scale and centre.
    const P = new Float32Array(pos.length), N = new Float32Array(nor.length);
    for (let i = 0; i < pos.length; i += 3) {
      P[i] = pos[i + 2]; P[i + 1] = pos[i + 1]; P[i + 2] = -pos[i];
      N[i] = nor[i + 2]; N[i + 1] = nor[i + 1]; N[i + 2] = -nor[i];
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i++) { min[i % 3] = Math.min(min[i % 3], P[i]); max[i % 3] = Math.max(max[i % 3], P[i]); }
    const k = spec.length / (max[2] - min[2]);
    for (let i = 0; i < P.length; i += 3) {
      P[i] = (P[i] - (min[0] + max[0]) / 2) * k;
      P[i + 1] = (P[i + 1] - min[1]) * k;
      P[i + 2] = (P[i + 2] - (min[2] + max[2]) / 2) * k;
    }
    // Paint and sort each triangle, judged by its middle.
    const middle = (t) => [0, 1, 2].map((i) => (P[t * 9 + i] + P[t * 9 + 3 + i] + P[t * 9 + 6 + i]) / 3);
    const colours = mat.map((m, t) => {
      const rule = spec.paint.find(([name, , box]) => name === m && inside(middle(t), box));
      if (!rule) throw new Error(`${id}: nothing paints ${m}`);
      return linear(rule[1]);
    });
    const partOf = mat.map((m, t) => Object.entries(spec.parts ?? {}).find(([, [name, box]]) => name === m && inside(middle(t), box))?.[0]);
    const node = gunsDoc.createNode(id).setMesh(gunMesh(gunsDoc, buf, material, id, P, N, colours, (t) => !partOf[t]));
    for (const part of Object.keys(spec.parts ?? {})) {
      const count = partOf.filter((p) => p === part).length;
      if (!count) throw new Error(`${id}: the ${part} is empty`);
      node.addChild(gunsDoc.createNode(`${id}_${part}`).setMesh(gunMesh(gunsDoc, buf, material, `${id}_${part}`, P, N, colours, (t) => partOf[t] === part)));
    }
    scene.addChild(node);
  }
  await gunsDoc.transform(weld(), dedup(), prune());
  const gunsFile = path.join(args.out, 'guns.glb');
  await io.write(gunsFile, gunsDoc);
  console.log(`${gunsFile}  ${(fs.statSync(gunsFile).size / 1024).toFixed(0)} KB, ${Object.keys(GUNS).length} guns`);
}
