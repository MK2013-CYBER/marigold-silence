"""
THE MARIGOLD SILENCE: airway beacon tower at the west end of the runway (location A).
A 14 m steel lattice tower, leaning ~4 degrees after years of wind, with a ladder,
a railed platform and a rotating beacon head.

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_beacon_tower.py
Output: public/models/beacon_tower.glb

Built around its own origin (game coords); world.json places it.
Names: BeaconTower (static), BeaconHead (spins about its origin; custom property spin = 1),
       COL_BeaconTower, LIGHT_Beacon (small light at the lens).
"""
import math
import os
import sys

import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
import pbr_textures as tex  # noqa: E402
from bhelpers import (T, col_box, export_glb, join, marker, material, parent, reset_scene,  # noqa: E402
                      tbeam, tbox, tcyl, tcyl_dir, texture_set, world_uv)

PROJECT = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, 'textures')
OUT_GLB = os.path.join(PROJECT, 'public', 'models', 'beacon_tower.glb')
LEAN = math.radians(4.0)
H = 14.0


def build():
    reset_scene(['Props', 'Collision'])
    steel = material('TowerSteel', texture_set('towersteel', tex.painted_metal(512, 160, (0.36, 0.33, 0.28)), TEX_DIR))
    conc = material('Footing', color=(0.5, 0.48, 0.44), rough=0.95)
    lamp_red = material('BeaconLens', color=(0.4, 0.3, 0.1), emission=(1.0, 0.82, 0.45), emission_strength=4.0)
    dark = material('BeaconHousing', color=(0.06, 0.06, 0.055), rough=0.5, metal=0.6)
    wire = material('GuyWire', color=(0.15, 0.14, 0.13), rough=0.6, metal=0.8)

    def half(y):  # half-width of the tower at height y
        return 1.5 - (1.5 - 0.6) * y / H
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    p = []
    for sx, sz in corners:
        p.append(tbox(f'footing_{sx}_{sz}', sx * 1.5 - 0.3, sx * 1.5 + 0.3, -0.1, 0.25, sz * 1.5 - 0.3, sz * 1.5 + 0.3, conc))
        p.append(tcyl_dir(f'leg_{sx}_{sz}', (sx * 1.5, 0.2, sz * 1.5), (sx * 0.6, H, sz * 0.6), 0.06, steel, 8))
    levels = [0.2 + i * 2.3 for i in range(7)]
    for a, b in zip(levels, levels[1:]):
        for i in range(4):
            c0, c1 = corners[i], corners[(i + 1) % 4]
            P = lambda c, y: (c[0] * half(y), y, c[1] * half(y))  # noqa: E731
            p.append(tcyl_dir(f'ring_{a:.1f}_{i}', P(c0, a), P(c1, a), 0.035, steel, 6))
            p.append(tcyl_dir(f'x1_{a:.1f}_{i}', P(c0, a), P(c1, b), 0.025, steel, 6))
            p.append(tcyl_dir(f'x2_{a:.1f}_{i}', P(c1, a), P(c0, b), 0.025, steel, 6))
    # ladder up the south face
    for dx in (-0.2, 0.2):
        p.append(tcyl_dir(f'ladder_{dx}', (dx, 0.2, 1.55), (dx, H, 0.65), 0.02, steel, 6))
    for k in range(1, 46):
        y = 0.2 + k * (H - 0.2) / 46
        z = 1.55 - (1.55 - 0.65) * (y - 0.2) / (H - 0.2) + 0.0
        p.append(tcyl_dir(f'rung_{k}', (-0.2, y, z), (0.2, y, z), 0.012, steel, 5))
    # platform and railing
    p.append(tbox('platform', -1.0, 1.0, H, H + 0.08, -1.0, 1.0, steel))
    for i in range(4):
        c0, c1 = corners[i], corners[(i + 1) % 4]
        for y in (H + 0.55, H + 1.05):
            p.append(tcyl_dir(f'rail_{y}_{i}', (c0[0] * 1.0, y, c0[1] * 1.0), (c1[0] * 1.0, y, c1[1] * 1.0), 0.025, steel, 6))
        p.append(tcyl_dir(f'stanchion_{i}', (c0[0], H, c0[1]), (c0[0], H + 1.05, c0[1]), 0.025, steel, 6))
    p.append(tcyl('pedestal', (0, H + 0.45, 0), 0.18, 0.8, 'y', dark, 14))
    # one snapped guy wire hanging from a corner, one still taut to an anchor
    p.append(tcyl_dir('guy_taut', (0.75, H - 2, 0.75), (8.0, 0.1, 8.0), 0.01, wire, 4))
    p.append(tbox('guy_anchor', 7.8, 8.2, -0.1, 0.15, 7.8, 8.2, conc))
    p.append(tcyl_dir('guy_snapped', (-0.75, H - 2, 0.75), (-1.6, 4.0, 1.4), 0.01, wire, 4))
    tower = join('BeaconTower', p, 'Props')
    world_uv(tower, 1, 1, 1)

    # beacon head: housing drum with a lens on each side; spins about its origin
    hp = [tcyl('housing', (0, H + 1.15, 0), 0.32, 0.55, 'y', dark, 18),
          tcyl('cap', (0, H + 1.5, 0), 0.22, 0.16, 'y', dark, 16, r2=0.34),
          tcyl('lens_a', (0.33, H + 1.15, 0), 0.24, 0.06, 'x', lamp_red, 18),
          tcyl('lens_b', (-0.33, H + 1.15, 0), 0.24, 0.06, 'x', lamp_red, 18)]
    head = join('BeaconHead', hp, 'Props')
    head.data.transform(Matrix.Translation((0, 0, -(H + 1.15))))
    head.location = T((0, H + 1.15, 0))
    head['spin'] = 1
    parent(head, tower)
    mk = marker('LIGHT_Beacon', T((0, H + 1.15, 0)), {'light': 'point', 'intensity': 30, 'distance': 30, 'color': '#ffd9a0'}, 'Props')
    parent(mk, tower)

    # lean the whole tower about its base (rotation about game z = Blender -y)
    tower.rotation_euler = (0, LEAN, 0)
    col_box('COL_BeaconTower', -1.9, 1.9, -1.9, 1.9, mat=material('Collision', color=(0, 1, 0.3)))
    col_box('COL_GuyAnchor', 7.7, 8.3, 7.7, 8.3, mat=bpy.data.materials['Collision'])


build()
size = export_glb(OUT_GLB, extras=True)
print(f'EXPORTED {OUT_GLB} ({size:.2f} MB)')
