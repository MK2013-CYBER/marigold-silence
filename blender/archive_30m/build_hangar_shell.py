"""
THE MARIGOLD SILENCE: hangar shell (location B) and the rooms attached to it.

Run (from the project folder):
  /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python blender/build_hangar_shell.py

Outputs:
  public/models/hangar_shell.glb   (Draco-compressed, JPEG textures)
  blender/hangar_shell.blend
  blender/textures/*.png

Contains: floor, corrugated walls, roof, timber frame, windows, sliding doors
(with a small wicket door), Pryce's office walls + door, the survey office and
darkroom (location H) + their doors, the storm outside, collision boxes.

Naming contract with the game:
  COL_*            invisible collision boxes (COL_Door_* switch off when that door is open)
  Door_*           doors; each object's origin is its hinge
  StormGlass       window/skylight glass (lightning drives it)
  StormLeak        the storm seen through the door gaps and the wicket door
"""
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
import pbr_textures as tex  # noqa: E402
from bhelpers import (T, apply_boolean, beam, box, col_box, coll, cylinder, export_glb, join,  # noqa: E402
                      material, new_object, quad, reset_scene, save_image, set_origin, tbeam, tbox,
                      tcyl, texture_set, torus, tquad, ttext, world_uv)

PROJECT = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, 'textures')
OUT_GLB = os.path.join(PROJECT, 'public', 'models', 'hangar_shell.glb')
OUT_BLEND = os.path.join(HERE, 'hangar_shell.blend')

# Hangar interior in Blender coords (x, y = -game z, z = up)
HX, HY = 15.0, 12.0
TH = 0.3
WALL_H, RIDGE = 8.0, 11.0
TRUSS_Y = [-10, -6, -2, 2, 6, 10]
WINDOW_Y = [-8, -4, 0, 4, 8]
WIN_W, WIN_Z0, WIN_Z1 = 2.4, 5.6, 6.9
DOOR_X, DOOR_H = 9.2, 6.9
ROOF_SLOPE = (RIDGE - WALL_H) / HX

# Rooms, in GAME coords (x, z on the floor plan; y up)
OFFICE = dict(x0=8.0, x1=15.0, z0=-12.0, z1=-6.0, h=3.2, door=(10.0, 11.0), window=(12.2, 13.8))
SURVEY = dict(x0=-15.0, x1=-9.9, z0=12.3, z1=16.3, h=3.0, door=(-13.0, -12.0), back_door=(-13.9, -12.9))
DARK = dict(x0=-15.0, x1=-11.6, z0=16.45, z1=19.0, h=2.8)
WICKET = (-3.05, -2.15, 0.15, 2.2)   # game x0, x1, y0, y1 in the left sliding door


def roof_z(x):
    return RIDGE - ROOF_SLOPE * abs(x)


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

    print('Building shell...')
    floor = box('Hangar_Floor', -HX - TH, HX + TH, -HY - TH, HY + TH, -0.2, 0.0, M['floor'])
    world_uv(floor)

    # ---- hangar walls with openings
    cut = lambda n, *a: box(n, *a, None, 'Cutters')  # noqa: E731
    win_cuts = {sx: [cut(f'cut_w_{sx}_{y}', sx * HX - 1, sx * HX + 1, y - WIN_W / 2, y + WIN_W / 2, WIN_Z0, WIN_Z1) for y in WINDOW_Y] for sx in (-1, 1)}
    office_win = cut('cut_office_win', HX - 0.5, HX + 1, 8.4, 9.6, 1.2, 2.2)   # game z -9.6..-8.4
    door_cut = cut('cut_door', -DOOR_X, DOOR_X, -HY - 1, -HY + 1, -1, DOOR_H)
    survey_cut = cut('cut_survey', SURVEY['door'][0], SURVEY['door'][1], -HY - 1, -HY + 1, -1, 2.1)

    west = box('wall_w', -HX - TH, -HX, -HY - TH, HY + TH, 0, WALL_H, M['wall'])
    east = box('wall_e', HX, HX + TH, -HY - TH, HY + TH, 0, WALL_H, M['wall'])
    apply_boolean(west, win_cuts[-1])
    apply_boolean(east, win_cuts[1] + [office_win])
    north = box('wall_n', -HX - TH, HX + TH, HY, HY + TH, 0, WALL_H, M['wall'])
    south = box('wall_s', -HX - TH, HX + TH, -HY - TH, -HY, 0, WALL_H, M['wall'])
    apply_boolean(south, [door_cut, survey_cut])
    walls = [west, east, north, south]
    for name, y0, y1 in (('gable_n', HY, HY + TH), ('gable_s', -HY - TH, -HY)):
        bm = bmesh.new()
        pts = [(-HX - TH, WALL_H), (HX + TH, WALL_H), (0, RIDGE + 0.2)]
        a = [bm.verts.new((x, y0, z)) for x, z in pts]
        b = [bm.verts.new((x, y1, z)) for x, z in pts]
        bm.faces.new(a[::-1]); bm.faces.new(b)
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        walls.append(new_object(name, bm, M['wall'], 'Shell'))
    for w in walls:
        world_uv(w)
    join('Hangar_Walls', walls)

    # ---- roof with skylights
    roofs = []
    for s in (-1, 1):
        bm = bmesh.new()
        uv = bm.loops.layers.uv.verify()
        xe, ye = s * (HX + 0.6), HY + 0.6
        inner = [(xe, -ye, roof_z(xe)), (0, -ye, RIDGE), (0, ye, RIDGE), (xe, ye, roof_z(xe))]
        lo = [bm.verts.new(p) for p in inner]
        hi = [bm.verts.new((p[0], p[1], p[2] + 0.12)) for p in inner]
        bm.faces.new(lo); bm.faces.new(hi[::-1])
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((lo[i], hi[i], hi[j], lo[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            for l in f.loops:
                l[uv].uv = (l.vert.co.y / 2.0, abs(l.vert.co.x) / 8.0)
        r = new_object(f'roof_{s}', bm, M['wall'], 'Shell')
        x0, x1 = (4.4, 6.9) if s > 0 else (-6.9, -4.4)
        apply_boolean(r, [cut(f'cut_sky_{s}_{y}', x0, x1, y - 1.2, y + 1.2, 8.5, 12.5) for y in (-8, 0, 8)])
        roofs.append(r)
    join('Hangar_Roof', roofs)

    # ---- timber frame
    W = M['wood']
    I = M['iron']
    wood = []
    post_spots = []
    for sx in (-1, 1):
        for y in TRUSS_Y + [-HY + 0.15, HY - 0.15]:
            post_spots.append((sx * (HX - 0.15), y, 0.3, 0.25))
    for x in (-7.5, 7.5):
        post_spots.append((x, HY - 0.15, 0.25, 0.3))
    for x in (-(DOOR_X + 0.17), DOOR_X + 0.17):
        post_spots.append((x, -HY + 0.17, 0.34, 0.34))
    for i, (x, y, dx, dy) in enumerate(post_spots):
        wood.append(beam(f'post_{i}', (x, y, 0), (x, y, WALL_H), dy, dx, W, up=(1, 0, 0)))
    for sx in (-1, 1):
        for z in (2.7, 5.45):
            wood.append(beam(f'girt_{sx}_{z}', (sx * (HX - 0.05), -HY, z), (sx * (HX - 0.05), HY, z), 0.1, 0.16, W))
    for z in (2.7, 5.45):
        wood.append(beam(f'girt_n_{z}', (-HX, HY - 0.05, z), (HX, HY - 0.05, z), 0.1, 0.16, W))
        for s in (-1, 1):
            wood.append(beam(f'girt_s_{s}_{z}', (s * HX, -HY + 0.05, z), (s * (DOOR_X + 0.34), -HY + 0.05, z), 0.1, 0.16, W))
    wood.append(beam('door_header', (-DOOR_X - 0.4, -HY + 0.17, DOOR_H + 0.18), (DOOR_X + 0.4, -HY + 0.17, DOOR_H + 0.18), 0.34, 0.36, W))
    for ty in TRUSS_Y:
        wood.append(beam(f'tie_{ty}', (-HX, ty, WALL_H), (HX, ty, WALL_H), 0.2, 0.3, W))
        for s in (-1, 1):
            wood.append(beam(f'rafter_{ty}_{s}', (s * HX, ty, WALL_H + 0.15), (0, ty, RIDGE - 0.17), 0.2, 0.3, W))
            wood.append(beam(f'queen_{ty}_{s}', (s * HX / 2, ty, WALL_H + 0.15), (s * HX / 2, ty, roof_z(HX / 2) - 0.3), 0.16, 0.16, W, up=(1, 0, 0)))
            wood.append(beam(f'diag_a_{ty}_{s}', (s * HX / 2, ty, WALL_H + 0.15), (s * HX / 4, ty, roof_z(HX / 4) - 0.3), 0.14, 0.14, W))
            wood.append(beam(f'diag_b_{ty}_{s}', (s * HX / 2, ty, WALL_H + 0.15), (s * HX * 3 / 4, ty, roof_z(HX * 3 / 4) - 0.3), 0.14, 0.14, W))
            wood.append(beam(f'knee_{ty}_{s}', (s * (HX - 0.3), ty, 6.3), (s * (HX - 2.3), ty, WALL_H - 0.15), 0.14, 0.14, W))
        wood.append(beam(f'king_{ty}', (0, ty, WALL_H + 0.15), (0, ty, RIDGE - 0.3), 0.2, 0.2, W, up=(1, 0, 0)))
    for x in (-11.25, -7.5, -3.75, 3.75, 7.5, 11.25):
        z = roof_z(x) - 0.09
        wood.append(beam(f'purlin_{x}', (x, -HY - 0.3, z), (x, HY + 0.3, z), 0.12, 0.16, W))
    wood.append(beam('ridge', (0, -HY - 0.3, RIDGE - 0.1), (0, HY + 0.3, RIDGE - 0.1), 0.16, 0.2, W))

    glass = []
    for sx in (-1, 1):
        xm = sx * (HX + TH / 2)
        for y in WINDOW_Y:
            y0, y1 = y - WIN_W / 2, y + WIN_W / 2
            k = f'{sx}_{y}'
            wood.append(beam(f'wf_b_{k}', (xm, y0, WIN_Z0 + 0.04), (xm, y1, WIN_Z0 + 0.04), 0.3, 0.08, W))
            wood.append(beam(f'wf_t_{k}', (xm, y0, WIN_Z1 - 0.04), (xm, y1, WIN_Z1 - 0.04), 0.3, 0.08, W))
            for j in range(5):
                yy = y0 + 0.04 + j * (WIN_W - 0.08) / 4
                wood.append(beam(f'wf_v_{k}_{j}', (xm, yy, WIN_Z0), (xm, yy, WIN_Z1), 0.06 if 0 < j < 4 else 0.08, 0.1, W, up=(1, 0, 0)))
            wood.append(beam(f'wf_h_{k}', (xm, y0, (WIN_Z0 + WIN_Z1) / 2), (xm, y1, (WIN_Z0 + WIN_Z1) / 2), 0.06, 0.05, W))
            wood.append(beam(f'sill_{k}', (sx * (HX - 0.12), y0 - 0.1, WIN_Z0 - 0.03), (sx * (HX - 0.12), y1 + 0.1, WIN_Z0 - 0.03), 0.26, 0.06, W))
            gx = sx * (HX + 0.24)
            pts = [(gx, y0, WIN_Z0), (gx, y1, WIN_Z0), (gx, y1, WIN_Z1), (gx, y0, WIN_Z1)]
            if sx > 0:
                pts = [pts[1], pts[0], pts[3], pts[2]]
            glass.append(quad(f'glass_{k}', pts, M['glass']))
    for s in (-1, 1):
        for y in (-8, 0, 8):
            x0, x1 = (4.4, 6.9) if s > 0 else (-6.9, -4.4)
            z0, z1 = roof_z(x0) + 0.06, roof_z(x1) + 0.06
            glass.append(quad(f'sky_{s}_{y}', [(x0, y - 1.2, z0), (x0, y + 1.2, z0), (x1, y + 1.2, z1), (x1, y - 1.2, z1)], M['glass']))

    # office barred window in the east wall (game x 15, z -9.6..-8.4, y 1.2..2.2)
    for z in (-9.45, -9.2, -8.95, -8.7, -8.45):
        wood.append(tbeam(f'bar_{z}', (HX + 0.05, 1.2, z), (HX + 0.05, 2.2, z), 0.025, 0.025, I, up=(1, 0, 0), collection='Shell'))
    wood.append(tbeam('ow_sill', (HX - 0.05, 1.17, -9.7), (HX - 0.05, 1.17, -8.3), 0.25, 0.06, W, collection='Shell'))
    glass.append(tquad('glass_office_east', [(HX + 0.2, 1.2, -9.6), (HX + 0.2, 1.2, -8.4), (HX + 0.2, 2.2, -8.4), (HX + 0.2, 2.2, -9.6)], M['glass'], collection='Shell'))
    # survey office window (its west wall, game x -15.08, z 13.6..15.0)
    glass.append(tquad('glass_survey', [(-15.12, 1.1, 15.0), (-15.12, 1.1, 13.6), (-15.12, 2.1, 13.6), (-15.12, 2.1, 15.0)], M['glass'], collection='Shell'))
    for z in (13.6, 14.3, 15.0):
        wood.append(tbeam(f'sw_v_{z}', (-15.06, 1.1, z), (-15.06, 2.1, z), 0.06, 0.12, W, up=(1, 0, 0), collection='Shell'))
    for y in (1.1, 2.1):
        wood.append(tbeam(f'sw_h_{y}', (-15.06, y, 13.55), (-15.06, y, 15.05), 0.12, 0.06, W, collection='Shell'))
    join('Hangar_Timber', wood)
    join('Hangar_WindowGlass', glass)

    # ---- sliding doors with a wicket door in the left leaf
    yf, yb = -HY + 0.5, -HY + 0.35
    wx0, wx1, wy0, wy1 = WICKET
    S = M['steel']
    for side, (x0, x1) in (('L', (-DOOR_X - 0.15, -0.01)), ('R', (0.01, DOOR_X + 0.15))):
        parts = []
        panel = box(f'panel_{side}', x0, x1, yb + 0.04, yb + 0.07, 0.03, DOOR_H + 0.05, M['door'])
        if side == 'L':
            apply_boolean(panel, [cut('cut_wicket', wx0, wx1, yb - 1, yf + 1, wy0, wy1)])
        world_uv(panel)
        parts.append(panel)
        zt = DOOR_H + 0.05
        ym = (yf + yb) / 2
        parts.append(beam(f'f_top_{side}', (x0, ym, zt - 0.05), (x1, ym, zt - 0.05), 0.15, 0.1, S))
        parts.append(beam(f'f_bot_{side}', (x0, ym, 0.08), (x1, ym, 0.08), 0.15, 0.1, S))
        for z in (2.3, 4.6):
            parts.append(beam(f'f_rail_{side}_{z}', (x0, ym, z), (x1, ym, z), 0.12, 0.08, S))
        for x in (x0 + 0.05, (x0 + x1) / 2, x1 - 0.05):
            parts.append(beam(f'f_stile_{side}_{x:.2f}', (x, ym, 0.03), (x, ym, zt), 0.12, 0.1, S, up=(1, 0, 0)))
        parts.append(beam(f'f_brace_{side}', (x0 + 0.1, ym + 0.02, 0.15), ((x0 + x1) / 2, ym + 0.02, 2.25), 0.08, 0.06, S))
        for xr in (x0 + 0.8, x1 - 0.8):
            parts.append(cylinder(f'roller_{side}_{xr:.1f}', (xr, ym, zt + 0.12), 0.09, 0.06, 'y', S))
        if side == 'L':  # frame around the wicket opening
            for xx in (wx0 - 0.04, wx1 + 0.04):
                parts.append(beam(f'wick_jamb_{xx:.2f}', (xx, ym, 0.03), (xx, ym, wy1 + 0.05), 0.12, 0.08, S, up=(1, 0, 0)))
            parts.append(beam('wick_head', (wx0 - 0.08, ym, wy1 + 0.04), (wx1 + 0.08, ym, wy1 + 0.04), 0.12, 0.08, S))
        join(f'SlidingDoor_{side}', parts)

    # the wicket door itself (hinge on its left edge, opens outwards into the storm)
    wparts = []
    wp = box('wicket_panel', wx0 + 0.01, wx1 - 0.01, yb + 0.03, yb + 0.08, wy0 + 0.01, wy1 - 0.01, M['door'])
    world_uv(wp)
    wparts.append(wp)
    ym = yb + 0.055
    for xx in (wx0 + 0.04, wx1 - 0.04):
        wparts.append(beam(f'wd_stile_{xx:.2f}', (xx, ym, wy0 + 0.02), (xx, ym, wy1 - 0.02), 0.1, 0.06, S, up=(1, 0, 0)))
    for zz in (wy0 + 0.05, (wy0 + wy1) / 2, wy1 - 0.05):
        wparts.append(beam(f'wd_rail_{zz:.2f}', (wx0 + 0.02, ym, zz), (wx1 - 0.02, ym, zz), 0.1, 0.06, S))
    wparts.append(cylinder('wd_handle', (wx1 - 0.14, yf + 0.02, 1.05), 0.022, 0.14, 'z', M['brass']))
    wparts.append(cylinder('wd_handle_out', (wx1 - 0.14, yb - 0.02, 1.05), 0.022, 0.14, 'z', M['brass']))
    wicket = join('Door_Wicket', wparts)
    set_origin(wicket, (wx0 + 0.01, ym, wy0))

    track = [beam('track', (-HX, -HY + 0.43, DOOR_H + 0.32), (HX, -HY + 0.43, DOOR_H + 0.32), 0.18, 0.16, S)]
    for x in (-13, -6.5, 0, 6.5, 13):
        track.append(beam(f'hanger_{x}', (x, -HY + 0.1, DOOR_H + 0.32), (x, -HY + 0.43, DOOR_H + 0.32), 0.08, 0.06, S))
    track.append(beam('guide', (-HX, -HY + 0.6, 0.02), (HX, -HY + 0.6, 0.02), 0.06, 0.04, S))
    # chain and padlock across the seam: the doors are chained shut for the storm
    for i in range(9):
        x = -0.36 + i * 0.09
        track.append(torus(f'link_{i}', (x, yf + 0.04, 1.1), 0.045, 0.009, 'y' if i % 2 else 'x', I, (12, 6)))
    track.append(box('padlock', -0.05, 0.05, yf + 0.02, yf + 0.07, 0.94, 1.06, M['brass']))
    track.append(torus('padlock_shackle', (0, yf + 0.045, 1.08), 0.035, 0.008, 'y', S, (12, 6)))
    join('Hangar_DoorTrack', track)

    # ---- the storm outside: what you see through door gaps and the open wicket
    zs0, zs1, top = 12.3, 15.5, 7.5
    storm = [
        tquad('storm_back', [(9.2, 0, zs1), (-9.2, 0, zs1), (-9.2, top, zs1), (9.2, top, zs1)], M['leak'], collection='Shell'),
        tquad('storm_l', [(-9.2, 0, zs1), (-9.2, 0, zs0), (-9.2, top, zs0), (-9.2, top, zs1)], M['leak'], collection='Shell'),
        tquad('storm_r', [(9.2, 0, zs0), (9.2, 0, zs1), (9.2, top, zs1), (9.2, top, zs0)], M['leak'], collection='Shell'),
        tquad('storm_top', [(-9.2, top, zs0), (9.2, top, zs0), (9.2, top, zs1), (-9.2, top, zs1)], M['leak'], collection='Shell'),
    ]
    join('StormOutside', storm)
    tquad('Outside_Ground', [(-9.2, 0.001, zs0), (-9.2, 0.001, zs1), (9.2, 0.001, zs1), (9.2, 0.001, zs0)], M['sand'],
          uvs=((0, 0), (0, 1), (4, 1), (4, 0)), collection='Shell')

    rooms(M)
    collisions(M, post_spots, yf)

    for c in list(coll('Cutters').objects):
        bpy.data.objects.remove(c)
    bpy.data.collections.remove(coll('Cutters'))


def door_leaf(name, hinge, width, height, M, style='planked', text=None):
    """A door in an x-aligned wall. Leaf runs from the hinge towards +x; origin = hinge."""
    hx, hy, hz = hinge  # game coords
    t = 0.05
    x0, x1 = hx + 0.01, hx + width - 0.01
    z0, z1 = hz - t / 2, hz + t / 2
    parts = []
    W = M['planks']
    if style == 'office':
        D = M['wood_dark']
        parts.append(tbox(f'{name}_low', x0, x1, 0.02, 1.15, z0, z1, D, 'Shell', uv=(1, 1, 1)))
        for xa, xb in ((x0, x0 + 0.12), (x1 - 0.12, x1)):
            parts.append(tbox(f'{name}_stile_{xa:.2f}', xa, xb, 1.15, height, z0, z1, D, 'Shell', uv=(1, 1, 1)))
        parts.append(tbox(f'{name}_top', x0 + 0.12, x1 - 0.12, height - 0.12, height, z0, z1, D, 'Shell', uv=(1, 1, 1)))
        parts.append(tbox(f'{name}_pane', x0 + 0.12, x1 - 0.12, 1.15, height - 0.12, hz - 0.008, hz + 0.008, M['frosted'], 'Shell'))
        if text:
            parts.append(ttext(f'{name}_text1', text[0], 0.085, M['gold'], ((x0 + x1) / 2, 1.72, hz + 0.012), 'z+', 'Shell'))
            parts.append(ttext(f'{name}_text2', text[1], 0.05, M['gold'], ((x0 + x1) / 2, 1.6, hz + 0.012), 'z+', 'Shell'))
    else:
        parts.append(tbox(f'{name}_boards', x0, x1, 0.02, height, z0, z1, W, 'Shell', uv=(1, 1, 1)))
        for y in (0.25, height - 0.25):
            parts.append(tbox(f'{name}_ledge_{y:.1f}', x0 + 0.05, x1 - 0.05, y - 0.07, y + 0.07, z1, z1 + 0.025, W, 'Shell', uv=(1, 1, 1)))
        parts.append(tbeam(f'{name}_brace', (x0 + 0.1, 0.32, z1 + 0.012), (x1 - 0.1, height - 0.32, z1 + 0.012), 0.12, 0.025, W, up=(0, 0, 1), collection='Shell'))
    for s in (-1, 1):
        parts.append(tcyl(f'{name}_knob_{s}', (x1 - 0.09, 1.0, hz + s * 0.05), 0.028, 0.05, 'z', M['brass'], 12, 'Shell'))
    ob = join(name, parts)
    set_origin(ob, T((hx, 0, hz)))
    return ob


def rooms(M):
    P, FB = M['planks'], M['floorboards']
    M['wood_dark'] = material('DarkVarnish', texture_set('darkwood', tex.polished_wood(512, 71, (0.20, 0.11, 0.06)), TEX_DIR))
    D = M['wood_dark']
    t = 0.14

    # ---- Pryce's office (inside the hangar, north-east corner)
    o = OFFICE
    zf = o['z1']
    dx0, dx1 = o['door']
    wx0, wx1 = o['window']
    front = tbox('office_front', o['x0'] - t / 2, o['x1'], 0, o['h'], zf - t / 2, zf + t / 2, P, 'Shell')
    apply_boolean(front, [tbox('cut_od', dx0, dx1, -1, 2.1, zf - 1, zf + 1, None, 'Cutters'),
                          tbox('cut_ow', wx0, wx1, 1.15, 2.2, zf - 1, zf + 1, None, 'Cutters')])
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

    # ---- survey office + darkroom (outside the south wall, location H)
    s, d = SURVEY, DARK
    bx0, bx1 = s['back_door']
    sx0, sx1 = s['door']
    parts = [
        tbox('sv_floor', s['x0'] - t, s['x1'] + t, -0.05, 0.015, s['z0'], s['z1'] + t, FB, 'Shell'),
        tbox('sv_ceiling', s['x0'] - t, s['x1'] + t, s['h'], s['h'] + 0.12, s['z0'], s['z1'] + t, P, 'Shell'),
        tbox('sv_east', s['x1'], s['x1'] + t, 0, s['h'], s['z0'], s['z1'] + t, P, 'Shell'),
    ]
    svw = tbox('sv_west', s['x0'] - t, s['x0'], 0, s['h'], s['z0'], s['z1'] + t, P, 'Shell')
    apply_boolean(svw, [tbox('cut_svw', s['x0'] - 1, s['x0'] + 1, 1.1, 2.1, 13.6, 15.0, None, 'Cutters')])
    back = tbox('sv_back', s['x0'] - t, s['x1'] + t, 0, s['h'], s['z1'], s['z1'] + t, P, 'Shell')
    apply_boolean(back, [tbox('cut_svb', bx0, bx1, -1, 2.05, s['z1'] - 1, s['z1'] + 1, None, 'Cutters')])
    parts += [svw, back]
    zd0 = s['z1'] + t
    parts += [
        tbox('dk_floor', d['x0'] - t, d['x1'] + t, -0.05, 0.015, zd0, d['z1'] + t, FB, 'Shell'),
        tbox('dk_ceiling', d['x0'] - t, d['x1'] + t, d['h'], d['h'] + 0.12, zd0, d['z1'] + t, P, 'Shell'),
        tbox('dk_west', d['x0'] - t, d['x0'], 0, d['h'], zd0, d['z1'] + t, P, 'Shell'),
        tbox('dk_east', d['x1'], d['x1'] + t, 0, d['h'], zd0, d['z1'] + t, P, 'Shell'),
        tbox('dk_back', d['x0'] - t, d['x1'] + t, 0, d['h'], d['z1'], d['z1'] + t, P, 'Shell'),
    ]
    for ob in parts:
        world_uv(ob, 1, 1, 1)
    for nm, (a, b), zc, off, hgt in (('svd', (sx0, sx1), 12.15, 0.17, 2.1), ('dkd', (bx0, bx1), s['z1'] + t / 2, 0.085, 2.05)):
        for side in (-1, 1):
            z = zc + side * off
            parts.append(tbox(f'{nm}_l_{side}', a - 0.09, a, 0, hgt + 0.1, z - 0.015, z + 0.015, D, 'Shell', uv=(1, 1, 1)))
            parts.append(tbox(f'{nm}_r_{side}', b, b + 0.09, 0, hgt + 0.1, z - 0.015, z + 0.015, D, 'Shell', uv=(1, 1, 1)))
            parts.append(tbox(f'{nm}_h_{side}', a - 0.09, b + 0.09, hgt, hgt + 0.1, z - 0.015, z + 0.015, D, 'Shell', uv=(1, 1, 1)))
    join('Survey_Rooms', parts)
    door_leaf('Door_Survey', (sx0, 0, 12.15), sx1 - sx0, 2.08, M)
    door_leaf('Door_Darkroom', (bx0, 0, s['z1'] + t / 2), bx1 - bx0, 2.03, M)


def collisions(M, post_spots, yf):
    C = M['col']
    col_box('COL_Wall_N', -HX - TH, HX + TH, -HY - TH, -HY, mat=C)
    col_box('COL_Wall_E', HX, HX + TH, -HY - TH, HY + TH, mat=C)
    col_box('COL_Wall_W', -HX - TH, -HX, -HY - TH, HY + TH, mat=C)
    sx0, sx1 = SURVEY['door']
    col_box('COL_Wall_S_L1', -HX - TH, sx0, HY, HY + TH, mat=C)
    col_box('COL_Wall_S_L2', sx1, -DOOR_X, HY, HY + TH, mat=C)
    col_box('COL_Wall_S_R', DOOR_X, HX + TH, HY, HY + TH, mat=C)
    col_box('COL_Doors', -DOOR_X - 0.2, DOOR_X + 0.2, -yf - 0.12, HY, mat=C)
    for i, (x, y, dx, dy) in enumerate(post_spots):
        col_box(f'COL_Post_{i}', x - dx / 2, x + dx / 2, -y - dy / 2, -y + dy / 2, mat=C)
    o = OFFICE
    dx0, dx1 = o['door']
    col_box('COL_Office_Front_L', o['x0'] - 0.1, dx0, o['z1'] - 0.1, o['z1'] + 0.1, mat=C)
    col_box('COL_Office_Front_R', dx1, o['x1'], o['z1'] - 0.1, o['z1'] + 0.1, mat=C)
    col_box('COL_Office_West', o['x0'] - 0.1, o['x0'] + 0.1, o['z0'], o['z1'] + 0.1, mat=C)
    col_box('COL_Door_Office', dx0, dx1, o['z1'] - 0.05, o['z1'] + 0.05, mat=C)
    s, d = SURVEY, DARK
    col_box('COL_Door_Survey', sx0, sx1, 12.1, 12.2, mat=C)
    col_box('COL_Survey_W', s['x0'] - 0.2, s['x0'], s['z0'], s['z1'] + 0.15, mat=C)
    col_box('COL_Survey_E', s['x1'], s['x1'] + 0.2, s['z0'], s['z1'] + 0.15, mat=C)
    bx0, bx1 = s['back_door']
    col_box('COL_Survey_Back_L', s['x0'] - 0.2, bx0, s['z1'], s['z1'] + 0.15, mat=C)
    col_box('COL_Survey_Back_R', bx1, s['x1'] + 0.2, s['z1'], s['z1'] + 0.15, mat=C)
    col_box('COL_Door_Darkroom', bx0, bx1, s['z1'] + 0.03, s['z1'] + 0.12, mat=C)
    col_box('COL_Dark_W', d['x0'] - 0.2, d['x0'], s['z1'], d['z1'] + 0.2, mat=C)
    col_box('COL_Dark_E', d['x1'], d['x1'] + 0.2, s['z1'], d['z1'] + 0.2, mat=C)
    col_box('COL_Dark_Back', d['x0'] - 0.2, d['x1'] + 0.2, d['z1'], d['z1'] + 0.2, mat=C)


build()
size = export_glb(OUT_GLB)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f'EXPORTED {OUT_GLB} ({size:.2f} MB)')
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    if not ob.name.startswith('COL_'):
        print('OBJECT', ob.name, len(ob.data.polygons) if ob.type == 'MESH' else '')
print('COLLIDERS', sum(1 for o in bpy.data.objects if o.name.startswith('COL_')))
