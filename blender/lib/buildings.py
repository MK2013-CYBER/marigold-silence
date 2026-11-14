"""
Small-building toolkit for Sable Flat outbuildings. Everything is in GAME coordinates
(x east, y up, z south), built around the building's own origin; world.json places
and turns each building. By convention a building's front faces +z.
"""
import math

import bmesh
import bpy
from mathutils import Matrix

import pbr_textures as tex
from bhelpers import (T, apply_boolean, col_box, coll, join, material, new_object, tbeam, tbox, tcyl,
                      texture_set, tquad, ttext, world_uv)


def materials(tex_dir):
    M = {
        'siding': material('Siding', texture_set('siding', tex.planks(512, 201, 6, (0.92, 0.86, 0.76)), tex_dir)),
        'planks': material('PlankWall', texture_set('planks', tex.planks(512, 80, 5, (1.05, 0.98, 0.9)), tex_dir)),
        'floor': material('FloorBoards', texture_set('floorboards', tex.planks(512, 85, 6, (0.8, 0.72, 0.62)), tex_dir)),
        'tin': material('WallMetal', texture_set('wallmetal', tex.corrugated_metal(512, 1024, seed=20, rust_amount=0.14), tex_dir)),
        'roof': material('RoofTin', texture_set('rooftin', tex.corrugated_metal(256, 512, seed=27, paint=(0.42, 0.42, 0.4), rust_amount=0.3), tex_dir)),
        'wood': material('WeatheredWood', texture_set('wood', tex.weathered_wood(512), tex_dir)),
        'concrete': material('Concrete', texture_set('concrete', tex.concrete_floor(512), tex_dir)),
        'white': material('WhitePaintMetal', texture_set('whitemetal', tex.painted_metal(512, 63, (0.74, 0.72, 0.66)), tex_dir)),
        'red': material('RedPaint', texture_set('redpaint', tex.painted_metal(512, 61, (0.40, 0.07, 0.045)), tex_dir)),
        'olive': material('OlivePaint', texture_set('olive', tex.painted_metal(512, 60, (0.22, 0.27, 0.18)), tex_dir)),
        'grey': material('GreyPaint', texture_set('greypaint', tex.painted_metal(512, 62, (0.30, 0.31, 0.30)), tex_dir)),
        'steel': material('DarkSteel', color=(0.075, 0.07, 0.065), rough=0.55, metal=0.85),
        'iron': material('Iron', color=(0.05, 0.045, 0.04), rough=0.7, metal=0.7),
        'brass': material('Brass', color=(0.55, 0.42, 0.18), rough=0.3, metal=0.9),
        'alu': material('Aluminium', color=(0.55, 0.55, 0.52), rough=0.38, metal=0.85),
        'rubber': material('Rubber', color=(0.025, 0.025, 0.025), rough=0.9),
        'leather': material('Leather', color=(0.16, 0.07, 0.035), rough=0.45),
        'glass': material('WindowDust', color=(0.12, 0.11, 0.09), rough=0.15, metal=0.2, emission=(0.55, 0.45, 0.3), emission_strength=0.18),
        'clearglass': material('ClearGlassJar', color=(0.5, 0.55, 0.5), rough=0.05, alpha=0.35),
        'chainlink': material('ChainLink', color=(0.35, 0.35, 0.33), rough=0.6, metal=0.6, alpha=0.32),
        'paper': material('PlainPaper', color=(0.78, 0.74, 0.62), rough=0.95),
        'map': material('MapPaper', color=(0.72, 0.64, 0.46), rough=0.95),
        'chalkboard': material('Chalkboard', color=(0.05, 0.07, 0.06), rough=0.9),
        'chalk': material('Chalk', color=(0.82, 0.82, 0.78), rough=1.0),
        'stencil': material('StencilBlack', color=(0.03, 0.03, 0.03), rough=0.9),
        'sign_cream': material('SignCream', color=(0.76, 0.72, 0.6), rough=0.8),
        'sign_red': material('SignRed', color=(0.38, 0.06, 0.04), rough=0.7),
        'fuel': material('FuelAmber', color=(0.6, 0.38, 0.08), rough=0.1, emission=(0.4, 0.22, 0.03), emission_strength=0.4),
        'bulb': material('Bulb', color=(1.0, 0.9, 0.7), emission=(1.0, 0.82, 0.55), emission_strength=2.0),
        'tarp': material('Tarp', color=(0.22, 0.22, 0.15), rough=1.0),
        'sack': material('Sandbag', color=(0.43, 0.36, 0.25), rough=1.0),
        'card': material('Cardboard', color=(0.42, 0.32, 0.2), rough=1.0),
        'bakelite': material('Bakelite', color=(0.02, 0.018, 0.016), rough=0.25),
        'enamel': material('EnamelGreen', color=(0.06, 0.16, 0.1), rough=0.3, metal=0.1),
        'cork': material('Cork', texture_set('cork', tex.cork(512), tex_dir)),
        'blanket': material('ArmyBlanket', color=(0.2, 0.22, 0.16), rough=1.0),
        'linen': material('Linen', color=(0.72, 0.69, 0.6), rough=1.0),
        'ember': material('StoveEmber', color=(0.2, 0.05, 0.0), emission=(1.0, 0.35, 0.08), emission_strength=1.5),
        'safelight': material('Safelight', color=(0.2, 0.0, 0.0), emission=(1.0, 0.08, 0.02), emission_strength=0.9),
        'pwood': material('PolishedWood', texture_set('pwood', tex.polished_wood(512), tex_dir)),
        'feather': material('PigeonGrey', color=(0.38, 0.38, 0.4), rough=0.9),
        'mirror': material('Mirror', color=(0.9, 0.9, 0.9), rough=0.03, metal=1.0),
        'col': material('Collision', color=(0.0, 1.0, 0.3)),
    }
    return M


def uv(ob, t=1.0):
    world_uv(ob, t, t, t)
    return ob


def walls(prefix, w, d, h, t, mat, openings, tile=1.0):
    """Four walls of a w x d box (centred on the origin, outer faces at +-w/2, +-d/2).
    openings: (side, a0, a1, y0, y1) with side in 's','n','e','w'; a runs along x (s/n) or z (e/w)."""
    hw, hd = w / 2, d / 2
    sides = {
        's': tbox(f'{prefix}_s', -hw, hw, 0, h, hd - t, hd, mat),
        'n': tbox(f'{prefix}_n', -hw, hw, 0, h, -hd, -hd + t, mat),
        'e': tbox(f'{prefix}_e', hw - t, hw, 0, h, -hd + t, hd - t, mat),
        'w': tbox(f'{prefix}_w', -hw, -hw + t, 0, h, -hd + t, hd - t, mat),
    }
    for side, ob in sides.items():
        cuts = []
        for (s, a0, a1, y0, y1) in openings:
            if s != side:
                continue
            if side in 'sn':
                z = hd - t / 2 if side == 's' else -hd + t / 2
                cuts.append(tbox('cut', a0, a1, y0, y1, z - 1, z + 1, None, 'Cutters'))
            else:
                x = hw - t / 2 if side == 'e' else -hw + t / 2
                cuts.append(tbox('cut', x - 1, x + 1, y0, y1, a0, a1, None, 'Cutters'))
        if cuts:
            apply_boolean(ob, cuts)
        world_uv(ob, tile * 2 if mat.name == 'WallMetal' else tile, 8.0 if mat.name == 'WallMetal' else tile, tile)
    return list(sides.values())


def wall_colliders(prefix, w, d, t, doors, C):
    """Collision boxes for the four walls, split around doors. doors: (side, a0, a1, name)."""
    hw, hd = w / 2, d / 2
    spans = {'s': (-hw, hw), 'n': (-hw, hw), 'e': (-hd, hd), 'w': (-hd, hd)}
    for side, (lo, hi) in spans.items():
        gaps = sorted([(a0, a1, n) for (s, a0, a1, n) in doors if s == side])
        cur = lo
        k = 0
        for a0, a1, n in gaps + [(hi, hi, None)]:
            if a0 - cur > 0.02:
                if side in 'sn':
                    z0, z1 = (hd - t, hd) if side == 's' else (-hd, -hd + t)
                    col_box(f'COL_{prefix}_{side}{k}', cur, a0, z0, z1, mat=C)
                else:
                    x0, x1 = (hw - t, hw) if side == 'e' else (-hw, -hw + t)
                    col_box(f'COL_{prefix}_{side}{k}', x0, x1, cur, a0, mat=C)
                k += 1
            if n:
                if side in 'sn':
                    z0, z1 = (hd - t, hd) if side == 's' else (-hd, -hd + t)
                    col_box(n, a0, a1, z0, z1, mat=C)
                else:
                    x0, x1 = (hw - t, hw) if side == 'e' else (-hw, -hw + t)
                    col_box(n, x0, x1, a0, a1, mat=C)
            cur = max(cur, a1)


def gable_roof(prefix, w, d, h, rise, over, mat, gable_mat, t=0.12):
    """Ridge along x. Returns slabs + the two gable triangles."""
    parts = []
    hd = d / 2 + over
    y_eave = h - over * rise / (d / 2)
    y_ridge = h + rise
    L = math.hypot(hd, y_ridge - y_eave)
    for s in (-1, 1):
        n = (0, hd, s * (y_ridge - y_eave))
        nl = math.hypot(*n)
        n = (0, n[1] / nl, n[2] / nl)
        ym = (y_eave + y_ridge) / 2
        parts.append(tbeam(f'{prefix}_roof_{s}', (-w / 2 - over, ym + n[1] * t / 2, s * hd / 2 + n[2] * t / 2),
                           (w / 2 + over, ym + n[1] * t / 2, s * hd / 2 + n[2] * t / 2), L, t, mat, up=n, tile=2.0))
    for x0, x1 in ((-w / 2, -w / 2 + 0.12), (w / 2 - 0.12, w / 2)):
        parts.append(tri_prism(f'{prefix}_gable_{x0:.1f}', x0, x1, d, h, rise, gable_mat))
    return parts


def tri_prism(name, x0, x1, d, h, rise, mat):
    bm = bmesh.new()
    pts = [(-d / 2, h), (d / 2, h), (0, h + rise)]
    a = [bm.verts.new(T((x0, y, z))) for z, y in pts]
    b = [bm.verts.new(T((x1, y, z))) for z, y in pts]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_object(name, bm, mat, 'Props')
    world_uv(ob, 1, 1, 1)
    return ob


def shed_roof(prefix, w, d, h_front, h_back, over, mat, t=0.1):
    """Single slope: high at the back (-z), low at the front (+z)."""
    hd = d / 2 + over
    k = (h_back - h_front) / d
    yb, yf = h_back + over * k, h_front - over * k
    L = math.hypot(2 * hd, yb - yf)
    n = (0, 2 * hd, yb - yf)
    nl = math.hypot(*n)
    n = (0, n[1] / nl, n[2] / nl)
    ym = (yb + yf) / 2 + t / 2
    return tbeam(f'{prefix}_roof', (-w / 2 - over, ym, 0), (w / 2 + over, ym, 0), L, t, mat, up=n, tile=2.0)


def door_leaf(name, hinge, width, height, mat, trim, brass, along='x', mirror=False, thick=0.05):
    """Planked hinged door, origin = hinge. Built along +x (or -x if mirror), optionally turned to run along z."""
    x0, x1, z0, z1 = 0.01, width - 0.01, -thick / 2, thick / 2
    parts = [uv(tbox(f'{name}_boards', x0, x1, 0.02, height, z0, z1, mat, 'Props'))]
    for y in (0.25, height - 0.25):
        for s in (-1, 1):
            zz = s * (thick / 2 + 0.0125)
            parts.append(uv(tbox(f'{name}_ledge_{y:.1f}_{s}', x0 + 0.05, x1 - 0.05, y - 0.07, y + 0.07, zz - 0.0125, zz + 0.0125, trim, 'Props')))
    parts.append(tbeam(f'{name}_brace', (x0 + 0.1, 0.32, z1 + 0.012), (x1 - 0.1, height - 0.32, z1 + 0.012), 0.12, 0.025, trim, up=(0, 0, 1)))
    for s in (-1, 1):
        parts.append(tcyl(f'{name}_knob_{s}', (x1 - 0.09, 1.0, s * (thick / 2 + 0.025)), 0.028, 0.05, 'z', brass, 12))
    ob = join(name, parts, 'Props')
    if mirror:
        ob.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
    if along == 'z':
        ob.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    ob.location = T(hinge)
    return ob


def window(prefix, side, a, w, y0, y1, bw, bd, t, M):
    """Frame + mullions + dusty glass in an opening (side s/n/e/w at offset a along the wall)."""
    hw, hd = bw / 2, bd / 2
    c = {'s': hd - t / 2, 'n': -hd + t / 2, 'e': hw - t / 2, 'w': -hw + t / 2}[side]

    def P(u, y, dd=0.0):
        return (u, y, c + dd) if side in 'sn' else (c + dd, y, u)
    up = (0, 0, 1) if side in 'sn' else (1, 0, 0)
    W = M['wood']
    parts = [tbeam(f'{prefix}_wb', P(a - w / 2, y0 + 0.03), P(a + w / 2, y0 + 0.03), t + 0.04, 0.06, W),
             tbeam(f'{prefix}_wt', P(a - w / 2, y1 - 0.03), P(a + w / 2, y1 - 0.03), t + 0.04, 0.06, W),
             tbeam(f'{prefix}_wl', P(a - w / 2 + 0.03, y0), P(a - w / 2 + 0.03, y1), 0.06, t + 0.04, W, up=up),
             tbeam(f'{prefix}_wr', P(a + w / 2 - 0.03, y0), P(a + w / 2 - 0.03, y1), 0.06, t + 0.04, W, up=up),
             tbeam(f'{prefix}_wm', P(a, y0), P(a, y1), 0.04, 0.05, W, up=up),
             tbeam(f'{prefix}_wh', P(a - w / 2, (y0 + y1) / 2), P(a + w / 2, (y0 + y1) / 2), 0.04, 0.05, W)]
    q = [P(a - w / 2, y0), P(a + w / 2, y0), P(a + w / 2, y1), P(a - w / 2, y1)]
    parts.append(tquad(f'{prefix}_glass', q, M['glass']))
    return parts


def hanging_bulb(name, x, y_top, z, M, drop=0.6):
    return [tcyl(f'{name}_cord', (x, y_top - drop / 2, z), 0.006, drop, 'y', M['iron'], 6),
            tcyl(f'{name}_shade', (x, y_top - drop - 0.05, z), 0.16, 0.1, 'y', M['enamel'], 14, r2=0.04, cap=False),
            tcyl(f'{name}_bulb', (x, y_top - drop - 0.12, z), 0.035, 0.07, 'y', M['bulb'], 10)]
