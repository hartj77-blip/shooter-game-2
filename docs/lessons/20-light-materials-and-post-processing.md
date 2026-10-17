# Lesson 20: Light, materials and post-processing

**The idea in one sentence:** the look of a game is layers: surfaces that carry detail, light set by a mood, then a chain of filters on the finished picture, each layer cheap enough to leave room for the next.

## Textures that keep the colours' meaning

The grey-box grid (lesson 3) told you sizes at a glance, and its colours meant things: orange ledges can be climbed, red is too high. Real textures mustn't lose that.

So the photos from Poly Haven only bring their **detail**, not their colour. `tools/build-textures.py` turns each one into a grey picture:
- The same average brightness everywhere (`DETAIL_MEAN`, 0.8).
- Its contrast toned down for a clean look (`CONTRAST`).
- A faint line every metre: the old grid, kept so distances still read.

`src/render/materials.js` then paints each palette colour over a surface (`SURFACE_OF`). The orange ledge is concrete painted orange, the whitewash is plaster painted white, the containers are corrugated iron painted green, red or blue. It's like painting white plaster casts: one cast, many colours. The material's colour is divided by the detail's average brightness (`UNDO_DETAIL`), so a painted surface comes out the palette colour on average.

One concrete texture now serves ten palette colours. Nine surfaces in all come to 1.4 MB.

### Normal maps: bumps without triangles

A brick wall is flat: two triangles. To make light catch the mortar lines, each surface gets a second picture, a **normal map**. Each pixel's colour encodes which way that tiny bit of surface faces (red = left/right, green = up/down, blue = straight out). The lighting uses those directions instead of the flat face's. Grooves and cracks catch the sun, and there isn't a single extra triangle.

### UVs in metres

Every surface's **UVs** (which part of a picture goes where) are measured in world metres (`worldGridUVs` in `src/render/level-view.js`). Neighbouring pieces line up, and nothing ever stretches. The textures just say how many metres one picture covers (`SURFACES` in `materials.js`, matching `build-textures.py`; a test checks they agree).

### A real bug: the dotted wall

The first try put a denim weave on the sandbags, scaled up a bit. From 9 m away the Harbour's sandbag wall was a field of regular orange dots. A fine, regular pattern shrunk onto too few pixels beats against the pixel grid and makes a new, wrong pattern. That's **aliasing**, the same thing as a striped shirt shimmering on TV. Mipmaps (smaller, blurred copies of a texture for far away) soften it, but a pattern this regular still shows. Sandbags now use the lumpy ground texture: irregular detail doesn't alias. The metre lines were made thicker for the same reason (`GRID_WIDTH`), so they survive being shrunk.

## Trims: detail that isn't there

A wall with a cap along the top and a frame round its door looks *built*. The kit's walls now produce **decor** (`src/world/kit.js`): caps, door and window frames, sills, table legs. Decor is drawn but has **no collider**: it's too thin to matter, so bullets, eyesight and route-finding ignore it. It never pokes into a doorway, so a gap stays exactly as wide as it looks. A test fires rays through doors and windows a hand's width from the frame to make sure.

The opposite case is the mission props. A cache or a laptop's table used to be drawn but not solid, so you could walk through them. Now a site's `prop` (a table, a crate stack, a radio stand) is level geometry, solid and identical on every computer. The mission only adds what sits on top.

## Moods: light as data

Each map names a **mood** (`src/render/moods.js`): midday for the Proving Ground, dusty haze for the Compound, golden hour for the Harbour, and night. A mood sets:
- the sky's two colours
- the fog and how far it reaches
- the sun's colour, strength and height
- the soft light from sky and ground (a "hemisphere" light)
- the exposure
- the **colour grade** (below)

Like a film crew choosing when to shoot, then a colourist giving it a look. It's all presentation: the simulation never reads it.

## Post-processing: filters on the finished picture

On medium and high quality, the world isn't drawn straight to the screen. It's drawn into a hidden picture (a **render target**), then a chain of **passes** each take the picture so far and change it (`src/render/post.js`):

1. **The world.**
2. **Ambient occlusion** (high quality): corners and creases darken, where light from the sky can't easily reach, like dust settling in corners. three.js's GTAO works it out from the depth of each pixel. It costs a second drawing of the whole scene, so it's high quality only.
3. **The gun in your hands**, drawn on top after clearing the depth, as before (lesson 6).
4. **Bloom** (high quality): anything brighter than white glows a little into its neighbours: muzzle flashes, lamp bulbs, explosions. That's why the hidden pictures store light brighter than white (**half float**). An ordinary picture would cut it off at white.
5. **Tone mapping** and screen colours (`OutputPass`): squeezing all that light into what a screen can show.
6. **Our grade pass:** saturation, contrast, a tint and a **vignette** (darker corners) from the mood, plus night vision (lesson 21).

The hidden pictures use 4× **multisampling** (MSAA), the same smoothing of jagged edges the screen gets on low quality.

## Outlines: the inverted hull

To make soldiers stand out (the "clean toon" look), each gets a dark outline (`src/render/outline.js`). The trick is called an **inverted hull**:
- A second copy of the body is puffed out about a centimetre along its surface.
- It's drawn in flat dark colour, and only its *inside* faces are drawn.
- Where the copy is behind the real body you can't see it. Round the edges, the puffed-out rim peeks past: that's the outline.

It works on animated bodies, because the puff happens before the skeleton moves the corners. It costs one more draw per mesh, much cheaper than searching the finished picture for edges. One shared material means one switch turns every outline on or off.

## Quality presets, in numbers

| | Low | Medium | High |
|---|---|---|---|
| Pixel ratio | 1 | 1.5 | 2 |
| Shadows | off | 1024 | 2048 |
| Colour grade, outlines | | ✓ | ✓ |
| Ambient occlusion, bloom | | | ✓ |
| Harbour draw calls per frame | 204 | 292 | 591 |

Draw calls aren't the only cost. **Overdraw** (drawing the same pixel many times, as see-through things do) and pixel count matter too. That's why pixel ratio is part of the preset. A browser test switches through all three and checks each draws without errors and within budget.

## Try this

1. Settings → Graphics quality: compare low, medium and high on the Harbour at golden hour.
2. Tuning panel → Graphics: push **Bloom strength** up and fire a burst. Set **Outline width** to 0.04, then 0.
3. In the console: `fireteam.view.setMood({...fireteam.view.mood, grade: {saturation: 0.2, contrast: 1.3, tint: '#ffffff', vignette: 0.6}})`: instant war film. (The sun moves too: change map and back to undo it.)
4. Walk up to a door on the Harbour and look at the frame from the side: it stands out from the wall, but not into the doorway.

## Common mistakes

- **Coloured photo textures on colour-coded surfaces.** Paint the detail; keep the meaning.
- **Fine regular patterns far away.** They alias; prefer irregular detail.
- **Visual detail with colliders.** Players snag on trims they can't see the shape of.
- **Effects that cost a second drawing of the scene on every machine.** Put them in a quality preset.
- **Clipping light at white before bloom.** Keep the hidden pictures half float.
