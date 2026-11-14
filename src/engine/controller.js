import * as THREE from 'three';

/** First-person controller: pointer-lock mouse look, WASD, Shift to sprint, C to walk slowly. */
export class FirstPersonController {
  constructor(camera, dom, world) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.radius = 0.32;
    this.eyeHeight = 1.65;
    this.walkSpeed = 3.2;
    this.sprintSpeed = 7.5;
    this.slowSpeed = 1.3;
    this.groundHeight = null; // (x, z) => ground y
    this.bounds = null;       // { x: [min, max], z: [min, max] }
    this.onBoundary = null;
    this.sensitivity = 0.0022;

    this.keys = new Set();
    this.active = false; // player is in the game (not on the title / pause screen)
    this.locked = false; // browser granted pointer lock (mouse captured)
    this.frozen = false; // a reading panel or the notebook is open
    this.onLockChange = null;
    this.onFootstep = null;
    this._bobPhase = 0;
    this._dragging = false;

    camera.rotation.order = 'YXZ';

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.dom;
      if (was !== this.locked) this.onLockChange?.(this.locked);
    });
    // Some browsers (and embedded browser panes) refuse pointer lock.
    // Then the player looks around by holding the mouse button and dragging.
    this.dom.addEventListener('mousedown', () => {
      if (!this.active) return;
      if (!this.locked) this.lock();
      this._dragging = true;
    });
    window.addEventListener('mouseup', () => { this._dragging = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.active || this.frozen || !(this.locked || this._dragging)) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    window.addEventListener('keydown', (e) => { if (this.active) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this._dragging = false; });
  }

  setActive(on) {
    this.active = on;
    if (!on) {
      this.keys.clear();
      this._dragging = false;
      if (this.locked) document.exitPointerLock?.();
    }
  }

  lock() {
    try {
      const p = this.dom.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock unavailable: drag-to-look fallback */
    }
  }

  setPosition(x, z, yaw = 0) {
    this.position.set(x, this.groundHeight ? this.groundHeight(x, z) : 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this._apply(0);
  }

  update(dt) {
    const k = this.frozen ? new Set() : this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const slow = k.has('KeyC');
    const speed = slow ? this.slowSpeed : sprint ? this.sprintSpeed : this.walkSpeed;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const target = new THREE.Vector3(-sin * f + cos * s, 0, -cos * f - sin * s);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(speed);

    this.velocity.lerp(target, 1 - Math.exp(-(sprint ? 7 : 12) * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.world.resolve(this.position, this.radius);
    const b = this.bounds;
    if (b) {
      const x = Math.min(b.x[1], Math.max(b.x[0], this.position.x));
      const z = Math.min(b.z[1], Math.max(b.z[0], this.position.z));
      if (x !== this.position.x || z !== this.position.z) {
        this.position.x = x;
        this.position.z = z;
        this.onBoundary?.();
      }
    }
    if (this.groundHeight) this.position.y = this.groundHeight(this.position.x, this.position.z);

    this._apply(dt);
  }

  _apply(dt) {
    const v = Math.hypot(this.velocity.x, this.velocity.z);
    const amt = Math.min(1.4, v / this.walkSpeed);
    const prev = Math.sin(this._bobPhase);
    this._bobPhase += dt * Math.min(v, 5.5) * 2.3;
    const now = Math.sin(this._bobPhase);
    // One step per half bob cycle: fire when the sine crosses zero.
    if (v > 0.4 && Math.sign(prev) !== Math.sign(now)) this.onFootstep?.(amt);

    const bob = Math.abs(now) * 0.045 * amt;
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this._bobPhase) * 0.004 * amt);
  }
}
