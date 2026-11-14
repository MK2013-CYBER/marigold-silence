"""
Ground textures for the open world (salt flat, runway, apron, road), saved as JPEGs in
public/textures/world/. They are loaded directly by the game (no .glb needed).

Run: /Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_world_textures.py
"""
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
import pbr_textures as tex  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), 'public', 'textures', 'world')
os.makedirs(OUT, exist_ok=True)


def save(name, arr, quality=85):
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, axis=2)
    h, w, _ = arr.shape
    rgba = np.concatenate([arr, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'  # write the numbers exactly as computed
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'JPEG'
    path = os.path.join(OUT, name + '.jpg')
    img.save(filepath=path, quality=quality)
    print('SAVED', name, f'{os.path.getsize(path) / 1024:.0f} KB')


def save_set(prefix, maps):
    for k, a in maps.items():
        save(f'{prefix}_{k}', a, 88 if k == 'normal' else 82)


save_set('salt', tex.salt_crust(1024))
save('salt_macro', tex.macro_variation(512)['color'], 85)
save_set('runway', tex.gravel_strip(512, 1024, 120, ruts=(0.33, 0.41, 0.59, 0.67)))
save_set('apron', tex.gravel_strip(512, 512, 130, ruts=(), base=(0.55, 0.48, 0.38), edge=0.0))
save_set('road', tex.gravel_strip(512, 256, 140, ruts=(0.3, 0.7), base=(0.50, 0.42, 0.31), edge=0.12))
