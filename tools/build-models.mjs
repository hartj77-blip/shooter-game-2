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
//
// Usage:
//   node tools/build-models.mjs --ual1 PATH --ual2 PATH [--out assets/models]
//
// Needs the dev dependencies (npm install): @gltf-transform/core and /functions.

import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
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

fs.mkdirSync(args.out, { recursive: true });
const file = path.join(args.out, 'soldier.glb');
await io.write(file, doc);
console.log(`${file}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${root.listAnimations().length} animations`);
