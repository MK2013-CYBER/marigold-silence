"""
THE MARIGOLD SILENCE: the Undercroft (first bible 11.2; v4 section 1.4), where Clementine has lived
for two years, in and around the old fuel-line culvert under the hangar.

Five chambers along a culvert (local x runs from the ladder shaft eastward):
  1. the shaft      under Pryce's office trapdoor; iron rungs up the wall          x  -1.5 ..  1.5
  2. the storeroom  Ox's trays, tins, lamp oil                                     x   9   .. 13
  3. the sky room   her mural of a blue sky with aeroplanes; drawings pinned up     x  17   .. 23
  4. the bedroom    iron bed, table, lantern, diary, scratched calendar on the wall x  23   .. 28
  5. the radio nook the tapped telegraph cable and her spoon-handle Morse key       alcove off the bedroom
Concrete culvert tunnels join them. Lanterns: LIGHT_ markers. Named interactables: UC_Ladder, UC_Tray,
UC_Mural, UC_Drawings, UC_Diary, UC_Calendar, UC_SpoonKey, UC_Bed. Colliders: COL_UC_* (the game only
switches them on while you are down here).

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_undercroft.py
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from bhelpers import (T, col_box, export_glb, join, marker, material, reset_scene, save_image, tbox, tcyl, tcyl_dir,  # noqa: E402
                      texture_set, tquad, tsphere, ttorus)
from pbr_textures import concrete_floor, planks, spectral_noise, weathered_wood  # noqa: E402

PROJECT = os.path.dirname(HERE)
TEX = os.path.join(HERE, 'textures')
OUT = os.path.join(PROJECT, 'public', 'models', 'undercroft.glb')
C = 'Props'

reset_scene(['Props', 'Collision', 'Markers'])


def mural():
    """Her sky: a blue gradient with soft clouds and a few little aeroplanes, painted on plaster."""
    H, W = 512, 1024
    y = np.linspace(0, 1, H)[:, None]
    sky = np.stack([0.25 + 0.4 * y, 0.45 + 0.35 * y, 0.75 + 0.15 * y], -1) * np.ones((1, W, 1))
    n = spectral_noise(H, W, 1.6, 77)
    clouds = np.clip((n - 0.15) * 2.2, 0, 1)[..., None]
    img = sky * (1 - clouds * 0.8) + np.array((0.95, 0.93, 0.9)) * clouds * 0.8
    rng = np.random.default_rng(5)
    yy, xx = np.mgrid[0:H, 0:W]
    for _ in range(9):  # little aeroplanes: a body and a wing
        cx, cy, s = rng.uniform(60, W - 60), rng.uniform(60, H - 120), rng.uniform(10, 26)
        body = (np.abs(yy - cy) < s * 0.18) & (np.abs(xx - cx) < s)
        wing = (np.abs(xx - cx - s * 0.1) < s * 0.22) & (np.abs(yy - cy) < s * 0.9)
        img[body | wing] = (0.15, 0.13, 0.12)
    plaster = spectral_noise(H, W, 0.4, 78)[..., None] * 0.08
    img = np.clip(img * (0.9 + plaster), 0, 1)
    img[-60:] = img[-60:] * 0.6 + np.array((0.45, 0.4, 0.33)) * 0.4  # the paint gives out near the floor
    return img[::-1]


conc = texture_set('uc_concrete', concrete_floor(512, 401), TEX)
wood = texture_set('uc_wood', weathered_wood(512, 402), TEX)
plank = texture_set('uc_planks', planks(512, 403), TEX)
M = {
    'concrete': material('UC_Concrete', conc),
    'wood': material('UC_Wood', wood),
    'planks': material('UC_Planks', plank),
    'mural': material('UC_Mural', {'color': save_image('uc_mural', mural(), False, TEX)}, rough=0.9),
    'iron': material('UC_Iron', color=(0.12, 0.11, 0.1), rough=0.6, metal=0.7),
    'blanket': material('UC_Blanket', color=(0.45, 0.2, 0.15), rough=0.95),
    'linen': material('UC_Linen', color=(0.78, 0.74, 0.66), rough=0.9),
    'paper': material('UC_Paper', color=(0.85, 0.8, 0.68), rough=0.9),
    'tin': material('UC_Tin', color=(0.55, 0.53, 0.5), rough=0.4, metal=0.8),
    'brass': material('UC_Brass', color=(0.62, 0.46, 0.2), rough=0.3, metal=1.0),
    'glass': material('UC_LampGlass', color=(1.0, 0.85, 0.55), emission=(1.0, 0.7, 0.35), emission_strength=3.0),
    'cable': material('UC_Cable', color=(0.05, 0.05, 0.05), rough=0.7),
    'chalk': material('UC_Chalk', color=(0.85, 0.83, 0.78), rough=1.0),
}
for k in ('concrete', 'mural'):
    M[k].use_backface_culling = False

parts = []
H = 2.4


def room(name, x0, x1, z0, z1, h, west=None, east=None, north=None, wall='concrete', floor='concrete'):
    """A chamber: floor, ceiling and four walls; west/east/north = (z0, z1) or (x0, x1) gaps for doorways."""
    t = 0.25
    parts.append(tbox(f'{name}_floor', x0, x1, -0.05, 0.0, z0, z1, M[floor]))
    parts.append(tbox(f'{name}_ceil', x0, x1, h, h + 0.2, z0, z1, M[wall]))
    for side, x in (('w', x0), ('e', x1)):
        gap = west if side == 'w' else east
        segs = [(z0, z1)] if not gap else [(z0, gap[0]), (gap[1], z1)]
        for k, (a, b) in enumerate(segs):
            if b - a < 0.01:
                continue
            parts.append(tbox(f'{name}_{side}{k}', x - t / 2, x + t / 2, 0, h, a, b, M[wall]))
            col_box(f'COL_UC_{name}_{side}{k}', x - t / 2, x + t / 2, a, b)
        if gap:  # lintel over the doorway
            parts.append(tbox(f'{name}_{side}_lintel', x - t / 2, x + t / 2, 2.0, h, gap[0], gap[1], M[wall]))
    for side, z in (('s', z0), ('n', z1)):
        gap = north if side == 'n' else None
        segs = [(x0, x1)] if not gap else [(x0, gap[0]), (gap[1], x1)]
        for k, (a, b) in enumerate(segs):
            if b - a < 0.01:
                continue
            parts.append(tbox(f'{name}_{side}{k}', a, b, 0, h, z - t / 2, z + t / 2, M[wall]))
            col_box(f'COL_UC_{name}_{side}{k}', a, b, z - t / 2, z + t / 2)


def culvert(name, x0, x1):
    """A round concrete culvert between two chambers, 2.3 m across, floor laid flat."""
    parts.append(tcyl(f'{name}_pipe', ((x0 + x1) / 2, 1.0, 0), 1.15, x1 - x0, 'x', M['concrete'], 24, cap=False))
    parts.append(tbox(f'{name}_floor', x0, x1, -0.02, 0.0, -1.0, 1.0, M['concrete']))
    col_box(f'COL_UC_{name}_s', x0, x1, -1.25, -0.95)
    col_box(f'COL_UC_{name}_n', x0, x1, 0.95, 1.25)
    for k in range(int((x1 - x0) / 1.5)):  # pipe joints
        parts.append(ttorus(f'{name}_joint{k}', (x0 + 0.75 + k * 1.5, 1.0, 0), 1.13, 0.03, 'x', M['concrete'], (24, 4)))


def lantern(name, pos, intensity=3.0, dist=7.0, flicker=False):
    x, y, z = pos
    parts.append(tcyl(f'{name}_glass', (x, y, z), 0.06, 0.14, 'y', M['glass'], 12))
    parts.append(tcyl(f'{name}_top', (x, y + 0.1, z), 0.075, 0.05, 'y', M['iron'], 12, r2=0.03))
    parts.append(tcyl(f'{name}_base', (x, y - 0.09, z), 0.075, 0.03, 'y', M['iron'], 12))
    marker(f'LIGHT_{name}', T((x, y + 0.05, z)), {'light': 'point', 'intensity': intensity, 'distance': dist, 'color': '#ffbf78', 'flicker': flicker, 'shadow': False}, 'Markers')


# ---- 1. the shaft under the trapdoor
room('shaft', -1.5, 1.5, -1.5, 1.5, 3.4, east=(-1.0, 1.0))
for k in range(9):  # iron rungs up the north wall to the trapdoor
    parts.append(tcyl(f'rung{k}', (0, 0.35 + k * 0.33, 1.3), 0.02, 0.5, 'x', M['iron'], 8))
parts.append(tbox('trap_square', -0.4, 0.4, 3.35, 3.4, 0.6, 1.4, M['wood']))
lantern('L_shaft', (1.2, 1.6, -1.2), 2.0, 5, flicker=True)
ladder = join('UC_Ladder', [tbox('ladder_hit', -0.4, 0.4, 0.2, 2.6, 1.15, 1.35, M['iron'])], C)

# ---- culvert 1, 2. the storeroom
culvert('cv1', 1.5, 9.0)
room('store', 9.0, 13.0, -2.0, 2.0, H, west=(-1.0, 1.0), east=(-1.0, 1.0))
for k, (x, z) in enumerate(((9.6, -1.4), (10.4, -1.5), (9.7, 1.4), (12.4, 1.45))):
    parts.append(tbox(f'crate{k}', x - 0.35, x + 0.35, 0, 0.6, z - 0.3, z + 0.3, M['wood']))
    col_box(f'COL_UC_crate{k}', x - 0.35, x + 0.35, z - 0.3, z + 0.3)
for k in range(8):
    parts.append(tcyl(f'tin{k}', (12.3 + (k % 4) * 0.12, 0.66 + (k // 4) * 0.13, 1.4), 0.05, 0.12, 'y', M['tin'], 10))
tray = [tbox('tray', 11.0, 11.5, 0.6, 0.62, -1.75, -1.4, M['tin'])]
for k, dx in enumerate((0.1, 0.25)):
    tray.append(tcyl(f'cup{k}', (11.0 + dx, 0.67, -1.6), 0.04, 0.08, 'y', M['linen'], 12))
tray.append(tcyl('plate', (11.4, 0.63, -1.55), 0.09, 0.015, 'y', M['linen'], 16))
parts.append(tbox('tray_shelf', 10.9, 11.6, 0, 0.6, -1.85, -1.3, M['wood']))
col_box('COL_UC_trayshelf', 10.9, 11.6, -1.85, -1.3)
join('UC_Tray', tray, C)
lantern('L_store', (12.6, 1.8, -1.7), 2.4, 6)

# ---- culvert 2, 3. the sky room
culvert('cv2', 13.0, 17.0)
room('sky', 17.0, 23.0, -3.0, 3.0, 2.8, west=(-1.0, 1.0), east=(-1.0, 1.0), wall='concrete', floor='planks')
mural_parts = [tquad('mural_ceiling', [(17.15, 2.78, -2.85), (22.85, 2.78, -2.85), (22.85, 2.78, 2.85), (17.15, 2.78, 2.85)], M['mural'], uvs=((0, 0), (1, 0), (1, 1), (0, 1))),
               tquad('mural_n', [(17.15, 0.6, 2.86), (22.85, 0.6, 2.86), (22.85, 2.77, 2.86), (17.15, 2.77, 2.86)], M['mural'], uvs=((0, 0), (1, 0), (1, 0.6), (0, 0.6))),
               tquad('mural_s', [(22.85, 0.6, -2.86), (17.15, 0.6, -2.86), (17.15, 2.77, -2.86), (22.85, 2.77, -2.86)], M['mural'], uvs=((0, 0.4), (1, 0.4), (1, 1), (0, 1)))]
join('UC_Mural', mural_parts, C)
draw = []
for k in range(7):  # drawings pinned along the south wall
    x = 17.6 + k * 0.75
    draw.append(tbox(f'drawing{k}', x, x + 0.4, 1.3 + (k % 2) * 0.25, 1.6 + (k % 2) * 0.25, -2.85, -2.84, M['paper']))
join('UC_Drawings', draw, C)
parts.append(tbox('stool', 19.8, 20.2, 0, 0.45, 0.2, 0.6, M['wood']))
lantern('L_sky', (20.0, 2.2, 0.0), 3.0, 8, flicker=True)

# ---- 4. the bedroom (and 5. the radio nook to its north)
room('bed', 23.0, 28.0, -2.5, 2.5, H, west=(-1.0, 1.0), north=(24.0, 26.0), floor='planks')
room('nook', 24.0, 26.0, 2.5, 4.5, H)
bed = [tbox('bed_frame', 26.0, 27.8, 0.25, 0.4, -2.3, -1.4, M['iron']),
       tbox('mattress', 26.05, 27.75, 0.4, 0.55, -2.25, -1.45, M['linen']),
       tbox('blanket', 26.4, 27.75, 0.55, 0.6, -2.27, -1.43, M['blanket']),
       tbox('pillow', 26.08, 26.4, 0.55, 0.65, -2.15, -1.55, M['linen'])]
for x in (26.0, 27.8):
    for z in (-2.3, -1.4):
        bed.append(tcyl(f'bedleg_{x}_{z}', (x, 0.2, z), 0.02, 0.4, 'y', M['iron'], 6))
    bed.append(tbox(f'bed_end_{x}', x - 0.02, x + 0.02, 0.4, 1.0, -2.3, -1.4, M['iron']))
join('UC_Bed', bed, C)
col_box('COL_UC_bed', 26.0, 27.8, -2.3, -1.4)
parts.append(tbox('table', 23.4, 24.4, 0.72, 0.76, 1.6, 2.3, M['wood']))
for x in (23.45, 24.35):
    for z in (1.65, 2.25):
        parts.append(tbox(f'tleg{x}{z}', x - 0.025, x + 0.025, 0, 0.72, z - 0.025, z + 0.025, M['wood']))
col_box('COL_UC_table', 23.4, 24.4, 1.6, 2.3)
join('UC_Diary', [tbox('diary', 23.7, 23.92, 0.76, 0.79, 1.85, 2.0, M['blanket'])], C)
cal = [tbox('cal_panel', 27.86, 27.88, 0.9, 1.9, 0.3, 1.9, M['concrete'])]
for k in range(60):  # scratched tallies, in fives
    x0 = 0.45 + (k // 5) * 0.12
    row = (k // 60)
    cal.append(tbox(f'tally{k}', 27.85, 27.86, 1.0 + (k % 5) * 0.0 + row, 1.5, x0 + (k % 5) * 0.018, x0 + (k % 5) * 0.018 + 0.006, M['chalk']) if k % 5 != 4
               else tcyl_dir(f'tally{k}', (27.85, 1.05, x0 - 0.01), (27.85, 1.45, x0 + 0.08), 0.004, M['chalk'], 4))
join('UC_Calendar', cal, C)
lantern('L_bed', (24.0, 0.86, 2.15), 3.6, 9, flicker=True)
parts.append(tbox('bed_crate', 25.3, 25.8, 0, 0.5, -2.3, -1.8, M['wood']))
lantern('L_bedside', (25.55, 0.6, -2.05), 3.0, 6, flicker=True)
# the radio nook: the tapped cable comes out of a pipe; a key made from a bent spoon
parts.append(tcyl_dir('cable', (25.0, 2.4, 4.45), (25.0, 0.95, 4.2), 0.015, M['cable'], 6))
parts.append(tbox('nook_shelf', 24.4, 25.6, 0.85, 0.9, 3.9, 4.4, M['wood']))
col_box('COL_UC_nookshelf', 24.4, 25.6, 3.9, 4.4)
key = [tbox('key_base', 24.85, 25.15, 0.9, 0.93, 4.05, 4.25, M['wood']),
       tbox('spoon_arm', 24.88, 25.12, 0.95, 0.965, 4.1, 4.2, M['tin']),
       tsphere('spoon_bowl', (25.13, 0.97, 4.15), 0.03, M['tin'], scale=(1.4, 0.4, 1)),
       tcyl('contact', (24.9, 0.94, 4.15), 0.01, 0.03, 'y', M['brass'], 8)]
join('UC_SpoonKey', key, C)
lantern('L_nook', (24.3, 1.9, 4.3), 1.6, 4)

join('Undercroft_Shell', parts, C)
print(f'EXPORTED undercroft.glb ({export_glb(OUT, extras=True):.2f} MB)')
