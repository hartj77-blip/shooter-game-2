#!/usr/bin/env python3
"""Builds the world's textures in assets/textures/ from Poly Haven (CC0).

Each surface (concrete, plaster, brick...) becomes two small pictures:

  <surface>_color.jpg   the surface's light and dark detail, in grey. The game
                        paints it with the map's colours (PALETTE in
                        src/render/materials.js), so one concrete texture
                        serves the floors, the quay and the orange climbable
                        ledges alike, and the colours keep their meaning.
  <surface>_normal.jpg  which way each tiny bit of the surface faces (a
                        "normal map"), so light catches the bumps, cracks and
                        grooves without any extra triangles.

Both are made to cover a whole number of metres (`metres`), and the colour one
gets a faint line every metre: the old grey-box grid, kept so distances still
read at a glance. The detail is toned down (CONTRAST) for the clean look.

Like build-sounds.py: run it once on your computer, and commit what it writes.
It downloads the 1K JPEG sets from Poly Haven into --cache the first time.

Usage:
  python3 tools/build-textures.py [--cache DIR] [--out assets/textures]

Needs Pillow and numpy.
"""

import argparse
import json
import os
import urllib.request

import numpy as np
from PIL import Image

# surface: (Poly Haven id, how many metres one picture covers, copies of the
# source across it (sources come in their own real sizes), picture size)
SURFACES = {
    'concrete': ('concrete_floor_02', 2, 1, 512),    # 2 m source
    'ground':   ('gravel_concrete_03', 2, 1, 512),   # 2.1 m
    'plaster':  ('plastered_wall_03', 4, 1, 1024),   # 4 m
    'brick':    ('red_brick_03', 2, 2, 512),         # 1 m
    'metal':    ('corrugated_iron_02', 3, 1, 1024),  # 2.7 m (stretched a little)
    'tiles':    ('roof_09', 4, 1, 1024),             # 4 m
    'wood':     ('weathered_planks', 2, 1, 512),     # 2 m
    'asphalt':  ('asphalt_02', 3, 1, 1024),          # 3 m
    'plate':    ('metal_plate', 1, 2, 512),          # 0.5 m
}

DETAIL_MEAN = 0.8   # the colour picture's average brightness (0..1); materials.js divides it back out
CONTRAST = 0.085    # ...and how far it strays from that (standard deviation), at most
GRID = 0.85         # the metre lines: this much of the brightness...
GRID_WIDTH = 1 / 64  # ...and this wide, in metres (thick enough to survive being shrunk far away)
NORMAL_STRENGTH = 0.75  # bumps a little gentler than the photo
NORMAL_SIZE = 512
HEADERS = {'User-Agent': 'fireteam-build-textures'}  # Poly Haven turns away requests with no name


def fetch(asset, kind, cache):
    """Poly Haven's 1K JPEG of one map ('Diffuse' or 'nor_gl') of `asset`, cached."""
    path = os.path.join(cache, f'{asset}_{kind}_1k.jpg')
    if not os.path.exists(path):
        get = lambda url: urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS))
        with get(f'https://api.polyhaven.com/files/{asset}') as r:
            files = json.load(r)
        url = files[kind]['1k']['jpg']['url']
        print('  downloading', url)
        with get(url) as r, open(path, 'wb') as f:
            f.write(r.read())
    return Image.open(path)


def tiled(img, copies, size):
    """`copies` x `copies` of the picture side by side, shrunk to size x size."""
    if copies > 1:
        w, h = img.size
        big = Image.new(img.mode, (w * copies, h * copies))
        for i in range(copies):
            for j in range(copies):
                big.paste(img, (i * w, j * h))
        img = big
    return img.resize((size, size), Image.LANCZOS)


def colour(img, metres, copies, size):
    rgb = np.asarray(tiled(img.convert('RGB'), copies, size), dtype=np.float32) / 255
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # Same average everywhere, gentle contrast.
    std = float(lum.std())
    lum = DETAIL_MEAN + (lum - lum.mean()) * min(1.0, CONTRAST / max(std, 1e-6))
    # The metre lines, half on each side of the edge so they meet when tiled.
    step = size / metres
    half = max(1, round(step * GRID_WIDTH / 2))
    for i in range(metres):
        p = int(round(i * step))
        for c in range(p - half, p + half):
            lum[:, c % size] *= GRID
            lum[c % size, :] *= GRID
    return Image.fromarray(np.clip(lum * 255 + 0.5, 0, 255).astype(np.uint8), 'L')


def normal(img, copies):
    n = np.asarray(tiled(img.convert('RGB'), copies, NORMAL_SIZE), dtype=np.float32) / 255 * 2 - 1
    n[..., 0:2] *= NORMAL_STRENGTH
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.clip((n + 1) / 2 * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(here, '..', '.texture-cache'))
    ap.add_argument('--out', default=os.path.join(here, '..', 'assets', 'textures'))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)
    total = 0
    for name, (asset, metres, copies, size) in SURFACES.items():
        print(name, '<-', asset)
        c = colour(fetch(asset, 'Diffuse', args.cache), metres, copies, size)
        n = normal(fetch(asset, 'nor_gl', args.cache), copies)
        for suffix, im, q in (('color', c, 85), ('normal', n, 88)):
            path = os.path.join(args.out, f'{name}_{suffix}.jpg')
            im.save(path, quality=q, optimize=True)
            total += os.path.getsize(path)
    print(f'{len(SURFACES)} surfaces, {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
