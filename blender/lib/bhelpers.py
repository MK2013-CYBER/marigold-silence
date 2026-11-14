"""
Shared Blender helpers for the Marigold Silence build scripts.

Two coordinate systems are used:
  * Blender (Z-up)            box(), beam(), cylinder(), quad()
  * three.js / game (Y-up)    tbox(), tbeam(), tcyl(), tquad(), T()
The glTF exporter maps Blender (x, y, z) -> three (x, z, -y), so T() maps
game coordinates back: three (x, y, z) -> Blender (x, -z, y).
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


# ------------------------------------------------------------------ scene
def reset_scene(collections):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in collections:
        col = bpy.data.collections.new(c)
        bpy.context.scene.collection.children.link(col)


def coll(name):
    return bpy.data.collections[name]


def update():
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ images / materials
def save_image(name, arr, non_color, tex_dir):
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, axis=2)
    h, w, _ = arr.shape
    rgba = np.concatenate([arr, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    img.pixels.foreach_set(rgba.ravel())
    os.makedirs(tex_dir, exist_ok=True)
    img.filepath_raw = os.path.join(tex_dir, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def texture_set(prefix, maps, tex_dir):
    return {k: save_image(f'{prefix}_{k}', a, k != 'color', tex_dir) for k, a in maps.items()}


def material(name, maps=None, color=(0.5, 0.5, 0.5), rough=0.6, metal=0.0,
             emission=None, emission_strength=1.0, alpha=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    maps = maps or {}
    if alpha is not None:
        p.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except AttributeError:
            m.blend_method = 'BLEND'

    def img(image):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = image
        return n

    if 'color' in maps:
        nt.links.new(img(maps['color']).outputs['Color'], p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = (*color, 1)
    if 'roughness' in maps:
        nt.links.new(img(maps['roughness']).outputs['Color'], p.inputs['Roughness'])
    else:
        p.inputs['Roughness'].default_value = rough
    if 'metallic' in maps:
        nt.links.new(img(maps['metallic']).outputs['Color'], p.inputs['Metallic'])
    else:
        p.inputs['Metallic'].default_value = metal
    if 'normal' in maps:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(img(maps['normal']).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if emission is not None:
        if isinstance(emission, bpy.types.Image):
            nt.links.new(img(emission).outputs['Color'], p.inputs['Emission Color'])
        else:
            p.inputs['Emission Color'].default_value = (*emission, 1)
        p.inputs['Emission Strength'].default_value = emission_strength
    return m


# ------------------------------------------------------------------ meshes (Blender coords)
def new_object(name, bm_or_mesh, mat, collection):
    if isinstance(bm_or_mesh, bmesh.types.BMesh):
        me = bpy.data.meshes.new(name)
        bm_or_mesh.to_mesh(me)
        bm_or_mesh.free()
    else:
        me = bm_or_mesh
    if mat and not me.materials:
        me.materials.append(mat)
    ensure_uv(me)
    ob = bpy.data.objects.new(name, me)
    coll(collection).objects.link(ob)
    return ob


def ensure_uv(me):
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    elif me.uv_layers[0].name != 'UVMap':
        me.uv_layers[0].name = 'UVMap'


def _box_bm(x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    v = [bm.verts.new(c) for c in (
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])
    bm.normal_update()
    return bm


def box(name, x0, x1, y0, y1, z0, z1, mat=None, collection='Shell', uv=None):
    ob = new_object(name, _box_bm(min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1)), mat, collection)
    if uv:
        world_uv(ob, *uv)
    return ob


def world_uv(ob, tile_h=2.0, tile_v=8.0, tile_floor=4.0):
    """Box-project UVs from world coordinates (u along the surface, v = height)."""
    update()
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    mw = ob.matrix_world
    for f in bm.faces:
        n = mw.to_3x3() @ f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = mw @ l.vert.co
            if ax == 2:
                l[uv].uv = (c.x / tile_floor, c.y / tile_floor)
            elif ax == 0:
                l[uv].uv = (c.y / tile_h, c.z / tile_v)
            else:
                l[uv].uv = (c.x / tile_h, c.z / tile_v)
    bm.to_mesh(me)
    bm.free()


def beam(name, a, b, w, h, mat, up=(0, 0, 1), tile=1.0, collection='Shell'):
    """Member from a to b. h spans the 'up' side, w the other. UV u runs along the length."""
    a, b = Vector(a), Vector(b)
    ex = b - a
    L = ex.length
    ex.normalize()
    upv = Vector(up)
    if abs(ex.dot(upv)) > 0.95:
        upv = Vector((0, 1, 0)) if abs(ex.y) < 0.9 else Vector((1, 0, 0))
    ez = (upv - ex * upv.dot(ex)).normalized()
    ey = ez.cross(ex)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    corners = {(sx, sy, sz): (sx * L, sy * w / 2, sz * h / 2) for sx in (0, 1) for sy in (-1, 1) for sz in (-1, 1)}
    verts = {k: bm.verts.new(a + ex * c[0] + ey * c[1] + ez * c[2]) for k, c in corners.items()}
    faces = [
        ((0, -1, -1), (0, -1, 1), (0, 1, 1), (0, 1, -1)),
        ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)),
        ((0, -1, -1), (1, -1, -1), (1, -1, 1), (0, -1, 1)),
        ((0, 1, -1), (0, 1, 1), (1, 1, 1), (1, 1, -1)),
        ((0, -1, -1), (0, 1, -1), (1, 1, -1), (1, -1, -1)),
        ((0, -1, 1), (1, -1, 1), (1, 1, 1), (0, 1, 1)),
    ]
    for fk in faces:
        f = bm.faces.new([verts[k] for k in fk])
        for l, k in zip(f.loops, fk):
            lx, ly, lz = corners[k]
            if fk[0][0] == fk[1][0] == fk[2][0]:
                l[uv].uv = (ly / tile + 0.37, lz / tile)
            elif all(k2[1] == fk[0][1] for k2 in fk):
                l[uv].uv = (lx / tile, lz / tile + 0.21)
            else:
                l[uv].uv = (lx / tile, ly / tile + 0.63)
    bm.normal_update()
    return new_object(name, bm, mat, collection)


def cylinder(name, center, radius, depth, axis, mat, segments=14, collection='Shell', radius2=None, cap=True):
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
    rot = {'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(-math.pi / 2, 4, 'X'), 'z': Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ rot, verts=bm.verts)
    return new_object(name, bm, mat, collection)


def torus(name, center, r_major, r_minor, axis, mat, segs=(20, 8), collection='Shell'):
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    rings = []
    for i in range(segs[0]):
        a = 2 * math.pi * i / segs[0]
        ring = []
        for j in range(segs[1]):
            b = 2 * math.pi * j / segs[1]
            r = r_major + r_minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), r_minor * math.sin(b))))
        rings.append(ring)
    for i in range(segs[0]):
        for j in range(segs[1]):
            a, b = rings[i], rings[(i + 1) % segs[0]]
            bm.faces.new((a[j], b[j], b[(j + 1) % segs[1]], a[(j + 1) % segs[1]]))
    rot = {'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'z': Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ rot, verts=bm.verts)
    bm.normal_update()
    return new_object(name, bm, mat, collection)


def quad(name, pts, mat, uvs=((0, 0), (1, 0), (1, 1), (0, 1)), collection='Shell'):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    for l, t in zip(f.loops, uvs):
        l[uv].uv = t
    bm.normal_update()
    return new_object(name, bm, mat, collection)


def apply_boolean(ob, cutters):
    for c in cutters:
        m = ob.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = c
    update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def join(name, objs, collection='Shell'):
    """Merge objects into one mesh (keeps UVs and per-face materials). Result origin = world origin."""
    update()
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        ensure_uv(me)
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        if remap:
            for p in me.polygons:
                p.material_index = remap[p.material_index]
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    for m in mats:
        out.materials.append(m)
    ob = bpy.data.objects.new(name, out)
    coll(collection).objects.link(ob)
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return ob


def set_origin(ob, point):
    """Move the object's origin (pivot) to a world point, keeping the geometry in place."""
    p = Vector(point)
    ob.data.transform(Matrix.Translation(-p))
    ob.location = ob.location + p if ob.location.length else p


def parent(child, par):
    """Parent keeping world position (all objects here are unrotated)."""
    update()
    world = child.matrix_world.translation.copy()
    child.parent = par
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.location = world - par.matrix_world.translation


def marker(name, point, props, collection):
    e = bpy.data.objects.new(name, None)
    e.location = point
    for k, v in props.items():
        e[k] = v
    coll(collection).objects.link(e)
    return e


def text_mesh(name, text, size, mat, collection, extrude=0.0, align='CENTER'):
    """Flat text in the Blender XY plane (facing +Z), centred on the origin."""
    cu = bpy.data.curves.new(name + '_curve', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.extrude = extrude
    tmp = bpy.data.objects.new(name + '_tmp', cu)
    coll(collection).objects.link(tmp)
    update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = name
    me.materials.clear()
    me.materials.append(mat)
    return new_object(name, me, None, collection)


# ------------------------------------------------------------------ game (three.js) coordinates
def T(p):
    x, y, z = p
    return (x, -z, y)


def tbox(name, x0, x1, y0, y1, z0, z1, mat=None, collection='Props', uv=None):
    return box(name, x0, x1, -z1, -z0, y0, y1, mat, collection, uv)


def tbeam(name, a, b, w, h, mat, up=(0, 1, 0), collection='Props', tile=1.0):
    return beam(name, T(a), T(b), w, h, mat, up=T(up), tile=tile, collection=collection)


def tcyl(name, center, r, depth, axis, mat, segments=14, collection='Props', r2=None, cap=True):
    return cylinder(name, T(center), r, depth, {'x': 'x', 'y': 'z', 'z': 'y'}[axis], mat, segments, collection, r2, cap)


def tcyl_dir(name, a, b, r, mat, segments=12, collection='Props', r2=None, cap=True):
    """Cylinder (or cone, with r2) from game point a to game point b."""
    A, Bv = Vector(T(a)), Vector(T(b))
    d = Bv - A
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments, radius1=r,
                          radius2=r if r2 is None else r2, depth=d.length)
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((A + Bv) / 2) @ rot, verts=bm.verts)
    return new_object(name, bm, mat, collection)


def tsphere(name, center, r, mat, segs=(14, 9), scale=(1, 1, 1), collection='Props'):
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=r)
    sx, sy, sz = scale
    m = Matrix.Translation(Vector(T(center))) @ Matrix.Diagonal((sx, sz, sy, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return new_object(name, bm, mat, collection)


def place(ob, pos, ry=0.0):
    """Put an object built around the origin at a game position, turned ry radians about the up axis."""
    ob.location = T(pos)
    ob.rotation_euler = (0, 0, ry)
    return ob


def ttorus(name, center, R, r, axis, mat, segs=(20, 8), collection='Props'):
    """axis = the ring's axis in game coords ('y' = lying flat)."""
    return torus(name, T(center), R, r, {'x': 'x', 'y': 'z', 'z': 'y'}[axis], mat, segs, collection)


def tquad(name, pts, mat, uvs=((0, 0), (1, 0), (1, 1), (0, 1)), collection='Props'):
    return quad(name, [T(p) for p in pts], mat, uvs, collection)


_FACING = {
    'z+': Matrix.Rotation(math.pi / 2, 4, 'X'),
    'z-': Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'),
    'x+': Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'),
    'x-': Matrix.Rotation(-math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'),
    'y+': Matrix.Identity(4),
}


def ttext(name, text, size, mat, center, facing='z+', collection='Props', extrude=0.0, spin=0.0):
    """Text placed in game coords, readable from the direction it faces (e.g. 'z+' = faces south)."""
    ob = text_mesh(name, text, size, mat, collection, extrude)
    m = Matrix.Translation(Vector(T(center))) @ _FACING[facing] @ Matrix.Rotation(spin, 4, 'Z')
    ob.data.transform(m)
    return ob


def col_box(name, x0, x1, z0, z1, collection='Collision', mat=None):
    """Collision box in game coords (x/z footprint, 0..3 m tall)."""
    return tbox(name, x0, x1, 0, 3, z0, z1, mat, collection)


def col_from(name, objs, pad=0.0, collection='Collision', mat=None):
    """Collision box from the world bounds of objects (game x/z footprint)."""
    update()
    xs, ys = [], []
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            xs.append(w.x)
            ys.append(w.y)
    # Blender y = -game z
    return col_box(name, min(xs) - pad, max(xs) + pad, -max(ys) - pad, -min(ys) + pad, collection, mat)


def export_glb(path, extras=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_image_format='JPEG',
        export_jpeg_quality=82,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_tangents=False,
        export_lights=False,
        export_cameras=False,
        export_extras=extras,
    )
    return os.path.getsize(path) / 1e6
