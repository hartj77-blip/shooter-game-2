# Lesson 18: 3D models and assets

**The idea in one sentence:** real art arrives as files made by other people, so a game needs a small "kitchen" that trims them to size before shipping, a loader that fetches them once, a note of where each point that matters is on them, and a plan for when a file doesn't turn up.

## Assets, and where ours come from

Everything a game shows or plays that isn't code is an **asset**: models, textures, sounds, fonts. Until milestone 6 almost everything here was built by code (boxes for soldiers and guns, a grid drawn on a canvas). Now the soldiers, their animations, the guns and the world's surfaces come from free packs:

| What | Pack | Made by |
|---|---|---|
| The soldier and 10 animations | Universal Animation Library 1 and 2 | Quaternius |
| Five guns | Ultimate Gun Pack | Quaternius |
| Nine surfaces (concrete, plaster, brick, corrugated iron...) | Poly Haven | Rob Tuytel and others |

All are **CC0**: "no rights reserved". You may use them for anything, without asking. We still name every one in `CREDITS.md`: it's polite, and it's how the next person finds out where a file came from. Before downloading anything, check the licence on its own page, not on a list of "free assets" somewhere else.

## glTF: the JPEG of 3D

Models come as **glTF** files (`.glb` is the one-file binary version). A glTF holds:
- **meshes**: the shapes, as corner points (vertices) and the triangles between them
- **materials**: how each part looks
- **nodes**: a family tree of things, each placed relative to its parent
- a **skin** and **animations** (lesson 19)

three.js reads it with `GLTFLoader` (`vendor/three/addons/`). `src/render/assets.js` keeps a `MANIFEST` of every file and loads them all once, behind the loading bar, with the sounds. Each map then makes its own copies (a soldier is a clone of the one loaded model) and throws its copies away when it ends. The originals stay, so changing map never downloads anything again.

## The kitchen: trimming at build time

The animation packs are two 8 MB files with 86 animations: dancing, sword fights, farming. We play 10. Shipping the rest would make everyone download 16 MB for nothing. So, like `tools/build-sounds.py` for the sounds, there's a kitchen that prepares the ingredients once, on a computer, and we commit what it cooks.

`tools/build-models.mjs` uses glTF Transform, a library for editing glTF files:
1. Keep only our 10 clips (`SOLDIER_CLIPS`), copying two from the second pack onto the first pack's skeleton by bone name. The packs share a skeleton.
2. **Resample**: drop keyframes a straight line between their neighbours would give anyway.
3. **Prune** (throw away whatever nothing uses) and **dedup** (keep one copy of anything repeated).
4. Build a simplified body for far away (lesson 19).
5. Convert the guns from **OBJ** (an old text format: corners, then triangles, each group in a named colour) into one `guns.glb`. Each gun is turned to point along -Z, scaled to its real length, stood on the floor of its box, and repainted.

Result: `soldier.glb` is 1.1 MB and `guns.glb` 451 KB. `tests/unit/assets.test.js` reads the files (a `.glb` starts with a little JSON description you can read without a graphics card) and checks the clips, bones and gun parts are there, and that each file stays under its budget.

### A real bug: the 5.6 MB "trimmed" file

The first trim deleted 76 animations and the file shrank... from 8 MB to 5.6 MB. Deleting an animation in glTF Transform removes the animation itself, but not its **samplers** (which keyframes go where) or its **accessors** (the long lists of numbers). Those stayed, unused, in the file. The fix was to delete each animation's samplers and the accessors only they used, then prune. 5.6 MB became 1 MB. Lesson: **removing the label doesn't remove the box.** Check the file size after every step.

## Repainting: one material for a whole gun

The gun pack's colours were near-black (real guns are), and each gun had four or five materials: four or five draw calls each. The kitchen paints each triangle's colour onto its corners instead (**vertex colours**, lesson 10), choosing our own palette per part (`paint` rules in `GUNS`). Every gun now shares one material: one draw call, and the look matches the block-built guns' colours.

The same rules pick out the moving parts. The shotgun's pump is the black triangles inside a box under the barrel; the carbine's magazine is the body-coloured ones below the receiver. Each becomes its own child node (`shotgun_pump`, `carbine_mag`), so the viewmodel can still slide the pump and drop the magazine.

## A model is just a shape: marking the points

A model doesn't know where you hold it. The game needs to know, for each gun:
- the **grip**, where the right hand goes (it becomes the gun's origin)
- the **sight** line, which your eye lines up when aiming
- the **muzzle**, where bullets and the flash come out
- the **eject** port, where shells fly out
- the **support** point, for the left hand

`GUN_MODELS` in `src/render/gun-models.js` writes these down, measured once from side views of each model drawn on a 5 cm grid. It's like marking a toy's handholds with stickers. `buildGun()` uses the model if it loaded and the old block gun if not, and both return the same points, so the viewmodel, the soldiers' hands and the gun racks don't care which they got.

## Fallbacks: never break on a missing file

A slow connection, a typo in a path, a file missing on the server: assets fail. `assets.js` never throws. A failed file is noted in `assets.failed`, whoever asks for it gets `null`, and they draw the code-built version: block soldiers, block guns, the grid textures. That version is the **fallback**. The unit tests run without models at all (Node has no graphics card), so the fallbacks get tested every time. A browser test checks that `assets.failed` is empty, so a missing file can't slip through unnoticed either.

## A real bug: the rack guns stood on their stocks

Since milestone 2 the gun rack on the Proving Ground was meant to show its guns "lying on its side, muzzle to the left". With the new models it was obvious that they were standing straight up, muzzle to the sky. Nobody had noticed with block guns.

The code said `rotation.set(90°, 0, 90°)`. Rotations in three.js are **Euler angles**: three turns, about x, y and z, applied one after another. Order matters, like "turn left, then lie down" versus "lie down, then turn left". three.js applies z first, then y, then x:
- z did nothing to the muzzle (it points along z)
- x then tipped it straight up

The right answer is `(90°, 90°, 0)`: y swings the muzzle round to the left, then x rolls the gun onto its side. Now each gun also measures its own box to sit centred on its label (`src/render/targets-view.js`).

## Try this

1. In the console: `fireteam.assets.failed` (should be `[]`), and `fireteam.assets.model('guns').scene.children.map(c => c.name)`.
2. Block a file to see the fallback: browser dev tools → Network → right-click `guns.glb` → Block request URL, then reload. Block guns are back.
3. Change one of the `paint` colours in `tools/build-models.mjs` (say, the carbine's magazine) and rebuild (the command is at the top of the file). Look at the carbine.
4. Pick up a pencil: hold it pointing away from you, turn it 90° about the vertical, then 90° about the pencil's own length. Now do the same two turns in the other order.

## Common mistakes

- **Shipping the whole pack.** Trim at build time; budget every file.
- **Trusting a "free assets" list instead of the licence page.**
- **Throwing when a file fails.** Fall back, note it, carry on.
- **Hard-coding points from the code-built version on a real model.** Every model needs its own measurements.
- **Euler angles in the wrong order.** Write down which way you want it to point and check each turn.
