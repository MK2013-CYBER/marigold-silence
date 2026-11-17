import * as THREE from 'three';
import { rng } from '../engine/textures.js';
import { valueNoise } from './noise.js';

const OUT_FOG = new THREE.Color('#8c7150');   // brown-yellow storm haze
const IN_FOG = new THREE.Color('#3a2d1e');    // dim, dusty interior air (lets daylight read through open doors)
const NIGHT_FOG = new THREE.Color('#14110e'); // the storm after dark (intro)
const CLEAR_SKY = new THREE.Color('#d8b48a'); // the storm has passed (ending montage): a clear golden evening
const FLASH = new THREE.Color('#d9d6e8');

/**
 * The dust storm: fog, overcast brown-yellow light with a low sun, distant Raven Ridge,
 * blowing dust (near particles, low sand drift), gusting wind,
 * lightning. "indoor" (0..1) blends everything towards interior conditions, like eyes
 * adjusting when you step inside.
 */
export class Atmosphere {
  constructor(scene, renderer, cfg) {
    this.scene = scene;
    this.renderer = renderer;
    this.cfg = cfg;
    this.indoor = 1;
    this.flash = 0;
    this.onLightning = null;
    this._nextFlash = 6 + Math.random() * 6;
    this._flashT = -1;
    this.wind = { dirX: cfg.wind.dirX, dirZ: cfg.wind.dirZ, speed: cfg.wind.speed, gust: 0 };
    const wl = Math.hypot(this.wind.dirX, this.wind.dirZ);
    this.wind.dirX /= wl;
    this.wind.dirZ /= wl;

    scene.fog = new THREE.FogExp2(OUT_FOG.clone(), 0.012);
    scene.background = OUT_FOG.clone();

    this.night = 0;
    this.extraFog = 0;
    this.clear = 0; // 0 = the dust storm, 1 = it has blown itself out (only the ending montage sets this)
    this.hemi = new THREE.HemisphereLight('#cfae80', '#4d3c29', 1.4);
    scene.add(this.hemi);

    const az = THREE.MathUtils.degToRad(cfg.sun.azimuthDeg);
    const el = THREE.MathUtils.degToRad(cfg.sun.elevationDeg);
    this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sun = new THREE.DirectionalLight('#ffc98c', 1.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    this._buildSky(cfg);
    this._buildDust();
  }

  _buildSky(cfg) {
    // Raven Ridge: two faint silhouettes far to the north-west, unaffected by fog so they
    // can just be made out through the dust.
    const m = cfg.mountains;
    const ridge = (dist, h0, h1, opacity, color, seed) => {
      const P = [], I = [];
      const a0 = THREE.MathUtils.degToRad(m.fromDeg), a1 = THREE.MathUtils.degToRad(m.toDeg);
      const n = 90;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        const x = Math.sin(a) * dist, z = -Math.cos(a) * dist + 70;
        const k = i / n;
        const envelope = Math.sin(Math.PI * k) ** 0.6;
        const h = (h0 + (h1 - h0) * (0.5 + 0.5 * valueNoise(i * 0.18 + seed, seed))) * envelope
          + 25 * valueNoise(i * 0.9, seed + 3);
        P.push(x, -30, z, x, Math.max(h, 0), z);
        if (i > 0) { const b = (i - 1) * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setIndex(I);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, fog: false, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.renderOrder = -2;
      mesh.frustumCulled = false;
      mesh.name = m.name;
      this.scene.add(mesh);
      return mesh;
    };
    this.ridges = [ridge(m.distance + 400, m.height[0] * 0.8, m.height[1] * 0.9, 0.1, '#6e573c', 11),
      ridge(m.distance, m.height[0], m.height[1], 0.16, '#5e4a33', 4)];

    // the sun: a pale disc low in the east, barely there
    const [c, g] = makeCanvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,240,210,1)');
    grd.addColorStop(0.25, 'rgba(255,230,190,0.6)');
    grd.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const st = new THREE.CanvasTexture(c);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, opacity: 0.22, fog: false, depthWrite: false }));
    this.sunDisc.scale.setScalar(260);
    this.sunDisc.renderOrder = -1;
    this.scene.add(this.sunDisc);
  }

  _buildDust() {
    const r = rng(77);
    // 1) fine dust streaming past the camera
    const N = 2600;
    this.dust = { N, pos: new Float32Array(N * 3), spd: new Float32Array(N), box: [36, 14, 36] };
    for (let i = 0; i < N; i++) {
      this.dust.pos[i * 3] = (r() * 2 - 1) * 36;
      this.dust.pos[i * 3 + 1] = r() * 14;
      this.dust.pos[i * 3 + 2] = (r() * 2 - 1) * 36;
      this.dust.spd[i] = 0.6 + r() * 0.8;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dust.pos, 3));
    this.dustPoints = new THREE.Points(dg, new THREE.PointsMaterial({
      size: 0.06, map: dotTexture(), color: 0xc4a77c, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
    }));
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);

    // 2) sand skating low over the ground
    const M = 1500;
    this.drift = { M, pos: new Float32Array(M * 3), spd: new Float32Array(M) };
    for (let i = 0; i < M; i++) {
      this.drift.pos[i * 3] = (r() * 2 - 1) * 24;
      this.drift.pos[i * 3 + 1] = r() * 0.45;
      this.drift.pos[i * 3 + 2] = (r() * 2 - 1) * 24;
      this.drift.spd[i] = 1.2 + r() * 1.0;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.drift.pos, 3));
    this.driftPoints = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.035, map: dotTexture(), color: 0xd2bb94, transparent: true, opacity: 0.6, depthWrite: false,
    }));
    this.driftPoints.frustumCulled = false;
    this.scene.add(this.driftPoints);

    // (There used to be big drifting "dust sheets" here: huge flat sprites that showed up as brown walls
    // appearing from nowhere. Removed; the fog and the particles carry the storm.)
  }

  /** Quality presets: draw only part of the dust (0..1). */
  setDustScale(k) {
    this.dustPoints.geometry.setDrawRange(0, Math.round(this.dust.N * k));
    this.driftPoints.geometry.setDrawRange(0, Math.round(this.drift.M * k));
  }

  /** inside: is the player in an interior zone (true/false). */
  update(dt, t, p, inside) {
    // eye adaptation / interior blend
    this.indoor += ((inside ? 1 : 0) - this.indoor) * Math.min(1, dt * 1.6);
    const ind = this.indoor;

    // gusting wind
    const w = this.wind;
    w.gust = Math.max(0, valueNoise(t * 0.23, 5.1) * 0.8 + valueNoise(t * 0.9, 1.7) * 0.35);
    const gustSpeed = this.cfg.wind.speed * (0.75 + w.gust * 0.9);
    w.speed = gustSpeed;

    // lightning
    this._nextFlash -= dt;
    if (this.clear > 0) this._nextFlash = Math.max(this._nextFlash, 3); // no lightning once the storm has passed
    if (this._nextFlash <= 0 && this._flashT < 0) { this._flashT = 0; this.onLightning?.(0.8 + Math.random() * 2.5); }
    let f = 0;
    if (this._flashT >= 0) {
      this._flashT += dt;
      const ft = this._flashT;
      f = ft < 0.07 ? 1 : ft < 0.16 ? 0.1 : ft < 0.24 ? 0.8 : ft < 0.4 ? 0.15 : ft < 0.55 ? 0.55 * (1 - (ft - 0.4) / 0.15) : 0;
      if (ft > 0.6) { this._flashT = -1; this._nextFlash = 9 + Math.random() * 22; }
    }
    this.flash = f;

    // fog, sky and ambient light
    const fogC = this.scene.fog.color;
    fogC.copy(OUT_FOG).lerp(FLASH, f * 0.35).lerp(IN_FOG, ind);
    this.scene.background.copy(fogC);
    this.scene.fog.density = THREE.MathUtils.lerp(0.012 + w.gust * 0.003, 0.016, ind);
    this.hemi.intensity = THREE.MathUtils.lerp(1.4, 0.32, ind) * (1 + f * 1.6);
    this.sun.intensity = 1.15 * (1 - w.gust * 0.25);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.05, ind);
    for (const rdg of this.ridges) rdg.visible = ind < 0.95;

    // the cinematic intro: dusk / night (0..1) and a thicker wall of dust (0..1)
    if (this.night > 0 || this.extraFog > 0) {
      const n = this.night ?? 0;
      fogC.lerp(NIGHT_FOG, n);
      this.scene.background.copy(fogC);
      this.scene.fog.density *= 1 + (this.extraFog ?? 0) * 2.2;
      this.hemi.intensity *= 1 - n * 0.88;
      this.sun.intensity *= 1 - n * 0.97;
      this.renderer.toneMappingExposure *= 1 + n * 0.25;
    }

    // after the storm: clean air, a golden sky, a bright sun
    const c = this.clear;
    if (c > 0) {
      fogC.lerp(CLEAR_SKY, c);
      this.scene.background.copy(fogC);
      this.scene.fog.density *= 1 - 0.85 * c;
      this.sun.intensity *= 1 + 0.5 * c;
      this.hemi.intensity *= 1 + 0.15 * c;
    }
    this.sunDisc.material.opacity = 0.22 + 0.55 * c;

    // sun + shadow box follow the player (snapped to texels to stop shimmering)
    const snap = 140 / 2048;
    const cx = Math.round(p.x / snap) * snap, cz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + this.sunDir.x * 200, this.sunDir.y * 200, cz + this.sunDir.z * 200);
    this.sunDisc.position.set(p.x + this.sunDir.x * 1500, this.sunDir.y * 1500 + 40, p.z + this.sunDir.z * 1500);

    // dust: only outdoors
    const out = 1 - ind;
    const showDust = out > 0.05;
    this.dustPoints.visible = this.driftPoints.visible = showDust;
    if (!showDust) return;
    this.dustPoints.material.opacity = 0.55 * out * (1 - c);
    this.driftPoints.material.opacity = 0.6 * out * (1 - c);

    const vx = w.dirX * gustSpeed, vz = w.dirZ * gustSpeed;
    const D = this.dust, B = D.box;
    for (let i = 0; i < D.N; i++) {
      const j = i * 3;
      const k = D.spd[i];
      D.pos[j] += vx * k * dt + Math.sin(t * 2 + i) * 0.4 * dt;
      D.pos[j + 1] += Math.sin(t * 1.3 + i * 0.7) * 0.5 * dt - 0.2 * dt;
      D.pos[j + 2] += vz * k * dt;
      // keep the particle box centred on the player
      let x = D.pos[j] - p.x, y = D.pos[j + 1], z = D.pos[j + 2] - p.z;
      if (x > B[0]) x -= 2 * B[0]; else if (x < -B[0]) x += 2 * B[0];
      if (z > B[2]) z -= 2 * B[2]; else if (z < -B[2]) z += 2 * B[2];
      if (y < 0) y += B[1]; else if (y > B[1]) y -= B[1];
      D.pos[j] = x + p.x; D.pos[j + 1] = y; D.pos[j + 2] = z + p.z;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;

    const S = this.drift;
    for (let i = 0; i < S.M; i++) {
      const j = i * 3;
      const k = S.spd[i];
      S.pos[j] += vx * k * dt;
      S.pos[j + 2] += vz * k * dt;
      S.pos[j + 1] = Math.abs(Math.sin(t * 3 + i)) * 0.35 * (0.5 + w.gust);
      let x = S.pos[j] - p.x, z = S.pos[j + 2] - p.z;
      if (x > 24) x -= 48; else if (x < -24) x += 48;
      if (z > 24) z -= 48; else if (z < -24) z += 48;
      S.pos[j] = x + p.x; S.pos[j + 2] = z + p.z;
    }
    this.driftPoints.geometry.attributes.position.needsUpdate = true;
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function dotTexture() {
  const [c, g] = makeCanvas(32, 32);
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
