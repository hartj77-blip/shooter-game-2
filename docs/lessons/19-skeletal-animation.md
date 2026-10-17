# Lesson 19: Skeletal animation

**The idea in one sentence:** an animated character is a skin stretched over a skeleton; recorded clips move the bones, blended by how fast you're going, and code bends the rest so the hands land exactly on the gun.

## Bones and skin

The soldier model (`assets/models/soldier.glb`) is one mesh of about 14,000 triangles, and 65 invisible **bones** in a family tree: pelvis → spine → chest → upper arm → forearm → hand, and so on. Move a bone and everything below it moves too, like an arm moving the hand on the end of it.

Each corner of the mesh is tied to up to four bones, with a weight for each: a corner on the elbow is half upper-arm, half forearm, so it bends smoothly. That's **skinning**: the skin follows the bones. three.js does it on the graphics card (`SkinnedMesh`); each frame it only needs every bone's position and turn.

## Clips, and blending them

An **animation clip** is a recording of bones over time: "walk" is a second of every bone's turns, made to loop. The soldier has 10 (`SOLDIER_CLIPS` in `tools/build-models.mjs`): idle, walk, jog, sprint, crouch idle, crouch walk, two flinches, lying down, and an overhand throw.

Snapping from "walk" to "jog" when you speed up would jerk. Instead, a three.js `AnimationMixer` plays several clips at once, each with a **weight**, and mixes them (`src/render/character.js`):
- **By speed:** each gait has the speed it was recorded at (`GAIT`: walk 1.45 m/s, jog 3.6, sprint 6.2). The two nearest your real speed share the weight. At 2.5 m/s it's about half walk and half jog.
- **Playback rate:** clips play faster or slower so the feet match the ground's speed. Without that, feet slide like on ice.
- **Walking backwards:** the walk plays in reverse. Sideways, the hips turn up to 60° towards where you're going.
- **Crouch:** blends towards the crouch clips. It stops at `CROUCH_DEPTH` (0.82), so the head lands where the crouched hitbox is (lesson 10).

## Layering: legs from clips, arms from code

The packs have no rifle animations. So the soldier is split in two, like a puppet with two puppeteers:
- **Legs and hips:** the clips.
- **Spine, arms and gun:** code, every frame, after the mixer:
  - The spine bends with where they're aiming, up or down (`SPINE_AIM`).
  - The gun sits at a fixed spot in front of the chest, pointing where they aim, and lowered while sprinting or relaxed.
  - The hands are put on the gun with IK (below).
  - Reloading and throwing move the hand targets along a path. A hit adds a flinch to the spine, with the same sub-stepped springs as lesson 6.

### Two-bone IK: working out the elbow

Normally you turn the shoulder, then the elbow, and see where the hand ends up ("forward kinematics"). We know where the hand **must** end up (on the grip) and need the shoulder and elbow turns that put it there. That's **inverse kinematics** (IK).

For an arm (two bones: upper arm and forearm) it has a neat answer. You know three lengths:
- the upper arm
- the forearm
- the distance from shoulder to target

Three lengths make a triangle, so the elbow's angle follows from the law of cosines. Then the whole arm is turned to point at the target, with the elbow bending outwards and down, as real elbows do. `reach()` in `character.js` does this for both arms, every frame: right hand on the grip, left hand on the gun's `support` point (lesson 18).

## Ragdolls on a real skeleton

Lesson 10's ragdolls were boxes held together with joints. Now the ragdoll is the skeleton itself (`src/render/ragdolls.js`):
- When a soldier dies, each main bone segment (pelvis, spine, head, upper and lower arms and legs) becomes a physics capsule where the bone was, with joints between them.
- Every frame the capsules' positions are copied back into the bones, and the skin follows.

It's still presentation only, in its own physics world (`CLAUDE.md`).

## Drawing only what you can see

### A real bug: the co-op test that fell asleep

After the animated soldiers went in, the two-tab co-op browser test started timing out at "the host revives the friend". The game was running at about three ticks a second, not sixty. Measuring showed:
- The browser said drawing a frame took 6 ms.
- Frames were actually 1 to 2.5 seconds apart, because the real work happens later, on the (here, software) graphics card.
- The friend's screen drew **257,000 triangles** per frame: every soldier, every frame, even the ones behind them.

**Frustum culling** was off. Normally three.js skips anything outside the camera's view (the **frustum**, a pyramid with its top cut off). It judges that with a ball around each mesh. But a skinned mesh's ball is worked out once, in its first pose, and animation moves the body out of it. So the soldiers were set to "always draw", to be safe.

The fixes (`character.js`):
- **Culling back on**, judged by a ball 2.2 times bigger than the first pose's (`CULL_GROW`): big enough for lying down with arms out. Ragdolls switch it off again, because their bones can fly beyond it.
- **Level of detail (LOD).** `build-models.mjs` makes a second copy of the body with a quarter of the triangles (3,435), using meshoptimizer's simplifier. Past 20 m (`DETAIL_FAR` in `soldiers-view.js`) the soldier wears that one. Zooming in with a scope counts as nearer. Both copies ride the same skeleton, so the animation is identical.
- **One skeleton per soldier.** Each mesh had its own copy of the skeleton, each worked out every frame. Now they share one.
- Far soldiers were already **posed less often**: every 2nd frame past 35 m, every 4th past 70 m.

The test passed again, and phones and older laptops got the same speed-up for free.

### Another real bug: 64 textures left behind

The "changing map leaves nothing behind" test found 64 extra textures after leaving the Compound. Each skeleton keeps its bones' positions in a small texture on the graphics card. Nobody freed those when the soldiers were thrown away. Now `dispose()` frees each skeleton (`character.js`, `render/dispose.js`).

## Try this

1. Tuning panel → Time → Game speed 0.1, then walk an enemy towards you (or watch one patrol): see the walk and jog blend as they change speed.
2. In the console: `[...fireteam.mission.enemiesView.views.values()][0].model.detail(1)` gives the first enemy its far body. Walk up close and compare. `detail(0)` puts it back.
3. Watch an enemy reload: the left hand leaves the gun and comes back.
4. Kill one on stairs and watch the ragdoll fold over the steps.

## Common mistakes

- **Switching clips instead of blending them.** People don't teleport between walking and running.
- **Clips at the wrong speed.** Feet slide; match the playback rate to the ground speed.
- **Animating hands by hand-made keyframes when IK can put them exactly where they must be.**
- **Turning off culling "to be safe".** Make the bounding ball bigger instead.
- **Forgetting the graphics card's copies.** Skeletons, textures and geometries all need disposing.
