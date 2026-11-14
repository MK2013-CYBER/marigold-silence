import * as THREE from 'three';

/** Hart's flashlight: a spotlight fixed to the camera. Kept in the scene when off so shaders never recompile. */
export class Flashlight {
  constructor(camera) {
    this.on = false;
    this.light = new THREE.SpotLight(0xfff0d2, 0, 26, 0.36, 0.55, 2);
    this.light.position.set(0.18, -0.15, 0.1);
    this.light.target.position.set(0.05, -0.1, -1);
    camera.add(this.light, this.light.target);
    this.intensity = 45;
    this._flicker = 0;
  }

  toggle() {
    this.on = !this.on;
    this._flicker = this.on ? 0.12 : 0;
  }

  update(dt) {
    if (!this.on) { this.light.intensity = 0; return; }
    if (this._flicker > 0) {
      this._flicker -= dt;
      this.light.intensity = Math.random() < 0.5 ? this.intensity * 0.2 : this.intensity;
    } else {
      this.light.intensity = this.intensity;
    }
  }
}
