"""
THE MARIGOLD SILENCE: hangar shell (location B) and the rooms attached to it.
40 m x 25 m floor, 9 m walls, arched ("bowstring") timber trusses up to 13.5 m.

Run (from the project folder):
  /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python blender/build_hangar_shell.py

Outputs: public/models/hangar_shell.glb, blender/hangar_shell.blend, blender/textures/*.png
All coordinates below are GAME coordinates (x east, y up, z south); see bhelpers.T().

Naming contract with the game:
  COL_*            invisible collision boxes (COL_Door_* switch off while that door is open)
  Door_*           doors; each object's origin is its hinge
  SlidingDoor_*    the four leaves of the main door
  StormGlass       window/skylight glass (lightning drives it)
  StormLeak        the storm seen through gaps and open outside doors
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
import pbr_textures as tex  # noqa: E402
from bhelpers import (T, apply_boolean, col_box, coll, export_glb, join, material, new_object, parent,  # noqa: E402
                      reset_scene, save_image, tbeam, tbox, tcyl, texture_set, tquad, ttext, ttorus, world_uv)

PROJECT = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, 'textures')
OUT_GLB = os.path.join(PROJECT, 'public', 'models', 'hangar_shell.glb')
OUT_BLEND = os.path.join(HERE, 'hangar_shell.blend')

HX, HZ, TH = 20.0, 12.5, 0.3           # interior half width / half depth, wall thickness
WALL_H, CROWN = 9.0, 13.5               # eaves and roof crown height
R = (HX ** 2 + (CROWN - WALL_H) ** 2) / (2 * (CROWN - WALL_H))
CY = CROWN - R                          # centre of the roof arc (below the floor)
TRUSS_Z = [-10, -5, 0, 5, 10]
WIN_Z = [-7.5, -2.5, 2.5, 7.5]          # clerestory windows (east and west walls)
WIN_W, WIN_Y0, WIN_Y1 = 2.8, 6.4, 7.8
GABLE_X = [-6, 0, 6]                    # windows high in the north and south gables
GW, GY0, GY1 = 2.4, 9.6, 11.0
MAIN_X, MAIN_H = 12.0, 7.5              # main door opening: x -12..12, 7.5 m high
WICKET = (-2.4, -1.5, 0.15, 2.2)        # small door in leaf 2 (x0, x1, y0, y1)
SIDE_W = (1.9, 3.1)                     # west side door (z range)
SIDE_E = (1.9, 3.1)                     # east side door (z range)
BACK = (1.2, 2.4)                       # back door in the north wall (x range)

OFFICE = dict(x0=13.0, x1=20.0, z0=-12.5, z1=-6.5, h=3.2, door=(15.0, 16.0), window=(17.2, 18.8))


def roof_y(x):
    return CY + math.sqrt(max(R * R - x * x, 0.0))


def cut(name, x0, x1, y0, y1, z0, z1):
    return tbox(name, x0, x1, y0, y1, z0, z1, None, 'Cutters')


def gable(name, z0, z1, mat):
    """Arched end wall above the eaves, between z0 and z1."""
    bm = bmesh.new()
    xs = [-HX - TH + i * (2 * (HX + TH)) / 40 for i in range(41)]
    pts = [(x, roof_y(min(abs(x), HX)) + 0.25) for x in xs]
    pts = [(xs[0], WALL_H)] + pts + [(xs[-1], WALL_H)]
    a = [bm.verts.new(T((x, y, z0))) for x, y in pts]
    b = [bm.verts.new(T((x, y, z1))) for x, y in pts]
    bm.faces.new(a)
    bm.faces.new(b[::-1])
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_object(name, bm, mat, 'Shell')


def roof(mat):
    """Curved corrugated roof as a closed solid (so skylights can be cut with booleans)."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    n = 48
    xs = [-HX - 0.6 + i * (2 * HX + 1.2) / n for i in range(n + 1)]
    zf, zb = -HZ - 0.6, HZ + 0.6
    rows = []
    for x in xs:
        y = roof_y(min(abs(x), HX)) - (0.0 if abs(x) <= HX else (abs(x) - HX) * 0.45)
        rows.append([bm.verts.new(T((x, y + dy, z))) for dy in (0, 0.12) for z in (zf, zb)])
    # rows[i] = [in_front, in_back, out_front, out_back]
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        bm.faces.new((a[0], a[1], b[1], b[0]))       # inside (visible from below)
        bm.faces.new((a[2], b[2], b[3], a[3]))       # outside
        bm.faces.new((a[0], b[0], b[2], a[2]))       # front edge
        bm.faces.new((a[1], a[3], b[3], b[1]))       # back edge
    for r in (rows[0], rows[-1]):
        bm.faces.new((r[0], r[2], r[3], r[1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for l in f.loops:
            c = l.vert.co  # Blender coords: x, y = -game z
            # use the calmer middle band of the wall texture, stretched along the curve
            l[uv].uv = (c.y / 2.0, 0.42 + 0.38 * (c.x + HX + 0.6) / (2 * HX + 1.2))
    return new_object('roof', bm, mat, 'Shell')


def door_leaf(name, hinge, width, height, M, style='planked', text=None, along='x', thick=0.05):
    """Hinged door. Built along +x from the hinge, optionally turned to run along +z. Origin = hinge."""
    x0, x1, z0, z1 = 0.01, width - 0.01, -thick / 2, thick / 2
    parts = []
    W = M['planks']
    if style == 'office':
        D = M['wood_dark']
        parts.append(tbox(f'{name}_low', x0, x1, 0.02, 1.15, z0, z1, D, 'Shell', uv=(1, 1, 1)))
        for xa, xb in ((x0, x0 + 0.12), (x1 - 0.12, x1)):
            parts.append(tbox(f'{name}_stile_{xa:.2f}', xa, xb, 1.15, height, z0, z1, D, 'Shell', uv=(1, 1, 1)))
        parts.append(tbox(f'{name}_top', x0 + 0.12, x1 - 0.12, height - 0.12, height, z0, z1, D, 'Shell', uv=(1, 1, 1)))
        parts.append(tbox(f'{name}_pane', x0 + 0.12, x1 - 0.12, 1.15, height - 0.12, -0.008, 0.008, M['frosted'], 'Shell'))
        if text:
            parts.append(ttext(f'{name}_text1', text[0], 0.085, M['gold'], ((x0 + x1) / 2, 1.72, 0.012), 'z+', 'Shell'))
            parts.append(ttext(f'{name}_text2', text[1], 0.05, M['gold'], ((x0 + x1) / 2, 1.6, 0.012), 'z+', 'Shell'))
    else:
        parts.append(tbox(f'{name}_boards', x0, x1, 0.02, height, z0, z1, W, 'Shell', uv=(1, 1, 1)))
        for y in (0.25, height - 0.25):
            for s in (-1, 1):
                zz = s * (thick / 2 + 0.0125)
                parts.append(tbox(f'{name}_ledge_{y:.1f}_{s}', x0 + 0.05, x1 - 0.05, y - 0.07, y + 0.07, zz - 0.0125, zz + 0.0125, W, 'Shell', uv=(1, 1, 1)))
        parts.append(tbeam(f'{name}_brace', (x0 + 0.1, 0.32, z1 + 0.012), (x1 - 0.1, height - 0.32, z1 + 0.012), 0.12, 0.025, W, up=(0, 0, 1), collection='Shell'))
        if style == 'barred':
            for zz in (-thick / 2 - 0.06, thick / 2 + 0.06):
                parts.append(tbox(f'{name}_bar_{zz:.2f}', -0.1, width + 0.1, 1.05, 1.17, zz - 0.04, zz + 0.04, M['wood'], 'Shell', uv=(1, 1, 1)))
    for s in (-1, 1):
        parts.append(tcyl(f'{name}_knob_{s}', (x1 - 0.09, 1.0, s * (thick / 2 + 0.025)), 0.028, 0.05, 'z', M['brass'], 12, 'Shell'))
    ob = join(name, parts)
    if along == 'z':  # turn the leaf to run along +z (game rotation about y by -90 deg)
        ob.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z'))
    ob.location = T(hinge)
    return ob


def build():
    reset_scene(['Shell', 'Collision', 'Cutters'])
    print('Generating textures...')
    td = TEX_DIR
    M = {
        'floor': material('Concrete', texture_set('concrete', tex.concrete_floor(1024), td)),
        'wall': material('WallMetal', texture_set('wallmetal', tex.corrugated_metal(512, 2048, seed=20, rust_amount=0.14), td)),
        'door': material('DoorMetal', texture_set('doormetal', tex.corrugated_metal(
            256, 1024, seed=50, paint=(0.30, 0.36, 0.31), paint_metal=0.15, ribs=13, rust_amount=-0.1, peel=0.35, bottom_dust=0.05), td)),
        'wood': material('WeatheredWood', texture_set('wood', tex.weathered_wood(512), td)),
        'planks': material('PlankWall', texture_set('planks', tex.planks(512, 80, 5, (1.05, 0.98, 0.9)), td)),
        'floorboards': material('FloorBoards', texture_set('floorboards', tex.planks(512, 85, 6, (0.8, 0.72, 0.62)), td)),
        'wood_dark': material('DarkVarnish', texture_set('darkwood', tex.polished_wood(512, 71, (0.20, 0.11, 0.06)), td)),
        'steel': material('DarkSteel', color=(0.075, 0.07, 0.065), rough=0.55, metal=0.85),
        'iron': material('Iron', color=(0.05, 0.045, 0.04), rough=0.7, metal=0.7),
        'brass': material('Brass', color=(0.55, 0.42, 0.18), rough=0.3, metal=0.9),
        'glass': material('StormGlass', color=(0.02, 0.02, 0.02), rough=0.3,
                          emission=save_image('glass_emission', tex.dusty_glass(256)['color'], False, td), emission_strength=1.0),
        'leak': material('StormLeak', color=(0.0, 0.0, 0.0), rough=1.0,
                         emission=save_image('storm_emission', tex.dusty_glass(256, seed=44)['color'], False, td), emission_strength=1.0),
        'sand': material('Sand', color=(0.42, 0.34, 0.24), rough=1.0),
        'office_glass': material('OfficeGlass', color=(0.55, 0.55, 0.5), rough=0.08, alpha=0.18),
        'frosted': material('FrostedGlass', color=(0.62, 0.56, 0.44), rough=0.5, alpha=0.75),
        'gold': material('GoldLeaf', color=(0.75, 0.55, 0.2), rough=0.3, metal=1.0),
        'blind': material('BlindSlat', color=(0.62, 0.55, 0.40), rough=0.8),
        'col': material('Collision', color=(0.0, 1.0, 0.3)),
    }
    W, S, I = M['wood'], M['steel'], M['iron']
    print('Building shell...')

    floor = tbox('Hangar_Floor', -HX - TH, HX + TH, -0.2, 0.0, -HZ - TH, HZ + TH, M['floor'], 'Shell')
    world_uv(floor)

    # ---- walls (with window and door openings) and arched gables
    west = tbox('wall_w', -HX - TH, -HX, 0, WALL_H, -HZ - TH, HZ + TH, M['wall'], 'Shell')
    east = tbox('wall_e', HX, HX + TH, 0, WALL_H, -HZ - TH, HZ + TH, M['wall'], 'Shell')
    north = tbox('wall_n', -HX - TH, HX + TH, 0, WALL_H, -HZ - TH, -HZ, M['wall'], 'Shell')
    south = tbox('wall_s', -HX - TH, HX + TH, 0, WALL_H, HZ, HZ + TH, M['wall'], 'Shell')
    for sx, wall in ((-1, west), (1, east)):
        cuts = [cut(f'cw_{sx}_{z}', sx * HX - 1, sx * HX + 1, WIN_Y0, WIN_Y1, z - WIN_W / 2, z + WIN_W / 2) for z in WIN_Z]
        dz = SIDE_W if sx < 0 else SIDE_E
        cuts.append(cut(f'cside_{sx}', sx * HX - 1, sx * HX + 1, -1, 2.2, *dz))
        if sx > 0:
            cuts.append(cut('c_office_win', HX - 0.5, HX + 1, 1.2, 2.2, -10.1, -8.9))
        apply_boolean(wall, cuts)
    apply_boolean(north, [cut('cback', *BACK, -1, 2.2, -HZ - 1, -HZ + 1)])
    apply_boolean(south, [cut('cmain', -MAIN_X, MAIN_X, -1, MAIN_H, HZ - 1, HZ + 1)])
    gn = gable('gable_n', -HZ - TH, -HZ, M['wall'])
    gs = gable('gable_s', HZ, HZ + TH, M['wall'])
    for g, zc in ((gn, -HZ), (gs, HZ)):
        apply_boolean(g, [cut(f'cg_{zc}_{x}', x - GW / 2, x + GW / 2, GY0, GY1, zc - 1, zc + 1) for x in GABLE_X])
    walls = [west, east, north, south, gn, gs]
    for w in walls[:4]:
        world_uv(w, 2.0, WALL_H, 4.0)
    for g in (gn, gs):  # gables sit above 9 m: map them to the middle of the texture, not the rusty foot
        world_uv(g, 2.0, 22.0, 4.0)
    join('Hangar_Walls', walls)

    # ---- arched roof with skylight strips
    r = roof(M['wall'])
    sky = [(-9.0, -6.0, -7.5), (-9.0, -6.0, 2.5), (6.0, 9.0, -2.5), (6.0, 9.0, 7.5)]
    apply_boolean(r, [cut(f'csky_{i}', x0, x1, 8, 16, z - 1.4, z + 1.4) for i, (x0, x1, z) in enumerate(sky)])
    join('Hangar_Roof', [r])

    # ---- timber frame: posts, girts, bowstring trusses, purlins
    wood = []
    posts = []  # (x, z, size along x, size along z)
    for sx in (-1, 1):
        for z in TRUSS_Z + [-HZ + 0.15, HZ - 0.15]:
            posts.append((sx * (HX - 0.15), z, 0.3, 0.25))
    for x in (-11, -5, 5, 11):
        posts.append((x, -HZ + 0.15, 0.25, 0.3))
    for x in (-15, 15):
        posts.append((x, HZ - 0.15, 0.25, 0.3))
    for x in (-(MAIN_X + 0.2), MAIN_X + 0.2):
        posts.append((x, HZ - 0.17, 0.36, 0.34))
    for i, (x, z, dx, dz) in enumerate(posts):
        wood.append(tbeam(f'post_{i}', (x, 0, z), (x, WALL_H, z), dz, dx, W, up=(1, 0, 0), collection='Shell'))
    for y in (3.0, 6.2):
        for sx in (-1, 1):
            wood.append(tbeam(f'girt_{sx}_{y}', (sx * (HX - 0.05), y, -HZ), (sx * (HX - 0.05), y, HZ), 0.1, 0.16, W, collection='Shell'))
        wood.append(tbeam(f'girt_n_{y}', (-HX, y, -HZ + 0.05), (HX, y, -HZ + 0.05), 0.1, 0.16, W, collection='Shell'))
        for s in (-1, 1):
            wood.append(tbeam(f'girt_s_{s}_{y}', (s * HX, y, HZ - 0.05), (s * (MAIN_X + 0.38), y, HZ - 0.05), 0.1, 0.16, W, collection='Shell'))
    wood.append(tbeam('main_header', (-MAIN_X - 0.4, MAIN_H + 0.22, HZ - 0.17), (MAIN_X + 0.4, MAIN_H + 0.22, HZ - 0.17), 0.36, 0.44, W, collection='Shell'))

    n_pan = 16
    px = [-HX + i * (2 * HX / n_pan) for i in range(n_pan + 1)]
    ptop = [max(roof_y(x) - 0.2, WALL_H) for x in px]
    for tz in TRUSS_Z:
        wood.append(tbeam(f'chord_b_{tz}', (-HX, WALL_H, tz), (HX, WALL_H, tz), 0.22, 0.32, W, collection='Shell'))
        for k in range(n_pan):
            wood.append(tbeam(f'chord_t_{tz}_{k}', (px[k], ptop[k], tz), (px[k + 1], ptop[k + 1], tz), 0.22, 0.3, W, collection='Shell'))
            if ptop[k] > WALL_H + 0.3 or ptop[k + 1] > WALL_H + 0.3:
                wood.append(tbeam(f'lat_a_{tz}_{k}', (px[k], WALL_H + 0.1, tz), (px[k + 1], ptop[k + 1] - 0.1, tz), 0.09, 0.09, W, collection='Shell'))
                wood.append(tbeam(f'lat_b_{tz}_{k}', (px[k + 1], WALL_H + 0.1, tz), (px[k], ptop[k] - 0.1, tz), 0.09, 0.09, W, collection='Shell'))
        for s in (-1, 1):
            wood.append(tbeam(f'knee_{tz}_{s}', (s * (HX - 0.3), 7.0, tz), (s * (HX - 2.6), WALL_H - 0.12, tz), 0.15, 0.15, W, collection='Shell'))
    for x in (-17.5, -12.5, -7.5, -2.5, 2.5, 7.5, 12.5, 17.5, 0.0):
        y = roof_y(x) - 0.1
        wood.append(tbeam(f'purlin_{x}', (x, y, -HZ - 0.3), (x, y, HZ + 0.3), 0.12, 0.16, W, collection='Shell'))

    # ---- windows: frames, mullions, glass
    glass = []

    def window(key, center, axis, w, y0, y1, depth_c, glass_c, facing):
        """axis: the wall's horizontal direction ('z' for east/west walls, 'x' for north/south)."""
        a0, a1 = center - w / 2, center + w / 2

        def P(a, y, d):
            return (d, y, a) if axis == 'z' else (a, y, d)
        up_side = (1, 0, 0) if axis == 'z' else (0, 0, 1)
        wood.append(tbeam(f'wf_b_{key}', P(a0, y0 + 0.04, depth_c), P(a1, y0 + 0.04, depth_c), TH, 0.08, W, collection='Shell'))
        wood.append(tbeam(f'wf_t_{key}', P(a0, y1 - 0.04, depth_c), P(a1, y1 - 0.04, depth_c), TH, 0.08, W, collection='Shell'))
        for j in range(5):
            a = a0 + 0.04 + j * (w - 0.08) / 4
            wood.append(tbeam(f'wf_v_{key}_{j}', P(a, y0, depth_c), P(a, y1, depth_c), 0.06 if 0 < j < 4 else 0.08, 0.1, W, up=up_side, collection='Shell'))
        wood.append(tbeam(f'wf_h_{key}', P(a0, (y0 + y1) / 2, depth_c), P(a1, (y0 + y1) / 2, depth_c), 0.06, 0.05, W, collection='Shell'))
        pts = [P(a0, y0, glass_c), P(a1, y0, glass_c), P(a1, y1, glass_c), P(a0, y1, glass_c)]
        glass.append(tquad(f'glass_{key}', pts if facing > 0 else [pts[1], pts[0], pts[3], pts[2]], M['glass'], collection='Shell'))

    for sx in (-1, 1):
        for z in WIN_Z:
            window(f'{sx}_{z}', z, 'z', WIN_W, WIN_Y0, WIN_Y1, sx * (HX + TH / 2), sx * (HX + 0.24), -sx)
            wood.append(tbeam(f'sill_{sx}_{z}', (sx * (HX - 0.12), WIN_Y0 - 0.03, z - WIN_W / 2 - 0.1), (sx * (HX - 0.12), WIN_Y0 - 0.03, z + WIN_W / 2 + 0.1), 0.26, 0.06, W, collection='Shell'))
    for sz in (-1, 1):
        for x in GABLE_X:
            window(f'g_{sz}_{x}', x, 'x', GW, GY0, GY1, sz * (HZ + TH / 2), sz * (HZ + 0.24), sz)
    for i, (x0, x1, z) in enumerate(sky):
        n = 4
        for k in range(n):
            xa, xb = x0 + (x1 - x0) * k / n, x0 + (x1 - x0) * (k + 1) / n
            ya, yb = roof_y(xa) + 0.06, roof_y(xb) + 0.06
            glass.append(tquad(f'sky_{i}_{k}', [(xa, ya, z - 1.4), (xb, yb, z - 1.4), (xb, yb, z + 1.4), (xa, ya, z + 1.4)], M['glass'], collection='Shell'))

    # office barred window (east wall)
    for z in (-9.95, -9.7, -9.45, -9.2, -8.95):
        wood.append(tbeam(f'bar_{z}', (HX + 0.05, 1.2, z), (HX + 0.05, 2.2, z), 0.025, 0.025, I, up=(1, 0, 0), collection='Shell'))
    wood.append(tbeam('ow_sill', (HX - 0.05, 1.17, -10.2), (HX - 0.05, 1.17, -8.8), 0.25, 0.06, W, collection='Shell'))
    glass.append(tquad('glass_office_east', [(HX + 0.2, 1.2, -10.1), (HX + 0.2, 1.2, -8.9), (HX + 0.2, 2.2, -8.9), (HX + 0.2, 2.2, -10.1)], M['glass'], collection='Shell'))
    # (the survey office and darkroom moved to the Operations building: addendum v2, section B)

    # door casings for the side and back doors (both faces)
    for key, a0, a1, axis, c in (('dw', *SIDE_W, 'z', -HX - TH / 2), ('de', *SIDE_E, 'z', HX + TH / 2), ('db', *BACK, 'x', -HZ - TH / 2)):
        for side in (-1, 1):
            d = c + side * (TH / 2 + 0.015)

            def P(a, y, d=d, axis=axis):
                return (d, y, a) if axis == 'z' else (a, y, d)
            upv = (1, 0, 0) if axis == 'z' else (0, 0, 1)
            wood.append(tbeam(f'{key}_l_{side}', P(a0 - 0.05, 0), P(a0 - 0.05, 2.3), 0.1, 0.03, W, up=upv, collection='Shell'))
            wood.append(tbeam(f'{key}_r_{side}', P(a1 + 0.05, 0), P(a1 + 0.05, 2.3), 0.1, 0.03, W, up=upv, collection='Shell'))
            wood.append(tbeam(f'{key}_h_{side}', P(a0 - 0.1, 2.25), P(a1 + 0.1, 2.25), 0.1, 0.03, W, up=(0, 1, 0) if axis == 'x' else (0, 1, 0), collection='Shell'))
    join('Hangar_Timber', wood)
    join('Hangar_WindowGlass', glass)

    # ---- the main sliding door: four leaves, chained, with a wicket door in leaf 2
    zf, zb = HZ - 0.55, HZ - 0.4        # inner / outer faces of the leaves
    zm = (zf + zb) / 2
    leaves = [(-MAIN_X - 0.35, -6.02), (-6.0, -0.01), (0.01, 6.0), (6.02, MAIN_X + 0.35)]
    wx0, wx1, wy0, wy1 = WICKET
    leaf_obs = {}
    for n, (x0, x1) in enumerate(leaves, start=1):
        parts = []
        panel = tbox(f'panel_{n}', x0, x1, 0.03, MAIN_H + 0.1, zb - 0.07, zb - 0.04, M['door'], 'Shell')
        if n == 2:
            apply_boolean(panel, [cut('cwicket', wx0, wx1, wy0, wy1, zf - 1, zb + 1)])
        world_uv(panel, 2.0, 8.0, 4.0)
        parts.append(panel)
        top = MAIN_H + 0.1
        parts.append(tbeam(f'f_top_{n}', (x0, top - 0.05, zm), (x1, top - 0.05, zm), 0.15, 0.1, S, collection='Shell'))
        parts.append(tbeam(f'f_bot_{n}', (x0, 0.08, zm), (x1, 0.08, zm), 0.15, 0.1, S, collection='Shell'))
        for y in (2.5, 5.0):
            parts.append(tbeam(f'f_rail_{n}_{y}', (x0, y, zm), (x1, y, zm), 0.12, 0.08, S, collection='Shell'))
        for x in (x0 + 0.05, (x0 + x1) / 2, x1 - 0.05):
            parts.append(tbeam(f'f_stile_{n}_{x:.2f}', (x, 0.03, zm), (x, top, zm), 0.12, 0.1, S, up=(1, 0, 0), collection='Shell'))
        parts.append(tbeam(f'f_brace_{n}', (x0 + 0.1, 0.15, zm - 0.02), ((x0 + x1) / 2, 2.45, zm - 0.02), 0.08, 0.06, S, collection='Shell'))
        for xr in (x0 + 0.8, x1 - 0.8):
            parts.append(tcyl(f'roller_{n}_{xr:.1f}', (xr, top + 0.12, zm), 0.09, 0.06, 'z', S, 14, 'Shell'))
        if n == 2:
            for xx in (wx0 - 0.04, wx1 + 0.04):
                parts.append(tbeam(f'wick_jamb_{xx:.2f}', (xx, 0.03, zm), (xx, wy1 + 0.05, zm), 0.12, 0.08, S, up=(1, 0, 0), collection='Shell'))
            parts.append(tbeam('wick_head', (wx0 - 0.08, wy1 + 0.04, zm), (wx1 + 0.08, wy1 + 0.04, zm), 0.12, 0.08, S, collection='Shell'))
        leaf_obs[n] = join(f'SlidingDoor_{n}', parts)

    wparts = [tbox('wk_panel', 0.01, (wx1 - wx0) - 0.01, wy0 + 0.01, wy1 - 0.01, -0.025, 0.025, M['door'], 'Shell')]
    world_uv(wparts[0], 2.0, 8.0, 4.0)
    for xx in (0.04, (wx1 - wx0) - 0.04):
        wparts.append(tbeam(f'wk_stile_{xx:.2f}', (xx, wy0 + 0.02, 0), (xx, wy1 - 0.02, 0), 0.1, 0.06, S, up=(1, 0, 0), collection='Shell'))
    for yy in (wy0 + 0.05, (wy0 + wy1) / 2, wy1 - 0.05):
        wparts.append(tbeam(f'wk_rail_{yy:.2f}', (0.02, yy, 0), ((wx1 - wx0) - 0.02, yy, 0), 0.1, 0.06, S, collection='Shell'))
    for s in (-1, 1):
        wparts.append(tcyl(f'wk_handle_{s}', ((wx1 - wx0) - 0.14, 1.05, s * 0.06), 0.022, 0.14, 'y', M['brass'], 10, 'Shell'))
    wk = join('Door_Wicket', wparts)
    wk.location = T((wx0, 0, zb - 0.055))
    parent(wk, leaf_obs[2])  # the small door travels with its leaf when the leaf slides open

    track = [tbeam('track', (-HX, MAIN_H + 0.42, zm), (HX, MAIN_H + 0.42, zm), 0.18, 0.16, S, collection='Shell')]
    for x in (-18, -12, -6, 0, 6, 12, 18):
        track.append(tbeam(f'hanger_{x}', (x, MAIN_H + 0.42, HZ - 0.1), (x, MAIN_H + 0.42, zm), 0.08, 0.06, S, collection='Shell'))
    track.append(tbeam('guide', (-HX, 0.02, zf - 0.1), (HX, 0.02, zf - 0.1), 0.06, 0.04, S, collection='Shell'))
    # (the storm chain and padlock across the seam come back with the story locks later)
    join('Hangar_DoorTrack', track)

    # ---- side doors and back door (inward opening). West opens onto the storm; east and back are locked.
    door_leaf('Door_SideWest', (-HX - TH / 2, 0, SIDE_W[0]), SIDE_W[1] - SIDE_W[0], 2.18, M, along='z')
    door_leaf('Door_SideEast', (HX + TH / 2, 0, SIDE_E[0]), SIDE_E[1] - SIDE_E[0], 2.18, M, along='z')
    door_leaf('Door_Back', (BACK[0], 0, -HZ - TH / 2), BACK[1] - BACK[0], 2.18, M, style='barred')

    # (no fake storm boxes any more: the open world is outside)

    rooms(M)
    collisions(M, posts, zf)
    for c in list(coll('Cutters').objects):
        bpy.data.objects.remove(c)
    bpy.data.collections.remove(coll('Cutters'))


def rooms(M):
    P, FB, D = M['planks'], M['floorboards'], M['wood_dark']
    t = 0.14
    # ---- Pryce's office (north-east corner)
    o = OFFICE
    zf = o['z1']
    dx0, dx1 = o['door']
    wx0, wx1 = o['window']
    front = tbox('office_front', o['x0'] - t / 2, o['x1'], 0, o['h'], zf - t / 2, zf + t / 2, P, 'Shell')
    apply_boolean(front, [cut('cut_od', dx0, dx1, -1, 2.1, zf - 1, zf + 1), cut('cut_ow', wx0, wx1, 1.15, 2.2, zf - 1, zf + 1)])
    west = tbox('office_west', o['x0'] - t / 2, o['x0'] + t / 2, 0, o['h'], o['z0'], zf + t / 2, P, 'Shell')
    ceil = tbox('office_ceiling', o['x0'] - t / 2, o['x1'], o['h'], o['h'] + 0.14, o['z0'], zf + t / 2, P, 'Shell')
    flo = tbox('office_floor', o['x0'] + t / 2, o['x1'], 0, 0.015, o['z0'], zf - t / 2, FB, 'Shell')
    for ob in (front, west, ceil, flo):
        world_uv(ob, 1, 1, 1)
    trim = []
    for s in (-1, 1):
        zc = zf + s * (t / 2 + 0.015)
        trim.append(tbox(f'oc_l_{s}', dx0 - 0.1, dx0, 0, 2.22, zc - 0.015, zc + 0.015, D, 'Shell', uv=(1, 1, 1)))
        trim.append(tbox(f'oc_r_{s}', dx1, dx1 + 0.1, 0, 2.22, zc - 0.015, zc + 0.015, D, 'Shell', uv=(1, 1, 1)))
        trim.append(tbox(f'oc_h_{s}', dx0 - 0.1, dx1 + 0.1, 2.1, 2.22, zc - 0.015, zc + 0.015, D, 'Shell', uv=(1, 1, 1)))
        trim.append(tbox(f'ow_frame_{s}', wx0 - 0.08, wx1 + 0.08, 2.2, 2.28, zc - 0.015, zc + 0.015, D, 'Shell', uv=(1, 1, 1)))
        trim.append(tbox(f'base_{s}', o['x0'], o['x1'], 0, 0.12, zc - 0.012, zc + 0.012, D, 'Shell', uv=(1, 1, 1)))
    trim.append(tbox('ow_sill', wx0 - 0.1, wx1 + 0.1, 1.1, 1.15, zf - 0.14, zf + 0.14, D, 'Shell', uv=(1, 1, 1)))
    for i in range(16):
        y = 1.2 + i * 0.062
        trim.append(tbeam(f'slat_{i}', (wx0 + 0.02, y, zf - 0.12), (wx1 - 0.02, y, zf - 0.12), 0.045, 0.004, M['blind'], up=(0, 0.6, 0.8), collection='Shell'))
    glass = tquad('office_window_glass', [(wx0, 1.15, zf), (wx1, 1.15, zf), (wx1, 2.2, zf), (wx0, 2.2, zf)], M['office_glass'], collection='Shell')
    join('Office_Walls', [front, west, ceil, flo] + trim)
    glass.name = 'Office_WindowGlass'
    door_leaf('Door_Office', (dx0, 0, zf), dx1 - dx0, 2.08, M, style='office', text=('C. PRYCE', 'Private'))



def collisions(M, posts, zf):
    C = M['col']
    # north wall, split around the back door
    col_box('COL_Wall_N_1', -HX - TH, BACK[0], -HZ - TH, -HZ, mat=C)
    col_box('COL_Wall_N_2', BACK[1], HX + TH, -HZ - TH, -HZ, mat=C)
    col_box('COL_Door_Back', BACK[0], BACK[1], -HZ - TH, -HZ + 0.1, mat=C)
    # east wall, split around the east side door
    col_box('COL_Wall_E_1', HX, HX + TH, -HZ - TH, SIDE_E[0], mat=C)
    col_box('COL_Wall_E_2', HX, HX + TH, SIDE_E[1], HZ + TH, mat=C)
    col_box('COL_Door_SideEast', HX - 0.1, HX + TH, SIDE_E[0], SIDE_E[1], mat=C)
    # west wall, split around the side door (a real exit to the airfield)
    col_box('COL_Wall_W_1', -HX - TH, -HX, -HZ - TH, SIDE_W[0], mat=C)
    col_box('COL_Wall_W_2', -HX - TH, -HX, SIDE_W[1], HZ + TH, mat=C)
    col_box('COL_Door_SideWest', -HX - TH, -HX + 0.1, SIDE_W[0], SIDE_W[1], mat=C)
    col_box('COL_Wall_S_1', -HX - TH, -MAIN_X, HZ, HZ + TH, mat=C)
    col_box('COL_Wall_S_3', MAIN_X, HX + TH, HZ, HZ + TH, mat=C)
    # main door leaves, split around the wicket door (a real exit onto the apron)
    # outer leaves 1 and 4 never move; the middle leaves 2 and 3 slide open (the wicket rides on leaf 2)
    col_box('COL_MainDoor_1', -MAIN_X - 0.4, -6.0, zf - 0.1, HZ, mat=C)
    col_box('COL_Door_Main2a', -6.0, WICKET[0], zf - 0.1, HZ, mat=C)
    col_box('COL_Door_Wicket', WICKET[0], WICKET[1], zf - 0.05, zf + 0.2, mat=C)
    col_box('COL_Door_Main2b', WICKET[1], 0.0, zf - 0.1, HZ, mat=C)
    col_box('COL_Door_Main3', 0.0, 6.0, zf - 0.1, HZ, mat=C)
    col_box('COL_MainDoor_4', 6.0, MAIN_X + 0.4, zf - 0.1, HZ, mat=C)
    for i, (x, z, dx, dz) in enumerate(posts):
        col_box(f'COL_Post_{i}', x - dx / 2, x + dx / 2, z - dz / 2, z + dz / 2, mat=C)
    o = OFFICE
    dx0, dx1 = o['door']
    col_box('COL_Office_Front_L', o['x0'] - 0.1, dx0, o['z1'] - 0.1, o['z1'] + 0.1, mat=C)
    col_box('COL_Office_Front_R', dx1, o['x1'], o['z1'] - 0.1, o['z1'] + 0.1, mat=C)
    col_box('COL_Office_West', o['x0'] - 0.1, o['x0'] + 0.1, o['z0'], o['z1'] + 0.1, mat=C)
    col_box('COL_Door_Office', dx0, dx1, o['z1'] - 0.05, o['z1'] + 0.05, mat=C)


build()
size = export_glb(OUT_GLB)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f'EXPORTED {OUT_GLB} ({size:.2f} MB)')
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    if not ob.name.startswith('COL_'):
        print('OBJECT', ob.name, len(ob.data.polygons) if ob.type == 'MESH' else '')
print('COLLIDERS', sum(1 for o in bpy.data.objects if o.name.startswith('COL_')))
