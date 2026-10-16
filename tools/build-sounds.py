#!/usr/bin/env python3
"""Builds the game's sound effects in assets/sounds/ from free (CC0) recordings.

Recordings come as long files: a gunshot followed by seconds of echo, or a
reload with silence around it. This script cuts out the moment we want,
mixes it to mono (so the game can place it in 3D), fades out the tail, evens
out the loudness, and saves a small MP3.

Sources (all CC0 public domain, see CREDITS.md):
  --firearms  the "Prepared SFX Library" folder from The Free Firearm Sound Library
              https://opengameart.org/content/the-free-firearm-sound-library
  --oga       a folder with these OpenGameArt files:
                assaultriflereload1_0.wav, gunreload1.wav, shotguncock_0.wav
                  (https://opengameart.org/content/gun-reload-sounds)
                reload.wav (https://opengameart.org/content/handgun-reload-sound-effect)
                ShotgunSounds/ (shotgunsounds.zip from
                  https://opengameart.org/content/shotgun-reload-sound-effects)
                equipmentclicks.wav (https://opengameart.org/content/equipment-clicks-ii)
                gun_reload_lock_or_click_sound.mp3
                  (https://opengameart.org/content/gun-reload-lock-or-click-sound)
  --kenney    the Audio folder from Kenney's Impact Sounds pack
              https://kenney.nl/assets/impact-sounds
  --scifi     the Audio folder from Kenney's Sci-Fi Sounds pack (explosions)
              https://kenney.nl/assets/sci-fi-sounds

Usage:
  python3 tools/build-sounds.py --firearms DIR --oga DIR --kenney DIR --scifi DIR [--out assets/sounds]

Needs Python 3 with NumPy, and ffmpeg.
"""

import argparse
import os
import subprocess

import numpy as np

RATE = 44100
PEAK = 10 ** (-1 / 20)  # every file peaks at -1 dB; the game's sound bank sets the mix

# (output name, source folder, file, start seconds, length seconds)
# Start times are just before each sound's loud moment, found by looking at the waveforms.
CUTS = [
    # Gunshots, recorded close to the shooter.
    ('rifle_1', 'firearms', 'AR-15/D_32P.wav', 0.68, 1.1),
    ('rifle_2', 'firearms', 'AR-15/D_32P.wav', 5.62, 1.1),
    ('smg_1', 'firearms', 'Carl Gustav M45/G_31P.wav', 0.29, 0.7),
    ('smg_2', 'firearms', 'Carl Gustav M45/G_31P.wav', 3.48, 0.7),
    ('smg_3', 'firearms', 'Carl Gustav M45/G_31P.wav', 6.70, 0.7),
    ('shotgun_1', 'firearms', 'Nova/O_21P.wav', 0.41, 1.4),
    ('shotgun_2', 'firearms', 'Nova/O_21P.wav', 3.44, 1.4),
    ('pistol_1', 'firearms', 'Walther PPQ/X_39P.wav', 1.38, 0.9),
    ('pistol_2', 'firearms', 'Walther PPQ/X_39P.wav', 6.42, 0.9),
    ('pistol_3', 'firearms', 'Walther PPQ/X_39P.wav', 10.64, 0.9),
    # Handling.
    ('reload_rifle_1', 'oga', 'assaultriflereload1_0.wav', 0.0, 1.56),
    ('reload_smg_1', 'oga', 'gunreload1.wav', 0.0, 1.58),
    ('reload_pistol_1', 'oga', 'reload.wav', 0.0, 1.59),
    ('charge_1', 'oga', 'gunreload1.wav', 1.20, 0.38),
    ('pump_1', 'oga', 'shotguncock_0.wav', 0.0, 0.47),
    ('shell_1', 'oga', 'ShotgunSounds/Subsequent Shells.mp3', 0.62, 0.40),
    ('rack_1', 'oga', 'ShotgunSounds/Rack.mp3', 0.50, 0.63),
    ('dry_1', 'oga', 'gun_reload_lock_or_click_sound.mp3', 0.0, 0.34),
    ('gear_1', 'oga', 'equipmentclicks.wav', 0.10, 0.45),
    ('gear_2', 'oga', 'equipmentclicks.wav', 2.02, 0.30),
    ('gear_3', 'oga', 'equipmentclicks.wav', 2.35, 0.45),
]

# (output group, Kenney file prefix, variant numbers, max length seconds)
KENNEY = [
    ('hit_concrete', 'impactMining', [0, 1, 2], 0.35),
    ('hit_dirt', 'impactSoft_medium', [0, 1, 2], 0.2),
    ('hit_wood', 'impactWood_light', [0, 1, 2], 0.3),
    ('hit_metal', 'impactMetal_light', [0, 1, 2], 0.35),
    ('hit_paper', 'impactPunch_medium', [0, 1, 2], 0.25),
    ('ding', 'impactBell_heavy', [0, 1, 2], 1.2),
    ('casing', 'impactTin_medium', [0, 1, 2], 0.2),
    ('step_concrete', 'footstep_concrete', [0, 1, 2, 3, 4], 0.25),
    ('step_wood', 'footstep_wood', [0, 1, 2, 3, 4], 0.3),
    ('land', 'impactSoft_heavy', [0, 1], 0.5),
    # Milestone 3: soldiers.
    ('hit_flesh', 'impactPunch_heavy', [0, 1, 2], 0.3),
    ('hurt', 'impactPunch_heavy', [3, 4], 0.35),
    ('bodyfall', 'impactSoft_heavy', [2, 3, 4], 0.6),
]

# Milestone 5: explosions. Each is two recordings played together: a deep boom
# you feel, and a crunch that tells you something broke. (output, [(file, gain)], length)
LAYERS = [
    ('explosion_1', [('lowFrequency_explosion_000', 1.0), ('explosionCrunch_001', 0.7)], 2.0),
    ('explosion_2', [('lowFrequency_explosion_001', 1.0), ('explosionCrunch_003', 0.7)], 1.6),
    ('explosion_3', [('lowFrequency_explosion_000', 1.0), ('explosionCrunch_004', 0.6)], 2.0),
]


def decode(path, start, length):
    """Reads `length` seconds of `path` from `start`, as mono floats."""
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(length), '-i', path,
         '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def shape(x):
    """Short fade in (no click), fade out over the last 30% (no cut-off tail), normalise."""
    fade_in = int(0.002 * RATE)
    x[:fade_in] *= np.linspace(0, 1, fade_in)
    fade_out = int(len(x) * 0.3)
    x[-fade_out:] *= np.linspace(1, 0, fade_out) ** 2
    peak = np.abs(x).max()
    return x * (PEAK / peak) if peak > 0 else x


def encode(x, out_path):
    subprocess.run(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-',
         '-c:a', 'libmp3lame', '-b:a', '112k', out_path],
        input=x.astype(np.float32).tobytes(), check=True,
    )


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--firearms', required=True)
    p.add_argument('--oga', required=True)
    p.add_argument('--kenney', required=True)
    p.add_argument('--scifi', required=True)
    p.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds'))
    args = p.parse_args()
    roots = {'firearms': args.firearms, 'oga': args.oga}
    os.makedirs(args.out, exist_ok=True)

    for name, root, rel, start, length in CUTS:
        x = shape(decode(os.path.join(roots[root], rel), start, length))
        encode(x, os.path.join(args.out, f'{name}.mp3'))
        print(f'{name}.mp3  {len(x) / RATE:.2f}s')

    for group, prefix, variants, max_len in KENNEY:
        for i, v in enumerate(variants, 1):
            x = shape(decode(os.path.join(args.kenney, f'{prefix}_{v:03d}.ogg'), 0, max_len))
            encode(x, os.path.join(args.out, f'{group}_{i}.mp3'))
            print(f'{group}_{i}.mp3  {len(x) / RATE:.2f}s')

    for name, parts, length in LAYERS:
        x = np.zeros(int(length * RATE), dtype=np.float32)
        for f, gain in parts:
            y = decode(os.path.join(args.scifi, f'{f}.ogg'), 0, length)
            x[:len(y)] += y[:len(x)] * gain
        x = shape(x)
        encode(x, os.path.join(args.out, f'{name}.mp3'))
        print(f'{name}.mp3  {len(x) / RATE:.2f}s')


if __name__ == '__main__':
    main()
