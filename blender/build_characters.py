"""
THE MARIGOLD SILENCE: the cast, built from the Mixamo characters in ../mixamo downloads.

Who plays whom (blender/cast.json):
  Remy  -> Agent Danny Cole        Brute -> Abel 'Ox' Brennan      Ch31 -> Julian Ferreira-Blake
  The Boss -> Pryce, Dr Lindqvist, Walter Hobbs (the older men)
  Lola  -> Vivienne Pryce, Billie Strand, Tamsin Quill (the women)

The Mixamo outfits are modern (T-shirts, shorts, a samurai tunic...), so each person gets
1930s clothes built ON the body:
  * "layers": a copy of part of the body (chosen by which bones move it: torso, arms, legs)
    pushed outwards a few millimetres, with a new fabric. Because it keeps the body's skin
    weights it bends with every animation. Jackets, shirts, trousers, sleeves.
  * "vcut" opens a jacket down the front so the shirt and tie show.
  * "skirt": a flared tube from waist to calf or ankle, weighted to hips and legs.
  * "recolor": repaint parts of the original texture (hair colour, a waistcoat, trousers),
    keeping the shading (only the colour changes).
Hats, spectacles, cigarettes, pearls and goggles are added in the game (src/data/cast.json).

Every person also gets the shared animation set (Idle, Walk, Talk, Sit, Nod, Point, Glance,
LookAround, SadIdle, HeadShake).

Run:  Blender -b --factory-startup --python blender/build_characters.py [-- id id ...]
"""
import colorsys
import json
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from pbr_textures import normal_from_height, smoothstep, spectral_noise  # noqa: E402

PROJECT = os.path.dirname(HERE)
MIXAMO = os.path.join(os.path.dirname(PROJECT), 'mixamo downloads')
OUT = os.path.join(PROJECT, 'public', 'models', 'cast')
TEX = os.path.join(HERE, 'textures', 'cast')
ANIMS = {'Idle': 'Idle.fbx', 'Walk': 'Walking.fbx', 'Talk': 'Talking.fbx', 'LookAround': 'Nervously Look Around.fbx',
         'Sit': 'Sitting Idle.fbx', 'Nod': 'Head Nod Yes.fbx', 'Point': 'Pointing.fbx', 'Glance': 'Looking Around.fbx',
         'SadIdle': 'Sad Idle.fbx', 'HeadShake': 'Annoyed Head Shake.fbx'}
BODIES = {'remy': 'Remy.fbx', 'lola': 'Lola B Styperek.fbx', 'boss': 'The Boss.fbx', 'brute': 'Brute.fbx', 'ch31': 'Ch31_nonPBR.fbx'}
MAX_TEX = 1024

with open(os.path.join(HERE, 'cast.json')) as f:
    CAST = json.load(f)


# ------------------------------------------------------------------ fabrics (tileable, 256 px)
def fabric_maps(kind, color, seed=1):
    H = W = 256
    c = np.array(color, dtype=float)
    n = spectral_noise(H, W, 1.4, seed)
    fine = spectral_noise(H, W, 0.25, seed + 1)
    yy, xx = np.mgrid[0:H, 0:W] / H
    height = 0.2 * fine
    rough = 0.75
    if kind == 'tweed':
        weave = (np.sin(xx * math.tau * 48 + yy * math.tau * 48) * 0.5 + 0.5) * 0.5 + 0.5 * (np.sin(xx * math.tau * 96) * 0.5 + 0.5)
        fleck = smoothstep(0.75, 0.9, 0.5 + 0.5 * spectral_noise(H, W, 0.2, seed + 3))
        k = 1 + 0.12 * (weave - 0.5) + 0.06 * n + 0.18 * fleck
        height = 0.4 * weave + 0.2 * fine
        rough = 0.85
    elif kind == 'pinstripe':
        stripe = smoothstep(0.97, 1.0, np.cos(xx * math.tau * 10) * 0.5 + 0.5)
        k = 1 + 0.04 * n + 0.03 * fine + 0.7 * stripe
        rough = 0.7
    elif kind == 'wool':
        k = 1 + 0.08 * n + 0.05 * fine
        rough = 0.9
    elif kind == 'cotton':
        k = 1 + 0.03 * n + 0.03 * fine
        rough = 0.8
    elif kind == 'denim':
        twill = np.sin((xx + yy) * math.tau * 64) * 0.5 + 0.5
        k = 1 + 0.1 * (twill - 0.5) + 0.1 * n + 0.05 * fine
        height = 0.3 * twill
        rough = 0.9
    elif kind == 'leather':
        crease = smoothstep(0.55, 0.75, 0.5 + 0.35 * fine)
        k = 1 + 0.12 * n - 0.25 * crease
        height = 0.3 * fine + 0.4 * crease
        rough = 0.55
    elif kind == 'satin':
        sheen = np.sin(yy * math.tau * 2 + n * 2) * 0.5 + 0.5
        k = 1 + 0.12 * sheen + 0.03 * fine
        rough = 0.35
    elif kind == 'silk':
        k = 1 + 0.06 * n + 0.02 * fine
        rough = 0.4
    else:
        k = 1 + 0.05 * n
    col = np.clip(c[None, None, :] * k[..., None], 0, 1)
    return {'color': col, 'roughness': np.full((H, W), rough) + 0.05 * fine, 'normal': normal_from_height(height, 0.8)}


def save_image(name, arr, non_color):
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, axis=2)
    h, w, _ = arr.shape
    rgba = np.concatenate([arr, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    img.pixels.foreach_set(rgba.ravel())
    os.makedirs(TEX, exist_ok=True)
    img.filepath_raw = os.path.join(TEX, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def fabric_material(name, kind, color, seed=1):
    maps = fabric_maps(kind, color, seed)
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    for key, sock, nc in (('color', 'Base Color', False), ('roughness', 'Roughness', True)):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = save_image(f'{name}_{key}', maps[key], nc)
        nt.links.new(n.outputs['Color'], p.inputs[sock])
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = save_image(f'{name}_normal', maps['normal'], True)
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(n.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Metallic'].default_value = 0.0
    return m


# ------------------------------------------------------------------ helpers
def fcurves(act):
    if len(getattr(act, 'fcurves', []) or []) > 0:
        return list(act.fcurves)
    out = []
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                out += list(bag.fcurves)
    return out


def load_body(file):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(MIXAMO, file))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    return arm


def bone_world(arm, prefix, name):
    b = arm.data.bones.get(prefix + name)
    return arm.matrix_world @ b.head_local if b else None


def mesh_scale(ob):
    return ob.matrix_world.to_scale().x


def recolor(spec):
    """Repaint parts of a body texture. Rules pick pixels by UV box and hue / saturation /
    value ranges, and set their colour while keeping their brightness pattern."""
    mat = bpy.data.materials.get(spec['material'])
    if not mat:
        print('WARN no material', spec['material'])
        return
    node = next((n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and
                 any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links)), None)
    if not node:
        return
    src = node.image
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3]
    hsv = np.zeros_like(rgb)
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = np.where(mx > 0, d / (mx + 1e-6), 0)
    val = mx
    hsv[..., 0], hsv[..., 1], hsv[..., 2] = hue, sat, val
    vv, uu = np.mgrid[0:h, 0:w]
    u, v = uu / w, vv / h  # Blender pixels: row 0 is the bottom (v = 0)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    for rule in spec['rules']:
        m = np.ones((h, w), bool)
        if 'uv' in rule:
            x0, y0, x1, y1 = rule['uv']
            m &= (u >= x0) & (u <= x1) & (v >= y0) & (v <= y1)
        for box in rule.get('notuv', []):
            x0, y0, x1, y1 = box
            m &= ~((u >= x0) & (u <= x1) & (v >= y0) & (v <= y1))
        if 'hue' in rule:
            a0, a1 = rule['hue']
            m &= ((hue >= a0) & (hue <= a1)) if a0 <= a1 else ((hue >= a0) | (hue <= a1))
        if 'sat' in rule:
            m &= (sat >= rule['sat'][0]) & (sat <= rule['sat'][1])
        if 'val' in rule:
            m &= (val >= rule['val'][0]) & (val <= rule['val'][1])
        to = np.array(rule['to'], dtype=np.float32)
        ref = rule.get('ref', float(np.median(lum[m])) if m.any() else 0.5)
        shade = np.clip(lum / max(ref, 1e-3), 0.25, 1.8) ** rule.get('contrast', 1.0)
        new = np.clip(to[None, None, :] * shade[..., None], 0, 1)
        rgb[m] = new[m]
    img = bpy.data.images.new(src.name + '_' + spec['material'] + '_re', w, h, alpha=True)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    for mt in bpy.data.materials:  # every material that used this texture gets the new one
        if mt.node_tree:
            for n in mt.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image == src:
                    n.image = img


def layer(arm, prefix, spec, mats):
    """A garment layer: copy the faces of the source meshes that are mostly moved by the given
    bones, push them outwards, give them a fabric. Keeps skin weights, so it animates."""
    pieces = []
    for src_name in spec['from']:
        src = next((o for o in bpy.data.objects if o.type == 'MESH' and (o.name == src_name or o.name.endswith(':' + src_name))), None)
        if not src:
            print('WARN no mesh', src_name)
            continue
        me = src.data.copy()
        ob = bpy.data.objects.new(f"{spec['name']}_{src_name}", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = src.parent
        ob.matrix_world = src.matrix_world.copy()
        for mod in src.modifiers:
            if mod.type == 'ARMATURE':
                nm = ob.modifiers.new('Armature', 'ARMATURE')
                nm.object = mod.object
        bm = bmesh.new()
        bm.from_mesh(me)
        deform = bm.verts.layers.deform.active
        idx = {g.index for g in src.vertex_groups if any(g.name == prefix + bn for bn in spec.get('bones', []))}
        excl = {g.index for g in src.vertex_groups if any(g.name == prefix + bn for bn in spec.get('exclude', []))}
        lo = spec.get('min', 0.5)

        def keep(vert):
            if spec.get('all'):
                return True
            dv = vert[deform]
            if any(dv.get(k, 0) > spec.get('excludeMax', 0.35) for k in excl):
                return False
            return sum(dv.get(k, 0) for k in idx) >= lo

        sel = {vert for vert in bm.verts if keep(vert)}
        mw = ob.matrix_world
        cut = spec.get('vcut')
        if cut:
            neck = bone_world(arm, prefix, 'Neck')
            chest = bone_world(arm, prefix, cut.get('to', 'Spine1'))
            hips = bone_world(arm, prefix, 'Hips')
            depth = (neck - chest).length

        def face_kept(face):
            if not all(vv in sel for vv in face.verts):
                return False
            if cut:
                c = mw @ face.calc_center_median()
                front = (c.y - hips.y) < -0.02 * (neck.z - hips.z)  # Mixamo characters face -Y
                z0 = chest.z - depth * cut.get('below', 0.1)
                inside = False
                if front and z0 < c.z < neck.z + 0.05:
                    half = cut.get('width', 0.35) * (c.z - z0) + cut.get('base', 0.0)
                    inside = abs(c.x - hips.x) < half
                if cut.get('keep') == 'inside':  # e.g. a tie: only the strip down the middle
                    return inside
                if inside:
                    return False
            return True

        if cut:
            # slice the mesh exactly along the two edges of the V, so the opening has straight edges
            z0 = chest.z - depth * cut.get('below', 0.1)
            inv = mw.inverted()
            for sgn in (1, -1):
                wdt = cut.get('width', 0.35)
                a = Vector((hips.x + sgn * cut.get('base', 0.0), hips.y, z0))
                b = Vector((hips.x + sgn * (cut.get('base', 0.0) + wdt * (neck.z + 0.05 - z0)), hips.y, neck.z + 0.05))
                along = (b - a).normalized()
                nrm = along.cross(Vector((0, 1, 0))).normalized()
                la, ln = inv @ a, (inv.to_3x3() @ nrm).normalized()
                front = [g for g in bm.faces if (mw @ g.calc_center_median()).y < hips.y]
                geom = list({e for f in front for e in f.edges}) + list({v for f in front for v in f.verts}) + front
                bmesh.ops.bisect_plane(bm, geom=geom, plane_co=la, plane_no=ln)
            bm.verts.ensure_lookup_table()
            sel = {vert for vert in bm.verts if keep(vert)}
        bmesh.ops.delete(bm, geom=[fc for fc in bm.faces if not face_kept(fc)], context='FACES')
        bmesh.ops.delete(bm, geom=[vv for vv in bm.verts if not vv.link_faces], context='VERTS')
        bm.normal_update()
        push = spec.get('push', 0.01) / mesh_scale(ob)
        taper = spec.get('taper')  # trouser legs: roomier at the knee, narrower at the ankle
        if taper:
            kz = bone_world(arm, prefix, 'LeftLeg').z
            az = bone_world(arm, prefix, 'LeftFoot').z
        for vv in bm.verts:
            p_ = push
            if taper:
                wz = (mw @ vv.co).z
                k = min(1.0, max(0.0, (kz - wz) / max(kz - az, 1e-6)))
                p_ = (taper[0] + (taper[1] - taper[0]) * k) / mesh_scale(ob)
            vv.co += vv.normal * p_
        bm.to_mesh(me)
        bm.free()
        me.materials.clear()
        me.materials.append(mats[spec['fabric_id']])
        pieces.append(ob)
    return pieces


def skirt(arm, prefix, spec, mat):
    """A flared skirt from the waist down, weighted to the hips and legs."""
    hips = bone_world(arm, prefix, 'Hips')
    spine = bone_world(arm, prefix, 'Spine')
    knee_l = bone_world(arm, prefix, 'LeftLeg')
    foot_l = bone_world(arm, prefix, 'LeftFoot')
    up_l = bone_world(arm, prefix, 'LeftUpLeg')
    left_sign = 1 if up_l.x > hips.x else -1
    top = spine.z - (spine.z - hips.z) * 0.15
    bottom = foot_l.z + (knee_l.z - foot_l.z) * spec.get('hem', 0.15)
    body = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]
    # waist and hip radius from the body's own vertices
    xs, ys = [], []
    for o in body:
        for vtx in o.data.vertices:
            w = o.matrix_world @ vtx.co
            if abs(w.z - hips.z) < 0.04 * (spine.z - foot_l.z + 1e-6) * 3:
                xs.append(abs(w.x - hips.x))
                ys.append(abs(w.y - hips.y))
    rx = (np.percentile(xs, 98) if xs else 0.18) * spec.get('ease', 1.12)
    ry = (np.percentile(ys, 98) if ys else 0.13) * spec.get('ease', 1.12) * 1.05
    rings, segs = 10, 32
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.verify()
    dl = bm.verts.layers.deform.verify()
    gi = {n: i for i, n in enumerate(['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine'])}
    grid = []
    for i in range(rings + 1):
        t = i / rings
        z = top + (bottom - top) * t
        flare = 1 + spec.get('flare', 0.35) * t ** 1.4
        waist = 0.92 if t < 0.1 else 1.0
        row = []
        for j in range(segs):
            a = j / segs * math.tau
            x = hips.x + math.sin(a) * rx * flare * waist
            y = hips.y + math.cos(a) * ry * flare * waist
            vtx = bm.verts.new((x, y, z))
            # weights: hips at the top, the leg on that side lower down, a 50/50 blend at the middle seam
            side = math.sin(a) * left_sign  # >0 = character's left
            wl = 0.5 + 0.5 * max(-1, min(1, side * 2.2))
            legw = smoothstep(0.05, 0.55, np.array(t)).item() * 0.85
            knee = smoothstep(0.65, 1.0, np.array(t)).item() * 0.5 * spec.get('kneeFollow', 1.0)
            hw = 1 - legw
            vals = {'Hips': hw * (1 - (0.3 if t < 0.05 else 0)), 'Spine': hw * (0.3 if t < 0.05 else 0),
                    'LeftUpLeg': legw * wl * (1 - knee), 'RightUpLeg': legw * (1 - wl) * (1 - knee),
                    'LeftLeg': legw * wl * knee, 'RightLeg': legw * (1 - wl) * knee}
            for k2, wv in vals.items():
                if wv > 1e-4:
                    vtx[dl][gi[k2]] = wv
            row.append(vtx)
        grid.append(row)
    for i in range(rings):
        for j in range(segs):
            q = [grid[i][j], grid[i + 1][j], grid[i + 1][(j + 1) % segs], grid[i][(j + 1) % segs]]
            f = bm.faces.new(q)
            for k, l in enumerate(f.loops):
                jj = j + (1 if k in (2, 3) else 0)
                ii = i + (1 if k in (1, 2) else 0)
                l[uvl].uv = (jj / segs * 3, ii / rings * 1.5)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    # make the normals point outwards
    f0 = bm.faces[0]
    if (f0.calc_center_median() - Vector((hips.x, hips.y, f0.calc_center_median().z))).dot(f0.normal) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new('Skirt')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Skirt', me)
    bpy.context.scene.collection.objects.link(ob)
    for name in gi:
        ob.vertex_groups.new(name=prefix + name)
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    me.materials.append(mat)
    return ob


def legs(arm, prefix, spec, mat):
    """1930s trousers: a straight, roomy tube down each leg from the hip to the ankle,
    weighted to the thigh and shin bones (with a soft blend at the knee)."""
    out = []
    for side in ('Left', 'Right'):
        hip = bone_world(arm, prefix, side + 'UpLeg')
        knee = bone_world(arm, prefix, side + 'Leg')
        ankle = bone_world(arm, prefix, side + 'Foot')
        rings, segs = 14, 20
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.verify()
        dl = bm.verts.layers.deform.verify()
        names = [side + 'UpLeg', side + 'Leg', 'Hips']
        r_top, r_knee, r_hem = spec.get('radius', [0.095, 0.075, 0.072])
        grid = []
        for i in range(rings + 1):
            t = i / rings
            if t < 0.5:
                k = t / 0.5
                c = hip.lerp(knee, k)
                r = r_top + (r_knee - r_top) * k
            else:
                k = (t - 0.5) / 0.5
                c = knee.lerp(ankle, k)
                r = r_knee + (r_hem - r_knee) * k
            c = c + Vector((0, 0, spec.get('top', 0.05) * (1 - t) if t < 0.1 else 0))
            row = []
            for j in range(segs):
                a = j / segs * math.tau
                vtx = bm.verts.new((c.x + math.sin(a) * r, c.y + math.cos(a) * r * 1.05, c.z))
                kb = smoothstep(0.4, 0.6, np.array(t)).item()
                hb = 1 - smoothstep(0.0, 0.12, np.array(t)).item()
                w = {0: (1 - kb) * (1 - hb * 0.5), 1: kb, 2: hb * 0.5}
                for gi_, wv in w.items():
                    if wv > 1e-4:
                        vtx[dl][gi_] = wv
                row.append(vtx)
            grid.append(row)
        for i in range(rings):
            for j in range(segs):
                f = bm.faces.new([grid[i][j], grid[i][(j + 1) % segs], grid[i + 1][(j + 1) % segs], grid[i + 1][j]])
                for k, l in enumerate(f.loops):
                    jj = j + (1 if k in (1, 2) else 0)
                    ii = i + (1 if k in (2, 3) else 0)
                    l[uvl].uv = (jj / segs, ii / rings * 2)
        bm.normal_update()
        bm.faces.ensure_lookup_table()
        f0 = bm.faces[0]
        cen = f0.calc_center_median()
        axis_pt = hip
        if (cen - Vector((axis_pt.x, axis_pt.y, cen.z))).dot(f0.normal) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        me = bpy.data.meshes.new(side + 'TrouserLeg')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(side + 'TrouserLeg', me)
        bpy.context.scene.collection.objects.link(ob)
        for n in names:
            ob.vertex_groups.new(name=prefix + n)
        ob.parent = arm
        ob.matrix_parent_inverse = arm.matrix_world.inverted()
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        me.materials.append(mat)
        out.append(ob)
    return out


def import_anims(arm, prefix):
    keep = set(bpy.data.objects)
    for name, file in ANIMS.items():
        before = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=os.path.join(MIXAMO, file))
        new = [a for a in bpy.data.actions if a not in before]
        act = new[0]
        act.name = name
        act.use_fake_user = True
        for fc in fcurves(act):  # bone names: "mixamorig9:Hips" etc. -> this body's prefix
            fc.data_path = re.sub(r'mixamorig\d*:', prefix, fc.data_path)
        for o in list(bpy.data.objects):
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in new[1:]:
            bpy.data.actions.remove(a)
    arm.animation_data_create()
    for act in bpy.data.actions:
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, int(act.frame_range[0]), act)
        try:
            if hasattr(strip, 'action_slot') and act.slots:
                strip.action_slot = act.slots[0]
        except Exception:
            pass
        track.mute = True
    arm.animation_data.action = None


def build(cid, spec):
    arm = load_body(BODIES[spec['body']])
    arm.name = cid
    prefix = re.match(r'(mixamorig\d*:)', arm.data.bones[0].name).group(1)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and any(k in o.name for k in spec.get('remove', [])):
            bpy.data.objects.remove(o, do_unlink=True)
    for rc in spec.get('recolor', []):
        recolor(rc)
    mats = {fid: fabric_material(f'{cid}_{fid}', f['kind'], f['color'], seed=hash(fid) % 97)
            for fid, f in spec.get('fabrics', {}).items()}
    for ly in spec.get('layers', []):
        layer(arm, prefix, ly, mats)
    if 'skirt' in spec:
        skirt(arm, prefix, spec['skirt'], mats[spec['skirt']['fabric_id']])
    if 'legs' in spec:
        legs(arm, prefix, spec['legs'], mats[spec['legs']['fabric_id']])
    for name in spec.get('hide', []):
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.name == name:
                bpy.data.objects.remove(o, do_unlink=True)
                break
    import_anims(arm, prefix)
    for img in bpy.data.images:
        w, h = img.size
        if max(w, h) > MAX_TEX:
            k = MAX_TEX / max(w, h)
            img.scale(int(w * k), int(h * k))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{cid}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_image_format='WEBP', export_image_quality=82,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_skins=True, export_morph=False, export_lights=False, export_cameras=False, export_apply=False)
    print(f'EXPORTED {cid}.glb ({os.path.getsize(path) / 1e6:.2f} MB)')


args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for cid, spec in CAST.items():
    if cid.startswith('_') or (args and cid not in args):
        continue
    build(cid, spec)
