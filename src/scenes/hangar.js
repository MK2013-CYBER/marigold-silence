import * as THREE from 'three';
import * as T from '../engine/textures.js';
import data from '../data/scenes/hangar.json';
import { lightsFromMarkers, animateLamps } from '../engine/lights.js';

// Hangar interior half-extents (metres); origin = hangar centre at floor level.
const HX = 20;
const HZ = 12.5;
const WALL_H = 9;

const STORM = { StormGlass: [0.16, 3.0], StormLeak: [0.55, 4.0] }; // emissive: storm light, lightning peak
const NO_SHADOW = /^(Hangar_Floor|Hangar_WindowGlass|StormOutside|Outside_Ground|Office_Rug|OilPool|CompanyName)/;

/**
 * Location B: the hangar, Pryce's office, the survey office and darkroom.
 * Geometry comes from two Blender-built models (see blender/):
 *   shell  walls, roof, frame, rooms, doors        (hangar_shell.glb)
 *   props  everything inside, plus light markers   (hangar_props.glb)
 * Naming contract: COL_* = collision boxes, HIT_* = aiming boxes, LIGHT_* = lights,
 * nodes with the custom property "sway" swing gently in the draught.
 */
export function buildHangar(scene, world, shell, props) {
  const root = new THREE.Group();
  root.name = 'hangar';
  scene.add(root);
  root.add(shell, props);
  root.updateMatrixWorld(true);

  const colliders = [];
  const markers = [];
  const swingers = [];
  const stormMats = new Set();
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  root.traverse((o) => {
    if (o.userData.light) { markers.push(o); return; }
    if (o.userData.sway) swingers.push({ o, phase: Math.random() * 10 });
    if (!o.isMesh) return;
    if (o.name.startsWith('COL_')) { colliders.push(o); return; }
    if (o.name.startsWith('HIT_')) { o.material = hitMat; o.userData.hitProxy = true; return; }
    // multi-material nodes arrive as a Group of meshes named <node>_1, <node>_2...
    o.castShadow = !(NO_SHADOW.test(o.name) || NO_SHADOW.test(o.parent?.name ?? ''));
    o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = 8;
      if (m.transparent) { m.depthWrite = false; o.castShadow = false; }
      if (STORM[m.name]) { stormMats.add(m); o.castShadow = false; }
    }
  });
  for (const c of colliders) {
    world.addObject(c, 0, c.name);
    c.visible = false;
  }
  for (const m of stormMats) m.emissiveIntensity = STORM[m.name][0];

  // ---------- lights described by LIGHT_* markers in the props model ----------
  // (sky, sun and ambient light belong to the open world: src/world/atmosphere.js)
  const lamps = lightsFromMarkers(root);
  let lampsOn = true;

  // ---------- storm light spilling under the sliding doors ----------
  const leakMat = new THREE.MeshBasicMaterial({
    map: T.softGradient(), color: 0x5a3f1e, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const leakBase = leakMat.color.clone();
  const flashBright = new THREE.Color(2.2, 2.2, 2.6);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.6), leakMat);
  sill.rotation.x = -Math.PI / 2;
  sill.position.set(0, 0.012, HZ - 1.2);
  sill.userData.noRay = true;
  root.add(sill);

  // ---------- drifting dust ----------
  const DUST = 2200;
  const pos = new Float32Array(DUST * 3);
  const vel = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * (HX - 0.5);
    pos[i * 3 + 1] = Math.random() * WALL_H;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * (HZ - 0.5);
    vel[i * 3] = (Math.random() - 0.5) * 0.05;
    vel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05 - 0.02;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.035, map: T.dustSprite(), color: 0xb89a72, transparent: true, opacity: 0.35,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  dust.userData.noRay = true;
  root.add(dust);

  // ---------- per frame ----------
  const api = {
    spawn: data.spawn,
    root,
    named: {},
    props,
    /** Interior lamps on/off. They are switched off when you are well away from the hangar:
        lighting the open ground with 12 extra lamps is what costs frames outdoors. */
    setLights(on) {
      if (lampsOn === on) return;
      lampsOn = on;
      for (const l of lamps) l.light.visible = on;
    },
    /** flash: lightning brightness 0..1 from the atmosphere */
    update(dt, t, flash = 0) {
      for (const s of swingers) {
        s.o.rotation.x = Math.sin(t * 0.7 + s.phase) * 0.025;
        s.o.rotation.z = Math.sin(t * 0.53 + s.phase * 2) * 0.02;
      }
      animateLamps(lamps, dt, t);

      const gust = Math.sin(t * 0.3) * 0.03;
      for (let i = 0; i < DUST; i++) {
        const j = i * 3;
        pos[j] += (vel[j] + gust) * dt;
        pos[j + 1] += (vel[j + 1] + Math.sin(t + i) * 0.01) * dt;
        pos[j + 2] += vel[j + 2] * dt;
        if (pos[j] > HX) pos[j] = -HX; else if (pos[j] < -HX) pos[j] = HX;
        if (pos[j + 1] > WALL_H) pos[j + 1] = 0; else if (pos[j + 1] < 0) pos[j + 1] = WALL_H;
        if (pos[j + 2] > HZ) pos[j + 2] = -HZ; else if (pos[j + 2] < -HZ) pos[j + 2] = HZ;
      }
      dustGeo.attributes.position.needsUpdate = true;

      const f = flash;
      for (const m of stormMats) {
        const [base, peak] = STORM[m.name];
        m.emissiveIntensity = base + (peak - base) * f;
      }
      leakMat.color.copy(leakBase).lerp(flashBright, f * 0.4);
    },
  };
  return api;
}
