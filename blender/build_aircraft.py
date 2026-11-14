"""
THE MARIGOLD SILENCE: the other two aeroplanes on Sable Flat (v4 map fix list).

  trimotor.glb   the 'Marigold II': a corrugated-metal three-engined airliner of the late 1920s,
                 parked in the hangar nose-first toward the big door. (In the spirit of the period's
                 trimotors, not a copy of one type.) Silver corrugated skin, marigold-yellow trim.
  waco.glb       Julian's biplane: red and cream fabric, a radial engine, two open cockpits.
                 Named node: Waco_FuelCap (S16).

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_aircraft.py
Game coordinates (y up), nose toward +z, origin on the ground under the main wheels.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from bhelpers import (T, col_box, export_glb, join, material, new_object, reset_scene, set_origin, tbox,  # noqa: E402
                      tcyl, tcyl_dir, texture_set, tquad, tsphere, ttext, ttorus)
from pbr_textures import corrugated_metal, normal_from_height, smoothstep, spectral_noise  # noqa: E402

PROJECT = os.path.dirname(HERE)
TEX = os.path.join(HERE, 'textures')
OUT = os.path.join(PROJECT, 'public', 'models')
C = 'Props'


def superellipse(hw, hh, n, p):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        out.append((hw * math.copysign(abs(c) ** (2 / p), c), hh * math.copysign(abs(s) ** (2 / p), s)))
    return out


def loft(name, sections, mat, n=24, axis='z', p=2.6, cap=(True, True)):
    """sections: (pos, (cu, cv), half_width, half_height[, power]); axis z: (x, y); x: (z, y); y: (x, z)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    rings, dist = [], [0.0]
    for i, sec in enumerate(sections):
        a, (cu, cv), hw, hh = sec[:4]
        ring = []
        for (u, v) in superellipse(hw, hh, n, sec[4] if len(sec) > 4 else p):
            g = (cu + u, cv + v, a) if axis == 'z' else (a, cv + v, cu + u) if axis == 'x' else (cu + u, a, cv + v)
            ring.append(bm.verts.new(T(g)))
        rings.append(ring)
        if i:
            dist.append(dist[-1] + abs(a - sections[i - 1][0]))
    for i in range(len(rings) - 1):
        for j in range(n):
            f = bm.faces.new([rings[i][j], rings[i][(j + 1) % n], rings[i + 1][(j + 1) % n], rings[i + 1][j]])
            for k, l in enumerate(f.loops):
                l[uvl].uv = ((j + (1 if k in (1, 2) else 0)) / n * 3.0, dist[i + (1 if k in (2, 3) else 0)] / 2)
    if cap[0]:
        bm.faces.new(rings[0][::-1])
    if cap[1]:
        bm.faces.new(rings[-1])
    bm.normal_update()
    return new_object(name, bm, mat, C)


def fabric(paint, seed):
    H = W = 256
    n1 = spectral_noise(H, W, 1.8, seed)
    fine = spectral_noise(H, W, 0.35, seed + 1)
    col = np.ones((H, W, 3)) * np.array(paint) * (1 + 0.04 * n1[..., None] + 0.02 * fine[..., None])
    return {'color': np.clip(col, 0, 1), 'roughness': np.clip(0.45 + 0.06 * n1, 0.2, 0.9), 'normal': normal_from_height(0.05 * fine, 1)}


def radial(prefix, center, r, mats, parts, cyl=9):
    """A radial engine with a ring cowl at center (facing +z)."""
    x, y, z = center
    parts.append(tcyl(f'{prefix}_cowl', (x, y, z), r, 0.45, 'z', mats['alu'], 32, r2=r * 0.93, cap=False))
    parts.append(ttorus(f'{prefix}_lip', (x, y, z + 0.22), r * 0.97, 0.03, 'z', mats['alu'], (32, 6)))
    for i in range(cyl):
        a = i / cyl * math.tau
        parts.append(tcyl_dir(f'{prefix}_cyl{i}', (x + math.cos(a) * r * 0.25, y + math.sin(a) * r * 0.25, z),
                              (x + math.cos(a) * r * 0.82, y + math.sin(a) * r * 0.82, z), r * 0.12, mats['dark'], 10))
    parts.append(tsphere(f'{prefix}_case', (x, y, z), r * 0.32, mats['alu'], scale=(1, 1, 0.8)))


def prop(name, center, length, mats):
    x, y, z = center
    p = [tcyl(f'{name}_spin', (x, y, z + 0.15), length * 0.12, length * 0.22, 'z', mats['alu'], 16, r2=0.02)]
    for s in (1, -1):
        b = tbox(f'{name}_b{s}', x - 0.07, x + 0.07, y, y + s * length / 2 if s > 0 else y, z - 0.015, z + 0.015, mats['dark'])
        if s < 0:
            b = tbox(f'{name}_b{s}', x - 0.07, x + 0.07, y - length / 2, y, z - 0.015, z + 0.015, mats['dark'])
        p.append(b)
    ob = join(name, p, C)
    set_origin(ob, T(center))
    return ob


# ======================================================================== the Trimotor
def trimotor():
    reset_scene(['Props', 'Collision'])
    # clean corrugated aluminium: fine ridges running nose to tail, a little oil and dust
    H = W = 512
    xx = np.arange(W)[None, :] / W
    ridge = np.sin(xx * math.tau * 48) * np.ones((H, 1))
    n1 = spectral_noise(H, W, 1.6, 211)
    grime = smoothstep(0.6, 0.9, 0.5 + 0.35 * n1)
    col = np.ones((H, W, 3)) * np.array((0.8, 0.8, 0.78)) * (1 + 0.05 * ridge[..., None]) * (1 - 0.25 * grime[..., None])
    corr = texture_set('tri_corr', {'color': np.clip(col, 0, 1), 'roughness': np.clip(0.35 + 0.25 * grime, 0, 1),
                                    'metallic': np.full((H, W), 0.3), 'normal': normal_from_height(ridge * 0.6, 2.5)}, TEX)
    M = {
        'skin': material('TrimotorSkin', corr),
        'alu': material('TrimotorAlu', color=(0.72, 0.71, 0.68), rough=0.32, metal=0.6),
        'dark': material('TrimotorDark', color=(0.06, 0.06, 0.055), rough=0.6, metal=0.4),
        'yellow': material('MarigoldYellow', color=(0.85, 0.55, 0.08), rough=0.45),
        'glass': material('TrimotorGlass', color=(0.15, 0.16, 0.15), rough=0.08, alpha=0.55),
        'rubber': material('TrimotorRubber', color=(0.03, 0.03, 0.03), rough=0.9),
    }
    M['skin'].use_backface_culling = False
    parts = []
    parts.append(loft('Tri_Fuselage', [(-8.0, (0, 2.7), 0.08, 0.15), (-6.0, (0, 2.5), 0.45, 0.6), (-3.0, (0, 2.25), 0.85, 1.0),
                                       (0.0, (0, 2.15), 0.95, 1.15), (3.0, (0, 2.15), 0.95, 1.15), (5.0, (0, 2.1), 0.85, 1.0), (6.0, (0, 2.1), 0.7, 0.82)],
                      M['skin'], n=28, p=3.4))
    for side in (1, -1):  # cabin windows and the trim line
        for k in range(6):
            z0 = -2.2 + k * 1.0
            x = side * 0.955
            parts.append(tquad(f'win_{side}_{k}', [(x, 2.35, z0), (x, 2.35, z0 + 0.6), (x, 2.85, z0 + 0.6), (x, 2.85, z0)], M['glass']))
        parts.append(tbox(f'trim_{side}', side * 0.95 - 0.01, side * 0.95 + 0.01, 1.75, 1.88, -5.5, 5.8, M['yellow']) if side > 0
                     else tbox(f'trim_{side}', -0.96, -0.94, 1.75, 1.88, -5.5, 5.8, M['yellow']))
        parts.append(ttext(f'name_{side}', 'MARIGOLD II', 0.32, M['yellow'], (side * 0.97, 2.25, 4.0), 'x+' if side > 0 else 'x-'))
        # cabin door (left side, aft)
    parts.append(tbox('door_frame', -0.99, -0.96, 1.4, 3.0, -4.0, -3.1, M['dark']))
    parts.append(tquad('windscreen', [(-0.65, 2.75, 5.3), (0.65, 2.75, 5.3), (0.55, 3.15, 4.8), (-0.55, 3.15, 4.8)], M['glass']))
    # wing: thick, high, corrugated
    W = []
    for k in range(13):
        t = k / 12
        x = -11.5 + 23 * t
        a = abs(x) / 11.5
        W.append((x, (1.4 - 0.4 * a, 3.45), (3.4 - 1.4 * a) / 2, 0.24 - 0.12 * a, 2.4))
    parts.append(loft('Tri_Wing', W, M['skin'], n=16, axis='x'))
    # engines: nose, and one under each wing
    radial('eng_nose', (0, 2.1, 6.25), 0.75, M, parts)
    for side in (1, -1):
        x = side * 4.5
        parts.append(loft(f'nacelle_{side}', [(1.0, (x, 2.35), 0.1, 0.1), (2.0, (x, 2.35), 0.5, 0.5), (3.2, (x, 2.35), 0.55, 0.55)], M['alu'], n=16, axis='z'))
        radial(f'eng_{side}', (x, 2.35, 3.45), 0.62, M, parts)
        parts.append(tcyl_dir(f'nstrut_a{side}', (x, 2.9, 2.6), (x, 3.3, 2.0), 0.05, M['alu']))
        parts.append(tcyl_dir(f'nstrut_b{side}', (x, 2.0, 2.4), (side * 0.9, 1.4, 2.0), 0.06, M['alu']))
        # undercarriage under each nacelle
        parts.append(tcyl_dir(f'leg_{side}', (x, 1.9, 2.2), (side * 3.3, 0.55, 2.0), 0.08, M['alu']))
        parts.append(tcyl_dir(f'brace_{side}', (side * 0.9, 1.2, 1.6), (side * 3.3, 0.55, 2.0), 0.06, M['alu']))
        parts.append(ttorus(f'tyre_{side}', (side * 3.3, 0.55, 2.0), 0.42, 0.14, 'x', M['rubber'], (24, 10)))
        parts.append(tcyl(f'hub_{side}', (side * 3.3, 0.55, 2.0), 0.28, 0.2, 'x', M['alu'], 18))
    # tail
    S = [(-3.6 + 7.2 * k / 8, (-7.2, 2.75), 0.6 * math.sqrt(max(0.0, 1 - abs(-3.6 + 7.2 * k / 8) / 3.6)) + 0.05, 0.05, 2.2) for k in range(9)]
    parts.append(loft('Tri_Stab', S, M['skin'], n=12, axis='x'))
    F = [(2.6 + 1.8 * k / 7, (0, -7.5 + 0.4 * k / 7), 0.06, 0.9 * math.sqrt(max(0.0, 1 - (k / 7) ** 2.2)) + 0.05, 2.2) for k in range(8)]
    parts.append(loft('Tri_Fin', F, M['skin'], n=12, axis='y'))
    parts.append(ttext('reg_l', 'NC 9612', 0.3, M['dark'], (0.08, 3.4, -7.4), 'x+'))
    parts.append(ttext('reg_r', 'NC 9612', 0.3, M['dark'], (-0.08, 3.4, -7.4), 'x-'))
    parts.append(tcyl_dir('tailwheel', (0, 1.8, -7.0), (0, 0.2, -7.3), 0.04, M['alu']))
    parts.append(ttorus('tailtyre', (0, 0.18, -7.3), 0.13, 0.06, 'x', M['rubber'], (16, 6)))
    join('Trimotor_Body', parts, C)
    for name, ctr in (('Trimotor_PropNose', (0, 2.1, 6.55)), ('Trimotor_PropL', (4.5, 2.35, 3.72)), ('Trimotor_PropR', (-4.5, 2.35, 3.72))):
        prop(name, ctr, 2.6, M)
    col_box('COL_Trimotor_Fuselage', -1.05, 1.05, -8.0, 6.8)
    for side in (1, -1):
        col_box(f'COL_Trimotor_Nacelle_{side}', side * 4.5 - 0.7, side * 4.5 + 0.7, 1.0, 3.9) if side > 0 else col_box(f'COL_Trimotor_Nacelle_{side}', -5.2, -3.8, 1.0, 3.9)
        col_box(f'COL_Trimotor_Wheel_{side}', side * 3.3 - 0.3, side * 3.3 + 0.3, 1.4, 2.6) if side > 0 else col_box(f'COL_Trimotor_Wheel_{side}', -3.6, -3.0, 1.4, 2.6)
    print(f'EXPORTED trimotor.glb ({export_glb(os.path.join(OUT, "trimotor.glb"), extras=True):.2f} MB)')


# ======================================================================== Julian's Waco
def waco():
    reset_scene(['Props', 'Collision'])
    M = {
        'red': material('WacoRed', texture_set('waco_red', fabric((0.42, 0.06, 0.05), 401), TEX)),
        'cream': material('WacoCream', texture_set('waco_cream', fabric((0.82, 0.76, 0.6), 402), TEX)),
        'alu': material('WacoAlu', color=(0.72, 0.71, 0.68), rough=0.32, metal=0.6),
        'dark': material('WacoDark', color=(0.06, 0.06, 0.055), rough=0.6, metal=0.4),
        'rubber': material('WacoRubber', color=(0.03, 0.03, 0.03), rough=0.9),
        'leather': material('WacoLeather', color=(0.25, 0.13, 0.06), rough=0.6),
    }
    parts = [loft('Waco_Fuselage', [(-4.2, (0, 1.55), 0.05, 0.1), (-2.6, (0, 1.45), 0.33, 0.42), (-0.6, (0, 1.4), 0.5, 0.6),
                                   (1.0, (0, 1.4), 0.52, 0.6), (2.0, (0, 1.4), 0.5, 0.55), (2.45, (0, 1.4), 0.45, 0.5)], M['red'], n=24, p=2.8)]
    for z in (0.3, -0.75):  # two open cockpits with leather rims
        parts.append(ttorus(f'cockpit_{z}', (0, 1.98, z), 0.32, 0.04, 'y', M['leather'], (20, 6)))
        parts.append(tcyl(f'cockpit_hole_{z}', (0, 1.97, z), 0.3, 0.02, 'y', M['dark'], 20))
    radial('eng', (0, 1.4, 2.65), 0.62, M, parts)
    for name, y, z, span, chord in (('Waco_LowerWing', 0.85, 0.5, 4.4, 1.35), ('Waco_UpperWing', 2.45, 0.95, 4.7, 1.45)):
        Wg = []
        for k in range(11):
            x = -span + 2 * span * k / 10
            a = abs(x) / span
            Wg.append((x, (z, y + abs(x) * 0.02), chord / 2 * (1 - 0.15 * a ** 4), 0.07, 2.2))
        parts.append(loft(name, Wg, M['cream'], n=14, axis='x'))
    for side in (1, -1):
        for dz in (0.2, 0.9):
            parts.append(tcyl_dir(f'istrut_{side}_{dz}', (side * 2.9, 0.9, dz + 0.05), (side * 2.9, 2.45, dz + 0.4), 0.03, M['alu']))
        parts.append(tcyl_dir(f'cabane_{side}', (side * 0.35, 1.9, 1.3), (side * 0.3, 2.45, 1.1), 0.025, M['alu']))
        parts.append(tcyl_dir(f'leg_{side}', (side * 0.4, 0.95, 1.3), (side * 1.0, 0.36, 1.45), 0.05, M['alu']))
        parts.append(ttorus(f'tyre_{side}', (side * 1.0, 0.36, 1.45), 0.28, 0.09, 'x', M['rubber'], (20, 8)))
        parts.append(tcyl(f'hub_{side}', (side * 1.0, 0.36, 1.45), 0.18, 0.13, 'x', M['alu'], 16))
    S = [(-1.6 + 3.2 * k / 8, (-3.8, 1.55), 0.45 * math.sqrt(max(0.0, 1 - abs(-1.6 + 3.2 * k / 8) / 1.6)) + 0.04, 0.03, 2.2) for k in range(9)]
    parts.append(loft('Waco_Stab', S, M['cream'], n=12, axis='x'))
    F = [(1.6 + 1.0 * k / 7, (0, -3.95 + 0.3 * k / 7), 0.04, 0.55 * math.sqrt(max(0.0, 1 - (k / 7) ** 2.2)) + 0.04, 2.2) for k in range(8)]
    parts.append(loft('Waco_Fin', F, M['red'], n=12, axis='y'))
    parts.append(ttext('reg_l', 'NC 14036', 0.16, M['cream'], (0.05, 2.0, -3.9), 'x+'))
    parts.append(ttext('reg_r', 'NC 14036', 0.16, M['cream'], (-0.05, 2.0, -3.9), 'x-'))
    parts.append(ttext('line_l', 'MERIDIAN AIR', 0.2, M['cream'], (0.53, 1.35, -1.6), 'x+'))
    parts.append(ttext('line_r', 'MERIDIAN AIR', 0.2, M['cream'], (-0.53, 1.35, -1.6), 'x-'))
    parts.append(tcyl_dir('tailskid', (0, 1.4, -3.9), (0, 0.1, -4.15), 0.03, M['alu']))
    join('Waco_Body', parts, C)
    cap = tcyl('Waco_FuelCap', (0, 2.56, 0.95), 0.07, 0.04, 'y', M['alu'], 16)
    set_origin(cap, T((0, 2.56, 0.95)))
    prop('Waco_Prop', (0, 1.4, 2.95), 2.3, M)
    col_box('COL_Waco_Fuselage', -0.6, 0.6, -4.2, 3.0)
    col_box('COL_Waco_WheelL', 0.75, 1.25, 1.1, 1.8)
    col_box('COL_Waco_WheelR', -1.25, -0.75, 1.1, 1.8)
    print(f'EXPORTED waco.glb ({export_glb(os.path.join(OUT, "waco.glb"), extras=True):.2f} MB)')


trimotor()
waco()
