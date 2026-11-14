import * as THREE from 'three';
import { loadModel } from '../engine/assets.js';

/**
 * Loads each building's .glb when the player comes within its "load" radius and hides
 * it beyond its "cull" radius (world.json → models). Collision boxes (COL_*) are adopted
 * once on load. Nodes with the custom property "spin" rotate (the airway beacon).
 */
export class Streamer {
  constructor(scene, world, entries) {
    this.scene = scene;
    this.world = world;
    this.items = entries.map((e) => ({ ...e, state: 'idle', root: null }));
    this.spinners = [];
    this.onLoad = null; // (id, root) => void
    this._acc = 1;
  }

  update(dt, p) {
    for (const s of this.spinners) s.rotation.y += dt * s.userData.spinRate * Math.PI * 2;
    this._acc += dt;
    if (this._acc < 0.25) return; // distance checks 4x a second are plenty
    this._acc = 0;
    for (const it of this.items) {
      const d = Math.hypot(p.x - it.position[0], p.z - it.position[2]);
      if (it.state === 'idle' && d < (it.load ?? 400)) this._load(it);
      if (it.root) it.root.visible = d < (it.cull ?? 600);
    }
  }

  async _load(it) {
    it.state = 'loading';
    try {
      const model = await loadModel(it.file);
      const root = new THREE.Group();
      root.name = it.id;
      root.position.fromArray(it.position);
      root.rotation.y = it.rotationY ?? 0;
      root.add(model);
      this.scene.add(root);
      root.updateMatrixWorld(true);
      const cols = [];
      root.traverse((o) => {
        if (o.userData.spin) { o.userData.spinRate = 1 / 8; this.spinners.push(o); attachBeams(o); }
        else if (o.userData.spinRate) this.spinners.push(o); // e.g. the anemometer cups (revolutions per second)
        if (!o.isMesh) return;
        if (o.name.startsWith('COL_')) { cols.push(o); return; }
        o.castShadow = true;
        o.receiveShadow = true;
      });
      for (const c of cols) { this.world.addObject(c, 0, c.name); c.visible = false; }
      it.root = root;
      it.state = 'ready';
      this.onLoad?.(it.id, root);
    } catch (err) {
      console.error(`Could not load ${it.file}`, err);
      it.state = 'failed';
    }
  }
}

/** The beacon's two light beams sweeping through the dust (no real light: additive cones). */
function attachBeams(head) {
  const len = 110;
  const geo = new THREE.ConeGeometry(5, len, 20, 1, true);
  geo.translate(0, -len / 2, 0);
  geo.rotateZ(Math.PI / 2); // tip at the lamp, opening along +x
  // fade from bright at the lamp to nothing at the far end (cone uv: v = 1 at the tip)
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.35, '#555');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.09,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (const s of [1, -1]) {
    const beam = new THREE.Mesh(geo, mat);
    beam.rotation.y = s > 0 ? 0 : Math.PI;
    beam.rotation.z = 0.05;
    beam.position.x = 0.3 * s;
    beam.renderOrder = 3;
    head.add(beam);
  }
}
