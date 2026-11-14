import * as THREE from 'three';
import { fbm, smoothstep } from './noise.js';

/**
 * The salt flat. Flat (y = 0) across the fenced airfield, rising into low dunes beyond
 * it. One mesh whose vertices are packed densely near the airfield and sparsely far away
 * (where the dust hides everything anyway).
 */
export function createTerrain(scene, cfg, textures) {
  const fx = cfg.fence.x, fz = cfg.fence.z;
  const cx = (fx[0] + fx[1]) / 2, cz = (fz[0] + fz[1]) / 2;
  const road = cfg.road.points;

  // distance from a point to the road polyline (dunes are flattened along the road)
  function roadDist(x, z) {
    let best = Infinity;
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const px = ax + dx * t - x, pz = az + dz * t - z;
      best = Math.min(best, px * px + pz * pz);
    }
    return Math.sqrt(best);
  }

  function heightAt(x, z) {
    // distance outside the fenced rectangle
    const ox = Math.max(fx[0] - x, 0, x - fx[1]);
    const oz = Math.max(fz[0] - z, 0, z - fz[1]);
    const out = Math.hypot(ox, oz);
    if (out < 55) return 0;
    const ramp = smoothstep(55, 320, out);
    const ridge = 1 - Math.abs(fbm(x * 0.006 + 3.1, z * 0.009 - 7.4, 3));
    const dunes = ridge * ridge * 11 + fbm(x * 0.02, z * 0.02, 2) * 2.5 + 2;
    const flat = smoothstep(10, 45, roadDist(x, z));
    return ramp * dunes * (0.15 + 0.85 * flat);
  }

  const N = 220, R = 2300;
  const geo = new THREE.PlaneGeometry(1, 1, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i) * 2, t = pos.getZ(i) * 2; // -1..1
    const x = cx + Math.sign(s) * R * Math.pow(Math.abs(s), 1.65);
    const z = cz + Math.sign(t) * R * Math.pow(Math.abs(t), 1.65);
    pos.setXYZ(i, x, heightAt(x, z), z);
    uv.setXY(i, x / 6, -z / 6);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    map: textures.salt_color,
    normalMap: textures.salt_normal,
    roughnessMap: textures.salt_roughness,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1,
  });
  // Large-scale tint (salt_macro, 1 tile = 300 m) and sandier dunes, to hide tiling.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.macroMap = { value: textures.salt_macro };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform sampler2D macroMap;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mv = texture2D(macroMap, vWorldP.xz / 300.0).r;
        float mv2 = texture2D(macroMap, vWorldP.xz / 47.0 + 0.37).r;
        diffuseColor.rgb *= 0.74 + 0.5 * mv + 0.12 * (mv2 - 0.5);
        float dune = smoothstep(0.4, 5.0, vWorldP.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.50, 0.36), dune * 0.55);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Terrain';
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, heightAt };
}

/** Loads the ground textures made by blender/build_world_textures.py. */
export async function loadGroundTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}textures/world/`;
  const names = ['salt_color', 'salt_normal', 'salt_roughness', 'salt_macro',
    'runway_color', 'runway_normal', 'runway_roughness',
    'apron_color', 'apron_normal', 'apron_roughness',
    'road_color', 'road_normal', 'road_roughness'];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const out = {};
  await Promise.all(names.map(async (n) => {
    const t = await loader.loadAsync(`${base}${n}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, maxAniso);
    if (n.endsWith('_color')) t.colorSpace = THREE.SRGBColorSpace;
    out[n] = t;
  }));
  return out;
}
