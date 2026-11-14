import * as THREE from 'three';
import * as T from '../engine/textures.js';

/**
 * Model builders referenced by "model" in interactables.json. Each returns a
 * Group with its local origin at the base; moving parts go in userData.parts.
 */

const std = (o) => new THREE.MeshStandardMaterial(o);
let M = null;
function mats() {
  if (M) return M;
  M = {
    red: std({ color: 0x7a2016, roughness: 0.5, metalness: 0.4 }),
    dark: std({ color: 0x1c1a18, roughness: 0.7, metalness: 0.5 }),
    steel: std({ color: 0x55534e, roughness: 0.4, metalness: 0.85 }),
    cabinet: std({ color: 0x3a4036, roughness: 0.55, metalness: 0.5 }),
    brass: std({ color: 0xb08a3c, roughness: 0.3, metalness: 0.9 }),
    paper: std({ map: T.paper(), roughness: 0.95, side: THREE.DoubleSide }),
    tag: std({ color: 0xd8cca8, roughness: 0.95, side: THREE.DoubleSide }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  return M;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Invisible, larger hit box so small things are easy to aim at. */
function hitProxy(w, h, d, y) {
  const m = box(w, h, d, mats().hit, 0, y, 0);
  m.userData.hitProxy = true;
  return m;
}

export const builders = {
  toolbox() {
    const { red, dark, steel } = mats();
    const g = new THREE.Group();
    // Shallow box with a raised tray, so what's inside can be seen from standing height.
    const L = 0.56, H = 0.13, D = 0.28, t = 0.012, tray = 0.08;
    g.add(box(L, t, D, red, 0, t / 2, 0));
    g.add(box(L, H, t, red, 0, H / 2, D / 2 - t / 2));
    g.add(box(L, H, t, red, 0, H / 2, -D / 2 + t / 2));
    g.add(box(t, H, D, red, -L / 2 + t / 2, H / 2, 0));
    g.add(box(t, H, D, red, L / 2 - t / 2, H / 2, 0));
    g.add(box(L - 2 * t, 0.006, D - 2 * t, dark, 0, tray - 0.003, 0));
    const s1 = box(0.22, 0.012, 0.03, steel, -0.13, tray + 0.006, -0.06); s1.rotation.y = 0.2; g.add(s1);
    const s2 = box(0.18, 0.015, 0.025, steel, -0.15, tray + 0.02, 0.05); s2.rotation.y = -0.15; g.add(s2);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 6, 16), steel);
    coil.rotation.x = Math.PI / 2; coil.position.set(0.21, tray + 0.006, -0.06); g.add(coil);
    // lid hinged along the back top edge
    const lid = new THREE.Group();
    lid.position.set(0, H, -D / 2);
    lid.add(box(L + 0.01, 0.02, D + 0.01, red, 0, 0.01, D / 2));
    lid.add(box(0.16, 0.018, 0.02, dark, 0, 0.05, D / 2));
    lid.add(box(0.015, 0.03, 0.015, dark, -0.07, 0.033, D / 2));
    lid.add(box(0.015, 0.03, 0.015, dark, 0.07, 0.033, D / 2));
    g.add(lid);
    g.userData.parts = { lid };
    return g;
  },

  partsCabinet() {
    const { cabinet, dark, steel, brass } = mats();
    const g = new THREE.Group();
    const W = 0.5, H = 0.9, D = 0.45;
    g.add(box(W, H, D, cabinet, 0, H / 2, 0));
    for (const y of [0.16, 0.42]) {
      g.add(box(W - 0.04, 0.24, 0.02, cabinet, 0, y, D / 2 + 0.01));
      g.add(box(0.12, 0.02, 0.025, steel, 0, y + 0.06, D / 2 + 0.03));
    }
    // the top drawer slides out along +z
    const drawer = new THREE.Group();
    drawer.position.set(0, 0.6, 0);
    drawer.add(box(W - 0.04, 0.24, 0.02, cabinet, 0, 0.12, D / 2 + 0.01));
    drawer.add(box(W - 0.08, 0.01, D - 0.04, dark, 0, 0.015, 0));
    for (const s of [-1, 1]) drawer.add(box(0.01, 0.15, D - 0.04, dark, s * (W / 2 - 0.045), 0.08, 0));
    drawer.add(box(W - 0.08, 0.15, 0.01, dark, 0, 0.08, -D / 2 + 0.03));
    drawer.add(box(0.12, 0.02, 0.025, steel, 0, 0.18, D / 2 + 0.03));
    drawer.add(box(0.1, 0.04, 0.004, brass, 0, 0.08, D / 2 + 0.022));
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10), brass);
    hole.rotation.x = Math.PI / 2; hole.position.set(0.17, 0.12, D / 2 + 0.022); drawer.add(hole);
    drawer.add(box(0.004, 0.01, 0.004, dark, 0.17, 0.117, D / 2 + 0.026));
    g.add(drawer);
    g.userData.parts = { drawer };
    return g;
  },

  note() {
    const { paper } = mats();
    const g = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.11), paper);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = 0.002;
    g.add(sheet);
    g.add(hitProxy(0.2, 0.1, 0.16, 0.05)); // tall enough to rise above a box rim
    return g;
  },

  smallKey() {
    const { brass, tag } = mats();
    const g = new THREE.Group();
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 8, 20), brass);
    bow.rotation.x = Math.PI / 2; bow.position.set(-0.025, 0.004, 0); g.add(bow);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.045, 8), brass);
    shaft.rotation.z = Math.PI / 2; shaft.position.set(0.01, 0.004, 0); g.add(shaft);
    g.add(box(0.008, 0.004, 0.012, brass, 0.03, 0.004, 0.007));
    // paper tag on a bit of string, so it can be spotted
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.03), tag);
    label.rotation.set(-Math.PI / 2, 0, 0.5); label.position.set(-0.065, 0.002, 0.02); g.add(label);
    g.add(hitProxy(0.24, 0.08, 0.24, 0.04));
    return g;
  },
};
