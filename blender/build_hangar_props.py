"""
THE MARIGOLD SILENCE: everything inside the hangar and its rooms (props).

Run (from the project folder):
  /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python blender/build_hangar_props.py

Output: public/models/hangar_props.glb (+ blender/hangar_props.blend)

All positions are GAME coordinates (x east, y up, z south), see bhelpers.T().

Naming contract with the game (interactables.json refers to these names):
  Workbench, Toolbox (+ Toolbox_Lid, Note_Toolbox), PartsCabinet (+ PartsCabinet_Drawer, Note_Drawer),
  Locker_1..6 (+ Locker_N_Door), SmallKey, Office_*, Survey_*, Dark_*
  HIT_*    invisible, bigger aiming boxes for small things
  COL_*    invisible collision boxes
  LIGHT_*  empties whose custom properties describe a light (type, intensity, distance, color...)
  Lamp_N   hanging lamps (custom property sway = 1); Bulb_N = that lamp's bulb
"""
import json
import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
import pbr_textures as tex  # noqa: E402
from bhelpers import (T, col_box, col_from, export_glb, join, marker, material, parent, place,  # noqa: E402
                      update, reset_scene, save_image, set_origin, tbeam, tbox, tcyl, tcyl_dir, texture_set,
                      tquad, tsphere, ttext, ttorus, world_uv)

PROJECT = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, 'textures')
OUT_GLB = os.path.join(PROJECT, 'public', 'models', 'hangar_props.glb')
OUT_BLEND = os.path.join(HERE, 'hangar_props.blend')
with open(os.path.join(PROJECT, 'src', 'data', 'scenes', 'hangar.json')) as f:
    SIGNS = json.load(f)['signs']

R = random.Random(7)
M = {}


def J(name, parts, origin=None):
    """Join parts into one named prop; optional pivot (game coords)."""
    ob = join(name, parts, 'Props')
    if origin is not None:
        set_origin(ob, T(origin))
    return ob


def COL(name, objs, pad=0.0):
    return col_from(name, objs if isinstance(objs, list) else [objs], pad, mat=M['col'])


def hit(name, center, size):
    sx, sy, sz = size
    x, y, z = center
    return tbox(name, x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z - sz / 2, z + sz / 2, M['col'])


def wuv(ob, t=1.0):
    world_uv(ob, t, t, t)
    return ob


# ------------------------------------------------------------------ materials
def materials():
    td = TEX_DIR
    M.update({
        'wood': material('WeatheredWood', texture_set('wood', tex.weathered_wood(512), td)),
        'pwood': material('PolishedWood', texture_set('pwood', tex.polished_wood(512), td)),
        'olive': material('OlivePaint', texture_set('olive', tex.painted_metal(512, 60, (0.22, 0.27, 0.18)), td)),
        'red': material('RedPaint', texture_set('redpaint', tex.painted_metal(512, 61, (0.40, 0.07, 0.045)), td)),
        'grey': material('GreyPaint', texture_set('greypaint', tex.painted_metal(512, 62, (0.30, 0.31, 0.30)), td)),
        'paper': material('NotePaper', {'color': save_image('paper', tex.paper()['color'], False, td)}, rough=0.95),
        'steel': material('DarkSteel', color=(0.075, 0.07, 0.065), rough=0.55, metal=0.85),
        'alu': material('Aluminium', color=(0.55, 0.55, 0.52), rough=0.38, metal=0.85),
        'brass': material('Brass', color=(0.55, 0.42, 0.18), rough=0.3, metal=0.9),
        'iron': material('Iron', color=(0.05, 0.045, 0.04), rough=0.7, metal=0.7),
        'rubber': material('Rubber', color=(0.025, 0.025, 0.025), rough=0.9),
        'leather': material('Leather', color=(0.16, 0.07, 0.035), rough=0.45),
        'tarp': material('Tarp', color=(0.22, 0.22, 0.15), rough=1.0),
        'canvas': material('WingCanvas', color=(0.6, 0.55, 0.42), rough=0.85),
        'card': material('Cardboard', color=(0.42, 0.32, 0.2), rough=1.0),
        'plain_paper': material('PlainPaper', color=(0.78, 0.74, 0.62), rough=0.95),
        'map': material('MapPaper', color=(0.72, 0.64, 0.46), rough=0.95),
        'ink': material('Ink', color=(0.05, 0.04, 0.04), rough=0.6),
        'felt': material('Felt', color=(0.06, 0.16, 0.1), rough=1.0),
        'rug': material('Rug', color=(0.3, 0.06, 0.045), rough=1.0),
        'rug_border': material('RugBorder', color=(0.12, 0.08, 0.05), rough=1.0),
        'enamel': material('EnamelGreen', color=(0.06, 0.16, 0.1), rough=0.3, metal=0.1),
        'enamel_in': material('EnamelInner', color=(0.85, 0.82, 0.72), rough=0.5),
        'bulb': material('Bulb', color=(1.0, 0.9, 0.7), emission=(1.0, 0.82, 0.55), emission_strength=4.0),
        'bulb_dead': material('BulbDead', color=(0.12, 0.11, 0.1), rough=0.2),
        'banker': material('BankerShade', color=(0.02, 0.1, 0.04), rough=0.15, emission=(0.05, 0.35, 0.12), emission_strength=1.0),
        'safelight': material('Safelight', color=(0.2, 0.0, 0.0), emission=(1.0, 0.08, 0.02), emission_strength=0.9),
        'bakelite': material('Bakelite', color=(0.02, 0.018, 0.016), rough=0.25),
        'brownglass': material('BrownGlass', color=(0.14, 0.06, 0.015), rough=0.08),
        'clearglass': material('ClearGlassJar', color=(0.5, 0.55, 0.5), rough=0.05, alpha=0.35),
        'porcelain': material('Porcelain', color=(0.85, 0.84, 0.8), rough=0.2),
        'stencil': material('StencilBlack', color=(0.03, 0.03, 0.03), rough=0.9),
        'paint_cream': material('FadedPaint', color=(0.72, 0.68, 0.57), rough=1.0),
        'sign_cream': material('SignCream', color=(0.76, 0.72, 0.6), rough=0.8),
        'sign_red': material('SignRed', color=(0.38, 0.06, 0.04), rough=0.7),
        'white_paint': material('WhitePaint', color=(0.8, 0.78, 0.7), rough=0.8),
        'sandbag': material('Sandbag', color=(0.43, 0.36, 0.25), rough=1.0),
        'oil': material('OilPool', color=(0.008, 0.007, 0.006), rough=0.05, metal=0.2),
        'safe': material('SafeGreen', color=(0.06, 0.1, 0.07), rough=0.4, metal=0.6),
        'cloth': material('Overalls', color=(0.09, 0.11, 0.15), rough=1.0),
        'slicker': material('Slicker', color=(0.55, 0.45, 0.12), rough=0.6),
        'photo': material('PhotoPrint', color=(0.36, 0.35, 0.32), rough=0.4),
        'book_a': material('BookRed', color=(0.3, 0.06, 0.05), rough=0.7),
        'book_b': material('BookGreen', color=(0.07, 0.18, 0.1), rough=0.7),
        'book_c': material('BookBlue', color=(0.06, 0.08, 0.2), rough=0.7),
        'book_d': material('BookTan', color=(0.45, 0.35, 0.22), rough=0.7),
        'tube': material('TubeGreyGreen', color=(0.26, 0.29, 0.25), rough=0.5, metal=0.4),
        'ember': material('StoveEmber', color=(0.2, 0.05, 0.0), emission=(1.0, 0.35, 0.08), emission_strength=1.5),
        'col': material('Collision', color=(0.0, 1.0, 0.3)),
    })


# ------------------------------------------------------------------ practice objects
def workbench():
    W = M['wood']
    bx0, bx1, z0, z1 = -14.975, -14.025, -1.7, 1.7
    p = [wuv(tbox('wb_top', bx0, bx1, 0.86, 0.94, z0, z1, W)),
         wuv(tbox('wb_shelf', bx0 + 0.05, bx1 - 0.05, 0.23, 0.27, z0 + 0.1, z1 - 0.1, W))]
    for x in (bx0 + 0.06, bx1 - 0.06):
        for z in (z0 + 0.06, z1 - 0.06):
            p.append(wuv(tbox(f'wb_leg_{x}_{z}', x - 0.04, x + 0.04, 0, 0.86, z - 0.04, z + 0.04, W)))
    # vise
    p += [tbox('vise_body', -14.2, -14.0, 0.94, 1.06, 1.22, 1.38, M['grey']),
          tbox('vise_jaw', -14.0, -13.95, 0.94, 1.08, 1.22, 1.38, M['grey']),
          tbeam('vise_screw', (-13.95, 1.0, 1.3), (-13.8, 1.0, 1.3), 0.02, 0.02, M['steel']),
          tbeam('vise_bar', (-13.82, 1.0, 1.18), (-13.82, 1.0, 1.42), 0.015, 0.015, M['steel'], up=(1, 0, 0))]
    # oil can, rag, coffee tin with pencils
    p += [tcyl('oilcan', (-14.4, 1.04, -0.4), 0.08, 0.2, 'y', M['red'], 16, r2=0.06),
          tcyl_dir('oilcan_spout', (-14.4, 1.12, -0.4), (-14.22, 1.3, -0.4), 0.01, M['steel'], 6, r2=0.005),
          tquad('rag', [(-14.45, 0.942, 0.15), (-14.15, 0.942, 0.1), (-14.1, 0.942, 0.42), (-14.4, 0.942, 0.45)], M['tarp']),
          tcyl('tin', (-14.75, 1.0, 0.7), 0.06, 0.12, 'y', M['alu'], 14)]
    for i in range(4):
        a = i * 1.6
        p.append(tcyl_dir(f'pencil_{i}', (-14.75 + 0.02 * math.cos(a), 1.0, 0.7 + 0.02 * math.sin(a)),
                          (-14.75 + 0.05 * math.cos(a), 1.17, 0.7 + 0.05 * math.sin(a)), 0.004, M['book_d'], 6))
    # pegboard with tools
    p.append(tbox('pegboard', -14.998, -14.97, 1.15, 2.35, -1.5, 1.5, M['card']))
    for i in range(7):
        z = -1.3 + i * 0.32
        length = 0.22 + (i % 3) * 0.06
        p.append(tbeam(f'spanner_{i}', (-14.955, 1.95 - length / 2, z), (-14.955, 1.95 + length / 2, z), 0.035, 0.012, M['steel'], up=(1, 0, 0)))
        p.append(ttorus(f'spanner_ring_{i}', (-14.955, 1.95 + length / 2 + 0.02, z), 0.022, 0.006, 'x', M['steel'], (10, 5)))
    p += [tbeam('hammer_handle', (-14.955, 1.45, 0.9), (-14.955, 1.8, 0.9), 0.03, 0.02, M['wood'], up=(1, 0, 0)),
          tbox('hammer_head', -14.97, -14.94, 1.78, 1.82, 0.84, 0.98, M['steel']),
          tbox('saw_blade', -14.962, -14.958, 1.35, 1.5, -1.45, -0.95, M['alu']),
          tbox('saw_handle', -14.97, -14.95, 1.33, 1.52, -1.0, -0.88, M['wood'])]
    bench = J('Workbench', p)
    COL('COL_Workbench', bench, 0.03)
    bench_lamp('BenchLamp', -15.0, 0.0, True)
    # calendar pin-up beside the bench
    tquad('calendar', [(-14.985, 1.5, 1.9), (-14.985, 1.5, 2.3), (-14.985, 2.05, 2.3), (-14.985, 2.05, 1.9)], M['plain_paper'])


def note(name, center, ry=0.0):
    x, y, z = center
    c, s = math.cos(ry), math.sin(ry)
    pts = [(-0.075, -0.055), (0.075, -0.055), (0.075, 0.055), (-0.075, 0.055)]
    q = tquad(name, [(x + px * c - pz * s, y, z + px * s + pz * c) for px, pz in pts], M['paper'])
    h = hit(f'HIT_{name}', (x, y + 0.05, z), (0.2, 0.1, 0.17))
    parent(h, q)
    return q


def toolbox():
    red = M['red']
    x0, x1, y0, y1, z0, z1, t = -14.76, -14.48, 0.94, 1.07, -1.28, -0.72, 0.012
    p = [tbox('tb_bottom', x0, x1, y0, y0 + t, z0, z1, red),
         tbox('tb_wall_w', x0, x0 + t, y0, y1, z0, z1, red),
         tbox('tb_wall_e', x1 - t, x1, y0, y1, z0, z1, red),
         tbox('tb_wall_n', x0, x1, y0, y1, z0, z0 + t, red),
         tbox('tb_wall_s', x0, x1, y0, y1, z1 - t, z1, red),
         tbox('tb_tray', x0 + t, x1 - t, 1.017, 1.023, z0 + t, z1 - t, M['iron']),
         tbeam('tb_spanner', (-14.66, 1.03, -1.25), (-14.6, 1.03, -1.05), 0.03, 0.012, M['steel']),
         ttorus('tb_wire', (-14.56, 1.03, -0.82), 0.045, 0.006, 'y', M['steel'], (14, 5))]
    box_ob = J('Toolbox', p)
    lid = J('Toolbox_Lid', [tbox('tb_lid', x0 - 0.005, x1 + 0.005, y1, y1 + 0.02, z0 - 0.005, z1 + 0.005, red),
                            tbox('tb_handle', -14.64, -14.6, y1 + 0.02, y1 + 0.06, -1.08, -0.92, M['iron'])], (x0, y1, -1.0))
    parent(lid, box_ob)


def parts_cabinet():
    O = M['olive']
    x0, x1, z0, z1 = -14.975, -14.525, 2.5, 3.0
    p = [wuv(tbox('pc_body', x0, x1, 0, 0.9, z0, z1, O))]
    for y in (0.16, 0.42):
        p.append(wuv(tbox(f'pc_front_{y}', x1, x1 + 0.02, y - 0.12, y + 0.12, z0 + 0.02, z1 - 0.02, O)))
        p.append(tbox(f'pc_handle_{y}', x1 + 0.02, x1 + 0.045, y + 0.05, y + 0.07, 2.69, 2.81, M['steel']))
    cab = J('PartsCabinet', p)
    d = [wuv(tbox('dr_front', x1, x1 + 0.02, 0.6, 0.84, z0 + 0.02, z1 - 0.02, O)),
         tbox('dr_bottom', x0 + 0.04, x1, 0.615, 0.625, z0 + 0.04, z1 - 0.04, M['iron']),
         tbox('dr_side_n', x0 + 0.04, x1, 0.615, 0.77, z0 + 0.04, z0 + 0.05, M['iron']),
         tbox('dr_side_s', x0 + 0.04, x1, 0.615, 0.77, z1 - 0.05, z1 - 0.04, M['iron']),
         tbox('dr_back', x0 + 0.04, x0 + 0.05, 0.615, 0.77, z0 + 0.04, z1 - 0.04, M['iron']),
         tbox('dr_handle', x1 + 0.02, x1 + 0.045, 0.77, 0.79, 2.69, 2.81, M['steel']),
         tbox('dr_label', x1 + 0.02, x1 + 0.024, 0.66, 0.70, 2.7, 2.8, M['brass']),
         tcyl('dr_keyhole', (x1 + 0.022, 0.72, 2.93), 0.01, 0.006, 'x', M['brass'], 10)]
    d.append(ttext('dr_label_text', 'PARTS', 0.028, M['stencil'], (x1 + 0.025, 0.68, 2.75), 'x+'))
    drawer = J('PartsCabinet_Drawer', d, (x1, 0.6, 2.75))
    parent(drawer, cab)
    COL('COL_PartsCabinet', cab)


def lockers():
    O = M['olive']
    inside = material('LockerInside', color=(0.05, 0.055, 0.04), rough=0.9)
    zb, zf = -11.98, -11.48
    for i in range(6):
        n = i + 1
        cx = -14.55 + i * 0.62
        x0, x1 = cx - 0.3, cx + 0.3
        p = [tbox(f'lk_back_{n}', x0, x1, 0, 1.9, zb, zb + 0.02, O), tbox(f'lk_l_{n}', x0, x0 + 0.02, 0, 1.9, zb, zf, O),
             tbox(f'lk_r_{n}', x1 - 0.02, x1, 0, 1.9, zb, zf, O), tbox(f'lk_top_{n}', x0, x1, 1.88, 1.9, zb, zf, O),
             tbox(f'lk_bot_{n}', x0, x1, 0, 0.05, zb, zf, O), tbox(f'lk_shelf_{n}', x0 + 0.02, x1 - 0.02, 1.55, 1.565, zb, zf - 0.02, O),
             tbox(f'lk_in_{n}', x0 + 0.02, x1 - 0.02, 0.05, 1.88, zb + 0.02, zb + 0.025, inside)]
        for q in p:
            wuv(q)
        # contents
        if n == 3:
            p += [tbox('overalls', cx - 0.15, cx + 0.17, 0.5, 1.5, zb + 0.06, zb + 0.16, M['cloth']),
                  tcyl('blacking', (cx - 0.18, 1.585, -11.75), 0.04, 0.03, 'y', M['iron'], 12),
                  tquad('pigeon_photo', [(cx + 0.06, 1.24, zb + 0.026), (cx + 0.18, 1.24, zb + 0.026), (cx + 0.18, 1.39, zb + 0.026), (cx + 0.06, 1.39, zb + 0.026)], M['photo'])]
        elif n == 2:
            for k, dx in enumerate((-0.12, 0.08)):
                p += [tbox(f'boot_{k}', cx + dx - 0.05, cx + dx + 0.05, 0.05, 0.3, -11.85, -11.6, M['leather']),
                      tbox(f'boot_toe_{k}', cx + dx - 0.05, cx + dx + 0.05, 0.05, 0.12, -11.6, -11.52, M['leather'])]
        elif n == 4:
            p += [tcyl('thermos', (cx - 0.1, 1.72, -11.75), 0.045, 0.3, 'y', M['enamel'], 12),
                  tbox('lunch_tin', cx, cx + 0.22, 1.565, 1.68, -11.85, -11.62, M['alu'])]
        elif n == 6:
            p += [tbox('slicker', cx - 0.18, cx + 0.18, 0.7, 1.5, zb + 0.06, zb + 0.14, M['slicker'])]
        body = J(f'Locker_{n}', p)
        d = [tbox(f'lkd_{n}', x0 + 0.005, x1 - 0.005, 0.03, 1.88, zf, zf + 0.022, O)]
        for k in range(6):
            d.append(tbox(f'lkd_vent_{n}_{k}', cx - 0.12, cx + 0.12, 1.62 + k * 0.035, 1.635 + k * 0.035, zf + 0.022, zf + 0.026, M['iron']))
        d += [tbox(f'lkd_plate_{n}', cx - 0.06, cx + 0.06, 1.38, 1.46, zf + 0.022, zf + 0.026, M['brass']),
              ttext(f'lkd_num_{n}', str(n), 0.06, M['stencil'], (cx, 1.42, zf + 0.028), 'z+'),
              tbox(f'lkd_handle_{n}', x1 - 0.09, x1 - 0.06, 0.95, 1.15, zf + 0.022, zf + 0.045, M['steel'])]
        if n == 5:  # padlocked
            d += [tbox('padlock_5', x1 - 0.1, x1 - 0.04, 0.82, 0.88, zf + 0.03, zf + 0.06, M['brass']),
                  ttorus('padlock_5_shackle', (x1 - 0.07, 0.9, zf + 0.045), 0.022, 0.005, 'z', M['steel'], (10, 5))]
        for q in d:
            wuv(q)
        door = J(f'Locker_{n}_Door', d, (x0, 0, zf))
        parent(door, body)
    col_box('COL_Lockers', -14.9, -11.0, zb, zf + 0.03, mat=M['col'])


def small_key():
    p = [ttorus('key_bow', (-0.025, 0.004, 0), 0.012, 0.0035, 'y', M['brass'], (16, 6)),
         tcyl('key_shaft', (0.01, 0.004, 0), 0.003, 0.045, 'x', M['brass'], 8),
         tbox('key_bit', 0.026, 0.034, 0.002, 0.006, 0.0, 0.012, M['brass']),
         tquad('key_tag', [(-0.09, 0.002, 0.005), (-0.045, 0.002, 0.0), (-0.042, 0.002, 0.03), (-0.087, 0.002, 0.035)], M['plain_paper'])]
    key = J('SmallKey', p)
    h = hit('HIT_SmallKey', (0, 0.04, 0), (0.24, 0.08, 0.24))
    parent(h, key)
    place(key, (9.0, 1.003, 10.7), 0.7)


# ------------------------------------------------------------------ hangar dressing
def loft():
    W = M['wood']
    x0, x1, z0, z1, y = -15.0, -7.0, -12.0, -8.0, 3.49
    p = [wuv(tbox('loft_floor', x0, x1, y - 0.18, y, z0, z1, W))]
    for x in [x0 + 0.5 + i * 1.5 for i in range(6)]:
        p.append(tbeam(f'joist_{x}', (x, y - 0.3, z0), (x, y - 0.3, z1), 0.1, 0.22, W))
    p.append(tbeam('loft_beam', (x0, y - 0.3, z1 - 0.07), (x1, y - 0.3, z1 - 0.07), 0.14, 0.26, W))
    for x in (x1 - 0.12, -11.0, x0 + 0.12):
        p.append(tbeam(f'loft_post_{x}', (x, 0, z1 - 0.12), (x, y - 0.3, z1 - 0.12), 0.2, 0.2, W, up=(1, 0, 0)))
    p.append(tbeam('loft_post_back', (x1 - 0.12, 0, z0 + 0.12), (x1 - 0.12, y - 0.3, z0 + 0.12), 0.2, 0.2, W, up=(1, 0, 0)))
    ry = y + 1.0
    p += [tbeam('rail_a', (x0, ry, z1 - 0.06), (-9.2, ry, z1 - 0.06), 0.07, 0.07, W),
          tbeam('rail_b', (-8.2, ry, z1 - 0.06), (x1, ry, z1 - 0.06), 0.07, 0.07, W),
          tbeam('rail_c', (x1 - 0.06, ry, z1), (x1 - 0.06, ry, z0), 0.07, 0.07, W)]
    for x in [x0 + 0.4 + i * 0.8 for i in range(10)]:
        if not -9.2 < x < -8.2:
            p.append(tbeam(f'bal_{x:.1f}', (x, y, z1 - 0.06), (x, ry, z1 - 0.06), 0.05, 0.05, W, up=(1, 0, 0)))
    for z in [z0 + 0.4 + i * 0.8 for i in range(5)]:
        p.append(tbeam(f'bal_s_{z:.1f}', (x1 - 0.06, y, z), (x1 - 0.06, ry, z), 0.05, 0.05, W, up=(1, 0, 0)))
    # ladder
    lx, zb, zt = -8.7, z1 + 0.85, z1 - 0.02
    for dx in (-0.22, 0.22):
        p.append(tbeam(f'ladder_rail_{dx}', (lx + dx, 0, zb), (lx + dx, y + 0.95, zt), 0.06, 0.08, W, up=(0, 0, 1)))
    for i in range(1, 14):
        t = i / 14
        p.append(tbeam(f'rung_{i}', (lx - 0.22, t * (y + 0.95), zb + (zt - zb) * t), (lx + 0.22, t * (y + 0.95), zb + (zt - zb) * t), 0.035, 0.035, W))
    # stored things
    p += [wuv(tbox('loft_crate_a', -14.1, -13.1, y, y + 0.8, -11.6, -10.8, W)),
          wuv(tbox('loft_crate_b', -12.75, -12.05, y, y + 0.6, -11.65, -10.95, W)),
          tbox('suitcase', -11.1, -10.2, y, y + 0.3, -11.7, -11.2, M['leather']),
          tsphere('loft_tarp', (-8.6, y, -10.6), 0.8, M['tarp'], (14, 7), (1.2, 0.7, 0.9))]
    J('Loft', p)
    for x in (x1 - 0.12, -11.0, x0 + 0.12):
        col_box(f'COL_LoftPost_{x}', x - 0.12, x + 0.12, z1 - 0.24, z1, mat=M['col'])
    col_box('COL_LoftPost_back', x1 - 0.24, x1, z0, z0 + 0.24, mat=M['col'])
    col_box('COL_Ladder', lx - 0.27, lx + 0.27, zt, zb + 0.05, mat=M['col'])


def drum(name, x, z, mat_key, lying=False, ry=0.0):
    m = material(f'Drum_{mat_key}', color={'red': (0.32, 0.09, 0.06), 'olive': (0.18, 0.2, 0.12), 'black': (0.05, 0.05, 0.05), 'brown': (0.25, 0.14, 0.07)}[mat_key], rough=0.55, metal=0.45) \
        if f'Drum_{mat_key}' not in bpy.data.materials else bpy.data.materials[f'Drum_{mat_key}']
    p = [tcyl(f'{name}_body', (0, 0.44, 0), 0.29, 0.88, 'y', m, 24),
         ttorus(f'{name}_rib1', (0, 0.22, 0), 0.292, 0.012, 'y', m, (24, 5)),
         ttorus(f'{name}_rib2', (0, 0.66, 0), 0.292, 0.012, 'y', m, (24, 5)),
         tcyl(f'{name}_bung', (0.15, 0.885, 0.05), 0.03, 0.01, 'y', M['steel'], 10)]
    ob = J(name, p)
    if lying:
        ob.rotation_euler = (0, math.pi / 2, ry)
        ob.location = T((x, 0.29, z))
    else:
        place(ob, (x, 0, z), ry)
    COL(f'COL_{name}', ob)


def crate(name, size, pos, ry=0.0, label=True):
    s = size
    W = M['wood']
    p = [wuv(tbox(f'{name}_box', -s / 2, s / 2, 0, s, -s / 2, s / 2, W))]
    e = 0.04
    for a in (-1, 1):
        for b in (-1, 1):
            p.append(wuv(tbox(f'{name}_edge_v_{a}{b}', a * s / 2 - e if a > 0 else -s / 2, a * s / 2 if a > 0 else -s / 2 + e, 0, s,
                              b * s / 2 - e if b > 0 else -s / 2, b * s / 2 if b > 0 else -s / 2 + e, W)))
    if label:
        txt = '\n'.join(SIGNS['crate'])
        p.append(ttext(f'{name}_st_s', txt, s * 0.14, M['stencil'], (0, s * 0.55, s / 2 + 0.003), 'z+'))
        p.append(ttext(f'{name}_st_e', txt, s * 0.14, M['stencil'], (s / 2 + 0.003, s * 0.55, 0), 'x+'))
    ob = J(name, p)
    place(ob, pos, ry)
    if pos[1] < 0.5:
        COL(f'COL_{name}', ob)
    return ob


# ------------------------------------------------------------------ layout helpers
def offset_group(fn, dx, dz):
    """Run a builder written for the old 30 m hangar and shift everything it made by (dx, dz) in game coords."""
    before = set(bpy.data.objects.keys())
    fn()
    update()
    for ob in bpy.data.objects:
        if ob.name not in before and ob.parent is None:
            ob.location.x += dx
            ob.location.y -= dz  # Blender y = -game z


# ------------------------------------------------------------------ hangar lighting
def hanging_lamp(n, x, z, light=None):
    top, shade_y = 8.85, 6.3
    parts = [
        tcyl_dir(f'cord_{n}', (x, shade_y + 0.18, z), (x, top, z), 0.007, M['iron'], 6),
        tcyl(f'shade_{n}', (x, shade_y, z), 0.42, 0.32, 'y', M['enamel'], 24, r2=0.07, cap=False),
        tcyl(f'shade_in_{n}', (x, shade_y - 0.005, z), 0.41, 0.31, 'y', M['enamel_in'], 24, r2=0.065, cap=False),
        tcyl(f'socket_{n}', (x, shade_y + 0.12, z), 0.05, 0.12, 'y', M['brass'], 10),
    ]
    lamp = J(f'Lamp_{n}', parts, (x, top, z))
    lamp['sway'] = 1
    bulb = tsphere(f'Bulb_{n}', (x, shade_y - 0.03, z), 0.06, M['bulb' if light else 'bulb_dead'])
    parent(bulb, lamp)
    if light:
        mk = marker(f'LIGHT_{n}', T((x, shade_y - 0.1, z)), {'distance': 28, 'angle': 1.0, **light, 'bulb': f'Bulb_{n}'}, 'Props')
        parent(mk, lamp)


def lamps():
    # lamps hang from the truss bottom chords (trusses at z = -10, -5, 0, 5, 10)
    hanging_lamp(1, -8, -5, {'light': 'spot', 'intensity': 130, 'shadow': 1})
    hanging_lamp(2, 3.5, 0, {'light': 'spot', 'intensity': 120, 'shadow': 1, 'flicker': 1})
    hanging_lamp(3, 12, -5, None)
    hanging_lamp(4, 0, 10, {'light': 'spot', 'intensity': 55})
    hanging_lamp(5, -14, 5, {'light': 'spot', 'intensity': 80})
    hanging_lamp(6, 14, 5, {'light': 'spot', 'intensity': 80})
    hanging_lamp(7, -2, -10, {'light': 'spot', 'intensity': 60})
    hanging_lamp(8, 8, 10, None)


def bench_lamp(name, x_wall, z, light):
    sx = 1 if x_wall < 0 else -1  # arm points into the room
    p = [tbeam(f'{name}_arm', (x_wall, 2.7, z), (x_wall + sx * 0.58, 2.6, z), 0.025, 0.025, M['iron']),
         tcyl(f'{name}_shade', (x_wall + sx * 0.6, 2.5, z), 0.2, 0.17, 'y', M['enamel'], 18, r2=0.04, cap=False),
         tcyl(f'{name}_shade_in', (x_wall + sx * 0.6, 2.495, z), 0.19, 0.16, 'y', M['enamel_in'], 18, r2=0.035, cap=False),
         tsphere(f'{name}_bulb', (x_wall + sx * 0.6, 2.44, z), 0.035, M['bulb'])]
    J(name, p)
    if light:
        marker(f'LIGHT_{name}', T((x_wall + sx * 0.6, 2.36, z)), {'light': 'point', 'intensity': 7, 'distance': 6, 'color': '#ffc27a'}, 'Props')


# ------------------------------------------------------------------ new clutter for the 40 m hangar
def engine_on_stand(pos, ry):
    R_ = M['red']
    p = [tbox('es_base', -0.7, 0.7, 0.12, 0.2, -0.5, 0.5, R_)]
    for dx in (-0.6, 0.6):
        for dz in (-0.4, 0.4):
            p.append(tcyl(f'caster_{dx}_{dz}', (dx, 0.06, dz), 0.06, 0.05, 'z', M['rubber'], 12))
    for dx in (-0.45, 0.45):
        p.append(tbeam(f'es_post_{dx}', (dx, 0.2, 0), (dx, 1.3, 0), 0.08, 0.08, R_, up=(1, 0, 0)))
    p.append(tbeam('es_cross', (-0.5, 1.3, 0), (0.5, 1.3, 0), 0.08, 0.08, R_))
    cy, cz = 1.5, 0.15
    p += [tcyl('crankcase', (0, cy, cz), 0.32, 0.34, 'z', M['steel'], 24),
          tcyl('nose', (0, cy, cz + 0.3), 0.26, 0.26, 'z', M['alu'], 20, r2=0.14),
          tcyl('shaft', (0, cy, cz + 0.52), 0.05, 0.2, 'z', M['steel'], 10),
          ttorus('exhaust_ring', (0, cy, cz - 0.2), 0.62, 0.04, 'z', M['iron'], (28, 6)),
          ttorus('lift_eye', (0, cy + 0.42, cz), 0.06, 0.015, 'x', M['steel'], (12, 5))]
    for i in range(9):
        a = i / 9 * math.tau
        d = (math.cos(a), math.sin(a))
        at = lambda r: (d[0] * r, cy + d[1] * r, cz)  # noqa: E731
        p.append(tcyl_dir(f'barrel_{i}', at(0.28), at(0.68), 0.1, M['steel'], 12))
        for f in range(5):
            r0 = 0.32 + f * 0.07
            p.append(tcyl_dir(f'fin_{i}_{f}', at(r0), at(r0 + 0.014), 0.135, M['iron'], 12))
        p.append(tcyl_dir(f'head_{i}', at(0.68), at(0.8), 0.11, M['alu'], 10))
        p.append(tcyl_dir(f'rod_{i}', (d[0] * 0.3, cy + d[1] * 0.3, cz + 0.12), (d[0] * 0.72, cy + d[1] * 0.72, cz + 0.1), 0.012, M['alu'], 6))
    eng = J('EngineStand', p)
    place(eng, pos, ry)
    COL('COL_Engine', eng)
    oil = tcyl('oil_pool', (0, 0.003, 0), 0.8, 0.004, 'y', M['oil'], 28)
    oil.scale = (1.0, 0.6, 1.0)
    place(oil, (pos[0] + 0.4, 0, pos[2] + 0.5), 0.3)
    oil.name = 'OilPool_Engine'


def aircraft_frame():
    """A half-stripped 1930s high-wing monoplane: steel-tube fuselage, partly covered, engine and wings removed."""
    tube, can = M['tube'], M['canvas']
    xs = [4.8, 3.8, 2.8, 1.8, 0.8, -0.4, -1.6, -2.8, -4.0]
    k = lambda x: (4.8 - x) / 8.8  # noqa: E731  0 at the firewall, 1 at the tail post
    hw = lambda x: 0.5 - 0.44 * k(x)  # noqa: E731
    top = lambda x: 2.25 - 0.7 * k(x)  # noqa: E731
    bot = lambda x: 1.15 + 0.1 * k(x)  # noqa: E731
    C = lambda x, s, up: (x, top(x) if up else bot(x), s * hw(x))  # noqa: E731
    p = []
    r = 0.022
    for s in (-1, 1):
        for up in (0, 1):
            for a, b in zip(xs, xs[1:]):
                p.append(tcyl_dir(f'long_{s}_{up}_{a}', C(a, s, up), C(b, s, up), r, tube, 8))
    for i, x in enumerate(xs):
        for s in (-1, 1):
            p.append(tcyl_dir(f'vert_{s}_{x}', C(x, s, 0), C(x, s, 1), r * 0.8, tube, 8))
        for up in (0, 1):
            p.append(tcyl_dir(f'cross_{up}_{x}', C(x, -1, up), C(x, 1, up), r * 0.8, tube, 8))
        if i + 1 < len(xs):
            b = xs[i + 1]
            for s in (-1, 1):
                p.append(tcyl_dir(f'diag_{s}_{x}', C(x, s, i % 2), C(b, s, 1 - i % 2), r * 0.7, tube, 8))
            p.append(tcyl_dir(f'diag_top_{x}', C(x, -1, 1), C(b, 1, 1), r * 0.7, tube, 8))
    # fabric still on the rear left side, torn strips on the right
    for a, b in zip(xs[5:], xs[6:]):
        p.append(tquad(f'skin_l_{a}', [C(a, -1, 0), C(b, -1, 0), C(b, -1, 1), C(a, -1, 1)], can))
    for a, b in ((-1.6, -2.8),):
        ya, yb = bot(a) + 0.15, bot(b) + 0.15
        p.append(tquad('skin_r_strip', [(a, ya, hw(a)), (b, yb, hw(b)), (b, yb + 0.25, hw(b)), (a, ya + 0.3, hw(a))], can))
    p.append(tquad('skin_top', [C(-0.4, -1, 1), C(-0.4, 1, 1), C(-1.6, 1, 1), C(-1.6, -1, 1)], can))
    # firewall and empty engine mount
    p.append(tbox('firewall', 4.8, 4.83, bot(4.8), top(4.8), -hw(4.8), hw(4.8), M['alu']))
    for s in (-1, 1):
        for up in (0, 1):
            p.append(tcyl_dir(f'mount_{s}_{up}', C(4.8, s, up), (5.3, 1.7 + (0.25 if up else -0.25), s * 0.25), 0.018, tube, 8))
    p.append(ttorus('mount_ring', (5.3, 1.7, 0), 0.35, 0.025, 'x', tube, (24, 6)))
    # cockpit
    p += [tbox('seat', 1.55, 1.95, 1.3, 1.36, -0.32, 0.32, M['leather']),
          tbox('seat_back', 1.5, 1.56, 1.36, 1.9, -0.32, 0.32, M['leather']),
          tcyl_dir('stick', (2.3, 1.25, 0), (2.25, 1.75, 0.02), 0.015, M['iron'], 8),
          tbox('panel', 2.75, 2.8, 1.65, 2.05, -0.4, 0.4, M['pwood'])]
    for j, zz in enumerate((-0.25, 0.0, 0.25)):
        p.append(tcyl(f'dial_{j}', (2.74, 1.86, zz), 0.045, 0.02, 'x', M['bakelite'], 14))
    # wing-root fittings on the top longerons
    for x in (3.3, 1.3):
        for s in (-1, 1):
            p.append(tbox(f'wing_fit_{x}_{s}', x - 0.08, x + 0.08, top(x), top(x) + 0.06, s * hw(x) - 0.05, s * hw(x) + 0.05, M['steel']))
    # tail: fin + rudder outline (covered), stabilisers (left covered, right bare)
    tx, tt = -4.0, top(-4.0)
    fin = [(tx + 1.0, tt, 0), (tx, tt + 1.0, 0), (tx - 0.45, tt + 0.9, 0), (tx - 0.5, bot(tx) - 0.05, 0)]
    for a, b in zip(fin, fin[1:]):
        p.append(tcyl_dir(f'fin_{a[0]:.2f}', a, b, 0.016, tube, 8))
    p.append(tquad('fin_skin', [(tx + 1.0, tt, 0), (tx, tt + 1.0, 0), (tx - 0.45, tt + 0.9, 0), (tx - 0.5, tt, 0)], can))
    for s in (-1, 1):
        st = [(tx + 0.9, tt - 0.05, s * 0.15), (tx + 0.4, tt - 0.05, s * 1.6), (tx - 0.35, tt - 0.05, s * 1.6), (tx - 0.45, tt - 0.05, s * 0.1)]
        for a, b in zip(st, st[1:]):
            p.append(tcyl_dir(f'stab_{s}_{a[0]:.2f}', a, b, 0.014, tube, 8))
        for q in range(1, 4):
            zq = s * 0.4 * q
            p.append(tcyl_dir(f'stab_rib_{s}_{q}', (tx + 0.75 - 0.1 * q, tt - 0.05, zq), (tx - 0.38, tt - 0.05, zq), 0.008, tube, 6))
        if s < 0:
            p.append(tquad('stab_skin', st, can))
    # landing gear and tail skid
    for s in (-1, 1):
        axle = (3.6, 0.36, s * 1.15)
        p.append(tcyl_dir(f'gear_a_{s}', C(3.8, s, 0), axle, 0.03, tube, 8))
        p.append(tcyl_dir(f'gear_b_{s}', C(2.8, s, 0), axle, 0.03, tube, 8))
        p.append(tcyl_dir(f'gear_c_{s}', (3.3, bot(3.3), 0), axle, 0.025, tube, 8))
        p.append(ttorus(f'tyre_{s}', (3.6, 0.36, s * 1.22), 0.27, 0.09, 'z', M['rubber'], (24, 10)))
        p.append(tcyl(f'hub_{s}', (3.6, 0.36, s * 1.22), 0.17, 0.12, 'z', M['alu'], 16))
    p.append(tcyl_dir('tail_skid', (tx + 0.1, bot(tx), 0), (tx - 0.3, 0.03, 0), 0.025, M['steel'], 8))
    frame = J('AircraftFrame', p)
    COL('COL_AircraftFrame_Body', [frame])
    oil = tcyl('oil_pool_plane', (4.4, 0.003, 0.3), 0.6, 0.004, 'y', M['oil'], 24)
    oil.name = 'OilPool_Plane'


def wall_bench(name, wall, a0, a1, light=False):
    """Tool bench against the north wall (wall='n', a = x range) or east wall (wall='e', a = z range)."""
    W = M['wood']

    def P(a, y, d):  # a along the wall, d = distance out from the wall face
        return (a, y, -12.5 + d) if wall == 'n' else (20.0 - d, y, a)

    def B(nm, a_0, a_1, y0, y1, d0, d1, mat):
        (x0, _, z0), (x1, _, z1) = P(a_0, 0, d0), P(a_1, 0, d1)
        return wuv(tbox(nm, min(x0, x1), max(x0, x1), y0, y1, min(z0, z1), max(z0, z1), mat))
    p = [B(f'{name}_top', a0, a1, 0.86, 0.94, 0.02, 0.95, W), B(f'{name}_shelf', a0 + 0.1, a1 - 0.1, 0.23, 0.27, 0.07, 0.9, W)]
    for a in (a0 + 0.06, a1 - 0.06):
        for d in (0.08, 0.88):
            p.append(B(f'{name}_leg_{a:.2f}_{d}', a - 0.04, a + 0.04, 0, 0.86, d - 0.04, d + 0.04, W))
    p.append(B(f'{name}_peg', a0 + 0.2, a1 - 0.2, 1.15, 2.35, 0.0, 0.03, M['card']))
    for i in range(int((a1 - a0 - 0.6) / 0.3)):
        a = a0 + 0.35 + i * 0.3
        L = 0.22 + (i % 3) * 0.06
        p.append(tbeam(f'{name}_tool_{i}', P(a, 1.95 - L / 2, 0.045), P(a, 1.95 + L / 2, 0.045), 0.035, 0.012, M['steel'], up=(1, 0, 0) if wall == 'e' else (0, 0, 1)))
    am = (a0 + a1) / 2
    p += [B(f'{name}_vise', a1 - 0.5, a1 - 0.3, 0.94, 1.06, 0.75, 0.95, M['grey']),
          tcyl(f'{name}_can', P(a0 + 0.5, 1.04, 0.4), 0.08, 0.2, 'y', M['red'], 14, r2=0.06),
          B(f'{name}_box', am - 0.2, am + 0.25, 0.94, 1.12, 0.2, 0.5, M['olive']),
          tcyl(f'{name}_jar', P(am + 0.6, 1.0, 0.3), 0.05, 0.12, 'y', M['clearglass'], 10)]
    ob = J(name, p)
    COL(f'COL_{name}', [ob])


def shelving_unit(name, x0, x1, z0, z1):
    G = M['grey']
    p = []
    for x in (x0, x1 - 0.04):
        for z in (z0, z1 - 0.04):
            p.append(tbox(f'{name}_post_{x}_{z}', x, x + 0.04, 0, 2.2, z, z + 0.04, G))
    for k, y in enumerate((0.1, 0.65, 1.2, 1.75, 2.15)):
        p.append(wuv(tbox(f'{name}_shelf_{k}', x0, x1, y, y + 0.03, z0, z1, G)))
        x = x0 + 0.05
        while x < x1 - 0.25 and k < 4:
            w = R.uniform(0.15, 0.4)
            h = R.uniform(0.12, 0.38)
            if R.random() < 0.5:
                p.append(tbox(f'{name}_box_{k}_{x:.2f}', x, x + w, y + 0.03, y + 0.03 + h, z0 + 0.05, z1 - 0.05, M['card']))
            else:
                p.append(tcyl(f'{name}_can_{k}_{x:.2f}', (x + w / 2, y + 0.03 + h / 2, (z0 + z1) / 2), min(w / 2, 0.12), h, 'y', M['red' if R.random() < 0.5 else 'olive'], 12))
            x += w + 0.05
    COL(f'COL_{name}', J(name, p))


def chain(name, x, z, y_top, y_bot, hook=True):
    p = []
    n = int((y_top - y_bot) / 0.075)
    for i in range(n):
        p.append(ttorus(f'{name}_l{i}', (x, y_top - i * 0.075, z), 0.03, 0.007, 'x' if i % 2 else 'z', M['iron'], (10, 5)))
    if hook:
        p.append(ttorus(f'{name}_hook', (x, y_bot - 0.05, z), 0.07, 0.016, 'z', M['steel'], (14, 6)))
    return p


def hangar_dressing():
    # chain hoist over the engine stand, two loose chains from the trusses
    J('ChainHoist', [tbox('hoist_body', 8.35, 8.65, 7.9, 8.4, -0.12, 0.12, M['grey']),
                     tcyl('hoist_wheel', (8.5, 8.15, 0.16), 0.2, 0.04, 'z', M['grey'], 18),
                     tbeam('hoist_hang', (8.5, 8.4, 0), (8.5, 8.85, 0), 0.05, 0.05, M['steel'])]
      + chain('hoist', 8.5, 0.0, 7.85, 2.7) + chain('hoist_loop', 8.62, 0.2, 7.85, 5.6, hook=False))
    J('HangingChain_1', chain('c1', -6.0, -10.0, 8.7, 4.4))
    J('HangingChain_2', chain('c2', 13.0, 5.0, 8.7, 5.2))
    engine_on_stand((8.5, 0, 0.6), -0.4)
    aircraft_frame()

    # wing panel on trestles
    W = M['wood']
    p = [tbox('wing', -8.5, -3.5, 1.0, 1.1, -5.7, -4.3, M['canvas']),
         tcyl('wing_le', (-6.0, 1.05, -4.3), 0.05, 5.0, 'x', M['canvas'], 12)]
    for k in range(11):
        x = -8.45 + k * 0.49
        p.append(tbox(f'rib_{k}', x - 0.015, x + 0.015, 1.1, 1.115, -5.68, -4.32, M['canvas']))
    for x in (-7.8, -4.2):
        for dz in (-0.35, 0.35):
            p.append(tbeam(f'tr_leg_{x}_{dz}', (x - 0.3, 0, -5.0 + dz), (x, 0.98, -5.0 + dz), 0.06, 0.06, W, up=(0, 0, 1)))
            p.append(tbeam(f'tr_leg2_{x}_{dz}', (x + 0.3, 0, -5.0 + dz), (x, 0.98, -5.0 + dz), 0.06, 0.06, W, up=(0, 0, 1)))
        p.append(tbeam(f'tr_top_{x}', (x, 0.98, -5.45), (x, 0.98, -4.55), 0.1, 0.06, W))
    COL('COL_Wing', J('WingSection', p))

    # tool cart beside the aircraft
    p = [wuv(tbox('cart_top', 5.9, 6.9, 0.8, 0.84, -2.2, -1.6, M['grey'])),
         wuv(tbox('cart_shelf', 5.9, 6.9, 0.25, 0.28, -2.2, -1.6, M['grey'])),
         tbeam('cart_handle', (5.85, 0.95, -2.15), (5.85, 0.95, -1.65), 0.03, 0.03, M['steel']),
         tbox('cart_tools', 6.1, 6.7, 0.84, 0.9, -2.05, -1.75, M['red'])]
    for x in (5.95, 6.85):
        for z in (-2.15, -1.65):
            p.append(tbeam(f'cart_leg_{x}_{z}', (x, 0.1, z), (x, 0.84, z), 0.03, 0.03, M['grey'], up=(1, 0, 0)))
            p.append(tcyl(f'cart_wheel_{x}_{z}', (x, 0.06, z), 0.06, 0.04, 'z', M['rubber'], 12))
    COL('COL_ToolCart', J('ToolCart', p))

    # step ladder by the fuselage
    p = []
    for dz in (-0.35, 0.35):
        for dx in (-0.25, 0.25):
            p.append(tbeam(f'stl_{dz}_{dx}', (dx, 0, dz), (dx, 1.5, 0), 0.05, 0.04, W, up=(0, 0, 1)))
    for k in range(1, 5):
        y = k * 0.3
        zz = -0.35 + 0.35 * y / 1.5
        p.append(tbox(f'step_{k}', -0.27, 0.27, y - 0.02, y + 0.02, zz - 0.06, zz + 0.06, W))
    step = J('StepLadder', p)
    place(step, (1.4, 0, 1.7), 0.3)
    COL('COL_StepLadder', step)

    # benches and shelving along the walls
    wall_bench('Workbench_North', 'n', -4.6, -1.0)
    wall_bench('Workbench_East', 'e', 5.4, 8.6)
    bench_lamp('BenchLamp_East', 20.0, 7.0, False)
    shelving_unit('Shelving_N1', 5.4, 7.4, -12.48, -12.0)
    shelving_unit('Shelving_N2', 7.8, 9.8, -12.48, -12.0)
    shelving_unit('Shelving_W', -14.6, -12.6, -12.48, -12.0)

    # drums, fuel cans, tyres, crates
    for nm, x, z, m in (('Drum_1', 18.6, 10.6, 'red'), ('Drum_2', 19.2, 11.3, 'olive'), ('Drum_3', 18.5, 11.5, 'red'),
                        ('Drum_4', 17.9, 10.9, 'brown'), ('Drum_5', -18.8, 6.3, 'olive'), ('Drum_6', -19.25, 7.0, 'red'),
                        ('Drum_7', -18.55, 7.15, 'black'), ('Drum_8', 12.2, -1.2, 'black'), ('Drum_9', 12.75, -0.8, 'olive')):
        drum(nm, x, z, m, ry=R.uniform(0, 3))
    drum('Drum_10', -17.3, 6.6, 'brown', lying=True, ry=0.25)
    for i, z in enumerate((7.9, 8.3, 8.7)):
        p = [tbox(f'jc_{i}', -0.08, 0.08, 0, 0.47, -0.17, 0.17, M['olive']),
             tbeam(f'jc_h_{i}', (0, 0.5, -0.08), (0, 0.5, 0.08), 0.03, 0.03, M['olive'])]
        place(J(f'JerryCan_{i}', p), (-19.65, 0, z), R.uniform(-0.2, 0.2))
    col_box('COL_JerryCans', -19.85, -19.45, 7.65, 8.95, mat=M['col'])
    p = []
    for k in range(4):
        p.append(ttorus(f'tyre_{k}', (16.8, 0.14 + k * 0.28, 9.0), 0.32, 0.13, 'y', M['rubber'], (24, 10)))
        p.append(tcyl(f'hub_{k}', (16.8, 0.14 + k * 0.28, 9.0), 0.2, 0.18, 'y', M['alu'], 16))
    COL('COL_Tyres', J('TyreStack', p))
    p = [ttorus('tyre_lean', (16.0, 0.42, 9.6), 0.32, 0.13, 'x', M['rubber'], (24, 10)),
         tcyl('hub_lean', (16.0, 0.42, 9.6), 0.2, 0.18, 'x', M['alu'], 16)]
    COL('COL_TyreLean', J('TyreLeaning', p))
    crate('Crate_4', 0.9, (-8.5, 0, -11.6), 0.2)
    crate('Crate_5', 1.0, (11.9, 0, -11.6), -0.1)
    crate('Crate_6', 0.7, (11.85, 1.0, -11.55), 0.35, label=False)
    crate('Crate_7', 1.1, (-11.5, 0, 3.0), 0.5)

    # the mechanics' corner: a small pot-bellied stove, warm, with seats and coffee
    I = M['iron']
    sx, sz = -17.2, -7.0
    p = [tcyl('stove_body', (sx, 0.55, sz), 0.3, 0.6, 'y', I, 18, r2=0.24),
         tcyl('stove_top', (sx, 0.9, sz), 0.24, 0.1, 'y', I, 18),
         tcyl_dir('flue_up', (sx, 0.95, sz), (sx, 4.2, sz), 0.08, I, 12),
         tcyl_dir('flue_out', (sx, 4.2, sz), (-20.0, 4.2, sz), 0.08, I, 12),
         tsphere('flue_elbow', (sx, 4.2, sz), 0.085, I, (10, 6)),
         tbox('stove_grate', sx + 0.27, sx + 0.3, 0.35, 0.55, sz - 0.12, sz + 0.12, M['ember']),
         tcyl('coffee', (sx - 0.05, 1.05, sz + 0.05), 0.07, 0.2, 'y', M['alu'], 14, r2=0.055),
         tcyl('scuttle', (sx + 0.55, 0.18, sz - 0.6), 0.16, 0.36, 'y', M['iron'], 14, r2=0.2)]
    for k in range(3):
        a = k / 3 * math.tau
        p.append(tbeam(f'stove_leg_{k}', (sx + 0.18 * math.cos(a), 0.25, sz + 0.18 * math.sin(a)),
                       (sx + 0.25 * math.cos(a), 0.0, sz + 0.25 * math.sin(a)), 0.04, 0.04, I))
    COL('COL_Stove', J('HangarStove', p), 0.1)
    marker('LIGHT_Stove', T((sx + 0.6, 0.5, sz)), {'light': 'point', 'intensity': 2.2, 'distance': 3.2, 'color': '#ff7a30'}, 'Props')
    crate('Seat_Crate', 0.5, (-16.1, 0, -6.3), 0.4, label=False)
    p = [tbox('chair_seat', -0.22, 0.22, 0.44, 0.48, -0.22, 0.22, W),
         tbox('chair_back', -0.22, 0.22, 0.48, 0.95, -0.24, -0.2, W)]
    for dx in (-0.19, 0.19):
        for dz in (-0.19, 0.19):
            p.append(tbeam(f'chair_leg_{dx}_{dz}', (dx, 0, dz), (dx, 0.44, dz), 0.035, 0.035, W, up=(1, 0, 0)))
    chair = J('StoveChair', p)
    place(chair, (-17.9, 0, -5.9), 2.6)
    COL('COL_StoveChair', chair)

    # fire point, hose reel, propeller on the east wall
    p = [tbox('fire_board', 19.86, 19.89, 1.55, 2.45, -4.2, -3.0, M['sign_red']),
         ttext('fire_text', '\n'.join(SIGNS['fire']), 0.16, M['white_paint'], (19.855, 2.25, -3.6), 'x-')]
    for k, dz in enumerate((-0.4, 0.0, 0.4)):
        p.append(tcyl(f'bucket_{k}', (19.7, 1.3, -3.6 + dz), 0.14, 0.26, 'y', M['red'], 16, r2=0.1))
        p.append(tbeam(f'hook_{k}', (19.86, 1.5, -3.6 + dz), (19.72, 1.5, -3.6 + dz), 0.02, 0.02, M['iron']))
    COL('COL_FireBuckets', J('FirePoint', p))
    J('HoseReel', [tcyl('reel', (19.65, 1.2, -1.3), 0.28, 0.14, 'x', M['red'], 20),
                   ttorus('hose', (19.62, 1.2, -1.3), 0.24, 0.035, 'x', M['rubber'], (24, 8)),
                   tbeam('reel_bracket', (19.98, 1.2, -1.3), (19.62, 1.2, -1.3), 0.05, 0.05, M['iron'])])
    col_box('COL_HoseReel', 19.4, 20.0, -1.6, -1.0, mat=M['col'])
    prop = J('Propeller', [tbeam('blade', (19.55, 0.05, 4.0), (19.78, 2.75, 4.0), 0.2, 0.05, M['pwood'], up=(1, 0, 0)),
                           tcyl_dir('prop_hub', (19.55, 1.4, 4.0), (19.8, 1.43, 4.0), 0.11, M['alu'], 14)])
    COL('COL_Propeller', prop, 0.05)

    # signs and the faded company name on the north wall
    J('NoSmokingSign', [tbox('ns_plate', -3.4, -2.2, 2.55, 3.05, -12.495, -12.48, M['sign_cream']),
                        ttext('ns_text', '\n'.join(SIGNS['noSmoking']), 0.12, M['stencil'], (-2.8, 2.8, -12.478), 'z+')])
    J('CompanyName', [ttext('banner', SIGNS['wallBanner'][0], 0.5, M['paint_cream'], (0, 7.9, -12.49), 'z+')])

    # sandbags against the main door, tarp pile, broom and bucket by the office
    p = []
    for side in (-1, 1):
        for row in range(2):
            for k in range(4 - row):
                x = side * (9.6 + k * 0.62 + row * 0.31)
                p.append(tbox(f'sb_{side}_{row}_{k}', x - 0.3, x + 0.3, row * 0.17, row * 0.17 + 0.18, 11.2, 11.56, M['sandbag']))
    J('Sandbags', p)
    for side in (-1, 1):
        a, b = sorted((side * 9.25, side * 11.85))
        col_box(f'COL_Sandbags_{side}', a, b, 11.15, 11.6, mat=M['col'])
    pile = J('TarpPile', [tsphere('pile_tarp', (-9.5, 0, 8.5), 1.0, M['tarp'], (16, 8), (1.1, 0.95, 0.8)),
                          tbox('pile_rope', -10.6, -8.4, 0.55, 0.58, 8.48, 8.52, M['sandbag'])])
    COL('COL_TarpPile', pile)
    J('Broom', [tcyl_dir('broom_stick', (12.75, 0.12, -8.25), (12.84, 1.45, -8.3), 0.014, M['wood'], 8),
                tbox('broom_head', 12.6, 12.9, 0.0, 0.14, -8.32, -8.18, M['tarp'])])
    J('Bucket', [tcyl('bucket', (12.55, 0.15, -8.75), 0.15, 0.3, 'y', M['alu'], 16, r2=0.12)])
    col_box('COL_Bucket', 12.38, 12.72, -8.92, -8.58, mat=M['col'])


def se_corner():
    """Crates in the south-east corner (old 30 m layout coords, shifted by offset_group)."""
    crate('Crate_1', 1.2, (10.4, 0, 10.6), 0.1)
    crate('Crate_2', 1.0, (9.1, 0, 10.8), -0.15)
    crate('Crate_3', 0.8, (10.3, 1.2, 10.55), 0.4, label=False)


def build():
    reset_scene(['Props', 'Collision'])
    print('Generating textures...')
    materials()
    print('Building props...')
    lamps()
    # practice objects and older pieces, moved from the 30 m layout to their new places
    offset_group(workbench, -5.0, -2.5)
    offset_group(toolbox, -5.0, -2.5)
    offset_group(parts_cabinet, -5.0, -1.9)
    offset_group(lockers, -5.0, -0.5)
    offset_group(loft, -5.0, -0.5)
    offset_group(se_corner, 5.0, 0.5)
    offset_group(office, 5.0, -0.5)
    hangar_dressing()


# ------------------------------------------------------------------ Pryce's office (furniture only; M3 adds the crime scene)
def office():
    PW = M['pwood']
    # partner desk facing the door
    p = [wuv(tbox('desk_top', 10.9, 12.7, 0.74, 0.78, -9.85, -8.95, PW))]
    for a, b in ((10.95, 11.4), (12.2, 12.65)):
        p.append(wuv(tbox(f'ped_{a}', a, b, 0, 0.74, -9.83, -8.97, PW)))
        for k in range(3):
            y = 0.08 + k * 0.22
            p.append(wuv(tbox(f'drw_{a}_{k}', a + 0.02, b - 0.02, y, y + 0.19, -9.86, -9.83, PW)))
            p.append(tcyl(f'knob_{a}_{k}', ((a + b) / 2, y + 0.1, -9.875), 0.015, 0.03, 'z', M['brass'], 8))
    p.append(wuv(tbox('desk_modesty', 11.4, 12.2, 0.1, 0.74, -8.99, -8.97, PW)))
    p += [tbox('blotter', 11.35, 12.25, 0.78, 0.786, -9.7, -9.15, M['felt']),
          tbox('papers', 11.5, 11.8, 0.786, 0.8, -9.55, -9.3, M['plain_paper']),
          tcyl('inkwell', (12.05, 0.81, -9.25), 0.035, 0.06, 'y', M['clearglass'], 10),
          tcyl_dir('pen', (11.9, 0.79, -9.6), (12.05, 0.79, -9.5), 0.005, M['bakelite'], 6)]
    # candlestick telephone
    p += [tcyl('phone_base', (11.1, 0.8, -9.2), 0.07, 0.04, 'y', M['bakelite'], 16),
          tcyl('phone_stem', (11.1, 0.97, -9.2), 0.018, 0.3, 'y', M['bakelite'], 10),
          tcyl('phone_mouth', (11.1, 1.13, -9.17), 0.035, 0.05, 'z', M['bakelite'], 12, r2=0.02),
          tcyl('phone_ear', (11.18, 1.0, -9.2), 0.03, 0.09, 'y', M['bakelite'], 10)]
    # banker's lamp (lit: it has burned all night)
    p += [tbox('bl_base', 12.25, 12.45, 0.78, 0.81, -9.8, -9.62, M['brass']),
          tcyl('bl_stem', (12.35, 0.92, -9.71), 0.012, 0.22, 'y', M['brass'], 8),
          tcyl('bl_shade', (12.35, 1.05, -9.69), 0.07, 0.36, 'x', M['banker'], 16, r2=0.07)]
    desk = J('Office_Desk', p)
    COL('COL_Office_Desk', desk)
    marker('LIGHT_Office', T((12.35, 1.0, -9.6)), {'light': 'point', 'intensity': 3.5, 'distance': 3.6, 'color': '#ffd08a'}, 'Props')

    # leather swivel chair behind the desk
    p = [tbox('ch_seat', 11.55, 12.05, 0.45, 0.55, -10.55, -10.05, M['leather']),
         tbox('ch_back', 11.55, 12.05, 0.55, 1.1, -10.62, -10.52, M['leather']),
         tbox('ch_arm_l', 11.5, 11.56, 0.55, 0.72, -10.55, -10.1, PW),
         tbox('ch_arm_r', 12.04, 12.1, 0.55, 0.72, -10.55, -10.1, PW),
         tcyl('ch_column', (11.8, 0.28, -10.3), 0.03, 0.34, 'y', M['iron'], 10)]
    for k in range(5):
        a = k / 5 * math.tau
        p.append(tbeam(f'ch_leg_{k}', (11.8, 0.08, -10.3), (11.8 + 0.3 * math.cos(a), 0.05, -10.3 + 0.3 * math.sin(a)), 0.04, 0.03, M['iron']))
    COL('COL_Office_Chair', J('Office_Chair', p), -0.05)

    # bookshelf on the west wall
    p = [wuv(tbox('bs_back', 8.07, 8.1, 0, 2.2, -11.6, -9.8, PW))]
    for z in (-11.6, -9.82):
        p.append(wuv(tbox(f'bs_side_{z}', 8.07, 8.42, 0, 2.2, z, z + 0.03, PW)))
    for k, y in enumerate((0.05, 0.6, 1.15, 1.7, 2.17)):
        p.append(wuv(tbox(f'bs_shelf_{k}', 8.07, 8.42, y, y + 0.03, -11.6, -9.8, PW)))
        if k < 4:
            z = -11.55
            while z < -9.9:
                w = R.uniform(0.03, 0.07)
                h = R.uniform(0.3, 0.46)
                p.append(tbox(f'book_{k}_{z:.2f}', 8.12, 8.12 + R.uniform(0.18, 0.27), y + 0.03, y + 0.03 + h, z, z + w,
                              M[R.choice(['book_a', 'book_b', 'book_c', 'book_d'])]))
                z += w + 0.004
    COL('COL_Office_Bookshelf', J('Office_Bookshelf', p))

    # safe in the corner, dial facing the room
    p = [tbox('safe_body', 14.1, 14.8, 0.08, 0.98, -11.9, -11.25, M['safe']),
         tbox('safe_door', 14.07, 14.1, 0.15, 0.91, -11.85, -11.3, M['safe']),
         tcyl('safe_dial', (14.05, 0.68, -11.45), 0.07, 0.03, 'x', M['brass'], 24),
         tbeam('safe_handle', (14.05, 0.45, -11.6), (14.05, 0.45, -11.4), 0.03, 0.03, M['brass'])]
    for dx in (0.15, 0.6):
        for dz in (0.1, 0.55):
            p.append(tcyl(f'safe_foot_{dx}_{dz}', (14.1 + dx, 0.04, -11.9 + dz), 0.04, 0.08, 'y', M['iron'], 8))
    COL('COL_Office_Safe', J('Office_Safe', p))

    # cold pot-bellied stove
    p = [tcyl('stove_body', (14.3, 0.55, -7.2), 0.26, 0.6, 'y', M['iron'], 18, r2=0.2),
         tcyl('stove_top', (14.3, 0.9, -7.2), 0.2, 0.1, 'y', M['iron'], 18),
         tcyl_dir('flue', (14.3, 0.95, -7.2), (14.3, 3.2, -7.2), 0.07, M['iron'], 12),
         tbox('stove_door', 14.03, 14.06, 0.4, 0.6, -7.3, -7.1, M['iron'])]
    for k in range(3):
        a = k / 3 * math.tau
        p.append(tbeam(f'stove_leg_{k}', (14.3 + 0.16 * math.cos(a), 0.25, -7.2 + 0.16 * math.sin(a)),
                       (14.3 + 0.22 * math.cos(a), 0.0, -7.2 + 0.22 * math.sin(a)), 0.04, 0.04, M['iron']))
    COL('COL_Office_Stove', J('Office_Stove', p))

    # filing cabinet, coat rack, rug, gramophone, frames
    p = [wuv(tbox('fc_body', 8.07, 8.6, 0, 1.3, -7.35, -6.85, M['olive']))]
    for k in range(4):
        y = 0.1 + k * 0.3
        p.append(tbox(f'fc_handle_{k}', 8.6, 8.62, y + 0.15, y + 0.17, -7.15, -7.05, M['brass']))
        p.append(tbox(f'fc_card_{k}', 8.6, 8.603, y + 0.19, y + 0.23, -7.14, -7.06, M['plain_paper']))
    COL('COL_Office_Filing', J('Office_FilingCabinet', p))
    p = [tcyl('cr_pole', (9.0, 0.9, -6.6), 0.025, 1.8, 'y', PW, 10)]
    for k in range(3):
        a = k / 3 * math.tau
        p.append(tbeam(f'cr_foot_{k}', (9.0, 0.03, -6.6), (9.0 + 0.25 * math.cos(a), 0.0, -6.6 + 0.25 * math.sin(a)), 0.035, 0.03, PW))
        p.append(tcyl_dir(f'cr_hook_{k}', (9.0, 1.72, -6.6), (9.0 + 0.12 * math.cos(a + 0.5), 1.8, -6.6 + 0.12 * math.sin(a + 0.5)), 0.01, M['brass'], 6))
    p += [tcyl('hat_brim', (9.07, 1.84, -6.58), 0.16, 0.012, 'y', M['bakelite'], 18),
          tcyl('hat_crown', (9.07, 1.9, -6.58), 0.095, 0.11, 'y', M['bakelite'], 16, r2=0.085)]
    COL('COL_Office_CoatRack', J('Office_CoatRack', p), -0.08)
    J('Office_Rug', [tbox('rug', 10.6, 13.1, 0.015, 0.025, -9.6, -7.6, M['rug']),
                     tbox('rug_b1', 10.7, 13.0, 0.025, 0.027, -9.5, -9.4, M['rug_border']),
                     tbox('rug_b2', 10.7, 13.0, 0.025, 0.027, -7.8, -7.7, M['rug_border'])])
    p = [wuv(tbox('gt_top', 13.6, 14.3, 0.7, 0.74, -8.95, -8.45, PW))]
    for dx in (13.65, 14.25):
        for dz in (-8.9, -8.5):
            p.append(tbeam(f'gt_leg_{dx}_{dz}', (dx, 0, dz), (dx, 0.7, dz), 0.04, 0.04, PW, up=(1, 0, 0)))
    p += [wuv(tbox('gram_box', 13.75, 14.15, 0.74, 0.9, -8.9, -8.5, PW)),
          tcyl('gram_platter', (13.95, 0.91, -8.7), 0.15, 0.015, 'y', M['felt'], 24),
          tcyl_dir('gram_arm', (14.1, 0.93, -8.6), (14.05, 1.15, -8.9), 0.012, M['brass'], 8),
          tcyl_dir('gram_horn', (14.05, 1.15, -8.9), (13.85, 1.55, -9.3), 0.03, M['brass'], 18, r2=0.24, cap=False)]
    COL('COL_Office_Gramophone', J('Office_Gramophone', p))
    J('Office_Frames', [
        tbox('map_frame', 10.8, 12.2, 1.5, 2.45, -11.995, -11.97, PW),
        tbox('map_sheet', 10.86, 12.14, 1.56, 2.39, -11.972, -11.968, M['map']),
        tbeam('map_route_a', (11.0, 1.8, -11.966), (11.55, 2.1, -11.966), 0.008, 0.002, M['sign_red'], up=(0, 0, 1)),
        tbeam('map_route_b', (11.55, 2.1, -11.966), (12.0, 1.95, -11.966), 0.008, 0.002, M['sign_red'], up=(0, 0, 1)),
        tbox('photo_frame', 14.97, 14.995, 1.65, 2.1, -11.0, -10.65, PW),
        tbox('photo_print', 14.966, 14.97, 1.69, 2.06, -10.97, -10.68, M['photo']),
        tquad('wall_calendar', [(8.075, 1.5, -7.6), (8.075, 1.5, -8.0), (8.075, 2.0, -8.0), (8.075, 2.0, -7.6)], M['plain_paper'])])


# ------------------------------------------------------------------ survey office and darkroom
def survey_rooms():
    W, O = M['wood'], M['olive']
    # drafting table
    p = []
    for dx in (-0.5, 0.5):
        for dz in (-0.3, 0.3):
            p.append(tbeam(f'dt_leg_{dx}_{dz}', (-11.2 + dx, 0, 14.6 + dz), (-11.2 + dx, 0.85, 14.6 + dz), 0.05, 0.05, W, up=(1, 0, 0)))
    board_a, board_b = (-11.8, 0.82, 14.25), (-10.6, 1.05, 14.95)
    p += [tbox('dt_board', -11.82, -10.58, 0.9, 0.93, 14.2, 15.0, W),
          tbox('dt_sheet', -11.7, -10.75, 0.93, 0.932, 14.28, 14.92, M['map']),
          tbox('dt_tsquare', -11.75, -10.7, 0.932, 0.94, 14.5, 14.55, W),
          tcyl_dir('dt_pencil', (-11.1, 0.94, 14.4), (-10.95, 0.94, 14.35), 0.004, M['book_d'], 6)]
    del board_a, board_b
    COL('COL_Survey_Drafting', J('Survey_DraftingTable', p))
    p = [tcyl('stool_seat', (-11.2, 0.62, 13.8), 0.17, 0.04, 'y', W, 16)]
    for k in range(3):
        a = k / 3 * math.tau
        p.append(tbeam(f'stool_leg_{k}', (-11.2 + 0.1 * math.cos(a), 0.6, 13.8 + 0.1 * math.sin(a)),
                       (-11.2 + 0.2 * math.cos(a), 0, 13.8 + 0.2 * math.sin(a)), 0.03, 0.03, W))
    J('Survey_Stool', p)
    # map cabinet with an aerial camera on top
    p = [wuv(tbox('mc_body', -15.0, -14.2, 0, 1.0, 15.3, 16.25, O))]
    for k in range(6):
        y = 0.08 + k * 0.15
        p.append(tbox(f'mc_drawer_{k}', -14.2, -14.18, y, y + 0.13, 15.33, 16.22, O))
        p.append(tbox(f'mc_pull_{k}', -14.18, -14.16, y + 0.05, y + 0.07, 15.7, 15.85, M['brass']))
    p += [tbox('cam_body', -14.85, -14.45, 1.0, 1.32, 15.55, 15.95, M['bakelite']),
          tcyl('cam_lens', (-14.65, 1.16, 15.45), 0.11, 0.2, 'z', M['iron'], 18),
          tcyl('cam_glass', (-14.65, 1.16, 15.345), 0.08, 0.01, 'z', M['clearglass'], 18),
          tbeam('cam_handle_a', (-14.9, 1.12, 15.62), (-14.9, 1.12, 15.88), 0.03, 0.03, M['leather']),
          tbeam('cam_handle_b', (-14.4, 1.12, 15.62), (-14.4, 1.12, 15.88), 0.03, 0.03, M['leather'])]
    COL('COL_Survey_MapCabinet', J('Survey_MapCabinet', p))
    # shelf of photo boxes beside the darkroom door
    p = []
    x0, x1, z0, z1 = -12.75, -10.05, 15.95, 16.29
    for x in (x0, x1 - 0.03):
        p.append(wuv(tbox(f'pb_side_{x}', x, x + 0.03, 0, 2.0, z0, z1, W)))
    for k, y in enumerate((0.05, 0.55, 1.05, 1.55, 1.97)):
        p.append(wuv(tbox(f'pb_shelf_{k}', x0, x1, y, y + 0.03, z0, z1, W)))
        if k < 4:
            x = x0 + 0.06
            while x < x1 - 0.3:
                w = R.uniform(0.22, 0.32)
                p.append(tbox(f'pbox_{k}_{x:.2f}', x, x + w, y + 0.03, y + 0.03 + R.uniform(0.12, 0.3), z0 + 0.03, z1 - 0.03, M['card']))
                x += w + 0.02
    COL('COL_Survey_Shelf', J('Survey_PhotoShelf', p))
    # big survey map on the east wall
    J('Survey_WallMap', [tbox('wm_frame', -9.92, -9.9, 1.0, 2.3, 13.4, 15.2, W),
                         tbox('wm_sheet', -9.925, -9.92, 1.05, 2.25, 13.45, 15.15, M['map'])]
      + [tbox(f'wm_grid_v_{k}', -9.927, -9.925, 1.05, 2.25, 13.45 + k * 0.24, 13.455 + k * 0.24, M['ink']) for k in range(8)]
      + [tbox(f'wm_grid_h_{k}', -9.927, -9.925, 1.05 + k * 0.2, 1.055 + k * 0.2, 13.45, 15.15, M['ink']) for k in range(7)])
    # hanging bulb
    J('Survey_Lamp', [tcyl_dir('sl_cord', (-12.4, 2.62, 14.6), (-12.4, 3.0, 14.6), 0.006, M['iron'], 6),
                      tcyl('sl_shade', (-12.4, 2.55, 14.6), 0.18, 0.12, 'y', M['enamel'], 16, r2=0.05, cap=False),
                      tsphere('sl_bulb', (-12.4, 2.5, 14.6), 0.045, M['bulb'])])
    marker('LIGHT_Survey', T((-12.4, 2.42, 14.6)), {'light': 'point', 'intensity': 5, 'distance': 3.4, 'color': '#ffc98a'}, 'Props')

    # darkroom: sink bench, trays, enlarger, chemical shelves, drying line, safelight
    p = [wuv(tbox('sink_bench', -15.0, -11.7, 0, 0.86, 18.4, 19.0, W)),
         tbox('sink_lining', -14.9, -11.8, 0.86, 0.9, 18.45, 18.95, M['iron'])]
    for k, x in enumerate((-14.2, -13.4, -12.6)):
        p.append(tbox(f'tray_{k}', x - 0.3, x + 0.3, 0.9, 0.95, 18.5, 18.9, M['porcelain']))
        p.append(tbox(f'tray_liquid_{k}', x - 0.27, x + 0.27, 0.93, 0.935, 18.53, 18.87, M['brownglass']))
    p += [tcyl_dir('tap_pipe', (-13.4, 1.4, 18.99), (-13.4, 1.4, 18.75), 0.02, M['brass'], 8),
          tcyl_dir('tap_spout', (-13.4, 1.4, 18.75), (-13.4, 1.25, 18.75), 0.015, M['brass'], 8)]
    COL('COL_Dark_Sink', J('Dark_SinkBench', p))
    p = [wuv(tbox('en_table', -12.5, -11.9, 0.72, 0.76, 16.7, 17.3, W))]
    for dx in (-12.45, -11.95):
        for dz in (16.75, 17.25):
            p.append(tbeam(f'en_leg_{dx}_{dz}', (dx, 0, dz), (dx, 0.72, dz), 0.04, 0.04, W, up=(1, 0, 0)))
    p += [tbox('en_base', -12.45, -11.95, 0.76, 0.79, 16.75, 17.2, W),
          tcyl_dir('en_column', (-12.2, 0.79, 17.22), (-12.2, 1.6, 17.22), 0.025, M['iron'], 10),
          tbox('en_head', -12.32, -12.08, 1.3, 1.5, 16.9, 17.15, M['bakelite']),
          tcyl('en_bellows', (-12.2, 1.22, 17.02), 0.07, 0.16, 'y', M['bakelite'], 14),
          tcyl('en_lens', (-12.2, 1.12, 17.02), 0.04, 0.05, 'y', M['iron'], 12)]
    COL('COL_Dark_Enlarger', J('Dark_Enlarger', p))
    p = []
    for k, y in enumerate((0.4, 0.9, 1.4, 1.9)):
        p.append(wuv(tbox(f'cs_shelf_{k}', -15.0, -14.75, y, y + 0.03, 16.6, 18.2, W)))
        z = 16.68
        while z < 18.1:
            r = R.uniform(0.035, 0.06)
            h = R.uniform(0.12, 0.26)
            mat = M['brownglass'] if R.random() < 0.6 else M['clearglass']
            p.append(tcyl(f'jar_{k}_{z:.2f}', (-14.87, y + 0.03 + h / 2, z + r), r, h, 'y', mat, 12))
            p.append(tcyl(f'jar_lid_{k}_{z:.2f}', (-14.87, y + 0.035 + h, z + r), r * 0.8, 0.012, 'y', M['bakelite'], 10))
            z += 2 * r + 0.04
    for z in (16.6, 18.17):
        p.append(wuv(tbox(f'cs_side_{z}', -15.0, -14.75, 0.0, 2.0, z, z + 0.03, W)))
    COL('COL_Dark_Shelves', J('Dark_ChemicalShelves', p))
    p = [tcyl_dir('line', (-15.0, 2.15, 17.7), (-11.6, 2.15, 17.7), 0.003, M['iron'], 5)]
    for k, x in enumerate((-14.4, -13.7, -13.0, -12.3)):
        p.append(tbox(f'clip_{k}', x - 0.01, x + 0.01, 2.1, 2.16, 17.69, 17.71, M['wood']))
        p.append(tbox(f'print_{k}', x - 0.12, x + 0.12, 1.82, 2.1, 17.698, 17.702, M['photo']))
    J('Dark_DryingLine', p)
    J('Dark_Safelight', [tbox('sf_box', -13.5, -13.1, 1.85, 2.15, 18.88, 19.0, M['bakelite']),
                         tbox('sf_glass', -13.45, -13.15, 1.88, 2.12, 18.875, 18.88, M['safelight'])])
    marker('LIGHT_Dark', T((-13.3, 1.9, 18.7)), {'light': 'point', 'intensity': 2.6, 'distance': 3.2, 'color': '#ff3a14'}, 'Props')


build()
size = export_glb(OUT_GLB, extras=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print(f'EXPORTED {OUT_GLB} ({size:.2f} MB)')
roots = [o for o in bpy.data.objects if o.parent is None and not o.name.startswith('COL_')]
print('TOP-LEVEL', len(roots), ' '.join(sorted(o.name for o in roots)))
print('COLLIDERS', sum(1 for o in bpy.data.objects if o.name.startswith('COL_')))
