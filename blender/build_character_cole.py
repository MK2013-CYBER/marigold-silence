"""
Agent Danny Cole: the Mixamo "Remy" character + Idle / Walking / Talking animations, as one
compressed .glb for the game.

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_character_cole.py
Output: public/models/cole.glb

The Mixamo downloads live in ../mixamo downloads (outside the project). They are only read.
(A proper 1930s suit and loosened tie are planned for the realism pass, addendum section D.)
"""
import os
import re

import bpy


def fcurves(act):
    """All F-curves of an action (Blender 4.4+ keeps them in layers / strips / channel bags)."""
    if len(getattr(act, 'fcurves', []) or []) > 0:
        return list(act.fcurves)
    out = []
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                out += list(bag.fcurves)
    return out

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
MIXAMO = os.path.join(os.path.dirname(PROJECT), 'mixamo downloads')
OUT = os.path.join(PROJECT, 'public', 'models', 'cole.glb')
ANIMS = {'Idle': 'Idle.fbx', 'Walk': 'Walking.fbx', 'Talk': 'Talking.fbx', 'LookAround': 'Nervously Look Around.fbx',
         'Sit': 'Sitting Idle.fbx', 'Nod': 'Head Nod Yes.fbx', 'Point': 'Pointing.fbx', 'Glance': 'Looking Around.fbx'}
MAX_TEX = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(MIXAMO, 'Remy.fbx'))
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
arm.name = 'Cole'
keep = set(bpy.data.objects)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)  # Remy's own bind-pose action

for name, file in ANIMS.items():
    before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=os.path.join(MIXAMO, file))
    new = [a for a in bpy.data.actions if a not in before]
    act = new[0]
    act.name = name
    # some Mixamo downloads name the bones "mixamorig9:Hips" instead of "mixamorig:Hips";
    # rename the channels so they drive Remy's skeleton
    for fc in fcurves(act):
        if 'mixamorig' in fc.data_path:
            fc.data_path = re.sub(r'mixamorig\d+:', 'mixamorig:', fc.data_path)
    for grp in getattr(act, 'groups', []):
        grp.name = re.sub(r'mixamorig\d+:', 'mixamorig:', grp.name)
    act.use_fake_user = True
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in new[1:]:
        bpy.data.actions.remove(a)
    print('ANIM', name, round(act.frame_range[1] - act.frame_range[0]), 'frames')

# one NLA track per action, so the exporter writes each as its own animation
arm.animation_data_create()
for act in bpy.data.actions:
    track = arm.animation_data.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, int(act.frame_range[0]), act)
    try:
        if hasattr(strip, 'action_slot') and act.slots:
            strip.action_slot = act.slots[0]
    except Exception:  # older Blender: no slots
        pass
    track.mute = True
arm.animation_data.action = None

# shrink textures
for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > MAX_TEX:
        k = MAX_TEX / max(w, h)
        img.scale(int(w * k), int(h * k))

bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_image_format='WEBP', export_image_quality=80,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_skins=True, export_morph=False, export_lights=False, export_cameras=False, export_apply=False,
)
print(f'EXPORTED cole.glb ({os.path.getsize(OUT) / 1e6:.2f} MB)')
