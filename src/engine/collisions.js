import * as THREE from 'three';

/**
 * Flat (XZ) collision world. The player is a vertical capsule, so on a single
 * floor it reduces to a circle pushed out of axis-aligned boxes.
 */
export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.byName = new Map();
    this.debug = new THREE.Group();
    this.debug.visible = false;
    this._debugMat = new THREE.LineBasicMaterial({ color: 0x55ff77, depthTest: false, transparent: true, opacity: 0.8 });
  }

  addBox(minX, minZ, maxX, maxZ, name = null) {
    const b = { minX, minZ, maxX, maxZ, enabled: true, name };
    this.boxes.push(b);
    if (name) this.byName.set(name, b);
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(maxX - minX, 2, maxZ - minZ));
    const lines = new THREE.LineSegments(geo, this._debugMat);
    lines.position.set((minX + maxX) / 2, 1, (minZ + maxZ) / 2);
    lines.renderOrder = 999;
    this.debug.add(lines);
    b.debugLines = lines;
    return b;
  }

  /** Adds the world-space bounding box of an object, unless it sits above head height. */
  addObject(obj, pad = 0, name = null) {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj);
    if (b.min.y > 1.9) return null;
    return this.addBox(b.min.x - pad, b.min.z - pad, b.max.x + pad, b.max.z + pad, name);
  }

  /** Switch a named box on/off (doors: solid when closed, passable when open). */
  setEnabled(name, on) {
    const b = this.byName.get(name);
    if (!b) return false;
    b.enabled = on;
    b.debugLines.visible = on;
    return true;
  }

  /** Pushes a circle (p.x, p.z, radius r) out of every box it overlaps. Mutates p. */
  resolve(p, r) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          p.x += dx * k;
          p.z += dz * k;
        } else {
          // Centre is inside the box: leave by the shallowest side.
          const left = p.x - b.minX + r;
          const right = b.maxX - p.x + r;
          const back = p.z - b.minZ + r;
          const front = b.maxZ - p.z + r;
          const m = Math.min(left, right, back, front);
          if (m === left) p.x -= left;
          else if (m === right) p.x += right;
          else if (m === back) p.z -= back;
          else p.z += front;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }
}
