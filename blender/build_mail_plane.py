"""
THE MARIGOLD SILENCE: the mail plane that brings Inspector Hart and Agent Cole to Sable Flat.

A 1930s high-wing cabin monoplane (in the spirit of the Stinson and Bellanca mail planes of
the time, not a copy of any one type): doped-fabric fuselage in cream with a maroon cheat
line, a Wright-style radial engine under a ring cowl, two-blade metal propeller, wheel spats,
V wing struts, and a real cabin: two leather front seats, a rear bench, a wooden instrument
panel with eight lit gauges, two control wheels, throttle quadrant, compass, rudder pedals,
door handles, lined walls and a headliner, framed windscreen and side windows with glass.

The same model flies in the cinematic intro and stays parked on the apron in the game.

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_mail_plane.py
Output: public/models/mail_plane.glb

Game coordinates (y up), nose towards +z, origin on the ground under the main wheels' axle line.
Named nodes: Plane_Prop (spins about z), SEAT_Pilot / SEAT_Passenger (hip points, facing +z),
CAM_Cockpit (pilot's eyes), COL_Plane_* (collision when parked).
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from bhelpers import (T, apply_boolean, col_box, export_glb, join, marker, material, new_object, reset_scene,  # noqa: E402
                      save_image, set_origin, tbeam, tbox, tcyl, tcyl_dir, texture_set, tquad, tsphere, ttext, ttorus)
from pbr_textures import painted_metal, spectral_noise, normal_from_height, smoothstep  # noqa: E402

PROJECT = os.path.dirname(HERE)
TEX = os.path.join(HERE, 'textures')
OUT = os.path.join(PROJECT, 'public', 'models', 'mail_plane.glb')
C = 'Props'

reset_scene(['Props', 'Collision', 'Markers'])


# ------------------------------------------------------------------ textures and materials
def fabric(paint, seed, size=512):
    """Doped fabric over a frame: a smooth satin paint with soft mottling, faint rib-stitching
    lines every 25 cm, a little dust lower down and oil streaks (no rust: it's fabric)."""
    H = W = size
    n1 = spectral_noise(H, W, 1.8, seed)
    n2 = spectral_noise(H, W, 0.9, seed + 1)
    fine = spectral_noise(H, W, 0.35, seed + 2)
    col = np.ones((H, W, 3)) * np.array(paint) * (1 + 0.035 * n1[..., None] + 0.015 * fine[..., None])
    y = np.arange(H)[:, None] / H
    ribs = smoothstep(0.992, 1.0, np.cos(y * math.pi * 2 * 4) * 0.5 + 0.5) * np.ones((1, W))
    col *= 1 - 0.07 * ribs[..., None]
    dirt = smoothstep(0.55, 0.85, 0.5 + 0.3 * n2) * 0.12
    col = col * (1 - dirt[..., None]) + np.array((0.32, 0.27, 0.2)) * dirt[..., None]
    rough = np.clip(0.42 + 0.06 * n1 + 0.2 * dirt, 0.2, 0.9)
    height = 0.04 * fine + 0.25 * ribs
    return {'color': np.clip(col, 0, 1), 'roughness': rough, 'normal': normal_from_height(height, 1.2)}


def leather():
    H = W = 256
    n = spectral_noise(H, W, 1.2, 7)
    fine = spectral_noise(H, W, 0.3, 8)
    col = np.stack([0.24 + 0.05 * n, 0.12 + 0.03 * n, 0.06 + 0.02 * n], -1)
    crease = smoothstep(0.55, 0.7, 0.5 + 0.3 * fine)
    col = col * (1 - 0.25 * crease[..., None])
    return {'color': np.clip(col, 0, 1), 'roughness': np.clip(0.45 + 0.25 * crease, 0, 1),
            'normal': normal_from_height(0.3 * fine + 0.4 * crease, 1.0)}


def gauges():
    """2x4 instrument faces: black dials, cream ticks and numerals, a needle each."""
    W, H = 1024, 512
    img = np.zeros((H, W, 3))
    yy, xx = np.mgrid[0:H, 0:W]
    rng = np.random.default_rng(3)
    for i in range(8):
        cx, cy, r = 128 + (i % 4) * 256, 128 + (i // 4) * 256, 118
        d = np.hypot(xx - cx, yy - cy)
        a = np.arctan2(yy - cy, xx - cx)
        face = d < r
        img[face] = (0.05, 0.045, 0.04)
        ring = (d > r - 6) & (d < r)
        img[ring] = (0.55, 0.5, 0.42)
        # ticks round 270 degrees
        for k in range(0, 41):
            ang = math.radians(135 + k * 6.75)
            big = k % 5 == 0
            t0, t1 = (r - 34, r - 10) if big else (r - 22, r - 10)
            w = 3.5 if big else 1.8
            px, py = math.cos(ang), math.sin(ang)
            proj = (xx - cx) * px + (yy - cy) * py
            perp = np.abs(-(xx - cx) * py + (yy - cy) * px)
            img[(proj > t0) & (proj < t1) & (perp < w)] = (0.92, 0.86, 0.7)
        # needle
        ang = math.radians(135 + rng.uniform(40, 230))
        px, py = math.cos(ang), math.sin(ang)
        proj = (xx - cx) * px + (yy - cy) * py
        perp = np.abs(-(xx - cx) * py + (yy - cy) * px)
        img[(proj > -14) & (proj < r - 26) & (perp < 3.2)] = (0.95, 0.92, 0.82)
        img[d < 10] = (0.2, 0.2, 0.2)
        _ = a
    return img[::-1]  # Blender images start at the bottom


fab = texture_set('plane_fabric', fabric((0.80, 0.74, 0.60), 301), TEX)
trim = texture_set('plane_trim', fabric((0.36, 0.07, 0.06), 302), TEX)
lea = texture_set('plane_leather', leather(), TEX)
gimg = save_image('plane_gauges', gauges(), False, TEX)

M = {
    'fabric': material('PlaneFabric', fab),
    'trim': material('PlaneTrim', trim),
    'alu': material('PlaneAluminium', color=(0.72, 0.71, 0.68), rough=0.32, metal=0.55),
    'dark': material('PlaneDarkMetal', color=(0.07, 0.07, 0.065), rough=0.55, metal=0.6),
    'rubber': material('PlaneRubber', color=(0.03, 0.03, 0.03), rough=0.9),
    'leather': material('PlaneLeather', lea),
    'lining': material('PlaneLining', color=(0.36, 0.30, 0.22), rough=0.92),
    'wood': material('PlanePanelWood', color=(0.20, 0.11, 0.05), rough=0.35),
    'glass': material('PlaneGlass', color=(0.55, 0.55, 0.5), rough=0.05, metal=0.0, alpha=0.18),
    'gauge': material('PlaneGauges', {'color': gimg}, rough=0.25, emission=gimg, emission_strength=0.6),
    'brass': material('PlaneBrass', color=(0.62, 0.46, 0.2), rough=0.3, metal=1.0),
    'stencil': material('PlaneLettering', color=(0.36, 0.07, 0.06), rough=0.6),
    'cream': material('PlaneLetteringCream', color=(0.85, 0.8, 0.66), rough=0.6),
    'exhaust': material('PlaneExhaust', color=(0.18, 0.12, 0.09), rough=0.7, metal=0.8),
}
for k in ('fabric', 'trim', 'lining', 'glass'):
    M[k].use_backface_culling = False


# ------------------------------------------------------------------ loft: a skin through cross-sections
def superellipse(hw, hh, n, p=2.6):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        pts.append((hw * math.copysign(abs(c) ** (2 / p), c), hh * math.copysign(abs(s) ** (2 / p), s)))
    return pts


def loft(name, sections, mat, n=28, axis='z', cap=(True, True), p=2.6, flip=False):
    """sections: (pos_along_axis, (cu, cv) centre, half_width, half_height[, power]).
    axis 'z': (u, v) = (x, y); axis 'x': (u, v) = (z, y); axis 'y': (u, v) = (x, z)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    rings = []
    for sec in sections:
        a, (cu, cv), hw, hh = sec[:4]
        pw = sec[4] if len(sec) > 4 else p
        ring = []
        for (u, v) in superellipse(hw, hh, n, pw):
            if axis == 'z':
                g = (cu + u, cv + v, a)
            elif axis == 'x':
                g = (a, cv + v, cu + u)
            else:
                g = (cu + u, a, cv + v)
            ring.append(bm.verts.new(T(g)))
        rings.append(ring)
    length = 0.0
    dist = [0.0]
    for i in range(1, len(sections)):
        length += abs(sections[i][0] - sections[i - 1][0])
        dist.append(length)
    for i in range(len(rings) - 1):
        for j in range(n):
            q = [rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]]
            if flip:
                q = q[::-1]
            f = bm.faces.new(q)
            for k, l in enumerate(f.loops):
                jj = j + (1 if k in (1, 2) else 0)
                ii = i + (1 if k in (2, 3) else 0)
                if flip:
                    jj = j + (1 if k in (0, 1) else 0)
                    ii = i + (1 if k in (0, 3) else 0)
                l[uvl].uv = (jj / n * 2.0, dist[ii])
    if cap[0]:
        f = bm.faces.new(rings[0][::-1] if not flip else rings[0])
    if cap[1]:
        f = bm.faces.new(rings[-1] if not flip else rings[-1][::-1])
    bm.normal_update()
    return new_object(name, bm, mat, C)


# ------------------------------------------------------------------ fuselage
# (z, (x, y) centre, half width, half height)
FUS = [
    (-5.45, (0, 1.80), 0.03, 0.06),
    (-5.1, (0, 1.78), 0.10, 0.17),
    (-4.2, (0, 1.72), 0.24, 0.33),
    (-3.0, (0, 1.66), 0.40, 0.50),
    (-1.8, (0, 1.62), 0.55, 0.64),
    (-0.8, (0, 1.64), 0.64, 0.76),
    (0.2, (0, 1.68), 0.68, 0.80),
    (1.2, (0, 1.68), 0.69, 0.79),
    (2.0, (0, 1.64), 0.67, 0.74),
    (2.55, (0, 1.6), 0.62, 0.66),
]
shell = loft('Fuselage', FUS, M['fabric'], n=36, cap=(False, False))
# a real skin: 3 cm thick, fabric outside, cabin lining on the inside faces
shell.data.materials.append(M['lining'])
sol = shell.modifiers.new('skin', 'SOLIDIFY')
sol.thickness = 0.03
sol.offset = -1.0
sol.material_offset = 1
sol.use_rim = True

# window and windscreen openings, cut through the skin
cut = []
for side in (1, -1):
    for z0, z1 in ((-0.55, 0.45), (0.62, 1.62)):  # rear window, door window
        cut.append(tbox(f'cut_{side}_{z0}', 0.3, 0.9, 1.86, 2.3, z0, z1) if side > 0
                   else tbox(f'cut_{side}_{z0}', -0.9, -0.3, 1.86, 2.3, z0, z1))
cut.append(tbox('cut_ws', -0.55, 0.55, 2.0, 2.6, 1.7, 2.3))  # windscreen
apply_boolean(shell, cut)  # evaluates the skin thickness and the cuts together
for c in cut:
    bpy.data.objects.remove(c)

parts = [shell]
# cheat line and window frames
for side in (1, -1):
    parts.append(tbeam(f'cheat_{side}', (side * 0.705, 1.48, 2.3), (side * 0.14, 1.66, -5.0), 0.012, 0.13, M['trim']))
    for z0, z1 in ((-0.55, 0.45), (0.62, 1.62)):
        x = side * 0.70
        for (a, b) in (((x, 1.86, z0), (x, 1.86, z1)), ((x, 2.3, z0), (x, 2.3, z1)), ((x, 1.86, z0), (x, 2.3, z0)), ((x, 1.86, z1), (x, 2.3, z1))):
            parts.append(tbeam(f'wf_{side}_{z0}_{a[2]}_{b[1]}', a, b, 0.03, 0.03, M['trim']))
        parts.append(tquad(f'glass_{side}_{z0}', [(x, 1.86, z0), (x, 1.86, z1), (x, 2.3, z1), (x, 2.3, z0)], M['glass']))
    # door seam and handle (passenger door on the right, pilot's on the left)
    x = side * 0.715
    for (a, b) in (((x, 1.18, 0.6), (x, 1.86, 0.6)), ((x, 1.18, 1.65), (x, 1.86, 1.65)), ((x, 1.18, 0.6), (x, 1.18, 1.65))):
        parts.append(tbeam(f'door_{side}_{a[2]}_{b[1]}', a, b, 0.012, 0.012, M['dark']))
    parts.append(tbeam(f'handle_{side}', (x + side * 0.02, 1.55, 0.72), (x + side * 0.02, 1.55, 0.88), 0.02, 0.02, M['alu']))
    parts.append(tbox(f'step_{side}', side * 0.72 - 0.12, side * 0.72 + 0.12, 0.72, 0.74, 0.95, 1.2, M['alu']) if side > 0
                 else tbox(f'step_{side}', -0.84, -0.6, 0.72, 0.74, 0.95, 1.2, M['alu']))
# windscreen: three panes in a sloped frame
ws_bot, ws_top = (2.0, 2.27), (2.47, 1.74)  # (y, z) bottom and top of the screen
for i, (x0, x1) in enumerate(((-0.55, -0.19), (-0.19, 0.19), (0.19, 0.55))):
    parts.append(tquad(f'ws_glass_{i}', [(x0, ws_bot[0], ws_bot[1]), (x1, ws_bot[0], ws_bot[1]), (x1, ws_top[0], ws_top[1]), (x0, ws_top[0], ws_top[1])], M['glass']))
for x in (-0.55, -0.19, 0.19, 0.55):
    parts.append(tbeam(f'ws_post_{x}', (x, ws_bot[0], ws_bot[1]), (x, ws_top[0], ws_top[1]), 0.03, 0.03, M['trim']))
parts.append(tbeam('ws_sill', (-0.58, ws_bot[0], ws_bot[1]), (0.58, ws_bot[0], ws_bot[1]), 0.04, 0.04, M['trim']))
parts.append(tbeam('ws_head', (-0.58, ws_top[0], ws_top[1]), (0.58, ws_top[0], ws_top[1]), 0.04, 0.04, M['trim']))

# ------------------------------------------------------------------ cabin interior
parts.append(tbox('floor', -0.6, 0.6, 1.0, 1.04, -1.0, 1.95, M['dark']))
for side, seat in ((1, 'P'), (-1, 'Q')):
    x = side * 0.28
    parts.append(tbox(f'seat_{seat}_cush', x - 0.24, x + 0.24, 1.2, 1.32, 0.38, 0.86, M['leather']))
    parts.append(tbox(f'seat_{seat}_base', x - 0.22, x + 0.22, 1.04, 1.2, 0.42, 0.84, M['dark']))
    back = tbox(f'seat_{seat}_back', x - 0.24, x + 0.24, 1.3, 1.95, 0.28, 0.4, M['leather'])
    parts.append(back)
    for k in range(3):  # tufted rolls
        parts.append(tcyl(f'seat_{seat}_roll{k}', (x, 1.45 + k * 0.17, 0.42), 0.035, 0.44, 'x', M['leather'], 10))
    # control wheel on a column out of the panel
    parts.append(tcyl_dir(f'col_{seat}', (x, 1.68, 1.86), (x, 1.62, 1.32), 0.022, M['dark']))
    parts.append(ttorus(f'yoke_{seat}', (x, 1.62, 1.3), 0.14, 0.017, 'z', M['wood']))
    parts.append(tbeam(f'yoke_bar_{seat}', (x - 0.14, 1.62, 1.3), (x + 0.14, 1.62, 1.3), 0.025, 0.025, M['wood']))
    for dx in (-0.08, 0.08):
        parts.append(tbox(f'pedal_{seat}_{dx}', x + dx - 0.04, x + dx + 0.04, 1.06, 1.22, 1.72, 1.76, M['dark']))
parts.append(tbox('rear_bench', -0.55, 0.55, 1.2, 1.32, -0.75, -0.3, M['leather']))
parts.append(tbox('rear_back', -0.55, 0.55, 1.3, 1.9, -0.9, -0.78, M['leather']))
parts.append(tbox('mail_sacks', -0.4, 0.4, 1.32, 1.6, -0.72, -0.35, M['lining']))
# instrument panel: wood board, eight gauges in two rows, compass on top
parts.append(tbox('panel', -0.62, 0.62, 1.66, 1.98, 1.86, 1.92, M['wood']))
parts.append(tbox('panel_shelf', -0.62, 0.62, 1.96, 1.99, 1.78, 1.93, M['wood']))
parts.append(tbox('glare_deck', -0.62, 0.62, 1.97, 2.01, 1.9, 2.3, M['dark']))  # the coaming between panel and windscreen
parts.append(tbox('nose_bulkhead', -0.62, 0.62, 1.1, 2.01, 2.28, 2.31, M['dark']))
for i in range(8):
    col, row = i % 4, i // 4
    x = 0.44 - col * 0.17 - (0.1 if col >= 2 else 0)
    y = 1.9 - row * 0.13
    r = 0.05
    u0, v0 = col * 0.25, 0.5 - row * 0.5
    pts = [(x + r, y - r, 1.857), (x - r, y - r, 1.857), (x - r, y + r, 1.857), (x + r, y + r, 1.857)]
    parts.append(tquad(f'gauge_{i}', pts, M['gauge'], uvs=((u0, v0), (u0 + 0.25, v0), (u0 + 0.25, v0 + 0.5), (u0, v0 + 0.5))))
    parts.append(ttorus(f'bezel_{i}', (x, y, 1.855), r, 0.008, 'z', M['brass'], (18, 6)))
parts.append(tsphere('compass', (0, 2.05, 1.86), 0.055, M['dark']))
parts.append(tcyl('compass_window', (0, 2.05, 1.81), 0.04, 0.01, 'z', M['glass'], 16))
parts.append(tbox('throttle_q', -0.05, 0.05, 1.5, 1.68, 1.72, 1.86, M['dark']))
for k, dx in enumerate((-0.025, 0.0, 0.025)):
    parts.append(tcyl_dir(f'lever_{k}', (dx, 1.6, 1.78), (dx, 1.68, 1.68), 0.006, M['alu']))
    parts.append(tsphere(f'knob_{k}', (dx, 1.68, 1.68), 0.016, M['dark'] if k else M['trim']))
parts.append(tbox('headliner', -0.6, 0.6, 2.36, 2.38, -0.9, 1.75, M['lining']))
parts.append(tcyl('cabin_lamp', (0, 2.33, 0.2), 0.05, 0.03, 'y', M['brass'], 12))

# ------------------------------------------------------------------ engine, cowl, propeller
parts.append(tcyl('firewall', (0, 1.6, 2.58), 0.6, 0.06, 'z', M['dark'], 28))
cowl = tcyl('cowl', (0, 1.6, 2.95), 0.8, 0.62, 'z', M['alu'], 40, r2=0.74, cap=False)
cowl_in = tcyl('cowl_in', (0, 1.6, 2.95), 0.7, 0.58, 'z', M['dark'], 40, r2=0.66, cap=False)
parts += [cowl, cowl_in, ttorus('cowl_lip', (0, 1.6, 3.26), 0.775, 0.03, 'z', M['alu'], (40, 8))]
for i in range(9):
    a = i / 9 * math.tau
    c, s = math.cos(a), math.sin(a)
    parts.append(tcyl_dir(f'cyl_{i}', (c * 0.18, 1.6 + s * 0.18, 3.0), (c * 0.6, 1.6 + s * 0.6, 3.0), 0.085, M['dark'], 12))
    for k in range(5):  # cooling fins
        rr = 0.3 + k * 0.06
        parts.append(tcyl_dir(f'fin_{i}_{k}', (c * rr, 1.6 + s * rr, 2.96), (c * (rr + 0.012), 1.6 + s * (rr + 0.012), 2.96), 0.11, M['dark'], 12))
    parts.append(tcyl_dir(f'rocker_{i}', (c * 0.58, 1.6 + s * 0.58, 2.92), (c * 0.58, 1.6 + s * 0.58, 3.08), 0.05, M['alu'], 8))
    parts.append(tcyl_dir(f'pushrod_{i}', (c * 0.2, 1.6 + s * 0.2, 2.85), (c * 0.56, 1.6 + s * 0.56, 2.92), 0.01, M['alu'], 6))
parts.append(tsphere('crankcase', (0, 1.6, 3.0), 0.24, M['alu'], scale=(1, 1, 0.8)))
parts.append(ttorus('collector', (0, 1.6, 2.68), 0.66, 0.045, 'z', M['exhaust'], (36, 8)))
parts.append(tcyl_dir('exhaust_pipe', (0.45, 1.05, 2.6), (0.55, 0.95, 1.6), 0.045, M['exhaust']))
for side in (1, -1):
    for k in range(4):
        parts.append(tbeam(f'louvre_{side}_{k}', (side * 0.66, 1.45 + k * 0.08, 2.2), (side * 0.66, 1.45 + k * 0.08, 2.45), 0.01, 0.025, M['dark']))

prop_parts = [tcyl('spinner', (0, 1.6, 3.42), 0.2, 0.36, 'z', M['alu'], 24, r2=0.02),
              tcyl('hub', (0, 1.6, 3.27), 0.12, 0.12, 'z', M['dark'], 16)]
for b, sgn in enumerate((1, -1)):
    secs = []
    for k in range(9):
        t = k / 8
        r = 0.12 + t * 1.03
        chord = 0.16 * math.sin(math.pi * (0.25 + 0.65 * t)) + 0.03
        secs.append((sgn * r, (3.3, 1.6), 0.018 * (1 - 0.6 * t), chord / 2, 2.2))  # thin along the axis, chord across
    # blade along y: build along x then rotate
    blade = loft(f'blade_{b}', [(s[0], (s[1][0], s[1][1]), s[2], s[3], s[4]) for s in secs], M['alu'], n=12, axis='x')
    hub = Vector(T((0, 1.6, 3.3)))
    blade.data.transform(Matrix.Translation(hub) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Translation(-hub))
    prop_parts.append(blade)
prop = join('Plane_Prop', prop_parts, C)
set_origin(prop, T((0, 1.6, 3.3)))
prop['spinRate'] = 0.0  # the game spins it (only the intro has the engine running)

# ------------------------------------------------------------------ wing and struts
WING = []
span = 6.2
for k in range(15):
    t = k / 14
    x = -span + 2 * span * t
    a = abs(x) / span
    chord = 1.75 - 0.45 * a ** 1.6
    tip = 1 - smoothstep(0.93, 1.0, np.array(a)).item() * 0.85
    WING.append((x, (0.95 + 0.25 * a ** 2, 2.55 + abs(x) * 0.035), chord / 2 * tip, 0.1 * (1 - 0.4 * a) * tip + 0.005, 2.2))
wing = loft('Wing', WING, M['fabric'], n=20, axis='x')
parts.append(wing)
for side in (1, -1):
    parts.append(tbeam(f'aileron_line_{side}', (side * 3.3, 2.66 + 3.3 * 0.035 * 0.97, 0.2), (side * 5.9, 2.66 + 5.9 * 0.035 - 0.01, 0.38), 0.008, 0.008, M['dark']))
    for z0, z1 in ((0.55, 0.62), (1.32, 1.4)):
        parts.append(tcyl_dir(f'strut_{side}_{z0}', (side * 0.62, 1.12, (z0 + z1) / 2), (side * 3.4, 2.46 + 3.4 * 0.035, (z0 + z1) / 2), 0.032, M['alu'], 10))
    parts.append(tcyl_dir(f'jury_{side}', (side * 2.1, 1.84, 0.95), (side * 2.1, 2.5, 0.95), 0.018, M['alu'], 8))
    parts.append(ttext(f'reg_wing_{side}', 'NC 11427', 0.55, M['stencil'], (side * 3.2, 2.69 + 3.2 * 0.035, 0.95), 'y+', spin=math.pi / 2 if side > 0 else -math.pi / 2))

# ------------------------------------------------------------------ tail
HS = []
for k in range(11):
    t = k / 10
    x = -1.75 + 3.5 * t
    a = abs(x) / 1.75
    chord = 0.95 * math.sqrt(max(0.0, 1 - a ** 2.4)) + 0.02
    HS.append((x, (-4.75 + 0.15 * a, 1.78), chord / 2, 0.035 * (1 - 0.5 * a) + 0.004, 2.2))
parts.append(loft('Stabiliser', HS, M['fabric'], n=14, axis='x'))
FIN = []
for k in range(10):
    t = k / 9
    y = 1.8 + 1.25 * t
    chord = 1.25 * math.sqrt(max(0.0, 1 - t ** 2.2)) + 0.03
    FIN.append((y, (0, -4.95 + 0.3 * t + (1.25 - chord) * 0.25), 0.04 * (1 - 0.5 * t) + 0.004, chord / 2, 2.2))
parts.append(loft('Fin', FIN, M['trim'], n=14, axis='y'))
parts.append(ttext('reg_fin_l', 'NC11427', 0.17, M['cream'], (0.05, 2.25, -5.0), 'x+'))
parts.append(ttext('reg_fin_r', 'NC11427', 0.17, M['cream'], (-0.05, 2.25, -5.0), 'x-'))
for side, face in ((1, 'x+'), (-1, 'x-')):
    parts.append(ttext(f'line_{side}', 'SABLE AIR MAIL', 0.22, M['stencil'], (side * 0.56, 1.9, -1.7), face))
    parts.append(ttext(f'usmail_{side}', 'U.S. MAIL', 0.12, M['stencil'], (side * 0.69, 1.25, 0.2), face))

# ------------------------------------------------------------------ undercarriage
for side in (1, -1):
    wx = side * 1.25
    parts.append(tcyl_dir(f'leg_{side}', (side * 0.55, 1.05, 1.15), (wx, 0.42, 1.2), 0.045, M['trim'], 10))
    parts.append(tcyl_dir(f'brace_{side}', (side * 0.5, 1.0, 0.6), (wx, 0.42, 1.2), 0.03, M['trim'], 8))
    parts.append(ttorus(f'tyre_{side}', (wx, 0.36, 1.2), 0.27, 0.09, 'x', M['rubber'], (28, 10)))
    parts.append(tcyl(f'hub_{side}', (wx, 0.36, 1.2), 0.18, 0.13, 'x', M['alu'], 20))
    parts.append(tsphere(f'spat_{side}', (wx, 0.5, 1.22), 0.5, M['trim'], (24, 14), scale=(0.3, 0.62, 1.15)))
parts.append(tcyl_dir('tailwheel_leg', (0, 1.55, -4.85), (0, 0.15, -5.05), 0.025, M['dark']))
parts.append(ttorus('tailwheel', (0, 0.1, -5.05), 0.07, 0.035, 'x', M['rubber'], (16, 6)))

# lights: navigation lamps on the wing tips, landing light in the left wing
parts.append(tsphere('nav_l', (6.15, 2.77, 0.95), 0.05, material('NavRed', color=(0.5, 0.02, 0.02), emission=(1.0, 0.1, 0.05), emission_strength=2.0)))
parts.append(tsphere('nav_r', (-6.15, 2.77, 0.95), 0.05, material('NavGreen', color=(0.02, 0.4, 0.05), emission=(0.1, 1.0, 0.2), emission_strength=2.0)))

body = join('MailPlane_Body', [p for p in parts], C)

# ------------------------------------------------------------------ markers and collision
marker('SEAT_Pilot', T((0.28, 1.27, 0.62)), {}, 'Markers')
marker('SEAT_Passenger', T((-0.28, 1.27, 0.62)), {}, 'Markers')
marker('CAM_Cockpit', T((0.28, 2.02, 0.68)), {}, 'Markers')
col_box('COL_Plane_Fuselage', -0.75, 0.75, -5.4, 3.4)
col_box('COL_Plane_WheelL', 1.0, 1.5, 0.6, 1.8)
col_box('COL_Plane_WheelR', -1.5, -1.0, 0.6, 1.8)

size = export_glb(OUT, extras=True)
print(f'EXPORTED mail_plane.glb ({size:.2f} MB)')
