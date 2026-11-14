"""
THE MARIGOLD SILENCE: Sable Flat outbuildings, each exported as its own .glb.

  fuel_farm.glb       fenced fuel compound: tank, visible pump, drum pump, attendant booth
  maint_shed.glb      tin maintenance shed: flare pots, boundary lights, road drag, tools
  storage_shed.glb    wooden storage shed: paint, tarps, rope, spare markers
  ops_building.glb    operations & passenger building: porch, lounge, counter, telegraph, weather board
  comms_shelter.glb   Radio & weather: Hobbs's radio, Morse key, relay gear, weather instruments
  quarters.glb        mess hall, kitchen and six bedrooms (addendum v2)
  hq_shed.glb         the Investigator's Shed: board, timeline, reports, lab table, cot (addendum v2)

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
from bhelpers import (T, apply_boolean, col_box, col_from, export_glb, join, marker, reset_scene, set_origin, tbeam, tbox,  # noqa: E402
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
    # the airfield generator and its fuse panel (addendum v2: P4 lives here)
    p = [uv(tbox('gen_skid', -3.4, -1.6, 0.03, 0.15, 0.6, 1.5, M['iron'])),
         uv(tbox('gen_block', -3.2, -2.3, 0.15, 0.95, 0.75, 1.35, M['olive'])),
         tcyl('gen_dynamo', (-1.95, 0.55, 1.05), 0.28, 0.6, 'x', M['grey'], 18),
         tcyl('gen_flywheel', (-2.25, 0.62, 1.05), 0.42, 0.08, 'x', M['iron'], 24),
         tbox('gen_radiator', -3.4, -3.25, 0.15, 1.05, 0.7, 1.4, M['steel']),
         tcyl_dir('gen_exhaust', (-2.8, 0.95, 0.9), (-2.8, 3.2, 0.9), 0.05, M['iron'], 10),
         tcyl('gen_tank', (-2.75, 1.15, 1.05), 0.16, 0.5, 'x', M['red'], 14)]
    COL('COL_MS_Generator', J('MaintShed_Generator', p), 0.05, M)
    J('MaintShed_FusePanel', [tbox('fp_box', 1.6, 2.4, 1.15, 1.95, 2.84, 2.9, M['grey']),
                              tbox('fp_switch', 2.1, 2.2, 1.35, 1.6, 2.81, 2.84, M['bakelite'])]
      + [tcyl(f'fp_fuse_{k}', (1.72 + (k % 3) * 0.12, 1.75 - (k // 3) * 0.2, 2.83), 0.03, 0.04, 'z', M['white'], 10) for k in range(6)])
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
    wins = [('s', x, 1.0, 2.2) for x in (-5.5, -2.5, 2.5, 5.5)] + [('w', z, 1.0, 2.2) for z in (-2.5, 2.5)]
    # east wall: two doors into the annex (darkroom, records room)
    openings = front + [('n', 4.0, 4.9, 0.0, 2.1), ('e', 1.0, 1.9, 0.0, 2.1), ('e', -2.6, -1.7, 0.0, 2.1)] + [(s, a - 0.6, a + 0.6, y0, y1) for s, a, y0, y1 in wins]
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
    wall_colliders('ops', w, d, t, [('s', -0.55, 0.55, 'COL_Door_Ops'), ('n', 4.0, 4.9, 'COL_Door_OpsBack'),
                                    ('e', 1.0, 1.9, 'COL_Door_OpsDarkroom'), ('e', -2.6, -1.7, 'COL_Door_OpsRecords')], C)
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
    ops_annex(M)
    lamps = []
    for x in (-5.0, 0.0, 5.0):
        lamps += hanging_bulb(f'ops_bulb_{x}', x, h, 0.0, M, 0.7)
    J('Ops_Lamps', lamps)


def ops_annex(M):
    """Darkroom + records room wing on the east side of Operations (addendum v2: P6, P17)."""
    C = M['col']
    x0, x1, z0, z1, h, t = 8.0, 13.6, -5.0, 3.0, 3.0, 0.12
    parts = [uv(tbox('ax_s', x0, x1, 0, h, z1 - t, z1, M['siding'])),
             uv(tbox('ax_e', x1 - t, x1, 0, h, z0, z1, M['siding'])),
             uv(tbox('ax_floor', x0, x1, 0.0, 0.03, z0, z1, M['floor'])),
             uv(tbox('ax_part', x0, x1 - t, 0, h, -1.06, -0.94, M['planks']))]
    north = tbox('ax_n', x0, x1, 0, h, z0, z0 + t, M['siding'])
    apply_boolean(north, [tbox('cut_axw', 10.2, 11.4, 1.7, 2.3, z0 - 1, z0 + 1, None, 'Cutters')])
    uv(north)
    parts.append(north)
    parts += [tbeam('ax_wf_b', (10.2, 1.72, z0 + t / 2), (11.4, 1.72, z0 + t / 2), t + 0.04, 0.05, M['wood']),
              tbeam('ax_wf_t', (10.2, 2.28, z0 + t / 2), (11.4, 2.28, z0 + t / 2), t + 0.04, 0.05, M['wood']),
              tquad('ax_glass', [(10.2, 1.7, z0 + t / 2), (11.4, 1.7, z0 + t / 2), (11.4, 2.3, z0 + t / 2), (10.2, 2.3, z0 + t / 2)], M['glass'])]
    roof = shed_roof('ax', 8.0, x1 - x0, 2.95, 3.3, 0.2, M['roof'])
    roof.rotation_euler = (0, 0, math.pi / 2)   # slopes down towards the east
    roof.location = T(((x0 + x1) / 2, 0, (z0 + z1) / 2))
    parts.append(roof)
    J('Ops_Annex', parts)
    door_leaf('Door_OpsDarkroom', (7.94, 0.03, 1.0), 0.9, 2.08, M['siding'], M['wood'], M['brass'], along='z')
    door_leaf('Door_OpsRecords', (7.94, 0.03, -2.6), 0.9, 2.08, M['siding'], M['wood'], M['brass'], along='z')
    col_box('COL_ax_s', x0, x1, z1 - t, z1, mat=C)
    col_box('COL_ax_n', x0, x1, z0, z0 + t, mat=C)
    col_box('COL_ax_e', x1 - t, x1, z0, z1, mat=C)
    col_box('COL_ax_part', x0, x1, -1.06, -0.94, mat=C)

    # darkroom (south half): sink bench, trays, enlarger, chemical shelves, drying line, safelight
    p = [uv(tbox('dk_sink', 12.85, 13.48, 0, 0.86, -0.8, 2.75, M['wood'])),
         tbox('dk_lining', 12.9, 13.43, 0.86, 0.9, -0.7, 2.65, M['iron'])]
    for k, z in enumerate((-0.3, 0.7, 1.7)):
        p.append(tbox(f'dk_tray_{k}', 12.92, 13.4, 0.9, 0.95, z - 0.3, z + 0.3, M['white']))
        p.append(tbox(f'dk_liquid_{k}', 12.95, 13.37, 0.93, 0.935, z - 0.27, z + 0.27, M['fuel']))
    p.append(tcyl_dir('dk_tap', (13.47, 1.4, 0.7), (13.2, 1.4, 0.7), 0.02, M['brass'], 8))
    COL('COL_dk_sink', J('Ops_DarkroomSink', p), 0.0, M)
    p = [uv(tbox('dk_entable', 8.3, 9.0, 0.72, 0.76, 1.9, 2.75, M['wood'])),
         tcyl_dir('dk_column', (8.65, 0.76, 2.65), (8.65, 1.6, 2.65), 0.025, M['iron'], 10),
         tbox('dk_head', 8.52, 8.78, 1.3, 1.5, 2.25, 2.5, M['bakelite']),
         tcyl('dk_lens', (8.65, 1.12, 2.35), 0.05, 0.1, 'y', M['iron'], 12)]
    for x in (8.35, 8.95):
        for z in (1.95, 2.7):
            p.append(tbeam(f'dk_enleg_{x}_{z}', (x, 0, z), (x, 0.72, z), 0.04, 0.04, M['wood'], up=(1, 0, 0)))
    COL('COL_dk_enlarger', J('Ops_DarkroomEnlarger', p), 0.0, M)
    p = []
    for k, y in enumerate((0.5, 1.0, 1.5, 2.0)):
        p.append(uv(tbox(f'dk_shelf_{k}', 9.6, 12.4, y, y + 0.03, 2.6, 2.86, M['wood'])))
        x = 9.7
        while x < 12.3:
            r = R.uniform(0.035, 0.06)
            hh = R.uniform(0.12, 0.25)
            p.append(tcyl(f'dk_jar_{k}_{x:.2f}', (x + r, y + 0.03 + hh / 2, 2.73), r, hh, 'y', M['fuel'] if R.random() < 0.6 else M['clearglass'], 10))
            x += 2 * r + 0.05
    COL('COL_dk_shelves', J('Ops_DarkroomShelves', p), 0.0, M)
    p = [tcyl_dir('dk_line', (8.1, 2.15, 0.3), (13.4, 2.15, 0.3), 0.003, M['iron'], 5)]
    for k in range(4):
        x = 9.0 + k * 1.0
        p.append(tbox(f'dk_print_{k}', x - 0.12, x + 0.12, 1.85, 2.13, 0.298, 0.302, M['paper']))
    p += [tbox('dk_safelight', 13.38, 13.48, 1.9, 2.2, -0.5, -0.1, M['safelight'])]
    J('Ops_DarkroomDetails', p)

    # records room (north half): filing cabinets, manifest shelves, sorting table
    p = []
    for k in range(3):
        xa = 8.5 + k * 1.3
        p.append(uv(tbox(f'rc_cab_{k}', xa, xa + 0.6, 0, 1.3, z0 + t, z0 + t + 0.6, M['olive'])))
        for j in range(4):
            p.append(tbox(f'rc_h_{k}_{j}', xa + 0.25, xa + 0.35, 0.25 + j * 0.3, 0.27 + j * 0.3, z0 + t + 0.6, z0 + t + 0.62, M['brass']))
    COL('COL_rc_cabinets', J('Ops_RecordsCabinets', p), 0.0, M)
    p = []
    for k, y in enumerate((0.1, 0.65, 1.2, 1.75)):
        p.append(uv(tbox(f'rc_shelf_{k}', 12.9, 13.48, y, y + 0.03, -4.6, -1.3, M['wood'])))
        z = -4.5
        while z < -1.5:
            wd = R.uniform(0.25, 0.4)
            p.append(tbox(f'rc_box_{k}_{z:.2f}', 12.95, 13.43, y + 0.03, y + 0.03 + R.uniform(0.2, 0.35), z, z + wd, M['card']))
            z += wd + 0.04
    COL('COL_rc_shelves', J('Ops_RecordsShelves', p), 0.0, M)
    p = [uv(tbox('rc_table', 9.4, 11.4, 0.76, 0.8, -3.2, -2.2, M['pwood'])),
         tbox('rc_cards', 9.8, 10.6, 0.8, 0.83, -2.9, -2.5, M['paper'])]
    for x in (9.5, 11.3):
        for z in (-3.1, -2.3):
            p.append(tbeam(f'rc_leg_{x}_{z}', (x, 0, z), (x, 0.76, z), 0.05, 0.05, M['pwood'], up=(1, 0, 0)))
    COL('COL_rc_table', J('Ops_RecordsTable', p), 0.0, M)
    J('Ops_AnnexLamps', hanging_bulb('ax_bulb_d', 10.8, h, 1.0, M, 0.5) + hanging_bulb('ax_bulb_r', 10.8, h, -3.0, M, 0.5))


# ====================================================================== radio relay / weather shelter
def comms_shelter(M):
    """Radio & weather (addendum v2): Hobbs's radio, the Morse key and tape, relay gear, weather instruments."""
    w, d, h, t = 5.0, 3.6, 2.5, 0.1
    parts = walls('cs', w, d, h, t, M['tin'], [('s', -0.45, 0.45, 0.0, 2.0)])
    parts.append(uv(tbox('cs_floor', -w / 2, w / 2, 0.0, 0.04, -d / 2, d / 2, M['concrete'])))
    parts.append(shed_roof('cs', w, d, h, h + 0.3, 0.15, M['roof']))
    parts += [tbox('cs_sign', -0.25, 0.25, 2.03, 2.25, d / 2 + 0.001, d / 2 + 0.01, M['sign_cream']),
              ttext('cs_sign_t', '\n'.join(SIGNS['commsDoor']), 0.06, M['sign_red'], (0.0, 2.14, d / 2 + 0.012), 'z+'),
              tbox('cs_vent', -1.6, -1.2, 1.9, 2.1, -d / 2 - 0.01, -d / 2, M['iron'])]
    J('CommsShelter', parts)
    door_leaf('Door_CommsShelter', (-0.45, 0.04, d / 2 - t / 2), 0.9, 1.95, M['grey'], M['steel'], M['brass'])
    wall_colliders('cs', w, d, t, [('s', -0.45, 0.45, 'COL_Door_CommsShelter')], M['col'])
    C = M['col']
    # Hobbs's radio desk along the back wall: transmitter/receiver, Morse key, sounder, paper-tape reel, logbook
    p = [uv(tbox('rd_top', -0.2, 2.3, 0.76, 0.8, -1.7, -1.0, M['pwood'])),
         uv(tbox('rd_radio', 0.3, 1.3, 0.8, 1.35, -1.68, -1.25, M['bakelite']))]
    for k in range(3):
        p.append(tcyl(f'rd_dial_{k}', (0.5 + k * 0.3, 1.12, -1.245), 0.07, 0.02, 'z', M['paper'], 16))
    for k in range(4):
        p.append(tcyl(f'rd_knob_{k}', (0.45 + k * 0.22, 0.9, -1.24), 0.025, 0.03, 'z', M['brass'], 10))
    p += [tbox('rd_key_base', 1.5, 1.75, 0.8, 0.82, -1.25, -1.1, M['pwood']),
          tbox('rd_key_lever', 1.52, 1.73, 0.83, 0.845, -1.2, -1.15, M['brass']),
          tcyl('rd_key_knob', (1.72, 0.86, -1.175), 0.02, 0.025, 'y', M['bakelite'], 10),
          tbox('rd_sounder', 1.9, 2.15, 0.8, 0.95, -1.6, -1.4, M['brass']),
          tcyl('rd_tape', (1.0, 0.86, -1.08), 0.09, 0.05, 'z', M['paper'], 18),
          tbox('rd_log', -0.05, 0.25, 0.8, 0.83, -1.45, -1.1, M['paper']),
          tbox('rd_logcover', -0.06, 0.26, 0.795, 0.8, -1.46, -1.09, M['leather'])]
    for x in (-0.1, 2.2):
        for z in (-1.65, -1.05):
            p.append(tbeam(f'rd_leg_{x}_{z}', (x, 0.04, z), (x, 0.76, z), 0.05, 0.05, M['pwood'], up=(1, 0, 0)))
    COL('COL_cs_radio', J('Comms_RadioDesk', p), 0.0, M)
    p = [tcyl('rd_chair_seat', (1.0, 0.45, -0.55), 0.2, 0.04, 'y', M['wood'], 14)]
    for k in range(3):
        a = k / 3 * math.tau
        p.append(tcyl_dir(f'rd_chair_leg_{k}', (1.0, 0.44, -0.55), (1.0 + 0.2 * math.cos(a), 0.04, -0.55 + 0.2 * math.sin(a)), 0.02, M['wood'], 6))
    J('Comms_Chair', p)
    # call-log cabinet, battery racks, relay cabinet (west side)
    J('Comms_CallLogCabinet', [uv(tbox('cl_cab', 1.9, 2.4, 0.04, 1.2, 0.4, 1.2, M['olive']))]
      + [tbox(f'cl_h_{k}', 1.88, 1.9, 0.3 + k * 0.3, 0.33 + k * 0.3, 0.75, 0.85, M['brass']) for k in range(3)])
    col_box('COL_cs_calllog', 1.9, 2.4, 0.4, 1.2, mat=C)
    p = []
    for y in (0.3, 0.9):
        p.append(uv(tbox(f'br_shelf_{y}', -2.4, -1.4, y, y + 0.04, -1.7, -1.2, M['wood'])))
        for k in range(4):
            x = -2.3 + k * 0.24
            p += [tbox(f'cell_{y}_{k}', x, x + 0.18, y + 0.04, y + 0.34, -1.6, -1.35, M['clearglass']),
                  tbox(f'plate_{y}_{k}', x + 0.03, x + 0.15, y + 0.06, y + 0.3, -1.5, -1.45, M['iron'])]
    COL('COL_cs_batt', J('Comms_Batteries', p), 0.0, M)
    p = [uv(tbox('rc_body', -2.4, -1.9, 0.04, 1.8, -0.9, 0.3, M['grey']))]
    for k in range(3):
        p.append(tcyl(f'rc_meter_{k}', (-1.895, 1.45, -0.6 + k * 0.32), 0.09, 0.02, 'x', M['paper'], 16))
    COL('COL_cs_relay', J('Comms_RelayCabinet', p), 0.0, M)
    J('Comms_Lamp', hanging_bulb('cs_bulb', 0.6, h, -0.6, M, 0.4))
    # outside: anemometer mast with spinning cups and a wind vane, instrument screen, rain gauge, aerial
    mx, mz = 4.4, -1.0
    J('Comms_Mast', [tcyl('mast', (mx, 3.0, mz), 0.05, 6.0, 'y', M['steel'], 10),
                     tcyl_dir('guy1', (mx, 4.5, mz), (mx + 2.5, 0.05, mz + 1.5), 0.008, M['steel'], 4),
                     tcyl_dir('guy2', (mx, 4.5, mz), (mx - 1.0, 0.05, mz - 2.8), 0.008, M['steel'], 4),
                     tcyl_dir('guy3', (mx, 4.5, mz), (mx + 1.6, 0.05, mz - 2.4), 0.008, M['steel'], 4),
                     tbox('vane_tail', mx - 0.55, mx - 0.1, 5.85, 6.15, mz - 0.01, mz + 0.01, M['steel']),
                     tcyl_dir('vane_arm', (mx - 0.5, 6.0, mz), (mx + 0.35, 6.0, mz), 0.012, M['steel'], 6)])
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
    col_box('COL_cs_mast', mx - 0.15, mx + 0.15, mz - 0.15, mz + 0.15, mat=C)
    p = [tbox('scr_box', -0.4, 0.4, 0.9, 1.5, -0.3, 0.3, M['white']),
         tbox('scr_roof', -0.45, 0.45, 1.5, 1.55, -0.35, 0.35, M['white'])]
    for k in range(5):
        p.append(tbox(f'scr_louvre_{k}', -0.41, 0.41, 0.95 + k * 0.11, 0.98 + k * 0.11, 0.3, 0.31, M['grey']))
    for x in (-0.3, 0.3):
        for z in (-0.2, 0.2):
            p.append(tcyl(f'scr_leg_{x}_{z}', (x, 0.45, z), 0.025, 0.9, 'y', M['wood'], 6))
    screen = J('Comms_InstrumentScreen', p)
    screen.location = T((-4.0, 0, 0.8))
    COL('COL_cs_screen', screen, 0.0, M)
    J('Comms_RainGauge', [tcyl('rg', (-3.8, 0.45, -1.9), 0.1, 0.9, 'y', M['brass'], 14), tcyl('rg_funnel', (-3.8, 0.95, -1.9), 0.13, 0.1, 'y', M['brass'], 14, r2=0.1)])
    J('Comms_Aerial', [tcyl('ae_pole', (0.0, 2.8 + 1.3, -1.2), 0.04, 2.6, 'y', M['wood'], 8),
                       tcyl('ae_far_pole', (0.0, 3.0, -16.0), 0.06, 6.0, 'y', M['wood'], 8),
                       tcyl_dir('ae_wire', (0.0, 5.3, -1.2), (0.0, 5.8, -16.0), 0.006, M['steel'], 4)])
    col_box('COL_cs_aerialpole', -0.15, 0.15, -16.15, -15.85, mat=C)


# ====================================================================== interior wall helper
def inner_wall(name, x0, x1, z0, z1, h, mat, doors, C, door_h=2.1):
    """Axis-aligned interior wall with door openings. doors: [(a0, a1, collider_name)] along the long axis."""
    along_x = (x1 - x0) >= (z1 - z0)
    ob = tbox(name, x0, x1, 0, h, z0, z1, mat)
    cuts = []
    for a0, a1, _ in doors:
        if along_x:
            cuts.append(tbox('cut', a0, a1, -1, door_h, z0 - 1, z1 + 1, None, 'Cutters'))
        else:
            cuts.append(tbox('cut', x0 - 1, x1 + 1, -1, door_h, a0, a1, None, 'Cutters'))
    if cuts:
        apply_boolean(ob, cuts)
    uv(ob)
    lo, hi = (x0, x1) if along_x else (z0, z1)
    cur, k = lo, 0
    for a0, a1, cname in sorted(doors) + [(hi, hi, None)]:
        if a0 - cur > 0.02:
            if along_x:
                col_box(f'COL_{name}_{k}', cur, a0, z0, z1, mat=C)
            else:
                col_box(f'COL_{name}_{k}', x0, x1, cur, a0, mat=C)
            k += 1
        if cname:
            if along_x:
                col_box(cname, a0, a1, z0, z1, mat=C)
            else:
                col_box(cname, x0, x1, a0, a1, mat=C)
        cur = max(cur, a1)
    return ob


# ====================================================================== quarters (mess hall, kitchen, six bedrooms)
def quarters(M):
    W, D, H, t = 24.0, 12.0, 3.2, 0.15
    hw, hd = W / 2, D / 2
    C = M['col']
    win_s = [-10.5, -4.5, 0.33, 5.0, 9.67]
    win_n = [-10.5, -5.0, 0.33, 5.0, 9.67]
    openings = [('s', -8.55, -7.45, 0.0, 2.15), ('e', -0.5, 0.5, 0.0, 2.15)]
    openings += [('s', a - 0.6, a + 0.6, 1.0, 2.1) for a in win_s] + [('n', a - 0.6, a + 0.6, 1.0, 2.1) for a in win_n]
    openings += [('w', a - 0.6, a + 0.6, 1.0, 2.1) for a in (-2.5, 2.5)]
    parts = walls('q', W, D, H, t, M['siding'], openings)
    parts.append(uv(tbox('q_floor', -hw, hw, 0.0, 0.03, -hd, hd, M['floor'])))
    parts += gable_roof('q', W, D, H, 1.6, 0.4, M['roof'], M['siding'])
    for x in (-8.0, -4.0, 0.0, 4.0, 8.0):
        parts.append(tbeam(f'q_tie_{x}', (x, H - 0.08, -hd), (x, H - 0.08, hd), 0.12, 0.16, M['wood']))
    for a in win_s:
        parts += window(f'q_ws_{a}', 's', a, 1.2, 1.0, 2.1, W, D, t, M)
    for a in win_n:
        parts += window(f'q_wn_{a}', 'n', a, 1.2, 1.0, 2.1, W, D, t, M)
    for a in (-2.5, 2.5):
        parts += window(f'q_ww_{a}', 'w', a, 1.2, 1.0, 2.1, W, D, t, M)
    parts += [tbox('q_sign', -10.2, -5.8, 2.45, 2.95, hd, hd + 0.04, M['sign_cream']),
              ttext('q_sign_t', SIGNS['quartersSign'], 0.32, M['stencil'], (-8.0, 2.7, hd + 0.045), 'z+')]
    # interior walls: mess | corridor + six bedrooms
    rooms_x = [0.33, 5.0, 9.67]
    P = M['planks']
    parts += [inner_wall('qw_part_n', -2.075, -1.925, -hd + t, -1.075, H, P, [], C),
              inner_wall('qw_part_s', -2.075, -1.925, 1.075, hd - t, H, P, [], C),
              inner_wall('qw_corr_n', -1.925, hw - t, -1.075, -0.925, H, P, [(cx - 0.45, cx + 0.45, f'COL_Door_Q_Room{i + 1}') for i, cx in enumerate(rooms_x)], C),
              inner_wall('qw_corr_s', -1.925, hw - t, 0.925, 1.075, H, P, [(cx - 0.45, cx + 0.45, f'COL_Door_Q_Room{i + 4}') for i, cx in enumerate(rooms_x)], C)]
    for xd in (2.67, 7.33):
        parts.append(inner_wall(f'qw_div_n_{xd}', xd - 0.075, xd + 0.075, -hd + t, -1.075, H, P, [], C))
        parts.append(inner_wall(f'qw_div_s_{xd}', xd - 0.075, xd + 0.075, 1.075, hd - t, H, P, [], C))
    for i, cx in enumerate(rooms_x):
        parts.append(ttext(f'q_plate_n{i}', SIGNS['quartersRooms'][i], 0.09, M['stencil'], (cx, 2.3, -0.92), 'z+'))
        parts.append(ttext(f'q_plate_s{i}', SIGNS['quartersRooms'][i + 3], 0.09, M['stencil'], (cx, 2.3, 0.92), 'z-'))
    J('Quarters', parts)
    door_leaf('Door_Q_Front', (-8.55, 0.03, hd - t / 2), 1.1, 2.12, M['siding'], M['wood'], M['brass'])
    door_leaf('Door_Q_East', (hw - t / 2, 0.03, -0.5), 1.0, 2.12, M['siding'], M['wood'], M['brass'], along='z')
    wall_colliders('q', W, D, t, [('s', -8.55, -7.45, 'COL_Door_Q_Front'), ('e', -0.5, 0.5, 'COL_Door_Q_East')], C)
    for i, cx in enumerate(rooms_x):
        door_leaf(f'Door_Q_Room{i + 1}', (cx - 0.45, 0.03, -1.0), 0.9, 2.08, M['planks'], M['wood'], M['brass'])
        door_leaf(f'Door_Q_Room{i + 4}', (cx - 0.45, 0.03, 1.0), 0.9, 2.08, M['planks'], M['wood'], M['brass'])

    # ---- kitchen corner and mess hall
    I = M['iron']
    p = [uv(tbox('k_counter', -11.85, -11.2, 0, 0.9, -5.6, -1.5, M['wood'])),
         uv(tbox('k_top', -11.85, -11.15, 0.9, 0.95, -5.65, -1.45, M['planks'])),
         tbox('k_sink', -11.75, -11.3, 0.85, 0.96, -3.6, -2.9, M['alu']),
         tcyl_dir('k_pump', (-11.7, 0.95, -3.0), (-11.7, 1.35, -3.0), 0.03, I, 8)]
    # drying rack: two cups and two plates
    p += [tbox('k_rack', -11.7, -11.3, 0.95, 0.98, -2.4, -1.8, M['wood'])]
    for k in range(2):
        p.append(tcyl(f'k_cup_{k}', (-11.5, 1.03, -2.3 + k * 0.15), 0.04, 0.09, 'y', M['white'], 10))
        p.append(tcyl(f'k_plate_{k}', (-11.55, 1.1, -2.0 + k * 0.03), 0.11, 0.015, 'x', M['white'], 16))
    COL('COL_q_counter', J('Quarters_KitchenCounter', p), 0.0, M)
    p = [uv(tbox('range_body', -10.8, -9.6, 0, 0.85, -5.85, -5.15, I)),
         tbox('range_top', -10.85, -9.55, 0.85, 0.9, -5.85, -5.1, I),
         tbox('range_ashpan', -10.6, -10.0, 0.08, 0.2, -5.12, -5.08, M['steel']),
         tbox('range_door', -10.5, -10.1, 0.35, 0.6, -5.13, -5.1, M['ember']),
         tcyl_dir('range_flue', (-10.2, 0.9, -5.6), (-10.2, H + 1.4, -5.6), 0.08, I, 12),
         tcyl('range_kettle', (-10.0, 0.98, -5.5), 0.12, 0.16, 'y', M['alu'], 14),
         tcyl('range_pot', (-10.5, 1.0, -5.45), 0.15, 0.2, 'y', I, 14)]
    COL('COL_q_range', J('Quarters_Range', p), 0.05, M)
    J('Quarters_ProvisionLedger', [tbox('pl_hook', -7.6, -7.5, 1.6, 1.65, -5.85, -5.8, M['brass']),
                                   tbox('pl_book', -7.75, -7.35, 1.15, 1.6, -5.84, -5.8, M['leather'])])
    # long table and benches
    p = [uv(tbox('mt_top', -9.0, -4.0, 0.74, 0.79, 0.3, 1.4, M['pwood']))]
    for x in (-8.8, -4.2):
        for z in (0.4, 1.3):
            p.append(tbeam(f'mt_leg_{x}_{z}', (x, 0, z), (x, 0.74, z), 0.07, 0.07, M['pwood'], up=(1, 0, 0)))
    for z in (-0.2, 1.9):
        p.append(uv(tbox(f'mt_bench_{z}', -9.0, -4.0, 0.42, 0.47, z - 0.18, z + 0.18, M['wood'])))
        for x in (-8.8, -4.2):
            p.append(tbeam(f'mt_bleg_{z}_{x}', (x, 0, z), (x, 0.42, z), 0.05, 0.3, M['wood'], up=(1, 0, 0)))
    for k in range(6):
        p.append(tcyl(f'mt_mug_{k}', (-8.5 + k * 0.8, 0.84, 0.6 + (k % 2) * 0.5), 0.04, 0.09, 'y', M['enamel'], 10))
    COL('COL_q_table', J('Quarters_MessTable', p), 0.0, M)
    p = [uv(tbox('bar_cab', -4.2, -2.6, 0, 1.1, hd - t - 0.5, hd - t, M['pwood']))]
    for k in range(5):
        p.append(tcyl(f'bar_bottle_{k}', (-4.0 + k * 0.3, 1.25, hd - t - 0.25), 0.04, 0.28, 'y', M['clearglass'] if k % 2 else M['fuel'], 10))
    COL('COL_q_bar', J('Quarters_BarCabinet', p), 0.0, M)
    p = [uv(tbox('rp_table', -3.2, -2.4, 0.7, 0.74, -5.8, -5.1, M['pwood'])),
         uv(tbox('rp_box', -3.1, -2.5, 0.74, 0.9, -5.7, -5.2, M['pwood'])),
         tcyl('rp_platter', (-2.8, 0.91, -5.45), 0.15, 0.015, 'y', M['bakelite'], 24),
         tcyl_dir('rp_horn', (-2.6, 0.95, -5.6), (-2.75, 1.35, -5.75), 0.03, M['brass'], 18, r2=0.2, cap=False)]
    for x in (-3.15, -2.45):
        for z in (-5.75, -5.15):
            p.append(tbeam(f'rp_leg_{x}_{z}', (x, 0, z), (x, 0.7, z), 0.04, 0.04, M['pwood'], up=(1, 0, 0)))
    COL('COL_q_gram', J('Quarters_RecordPlayer', p), 0.0, M)
    lamps = []
    for x in (-9.5, -4.5, 2.0, 7.0):
        lamps += hanging_bulb(f'q_bulb_{x}', x, H, 0.0 if x > 0 else 1.0, M, 0.6)
    J('Quarters_Lamps', lamps)

    # ---- six bedrooms: bed under the outer wall, chest, chair, table with candle, luggage
    for i, cx in enumerate(rooms_x * 2):
        s = -1 if i < 3 else 1          # north rooms (-z) and south rooms (+z)
        zo = s * (hd - t)               # outer wall face
        n = i + 1
        bz0, bz1 = sorted((zo, zo - s * 0.95))
        p = [uv(tbox(f'r{n}_bed', cx - 2.05, cx - 0.15, 0.25, 0.42, bz0, bz1, M['wood'])),
             tbox(f'r{n}_mattress', cx - 2.0, cx - 0.2, 0.42, 0.55, bz0 + 0.03, bz1 - 0.03, M['linen']),
             tbox(f'r{n}_blanket', cx - 1.6, cx - 0.2, 0.55, 0.58, bz0 + 0.02, bz1 - 0.02, M['blanket']),
             tbox(f'r{n}_pillow', cx - 1.95, cx - 1.65, 0.55, 0.63, bz0 + 0.12, bz1 - 0.12, M['linen'])]
        for x in (cx - 2.0, cx - 0.2):
            for z in (bz0 + 0.05, bz1 - 0.05):
                p.append(tbeam(f'r{n}_bleg_{x}_{z}', (x, 0, z), (x, 0.25, z), 0.05, 0.05, M['wood'], up=(1, 0, 0)))
        cz0, cz1 = sorted((zo, zo - s * 0.5))
        p += [uv(tbox(f'r{n}_chest', cx + 0.2, cx + 1.1, 0, 0.5, cz0, cz1, M['pwood'])),
              tbox(f'r{n}_chest_lock', cx + 0.6, cx + 0.7, 0.35, 0.45, cz1 if s < 0 else cz0, (cz1 if s < 0 else cz0) - s * 0.01, M['brass'])]
        tz = zo - s * 0.35
        p += [uv(tbox(f'r{n}_table', cx + 1.4, cx + 2.0, 0.7, 0.74, tz - 0.3, tz + 0.3, M['pwood'])),
              tcyl(f'r{n}_candle', (cx + 1.7, 0.8, tz), 0.025, 0.12, 'y', M['linen'], 8),
              tcyl(f'r{n}_holder', (cx + 1.7, 0.75, tz), 0.06, 0.02, 'y', M['brass'], 12)]
        for x in (cx + 1.45, cx + 1.95):
            for z in (tz - 0.25, tz + 0.25):
                p.append(tbeam(f'r{n}_tleg_{x}_{z}', (x, 0, z), (x, 0.7, z), 0.035, 0.035, M['pwood'], up=(1, 0, 0)))
        lz = s * 1.6
        p += [uv(tbox(f'r{n}_case', cx + 1.0, cx + 1.7, 0.03, 0.25, lz - 0.25, lz + 0.25, M['leather'])),
              tbox(f'r{n}_case_handle', cx + 1.25, cx + 1.45, 0.25, 0.29, lz - 0.02, lz + 0.02, M['bakelite']),
              uv(tbox(f'r{n}_chair', cx + 0.3, cx + 0.75, 0.42, 0.46, s * 3.0 - 0.22, s * 3.0 + 0.22, M['wood'])),
              uv(tbox(f'r{n}_chair_back', cx + 0.3, cx + 0.75, 0.46, 0.9, s * 3.0 - s * 0.24, s * 3.0 - s * 0.2, M['wood']))]
        room = J(f'Quarters_Room{n}', p)
        col_box(f'COL_q_r{n}_bed', cx - 2.05, cx - 0.15, bz0, bz1, mat=C)
        col_box(f'COL_q_r{n}_chest', cx + 0.2, cx + 1.1, cz0, cz1, mat=C)
        col_box(f'COL_q_r{n}_table', cx + 1.4, cx + 2.0, tz - 0.3, tz + 0.3, mat=C)


# ====================================================================== the Investigator's Shed (HQ)
def hq_shed(M):
    W, D, H, t = 7.0, 5.5, 2.8, 0.12
    hw, hd = W / 2, D / 2
    C = M['col']
    openings = [('s', -2.4, -1.5, 0.0, 2.05), ('s', 1.0, 2.2, 1.1, 1.9), ('e', -1.1, 0.1, 1.2, 1.9), ('w', 1.0, 2.2, 1.1, 1.9)]
    parts = walls('hq', W, D, H, t, M['siding'], openings)
    parts.append(uv(tbox('hq_floor', -hw, hw, 0.0, 0.03, -hd, hd, M['floor'])))
    parts += gable_roof('hq', W, D, H, 1.0, 0.3, M['roof'], M['siding'])
    for x in (-2.0, 0.0, 2.0):
        parts.append(tbeam(f'hq_tie_{x}', (x, H - 0.08, -hd), (x, H - 0.08, hd), 0.1, 0.14, M['wood']))
    parts += window('hq_wf', 's', 1.6, 1.2, 1.1, 1.9, W, D, t, M)
    parts += window('hq_we', 'e', -0.5, 1.2, 1.2, 1.9, W, D, t, M)
    parts += window('hq_ww', 'w', 1.6, 1.2, 1.1, 1.9, W, D, t, M)
    parts += [uv(tbox('hq_rug', -1.2, 1.8, 0.03, 0.04, -1.6, 1.0, M['blanket'])),
              tbox('hq_sign', -2.5, -1.4, 2.12, 2.32, hd, hd + 0.02, M['sign_cream']),
              ttext('hq_sign_t', SIGNS['hqDoor'], 0.07, M['sign_red'], (-1.95, 2.22, hd + 0.025), 'z+')]
    J('HQ_Shed', parts)
    door_leaf('Door_HQ', (-2.4, 0.03, hd - t / 2), 0.9, 2.02, M['siding'], M['wood'], M['brass'])
    wall_colliders('hq', W, D, t, [('s', -2.4, -1.5, 'COL_Door_HQ')], C)
    zb = -hd + t

    # the investigation board: a big cork wall with a few blank cards (the real board is the in-game UI)
    p = [uv(tbox('ib_frame', -2.75, 1.75, 0.72, 2.38, zb, zb + 0.03, M['pwood'])),
         uv(tbox('ib_cork', -2.65, 1.65, 0.8, 2.3, zb + 0.03, zb + 0.05, M['cork']))]
    for k in range(7):
        x = -2.3 + (k % 4) * 1.0 + (0.2 if k > 3 else 0)
        y = 1.95 - (k // 4) * 0.6
        p.append(tbox(f'ib_card_{k}', x - 0.16, x + 0.16, y - 0.11, y + 0.11, zb + 0.05, zb + 0.055, M['paper']))
        p.append(tsphere(f'ib_pin_{k}', (x, y + 0.08, zb + 0.06), 0.012, M['sign_red'], (8, 5)))
    for a, b in ((0, 2), (1, 5), (2, 6)):
        xa = -2.3 + (a % 4) * 1.0 + (0.2 if a > 3 else 0); ya = 1.95 - (a // 4) * 0.6 + 0.08
        xb = -2.3 + (b % 4) * 1.0 + (0.2 if b > 3 else 0); yb = 1.95 - (b // 4) * 0.6 + 0.08
        p.append(tcyl_dir(f'ib_string_{a}_{b}', (xa, ya, zb + 0.065), (xb, yb, zb + 0.065), 0.003, M['sign_red'], 4))
    J('HQ_Board', p)

    # the timeline wall: a long strip on the west wall, hours 18:00 to 06:00
    xw = -hw + t
    p = [uv(tbox('tl_board', xw, xw + 0.03, 1.3, 2.0, -2.35, 0.9, M['pwood'])),
         tbox('tl_strip', xw + 0.03, xw + 0.035, 1.55, 1.75, -2.25, 0.8, M['paper'])]
    hours = SIGNS['hqTimelineHours']
    for k, lab in enumerate(hours):
        z = -2.15 + k * (2.85 / (len(hours) - 1))
        p.append(tbox(f'tl_tick_{k}', xw + 0.035, xw + 0.04, 1.55, 1.75, z - 0.005, z + 0.005, M['stencil']))
        p.append(ttext(f'tl_lab_{k}', lab, 0.06, M['stencil'], (xw + 0.045, 1.85, z), 'x+'))
    J('HQ_Timeline', p)

    # cot with army blanket, clock above it
    p = [uv(tbox('cot_frame', 2.55, 3.35, 0.32, 0.38, -2.5, -0.5, M['wood'])),
         tbox('cot_canvas', 2.6, 3.3, 0.38, 0.45, -2.45, -0.55, M['linen']),
         tbox('cot_blanket', 2.58, 3.32, 0.45, 0.48, -2.0, -0.55, M['blanket']),
         tbox('cot_pillow', 2.7, 3.2, 0.45, 0.53, -2.42, -2.12, M['linen'])]
    for z in (-2.45, -0.55):
        p.append(tcyl_dir(f'cot_x1_{z}', (2.6, 0.0, z), (3.3, 0.36, z), 0.015, M['iron'], 6))
        p.append(tcyl_dir(f'cot_x2_{z}', (3.3, 0.0, z), (2.6, 0.36, z), 0.015, M['iron'], 6))
    J('HQ_Cot', p)
    col_box('COL_hq_cot', 2.55, 3.38, -2.5, -0.5, mat=C)
    xe = hw - t
    J('HQ_Clock', [tcyl('clk_face', (xe - 0.02, 2.1, -1.8), 0.17, 0.03, 'x', M['paper'], 24),
                   ttorus('clk_rim', (xe - 0.03, 2.1, -1.8), 0.17, 0.015, 'x', M['pwood'], (24, 6)),
                   tbox('clk_h', xe - 0.05, xe - 0.045, 2.1, 2.2, -1.81, -1.79, M['stencil']),
                   tbox('clk_m', xe - 0.05, xe - 0.045, 2.095, 2.105, -1.8, -1.68, M['stencil'])])

    # report desk under the front window: reports, typewriter, paraffin lamp, chair
    p = [uv(tbox('rd_top', 0.5, 2.6, 0.74, 0.78, 1.85, 2.6, M['pwood'])),
         uv(tbox('rd_drawers', 2.0, 2.55, 0.1, 0.74, 1.9, 2.55, M['pwood']))]
    for x in (0.55, 2.55):
        for z in (1.9, 2.55):
            p.append(tbeam(f'rd_leg_{x}_{z}', (x, 0, z), (x, 0.74, z), 0.05, 0.05, M['pwood'], up=(1, 0, 0)))
    J('HQ_Desk', p)
    col_box('COL_hq_desk', 0.5, 2.6, 1.85, 2.6, mat=C)
    J('HQ_Reports', [tbox('rep_folder', 0.75, 1.2, 0.78, 0.8, 2.0, 2.35, M['card'])]
      + [tbox(f'rep_sheet_{k}', 0.8 + k * 0.01, 1.15 + k * 0.01, 0.8 + k * 0.006, 0.805 + k * 0.006, 2.03, 2.32, M['paper']) for k in range(5)])
    p = [tbox('tw_body', 1.55, 2.0, 0.78, 0.92, 2.05, 2.4, M['bakelite']),
         tcyl('tw_roller', (1.775, 0.98, 2.33), 0.04, 0.5, 'x', M['bakelite'], 12),
         tbox('tw_paper', 1.62, 1.93, 0.98, 1.2, 2.35, 2.355, M['paper'])]
    for r in range(3):
        for k in range(8):
            p.append(tcyl(f'tw_key_{r}_{k}', (1.6 + k * 0.05, 0.92 - r * 0.02, 2.1 + r * 0.05), 0.012, 0.01, 'y', M['white'], 8))
    J('HQ_Typewriter', p)
    J('HQ_Lamp', [tcyl('pl_base', (2.4, 0.83, 2.0), 0.07, 0.1, 'y', M['brass'], 14),
                  tcyl('pl_font', (2.4, 0.92, 2.0), 0.06, 0.08, 'y', M['brass'], 14, r2=0.04),
                  tcyl('pl_chimney', (2.4, 1.05, 2.0), 0.035, 0.18, 'y', M['bulb'], 12, r2=0.025)])
    marker('LIGHT_HQ', T((2.4, 1.1, 2.0)), {'light': 'point', 'intensity': 11, 'distance': 8, 'color': '#ffc98a', 'flicker': 1}, 'Props')
    J('HQ_Chair', [uv(tbox('hc_seat', 1.3, 1.75, 0.44, 0.48, 1.2, 1.65, M['wood'])),
                   uv(tbox('hc_back', 1.3, 1.75, 0.48, 0.92, 1.18, 1.22, M['wood']))]
      + [tbeam(f'hc_leg_{x}_{z}', (x, 0, z), (x, 0.44, z), 0.035, 0.035, M['wood'], up=(1, 0, 0)) for x in (1.33, 1.72) for z in (1.23, 1.62)])

    # lab table: fingerprint kit, powder, brush, magnifier, tweezers
    p = [uv(tbox('lt_top', -2.6, -0.9, 0.86, 0.9, -0.5, 0.4, M['pwood']))]
    for x in (-2.55, -0.95):
        for z in (-0.45, 0.35):
            p.append(tbeam(f'lt_leg_{x}_{z}', (x, 0, z), (x, 0.86, z), 0.05, 0.05, M['pwood'], up=(1, 0, 0)))
    p += [tbox('fk_case', -2.4, -1.9, 0.9, 1.0, -0.3, 0.05, M['leather']),
          tbox('fk_lid', -2.4, -1.9, 1.0, 1.25, -0.32, -0.3, M['leather']),
          tcyl('fk_powder', (-1.7, 0.96, -0.2), 0.04, 0.12, 'y', M['bakelite'], 10),
          tcyl_dir('fk_brush', (-1.55, 0.91, 0.0), (-1.3, 0.91, 0.12), 0.01, M['pwood'], 6),
          ttorus('mg_ring', (-1.2, 0.915, -0.15), 0.05, 0.008, 'y', M['brass'], (16, 6)),
          tcyl('mg_lens', (-1.2, 0.915, -0.15), 0.048, 0.004, 'y', M['clearglass'], 16),
          tcyl_dir('mg_handle', (-1.15, 0.915, -0.1), (-1.0, 0.915, 0.05), 0.012, M['bakelite'], 8),
          tbox('fk_cards', -2.2, -1.95, 0.9, 0.91, 0.1, 0.3, M['paper'])]
    J('HQ_LabTable', p)
    col_box('COL_hq_lab', -2.6, -0.9, -0.5, 0.4, mat=C)
    # case file box, stove
    J('HQ_CaseBox', [uv(tbox('cb_box', -0.55, 0.15, 0.03, 0.4, 2.0, 2.5, M['card'])),
                     tbox('cb_files', -0.5, 0.1, 0.4, 0.46, 2.05, 2.45, M['paper'])])
    col_box('COL_hq_case', -0.55, 0.15, 2.0, 2.5, mat=C)
    I = M['iron']
    J('HQ_Stove', [tcyl('hs_body', (-3.0, 0.45, 1.9), 0.22, 0.5, 'y', I, 16, r2=0.18),
                   tcyl('hs_top', (-3.0, 0.75, 1.9), 0.18, 0.08, 'y', I, 16),
                   tbox('hs_grate', -2.8, -2.77, 0.3, 0.45, 1.8, 2.0, M['ember']),
                   tcyl_dir('hs_flue', (-3.0, 0.8, 1.9), (-3.0, H + 1.2, 1.9), 0.06, I, 10),
                   tcyl('hs_kettle', (-3.0, 0.84, 1.9), 0.09, 0.12, 'y', M['alu'], 12)])
    col_box('COL_hq_stove', -3.3, -2.7, 1.6, 2.2, mat=C)


BUILDINGS = {
    'fuel_farm': fuel_farm,
    'maint_shed': maint_shed,
    'storage_shed': storage_shed,
    'ops_building': ops_building,
    'comms_shelter': comms_shelter,
    'quarters': quarters,
    'hq_shed': hq_shed,
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
