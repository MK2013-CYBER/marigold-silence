"""
THE MARIGOLD SILENCE: Sable Flat outbuildings, each exported as its own .glb.

  fuel_farm.glb       fenced fuel compound: tank, visible pump, drum pump, attendant booth
  maint_shed.glb      tin maintenance shed: flare pots, boundary lights, road drag, tools
  storage_shed.glb    wooden storage shed: paint, tarps, rope, spare markers
  ops_building.glb    operations & passenger building: porch, lounge, counter, telegraph, weather board
  comms_shelter.glb   windowless radio relay shelter + weather instruments (spinning anemometer)

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_outbuildings.py
Optional: append "-- fuel_farm" (etc.) to build only one.

Game coordinates, origin = building centre, front faces +z. world.json places and turns them.
Names: Door_* (hinged, origin = hinge), COL_* collision boxes (COL_Door_* switch off when open),
custom property spinRate (revolutions per second) makes a node spin.
"""
import json
import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from bhelpers import (T, col_box, col_from, export_glb, join, reset_scene, set_origin, tbeam, tbox,  # noqa: E402
                      tcyl, tcyl_dir, tquad, tsphere, ttext, ttorus)
from buildings import (door_leaf, gable_roof, hanging_bulb, materials, shed_roof, uv, wall_colliders,  # noqa: E402
                       walls, window)

PROJECT = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, 'textures')
MODELS = os.path.join(PROJECT, 'public', 'models')
with open(os.path.join(PROJECT, 'src', 'data', 'scenes', 'outbuildings.json')) as f:
    SIGNS = json.load(f)['signs']
R = random.Random(5)


def J(name, parts):
    return join(name, parts, 'Props')


def COL(name, obs, pad=0.0, M=None):
    return col_from(name, obs if isinstance(obs, list) else [obs], pad, mat=M['col'])


def drum(name, pos, M, mat, lying=False):
    x, y, z = pos
    p = [tcyl(f'{name}_b', (0, 0.44, 0), 0.29, 0.88, 'y', mat, 20),
         ttorus(f'{name}_r1', (0, 0.22, 0), 0.292, 0.012, 'y', mat, (20, 5)),
         ttorus(f'{name}_r2', (0, 0.66, 0), 0.292, 0.012, 'y', mat, (20, 5))]
    ob = J(name, p)
    if lying:
        ob.rotation_euler = (0, math.pi / 2, R.uniform(0, 3))
        ob.location = T((x, y + 0.29, z))
    else:
        ob.rotation_euler = (0, 0, R.uniform(0, 3))
        ob.location = T((x, y, z))
    return ob


# ====================================================================== fuel farm
def fuel_farm(M):
    # concrete pad and wire fence with a gate at the front
    pad = uv(tbox('ff_pad', -9, 9, 0, 0.06, -6, 6, M['concrete']), 4)
    J('FuelFarm_Pad', [pad])
    posts, links = [], []
    corners = [(-8.7, -5.7), (8.7, -5.7), (8.7, 5.7), (-8.7, 5.7)]
    for i in range(4):
        (ax, az), (bx, bz) = corners[i], corners[(i + 1) % 4]
        n = max(1, int(math.hypot(bx - ax, bz - az) / 2.2))
        for k in range(n + 1):
            x, z = ax + (bx - ax) * k / n, az + (bz - az) * k / n
            if i == 2 and -1.7 < x < 1.7:
                continue  # gate opening (front)
            posts.append((x, z))
    p = []
    for x, z in posts:
        p.append(tcyl(f'fp_{x:.1f}_{z:.1f}', (x, 0.9, z), 0.04, 1.8, 'y', M['steel'], 8))
    for i in range(4):
        (ax, az), (bx, bz) = corners[i], corners[(i + 1) % 4]
        if i == 2:  # front: two runs either side of the gate
            for x0, x1 in ((8.7, 1.7), (-1.7, -8.7)):
                p.append(tcyl_dir(f'rail_f_{x0}', (x0, 1.78, az), (x1, 1.78, bz), 0.025, M['steel'], 6))
                links.append(tquad(f'mesh_f_{x0}', [(x0, 0.05, az), (x1, 0.05, bz), (x1, 1.75, bz), (x0, 1.75, az)], M['chainlink']))
        else:
            p.append(tcyl_dir(f'rail_{i}', (ax, 1.78, az), (bx, 1.78, bz), 0.025, M['steel'], 6))
            links.append(tquad(f'mesh_{i}', [(ax, 0.05, az), (bx, 0.05, bz), (bx, 1.75, bz), (ax, 1.75, az)], M['chainlink']))
    # gate leaves standing open
    for s, ang in ((-1, 0.9), (1, -0.9)):
        hx = s * 1.7
        L = 1.6
        ex, ez = hx - s * L * math.cos(ang), 5.7 + L * math.sin(abs(ang))
        p.append(tcyl_dir(f'gate_top_{s}', (hx, 1.7, 5.7), (ex, 1.7, ez), 0.025, M['steel'], 6))
        p.append(tcyl_dir(f'gate_bot_{s}', (hx, 0.1, 5.7), (ex, 0.1, ez), 0.025, M['steel'], 6))
        p.append(tcyl_dir(f'gate_end_{s}', (ex, 0.1, ez), (ex, 1.7, ez), 0.025, M['steel'], 6))
        links.append(tquad(f'gate_mesh_{s}', [(hx, 0.1, 5.7), (ex, 0.1, ez), (ex, 1.7, ez), (hx, 1.7, 5.7)], M['chainlink']))
    J('FuelFarm_Fence', p + links)
    C = M['col']
    col_box('COL_FF_Fence_N', -8.8, 8.8, -5.8, -5.6, mat=C)
    col_box('COL_FF_Fence_E', 8.6, 8.8, -5.8, 5.8, mat=C)
    col_box('COL_FF_Fence_W', -8.8, -8.6, -5.8, 5.8, mat=C)
    col_box('COL_FF_Fence_S1', -8.8, -1.7, 5.6, 5.8, mat=C)
    col_box('COL_FF_Fence_S2', 1.7, 8.8, 5.6, 5.8, mat=C)

    # the tank on its saddles
    cx, cy, cz = -1.5, 2.0, -2.6
    p = [tcyl('tank', (cx, cy, cz), 1.3, 7.0, 'x', M['white'], 32),
         tsphere('tank_end_w', (cx - 3.5, cy, cz), 1.3, M['white'], (24, 12), (0.3, 1, 1)),
         tsphere('tank_end_e', (cx + 3.5, cy, cz), 1.3, M['white'], (24, 12), (0.3, 1, 1))]
    for sx in (-2.3, 2.3):
        p.append(uv(tbox(f'saddle_{sx}', cx + sx - 0.3, cx + sx + 0.3, 0.06, 1.15, cz - 1.1, cz + 1.1, M['concrete'])))
        p.append(ttorus(f'strap_{sx}', (cx + sx, cy, cz), 1.32, 0.03, 'x', M['steel'], (32, 5)))
    p += [tcyl('manhole', (cx + 1.0, cy + 1.32, cz), 0.25, 0.1, 'y', M['steel'], 16),
          tcyl('vent', (cx - 1.5, cy + 1.6, cz), 0.04, 0.7, 'y', M['steel'], 8),
          tcyl('vent_cap', (cx - 1.5, cy + 1.98, cz), 0.09, 0.06, 'y', M['steel'], 10),
          ttext('tank_text', SIGNS['fuelTank'], 0.32, M['stencil'], (cx, cy + 0.2, cz + 1.315), 'z+')]
    for k in range(9):  # ladder up the east end
        y = 0.3 + k * 0.3
        p.append(tcyl_dir(f'tl_rung_{k}', (cx + 3.95, y, cz - 0.25), (cx + 3.95, y, cz + 0.25), 0.015, M['steel'], 6))
    for dz in (-0.25, 0.25):
        p.append(tcyl_dir(f'tl_rail_{dz}', (cx + 3.95, 0.06, cz + dz), (cx + 3.75, 3.3, cz + dz), 0.02, M['steel'], 6))
    # pipe to the pump
    p += [tcyl_dir('pipe_a', (cx + 2.8, 0.85, cz + 0.8), (cx + 2.8, 0.25, cz + 0.8), 0.045, M['steel'], 8),
          tcyl_dir('pipe_b', (cx + 2.8, 0.25, cz + 0.8), (4.5, 0.25, 2.5), 0.045, M['steel'], 8),
          tcyl('valve', (cx + 2.8, 0.6, cz + 0.8), 0.09, 0.04, 'z', M['red'], 12)]
    tank = J('FuelFarm_Tank', p)
    col_box('COL_FF_Tank', cx - 3.95, cx + 4.05, cz - 1.35, cz + 1.35, mat=C)

    # 1930s "visible" gasoline pump with a glass measuring cylinder on top
    px, pz = 4.5, 2.5
    p = [uv(tbox('vp_base', px - 0.3, px + 0.3, 0.06, 0.35, pz - 0.3, pz + 0.3, M['concrete'])),
         tcyl('vp_body', (px, 1.1, pz), 0.17, 1.5, 'y', M['red'], 16),
         tcyl('vp_collar', (px, 1.88, pz), 0.24, 0.06, 'y', M['red'], 16),
         tcyl('vp_glass', (px, 2.25, pz), 0.21, 0.7, 'y', M['clearglass'], 20),
         tcyl('vp_fuel', (px, 2.12, pz), 0.18, 0.42, 'y', M['fuel'], 16),
         tcyl('vp_cap', (px, 2.62, pz), 0.24, 0.06, 'y', M['red'], 16),
         tsphere('vp_globe', (px, 2.82, pz), 0.17, M['white'], (14, 9)),
         tbeam('vp_lever', (px + 0.17, 1.2, pz), (px + 0.45, 1.55, pz), 0.04, 0.04, M['steel'])]
    hose = [(px - 0.17, 1.35, pz), (px - 0.45, 1.0, pz + 0.1), (px - 0.5, 0.55, pz + 0.15), (px - 0.25, 0.4, pz + 0.18), (px - 0.18, 0.8, pz + 0.15)]
    for k in range(len(hose) - 1):
        p.append(tcyl_dir(f'vp_hose_{k}', hose[k], hose[k + 1], 0.025, M['rubber'], 8))
    p.append(tcyl_dir('vp_nozzle', (px - 0.18, 0.8, pz + 0.15), (px - 0.17, 1.05, pz + 0.12), 0.02, M['brass'], 8))
    pump = J('FuelFarm_Pump', p)
    COL('COL_FF_Pump', pump, 0.05, M)

    # drum stack with a hand-crank barrel pump
    dp = [drum(f'FuelFarm_Drum_{i}', (x, 0.06, z), M, M['red'] if i % 2 else M['olive']) for i, (x, z) in
          enumerate([(6.6, -4.4), (7.3, -3.8), (6.6, -3.6), (7.4, -4.6), (5.8, -4.6)])]
    dp.append(drum('FuelFarm_Drum_5', (7.0, 0.06, -2.4), M, M['olive'], lying=True))
    hp = J('FuelFarm_DrumPump', [tcyl('hp_tube', (6.6, 1.3, -4.4), 0.03, 0.9, 'y', M['steel'], 8),
                                  tcyl('hp_head', (6.6, 1.8, -4.4), 0.08, 0.16, 'y', M['red'], 12),
                                  tbeam('hp_crank', (6.6, 1.85, -4.4), (6.85, 1.95, -4.4), 0.03, 0.03, M['steel']),
                                  tcyl_dir('hp_spout', (6.68, 1.75, -4.4), (6.95, 1.6, -4.4), 0.02, M['steel'], 6)])
    COL('COL_FF_Drums', dp + [hp], 0.0, M)

    # attendant booth (enterable), front door, window towards the pump
    bw, bd, bh, t = 2.3, 2.1, 2.3, 0.08
    bx, bz = 6.2, 3.0
    import bhelpers
    parts = walls('booth', bw, bd, bh, t, M['siding'], [('s', -0.45, 0.45, 0.0, 2.0), ('w', -0.5, 0.4, 1.0, 1.65)])
    parts.append(uv(tbox('booth_floor', -bw / 2, bw / 2, 0.06, 0.08, -bd / 2, bd / 2, M['floor'])))
    parts.append(shed_roof('booth', bw, bd, bh, bh + 0.35, 0.25, M['roof']))
    parts += window('booth_win', 'w', -0.05, 0.9, 1.0, 1.65, bw, bd, t, M)
    parts += [uv(tbox('booth_desk', 0.35, 1.07, 0.85, 0.89, -0.98, -0.3, M['wood'])),
              tbox('booth_ledger', 0.5, 0.85, 0.89, 0.92, -0.85, -0.6, M['paper']),
              tcyl('booth_phone', (0.95, 0.95, -0.85), 0.05, 0.1, 'y', M['bakelite'], 12),
              tcyl('booth_stool', (0.6, 0.35, -0.1), 0.15, 0.04, 'y', M['wood'], 12),
              tcyl('booth_stool_leg', (0.6, 0.17, -0.1), 0.03, 0.34, 'y', M['iron'], 8),
              tcyl('booth_lantern', (-0.8, 0.98, -0.85), 0.07, 0.2, 'y', M['clearglass'], 12),
              tbox('booth_logboard', 1.1, 1.13, 1.3, 1.9, -0.6, 0.2, M['chalkboard']),
              ttext('booth_logtext', '\n'.join(SIGNS['fuelLog']), 0.07, M['chalk'], (1.098, 1.75, -0.2), 'x-')]
    parts += hanging_bulb('booth_bulb', 0.0, bh, 0.0, M, 0.35)
    for ob in parts:
        ob.location = T((bx, 0, bz))
    booth = J('FuelFarm_Booth', parts)
    door_leaf('Door_FuelBooth', (bx - 0.45, 0.06, bz + bd / 2 - t / 2), 0.9, 1.98, M['siding'], M['wood'], M['brass'])
    import buildings
    _cols_offset('booth', bw, bd, t, [('s', -0.45, 0.45, 'COL_Door_FuelBooth')], bx, bz, M)

    # signs, extinguisher, sand buckets
    p = [tbox('ns_plate', -1.0, 1.0, 1.95, 2.55, -5.66, -5.64, M['sign_cream']),
         ttext('ns_text', '\n'.join(SIGNS['fuelNoSmoking']), 0.14, M['sign_red'], (0, 2.25, -5.63), 'z+'),
         tcyl('extinguisher', (-8.5, 0.55, 5.2), 0.09, 0.6, 'y', M['red'], 12),
         tcyl_dir('ext_hose', (-8.5, 0.85, 5.2), (-8.42, 0.6, 5.27), 0.012, M['rubber'], 6),
         uv(tbox('bucket_stand', -8.5, -8.42, 0.06, 1.5, 3.2, 4.4, M['red']))]
    for k, z in enumerate((3.4, 3.8, 4.2)):
        p.append(tcyl(f'sand_bucket_{k}', (-8.3, 1.15, z), 0.13, 0.24, 'y', M['red'], 14, r2=0.1))
    J('FuelFarm_Details', p)


def _cols_offset(prefix, w, d, t, doors, ox, oz, M):
    """wall_colliders() for a sub-building at (ox, oz) inside a larger model."""
    before = set(bpy.data.objects.keys())
    wall_colliders(prefix, w, d, t, doors, M['col'])
    for ob in bpy.data.objects:
        if ob.name not in before:
            ob.location.x += ox
            ob.location.y -= oz


# ====================================================================== maintenance shed
def maint_shed(M):
    w, d, h, t = 8.0, 6.0, 3.0, 0.1
    parts = walls('ms', w, d, h, t, M['tin'], [('s', -0.95, 0.95, 0.0, 2.4), ('e', -0.8, 0.8, 1.2, 2.0), ('w', -0.8, 0.8, 1.2, 2.0)])
    parts.append(uv(tbox('ms_floor', -w / 2, w / 2, 0.0, 0.03, -d / 2, d / 2, M['concrete']), 4))
    parts += gable_roof('ms', w, d, h, 1.2, 0.35, M['roof'], M['tin'])
    for x in (-w / 2 + 0.1, 0.0, w / 2 - 0.1):
        parts.append(tbeam(f'ms_tie_{x}', (x, h - 0.1, -d / 2), (x, h - 0.1, d / 2), 0.1, 0.15, M['wood']))
    parts += window('ms_win_e', 'e', 0.0, 1.6, 1.2, 2.0, w, d, t, M) + window('ms_win_w', 'w', 0.0, 1.6, 1.2, 2.0, w, d, t, M)
    parts.append(ttext('ms_stencil', SIGNS['shedStencil'], 0.3, M['stencil'], (0, 2.65, d / 2 + 0.005), 'z+'))
    J('MaintShed', parts)
    door_leaf('Door_MaintShed_L', (-0.95, 0.03, d / 2 - t / 2), 0.95, 2.36, M['planks'], M['wood'], M['brass'])
    door_leaf('Door_MaintShed_R', (0.95, 0.03, d / 2 - t / 2), 0.95, 2.36, M['planks'], M['wood'], M['brass'], mirror=True)
    wall_colliders('ms', w, d, t, [('s', -0.95, 0.0, 'COL_Door_MaintShed_L'), ('s', 0.0, 0.95, 'COL_Door_MaintShed_R')], M['col'])

    # back bench with vise and oil cans
    p = [uv(tbox('msb_top', -3.6, -0.6, 0.86, 0.94, -2.9, -2.2, M['wood']))]
    for x in (-3.5, -0.7):
        for z in (-2.85, -2.25):
            p.append(tbeam(f'msb_leg_{x}_{z}', (x, 0, z), (x, 0.86, z), 0.07, 0.07, M['wood'], up=(1, 0, 0)))
    p += [uv(tbox('msb_vise', -1.1, -0.85, 0.94, 1.06, -2.4, -2.2, M['grey'])),
          tcyl('msb_can1', (-3.2, 1.05, -2.6), 0.08, 0.2, 'y', M['red'], 12, r2=0.06),
          tcyl('msb_can2', (-2.9, 1.05, -2.6), 0.08, 0.2, 'y', M['olive'], 12, r2=0.06)]
    COL('COL_MS_Bench', J('MaintShed_Bench', p), 0.0, M)
    # runway flare pots (round kerosene bombs with chimneys), in rows
    p = []
    for i in range(3):
        for j in range(4):
            x, z = 1.1 + j * 0.6, -2.5 + i * 0.6
            p += [tsphere(f'flare_{i}_{j}', (x, 0.22, z), 0.2, M['iron'], (12, 8), (1, 0.9, 1)),
                  tcyl(f'flare_chim_{i}_{j}', (x, 0.5, z), 0.04, 0.2, 'y', M['iron'], 8),
                  tcyl(f'flare_wick_{i}_{j}', (x, 0.61, z), 0.05, 0.03, 'y', M['steel'], 8)]
    COL('COL_MS_Flares', J('MaintShed_FlarePots', p), 0.0, M)
    # boundary lights on a shelf along the west wall
    p = [uv(tbox('msl_shelf', -3.9, -3.5, 1.2, 1.24, -1.6, 1.6, M['wood']))]
    for k in range(5):
        z = -1.4 + k * 0.7
        p += [tcyl(f'bl_base_{k}', (-3.7, 1.32, z), 0.1, 0.16, 'y', M['grey'], 12),
              tsphere(f'bl_dome_{k}', (-3.7, 1.45, z), 0.1, M['fuel'], (12, 8), (1, 0.8, 1))]
    for y in (0.4, 0.8):
        p.append(tbeam(f'msl_brk_{y}', (-3.9, y + 0.8, -1.5), (-3.9, y + 0.8, 1.5), 0.03, 0.03, M['iron']))
    J('MaintShed_BoundaryLights', p)
    # road drag (for smoothing the strip) leaning on the east wall, wheelbarrow, tool rack, coiled cable
    p = [tbeam('drag_blade', (3.9, 0.2, -2.0), (3.6, 1.6, -2.0), 0.35, 0.08, M['wood'], up=(1, 0, 0)),
         tbeam('drag_blade2', (3.9, 0.2, 0.8), (3.6, 1.6, 0.8), 0.35, 0.08, M['wood'], up=(1, 0, 0)),
         tbeam('drag_edge', (3.85, 0.25, -2.1), (3.85, 0.25, 0.9), 0.06, 0.06, M['steel']),
         tcyl_dir('drag_chain', (3.6, 1.55, -1.6), (3.6, 1.55, 0.4), 0.012, M['iron'], 6)]
    COL('COL_MS_Drag', J('MaintShed_RoadDrag', p), 0.0, M)
    p = [tbox('wb_tray', -0.4, 0.4, 0.45, 0.75, -0.3, 0.3, M['grey']),
         ttorus('wb_wheel', (0.55, 0.22, 0), 0.18, 0.05, 'z', M['rubber'], (16, 6)),
         tcyl_dir('wb_h1', (-0.3, 0.5, -0.22), (-1.1, 0.75, -0.25), 0.02, M['wood'], 6),
         tcyl_dir('wb_h2', (-0.3, 0.5, 0.22), (-1.1, 0.75, 0.25), 0.02, M['wood'], 6),
         tcyl_dir('wb_l1', (-0.2, 0.45, -0.2), (-0.25, 0.0, -0.2), 0.02, M['steel'], 6),
         tcyl_dir('wb_l2', (-0.2, 0.45, 0.2), (-0.25, 0.0, 0.2), 0.02, M['steel'], 6)]
    wb = J('MaintShed_Wheelbarrow', p)
    wb.location = T((1.6, 0, 1.4))
    wb.rotation_euler = (0, 0, 0.4)
    COL('COL_MS_Wheelbarrow', wb, 0.0, M)
    p = [tbeam('rack_rail', (-3.9, 2.0, 1.9), (-3.9, 2.0, 2.8), 0.04, 0.06, M['wood'])]
    for k in range(4):
        z = 2.0 + k * 0.22
        p.append(tcyl_dir(f'tool_handle_{k}', (-3.85, 0.25, z), (-3.88, 2.1, z), 0.018, M['wood'], 6))
        p.append(tbox(f'tool_head_{k}', -3.9, -3.8, 0.05, 0.3, z - 0.1, z + 0.1, M['steel']))
    J('MaintShed_ToolRack', p)
    J('MaintShed_Cable', [ttorus(f'cable_{k}', (2.8, 0.03 + k * 0.03, 2.2), 0.35 - k * 0.02, 0.025, 'y', M['rubber'], (20, 5)) for k in range(5)])
    J('MaintShed_Lamp', hanging_bulb('ms_bulb', 0, h + 0.3, 0, M, 0.9))


# ====================================================================== storage shed
def storage_shed(M):
    w, d, t = 6.0, 5.0, 0.1
    parts = walls('ss', w, d, 2.9, t, M['siding'], [('s', -2.0, -1.1, 0.0, 2.05), ('e', -0.6, 0.6, 1.2, 1.8)])
    parts.append(uv(tbox('ss_floor', -w / 2, w / 2, 0.0, 0.03, -d / 2, d / 2, M['floor'])))
    parts.append(shed_roof('ss', w, d, 2.6, 2.95, 0.3, M['roof']))
    parts += window('ss_win', 'e', 0.0, 1.2, 1.2, 1.8, w, d, t, M)
    J('StorageShed', parts)
    door_leaf('Door_StorageShed', (-2.0, 0.03, d / 2 - t / 2), 0.9, 2.02, M['siding'], M['wood'], M['brass'])
    wall_colliders('ss', w, d, t, [('s', -2.0, -1.1, 'COL_Door_StorageShed')], M['col'])
    # shelving along the back wall with paint tins and crates
    p = []
    for x in (-2.85, -0.1, 2.6):
        p.append(tbeam(f'ssh_post_{x}', (x, 0, -2.1), (x, 2.2, -2.1), 0.06, 0.06, M['wood'], up=(1, 0, 0)))
    for y in (0.5, 1.2, 1.9):
        p.append(uv(tbox(f'ssh_board_{y}', -2.9, 2.65, y, y + 0.04, -2.4, -1.8, M['wood'])))
        x = -2.8
        while x < 2.4:
            if R.random() < 0.55:
                p.append(tcyl(f'paint_{y}_{x:.1f}', (x + 0.13, y + 0.16, -2.1), 0.12, 0.25, 'y', M['white'], 12))
                x += 0.3
            else:
                wbx = R.uniform(0.3, 0.6)
                p.append(tbox(f'sbox_{y}_{x:.1f}', x, x + wbx, y + 0.04, y + 0.04 + R.uniform(0.2, 0.4), -2.35, -1.85, M['card']))
                x += wbx + 0.06
    COL('COL_SS_Shelf', J('StorageShed_Shelves', p), 0.0, M)
    # spare drum markers, tarps, rope, sacks, ladder
    dr = [drum(f'StorageShed_Drum_{i}', (x, 0.03, z), M, M['red'] if i % 2 else M['white']) for i, (x, z) in enumerate([(2.2, 0.4), (2.2, 1.1), (1.55, 0.75)])]
    COL('COL_SS_Drums', dr, 0.0, M)
    p = [tsphere('tarp_roll', (-2.2, 0.2, 0.2), 0.5, M['tarp'], (14, 8), (1.2, 0.4, 0.8)),
         tsphere('tarp_roll2', (-2.3, 0.5, 0.25), 0.4, M['tarp'], (14, 8), (1.0, 0.35, 0.7))]
    p += [ttorus(f'rope_{k}', (-0.6, 0.05 + k * 0.04, 1.4), 0.3, 0.03, 'y', M['sack'], (18, 5)) for k in range(5)]
    for k in range(4):
        p.append(tsphere(f'sack_{k}', (0.9 + (k % 2) * 0.55, 0.15 + (k // 2) * 0.25, -0.6), 0.32, M['sack'], (10, 6), (1, 0.45, 0.7)))
    for dz in (-0.2, 0.2):
        p.append(tbeam(f'lad_rail_{dz}', (-2.8, 0.05, -1.4 + dz), (-2.8, 0.05, 1.6 + dz), 0.05, 0.06, M['wood']))
    for k in range(9):
        p.append(tbeam(f'lad_rung_{k}', (-2.8, 0.06, -1.3 + k * 0.33 - 0.2), (-2.8, 0.06, -1.3 + k * 0.33 + 0.2), 0.03, 0.03, M['wood'], up=(1, 0, 0)))
    J('StorageShed_Stores', p)
    # only the bulky things block you; the ladder lies flat and you can step over the rope
    col_box('COL_SS_Tarps', -2.85, -1.6, -0.25, 0.65, mat=M['col'])
    col_box('COL_SS_Sacks', 0.55, 1.75, -0.95, -0.3, mat=M['col'])
    J('StorageShed_Lamp', hanging_bulb('ss_bulb', 0, 2.75, 0, M, 0.6))


# ====================================================================== operations building (1933 "FBO")
def ops_building(M):
    w, d, h, t = 16.0, 10.0, 3.4, 0.12
    front = [('s', -0.55, 0.55, 0.0, 2.2)]
    wins = [('s', x, 1.0, 2.2) for x in (-5.5, -2.5, 2.5, 5.5)] + [('e', z, 1.0, 2.2) for z in (-2.5, 2.5)] + [('w', z, 1.0, 2.2) for z in (-2.5, 2.5)]
    openings = front + [('n', 4.0, 4.9, 0.0, 2.1)] + [(s, a - 0.6, a + 0.6, y0, y1) for s, a, y0, y1 in wins]
    parts = walls('ops', w, d, h, t, M['siding'], openings)
    parts.append(uv(tbox('ops_floor', -w / 2, w / 2, 0.0, 0.03, -d / 2, d / 2, M['floor'])))
    parts += gable_roof('ops', w, d, h, 1.8, 0.4, M['roof'], M['siding'])
    for x in (-5.0, 0.0, 5.0):
        parts.append(tbeam(f'ops_tie_{x}', (x, h - 0.08, -d / 2), (x, h - 0.08, d / 2), 0.12, 0.16, M['wood']))
    for s, a, y0, y1 in wins:
        parts += window(f'ops_win_{s}_{a}', s, a, 1.2, y0, y1, w, d, t, M)
    # porch along the front
    pz0, pz1 = d / 2, d / 2 + 2.2
    parts.append(uv(tbox('porch_deck', -w / 2, w / 2, 0.0, 0.04, pz0, pz1, M['wood'])))
    for x in (-7.8, -3.5, 3.5, 7.8):
        parts.append(tbeam(f'porch_post_{x}', (x, 0.04, pz1 - 0.1), (x, 2.75, pz1 - 0.1), 0.12, 0.12, M['wood'], up=(1, 0, 0)))
    parts.append(tbeam('porch_beam', (-w / 2, 2.8, pz1 - 0.1), (w / 2, 2.8, pz1 - 0.1), 0.14, 0.16, M['wood']))
    porch_roof = shed_roof('porch', w, 2.2, 2.85, 3.2, 0.2, M['roof'])
    porch_roof.location = T((0, 0, (pz0 + pz1) / 2))
    parts.append(porch_roof)
    sign = '\n'.join(SIGNS['opsSign'])
    parts += [tbox('sign_board', -4.5, 4.5, 3.1, 3.9, pz1 - 0.12, pz1 - 0.06, M['sign_cream']),
              ttext('sign_text', sign, 0.26, M['stencil'], (0, 3.5, pz1 - 0.055), 'z+')]
    J('OpsBuilding', parts)
    door_leaf('Door_Ops', (-0.55, 0.03, d / 2 - t / 2), 1.1, 2.18, M['siding'], M['wood'], M['brass'])
    door_leaf('Door_OpsBack', (4.0, 0.03, -d / 2 + t / 2), 0.9, 2.08, M['siding'], M['wood'], M['brass'])
    C = M['col']
    wall_colliders('ops', w, d, t, [('s', -0.55, 0.55, 'COL_Door_Ops'), ('n', 4.0, 4.9, 'COL_Door_OpsBack')], C)
    for x in (-7.8, -3.5, 3.5, 7.8):
        col_box(f'COL_ops_post_{x}', x - 0.1, x + 0.1, pz1 - 0.2, pz1, mat=C)

    # porch bench and notice board
    p = [uv(tbox('pb_seat', -6.5, -4.7, 0.42, 0.47, 5.25, 5.65, M['wood'])),
         uv(tbox('pb_back', -6.5, -4.7, 0.47, 0.95, 5.15, 5.2, M['wood'])),
         tbox('nb_board', 1.6, 2.6, 1.2, 2.0, 5.0, 5.06, M['wood']),
         ttext('nb_text', '\n'.join(SIGNS['opsNotice']), 0.11, M['stencil'], (2.1, 1.8, 5.065), 'z+')]
    for k in range(3):
        p.append(tbox(f'nb_paper_{k}', 1.7 + k * 0.28, 1.95 + k * 0.28, 1.25, 1.55, 5.06, 5.065, M['paper']))
    for x in (-6.4, -4.8):
        p.append(tbeam(f'pb_leg_{x}', (x, 0.04, 5.45), (x, 0.42, 5.45), 0.05, 0.3, M['wood'], up=(1, 0, 0)))
    COL('COL_ops_bench', J('Ops_PorchBench', p[:2] + p[-2:]), 0.0, M)
    J('Ops_NoticeBoard', p[2:-2])

    # ---- inside: lounge (west half), operations counter and desks (east half)
    p = []
    for k, (bx, bz) in enumerate([(-6.0, -1.0), (-6.0, 1.6)]):
        p += [uv(tbox(f'bench_seat_{k}', bx - 1.0, bx + 1.0, 0.42, 0.47, bz - 0.22, bz + 0.22, M['wood'])),
              uv(tbox(f'bench_back_{k}', bx - 1.0, bx + 1.0, 0.47, 0.95, bz - 0.26, bz - 0.22, M['wood']))]
        for x in (bx - 0.9, bx + 0.9):
            p.append(tbeam(f'bench_leg_{k}_{x}', (x, 0.03, bz), (x, 0.42, bz), 0.05, 0.4, M['wood'], up=(1, 0, 0)))
    p += [uv(tbox('mag_table', -3.9, -3.1, 0.5, 0.54, -0.6, 0.2, M['wood'])),
          tbox('magazines', -3.75, -3.35, 0.54, 0.57, -0.4, -0.05, M['paper'])]
    lounge = J('Ops_Lounge', p)
    COL('COL_ops_benches', lounge, 0.0, M)
    I = M['iron']
    p = [tcyl('st_body', (-4.0, 0.55, -3.6), 0.3, 0.6, 'y', I, 18, r2=0.24),
         tcyl('st_top', (-4.0, 0.9, -3.6), 0.24, 0.1, 'y', I, 18),
         tcyl_dir('st_flue', (-4.0, 0.95, -3.6), (-4.0, h + 1.5, -3.6), 0.08, I, 12),
         tcyl('st_kettle', (-4.0, 1.03, -3.55), 0.11, 0.16, 'y', M['alu'], 14)]
    COL('COL_ops_stove', J('Ops_Stove', p), 0.1, M)
    p = [tcyl('wc_bottle', (-7.6, 1.3, -4.4), 0.16, 0.42, 'y', M['clearglass'], 16),
         tcyl('wc_stand', (-7.6, 0.55, -4.4), 0.2, 1.1, 'y', M['white'], 16)]
    COL('COL_ops_cooler', J('Ops_WaterCooler', p), 0.0, M)
    # luggage cart with suitcases by the front door
    p = [uv(tbox('lc_bed', -2.5, -1.3, 0.3, 0.35, 3.3, 4.2, M['wood'])),
         tbox('lc_case1', -2.4, -1.5, 0.35, 0.65, 3.4, 3.8, M['leather']),
         tbox('lc_case2', -2.3, -1.6, 0.65, 0.85, 3.45, 3.75, M['card']),
         tcyl_dir('lc_handle', (-2.5, 0.35, 3.75), (-2.9, 1.0, 3.75), 0.02, M['iron'], 6)]
    for x in (-2.4, -1.4):
        for z in (3.35, 4.15):
            p.append(tcyl(f'lc_wheel_{x}_{z}', (x, 0.12, z), 0.12, 0.05, 'z', M['rubber'], 12))
    COL('COL_ops_cart', J('Ops_LuggageCart', p), 0.0, M)
    # operations counter with a flap gap
    p = []
    for x0, x1 in ((1.5, 4.6), (5.6, 7.9)):
        p += [uv(tbox(f'ctr_{x0}', x0, x1, 0.0, 1.05, -0.6, -0.1, M['wood'])),
              uv(tbox(f'ctr_top_{x0}', x0 - 0.05, x1 + 0.05, 1.05, 1.1, -0.65, -0.05, M['planks']))]
    p += [tbox('ctr_ledger', 2.2, 2.7, 1.1, 1.13, -0.5, -0.2, M['paper']),
          tsphere('ctr_bell', (3.5, 1.13, -0.3), 0.05, M['brass'], (10, 6), (1, 0.6, 1))]
    counter = J('Ops_Counter', p)
    col_box('COL_ops_ctr1', 1.45, 4.65, -0.65, -0.05, mat=C)
    col_box('COL_ops_ctr2', 5.55, 7.95, -0.65, -0.05, mat=C)
    # telegraph desk, weather blackboard, wall map, clock, filing cabinet
    p = [uv(tbox('td_top', 5.4, 7.4, 0.76, 0.8, -4.85, -4.0, M['wood'])),
         tbox('td_key', 6.1, 6.3, 0.8, 0.84, -4.4, -4.25, M['brass']),
         tbox('td_sounder', 6.6, 6.85, 0.8, 0.95, -4.7, -4.5, M['brass']),
         tbox('td_pad', 5.6, 5.95, 0.8, 0.82, -4.5, -4.2, M['paper'])]
    for x in (5.5, 7.3):
        for z in (-4.8, -4.1):
            p.append(tbeam(f'td_leg_{x}_{z}', (x, 0.0, z), (x, 0.76, z), 0.05, 0.05, M['wood'], up=(1, 0, 0)))
    COL('COL_ops_tdesk', J('Ops_TelegraphDesk', p), 0.0, M)
    wb = '\n'.join(SIGNS['opsWeather'])
    J('Ops_WeatherBoard', [tbox('wbd', 0.6, 3.4, 1.2, 2.5, -4.88, -4.85, M['chalkboard']),
                           ttext('wbd_text', wb, 0.13, M['chalk'], (2.0, 1.85, -4.845), 'z+')])
    J('Ops_WallMap', [tbox('wm_frame', -7.4, -4.6, 1.2, 2.6, -4.88, -4.85, M['wood']),
                      tbox('wm_sheet', -7.3, -4.7, 1.27, 2.53, -4.85, -4.845, M['map'])]
      + [tbox(f'wm_route_{k}', -7.1 + k * 0.5, -6.8 + k * 0.5, 1.6 + (k % 2) * 0.4, 1.63 + (k % 2) * 0.4, -4.845, -4.84, M['sign_red']) for k in range(5)])
    J('Ops_Clock', [tcyl('clock_face', (-1.4, 2.6, -4.86), 0.22, 0.03, 'z', M['paper'], 24),
                    ttorus('clock_rim', (-1.4, 2.6, -4.85), 0.22, 0.02, 'z', M['wood'], (24, 6)),
                    tbox('clock_h', -1.41, -1.39, 2.6, 2.72, -4.84, -4.835, M['stencil']),
                    tbox('clock_m', -1.4, -1.24, 2.595, 2.605, -4.84, -4.835, M['stencil'])])
    fc = J('Ops_FilingCabinet', [uv(tbox('fc', 7.3, 7.88, 0.0, 1.3, -2.6, -2.0, M['olive']))]
           + [tbox(f'fc_h_{k}', 7.28, 7.3, 0.25 + k * 0.3, 0.27 + k * 0.3, -2.35, -2.25, M['brass']) for k in range(4)])
    COL('COL_ops_filing', fc, 0.0, M)
    lamps = []
    for x in (-5.0, 0.0, 5.0):
        lamps += hanging_bulb(f'ops_bulb_{x}', x, h, 0.0, M, 0.7)
    J('Ops_Lamps', lamps)


# ====================================================================== radio relay / weather shelter
def comms_shelter(M):
    w, d, h, t = 3.0, 2.5, 2.3, 0.1
    parts = walls('cs', w, d, h, t, M['tin'], [('s', -0.45, 0.45, 0.0, 2.0)])
    parts.append(uv(tbox('cs_floor', -w / 2, w / 2, 0.0, 0.04, -d / 2, d / 2, M['concrete'])))
    parts.append(shed_roof('cs', w, d, h, h + 0.25, 0.15, M['roof']))
    parts += [tbox('cs_sign', -0.25, 0.25, 2.03, 2.25, d / 2 + 0.001, d / 2 + 0.01, M['sign_cream']),
              ttext('cs_sign_t', '\n'.join(SIGNS['commsDoor']), 0.06, M['sign_red'], (0.0, 2.14, d / 2 + 0.012), 'z+'),
              tbox('cs_vent', -1.0, -0.6, 1.9, 2.1, -d / 2 - 0.01, -d / 2, M['iron'])]
    J('CommsShelter', parts)
    door_leaf('Door_CommsShelter', (-0.45, 0.04, d / 2 - t / 2), 0.9, 1.95, M['grey'], M['steel'], M['brass'])
    wall_colliders('cs', w, d, t, [('s', -0.45, 0.45, 'COL_Door_CommsShelter')], M['col'])
    # inside: battery racks with glass cells, relay cabinet, line terminal, small desk
    p = []
    for y in (0.3, 0.9):
        p.append(uv(tbox(f'br_shelf_{y}', -1.4, -0.4, y, y + 0.04, -1.15, -0.65, M['wood'])))
        for k in range(4):
            x = -1.3 + k * 0.24
            p += [tbox(f'cell_{y}_{k}', x, x + 0.18, y + 0.04, y + 0.34, -1.05, -0.8, M['clearglass']),
                  tbox(f'plate_{y}_{k}', x + 0.03, x + 0.15, y + 0.06, y + 0.3, -0.95, -0.9, M['iron']),
                  tcyl(f'post_{y}_{k}', (x + 0.09, y + 0.37, -0.92), 0.015, 0.05, 'y', M['brass'], 6)]
    COL('COL_cs_batt', J('Comms_Batteries', p), 0.0, M)
    p = [uv(tbox('rc_body', 0.3, 1.38, 0.0, 1.8, -1.15, -0.75, M['grey']))]
    for k in range(3):
        p.append(tcyl(f'rc_meter_{k}', (0.5 + k * 0.32, 1.45, -0.745), 0.09, 0.02, 'z', M['paper'], 16))
    for k in range(6):
        p.append(tbox(f'rc_switch_{k}', 0.45 + k * 0.15, 0.5 + k * 0.15, 1.0, 1.08, -0.75, -0.72, M['bakelite']))
    p += [tbox('lt_board', 1.37, 1.4, 0.9, 1.7, -0.2, 0.6, M['wood'])]
    for k in range(5):
        p.append(tcyl_dir(f'lt_wire_{k}', (1.36, 1.6 - k * 0.15, 0.0 + k * 0.1), (1.36, 2.2, 0.1 + k * 0.1), 0.006, M['rubber'], 4))
    COL('COL_cs_relay', J('Comms_RelayCabinet', p), 0.0, M)
    J('Comms_Desk', [uv(tbox('cd_top', -1.4, -0.6, 0.75, 0.79, 0.0, 0.7, M['wood'])),
                     tbox('cd_log', -1.2, -0.85, 0.79, 0.82, 0.15, 0.45, M['paper']),
                     ttorus('cd_headset', (-0.75, 0.83, 0.55), 0.07, 0.012, 'z', M['bakelite'], (14, 5))])
    col_box('COL_cs_desk', -1.4, -0.6, 0.0, 0.7, mat=M['col'])
    J('Comms_Lamp', hanging_bulb('cs_bulb', 0.2, h, 0.0, M, 0.4))
    # outside: anemometer mast with spinning cups and a wind vane, instrument screen, rain gauge, aerial
    mx, mz = 3.2, -1.0
    J('Comms_Mast', [tcyl('mast', (mx, 3.0, mz), 0.05, 6.0, 'y', M['steel'], 10),
                     tcyl_dir('guy1', (mx, 4.5, mz), (mx + 2.5, 0.05, mz + 1.5), 0.008, M['steel'], 4),
                     tcyl_dir('guy2', (mx, 4.5, mz), (mx - 1.0, 0.05, mz - 2.8), 0.008, M['steel'], 4),
                     tcyl_dir('guy3', (mx, 4.5, mz), (mx + 1.6, 0.05, mz - 2.4), 0.008, M['steel'], 4),
                     tbox('vane_tail', mx - 0.55, mx - 0.1, 5.85, 6.15, mz - 0.01, mz + 0.01, M['steel']),
                     tcyl_dir('vane_arm', (mx - 0.5, 6.0, mz), (mx + 0.35, 6.0, mz), 0.012, M['steel'], 6),
                     tcyl_dir('vane_tip', (mx + 0.35, 6.0, mz), (mx + 0.5, 6.0, mz), 0.03, M['steel'], 6, r2=0.0)])
    cups = []
    for k in range(3):
        a = k / 3 * math.tau
        ex, ez = math.cos(a) * 0.3, math.sin(a) * 0.3
        cups += [tcyl_dir(f'cup_arm_{k}', (0, 0, 0), (ex, 0, ez), 0.01, M['steel'], 6),
                 tsphere(f'cup_{k}', (ex, 0, ez), 0.06, M['steel'], (10, 6), (1, 1, 0.5))]
    cups.append(tcyl('cup_hub', (0, 0, 0), 0.03, 0.08, 'y', M['steel'], 8))
    cob = J('Comms_Anemometer', cups)
    cob.location = T((mx, 6.35, mz))
    cob['spinRate'] = 1.4
    col_box('COL_cs_mast', mx - 0.15, mx + 0.15, mz - 0.15, mz + 0.15, mat=M['col'])
    p = [tbox('scr_box', -0.4, 0.4, 0.9, 1.5, -0.3, 0.3, M['white']),
         tbox('scr_roof', -0.45, 0.45, 1.5, 1.55, -0.35, 0.35, M['white'])]
    for k in range(5):
        p.append(tbox(f'scr_louvre_{k}', -0.41, 0.41, 0.95 + k * 0.11, 0.98 + k * 0.11, 0.3, 0.31, M['grey']))
    for x in (-0.3, 0.3):
        for z in (-0.2, 0.2):
            p.append(tcyl(f'scr_leg_{x}_{z}', (x, 0.45, z), 0.025, 0.9, 'y', M['wood'], 6))
    screen = J('Comms_InstrumentScreen', p)
    screen.location = T((-3.0, 0, 0.8))
    COL('COL_cs_screen', screen, 0.0, M)
    J('Comms_RainGauge', [tcyl('rg', (-2.8, 0.45, -1.8), 0.1, 0.9, 'y', M['brass'], 14), tcyl('rg_funnel', (-2.8, 0.95, -1.8), 0.13, 0.1, 'y', M['brass'], 14, r2=0.1)])
    J('Comms_Aerial', [tcyl('ae_pole', (0.0, 2.8 + 1.3, -1.0), 0.04, 2.6, 'y', M['wood'], 8),
                       tcyl('ae_far_pole', (0.0, 3.0, -16.0), 0.06, 6.0, 'y', M['wood'], 8),
                       tcyl_dir('ae_wire', (0.0, 5.3, -1.0), (0.0, 5.8, -16.0), 0.006, M['steel'], 4)])
    col_box('COL_cs_aerialpole', -0.15, 0.15, -16.15, -15.85, mat=M['col'])


BUILDINGS = {
    'fuel_farm': fuel_farm,
    'maint_shed': maint_shed,
    'storage_shed': storage_shed,
    'ops_building': ops_building,
    'comms_shelter': comms_shelter,
}

if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(BUILDINGS)
    for name in only:
        reset_scene(['Props', 'Collision', 'Cutters'])
        M = materials(TEX_DIR)
        BUILDINGS[name](M)
        for c in list(bpy.data.collections['Cutters'].objects):
            bpy.data.objects.remove(c)
        size = export_glb(os.path.join(MODELS, f'{name}.glb'), extras=True)
        n = sum(1 for o in bpy.data.objects if o.parent is None and not o.name.startswith('COL_'))
        print(f'EXPORTED {name}.glb ({size:.2f} MB), {n} objects, '
              f'{sum(1 for o in bpy.data.objects if o.name.startswith("COL_"))} colliders')
