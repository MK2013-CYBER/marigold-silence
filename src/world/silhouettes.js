import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * Placeholder figures for the cinematic intro (addendum E: "use placeholder silhouettes
 * for characters until their models are ready"). Each is a copy of Danny's rigged body
 * in a dark, matte material, with its own build (height / breadth) and one or two props
 * so you can tell them apart: Billie's flying cap, Ox's bulk, Tamsin's cigarette...
 * They use Danny's animations (Idle, Talk, Sit, Point...).
 */
const BUILD = {
  pryce: { h: 1.0, w: 1.16, props: ['glass'] },
  vivienne: { h: 0.94, w: 0.88, props: ['bun'] },
  billie: { h: 0.96, w: 0.92, props: ['cap'] },
  lindqvist: { h: 1.01, w: 0.86, props: ['glassL'] },
  julian: { h: 1.04, w: 0.96, props: [] },
  ox: { h: 1.1, w: 1.38, props: [] },
  tamsin: { h: 0.95, w: 0.88, props: ['cigarette'] },
  hobbs: { h: 0.95, w: 1.0, props: ['cap', 'lantern'] },
  cole: { h: 1.0, w: 1.0, props: ['fedora'], real: true },
};

const _q = new THREE.Quaternion(), _s = new THREE.Quaternion(), _e = new THREE.Euler();
const SIL = new THREE.MeshStandardMaterial({ color: 0x0b0907, roughness: 1.0, metalness: 0.0 });

export class Figure {
  /** source = Danny's loaded model (cole.model), clips = his animation clips. */
  constructor(id, source, clips) {
    const b = BUILD[id] ?? { h: 1, w: 1, props: [] };
    this.id = id;
    this.root = new THREE.Group();
    this.root.name = `Intro_${id}`;
    const body = SkeletonUtils.clone(source);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      if (!b.real) o.material = SIL;
    });
    // build: scale around the feet
    const inner = new THREE.Group();
    inner.scale.set(b.w, b.h, b.w * 0.95 + 0.05);
    inner.add(body);
    this.root.add(inner);
    this.body = body;
    this.mixer = new THREE.AnimationMixer(body);
    this.actions = {};
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.current = null;
    this.props = {};
    this.root.updateMatrixWorld(true);
    for (const p of b.props) this._prop(p);
    this.play('Idle', 0);
  }

  bone(name) { return this.body.getObjectByName(`mixamorig${name}`) ?? this.body.getObjectByName(`mixamorig:${name}`); }

  play(name, fade = 0.4, timeScale = 1, offset = Math.random() * 2) {
    const a = this.actions[name];
    if (!a || a === this.current) return;
    a.reset();
    a.time = offset;
    a.timeScale = timeScale;
    a.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = a;
  }

  /** Attach a prop to a bone, sized in metres (cancels the bone's own scale). */
  attach(boneName, obj, offset = [0, 0, 0]) {
    const bone = this.bone(boneName);
    if (!bone) return obj;
    this.root.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    bone.getWorldScale(s);
    const holder = new THREE.Group();
    holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    holder.position.set(offset[0] / s.x, offset[1] / s.y, offset[2] / s.z);
    holder.add(obj);
    bone.add(holder);
    return obj;
  }

  _prop(kind) {
    const dark = SIL;
    if (kind === 'fedora') {
      const g = new THREE.Group();
      const felt = new THREE.MeshStandardMaterial({ color: 0x3b3229, roughness: 0.85 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.092, 0.085, 18), felt);
      crown.scale.z = 1.12;
      crown.position.y = 0.045;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 22), felt);
      brim.scale.z = 1.12;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.022, 18), new THREE.MeshStandardMaterial({ color: 0x15110d }));
      band.scale.z = 1.12;
      band.position.y = 0.014;
      g.add(crown, brim, band);
      g.rotation.x = -0.12; // tipped forward a touch
      this.props.fedora = this.attach('Head', g, [0, 0.125, 0.01]);
    } else if (kind === 'cap') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
      cap.scale.set(1, 0.8, 1.1);
      this.props.cap = this.attach('Head', cap, [0, 0.1, 0]);
    } else if (kind === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), dark);
      this.props.bun = this.attach('Head', bun, [0, 0.1, -0.09]);
    } else if (kind === 'glass' || kind === 'glassL') {
      const glass = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 });
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.07, 12, 1, true), m);
      bowl.position.y = 0.07;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), m);
      stem.position.y = 0.03;
      const wine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.035, 12), new THREE.MeshStandardMaterial({ color: 0x5a1018, roughness: 0.2 }));
      wine.position.y = 0.06;
      glass.add(bowl, stem, wine);
      glass.userData.upright = true;
      this.props.glass = this.attach(kind === 'glass' ? 'RightHand' : 'LeftHand', glass, [0, 0.08, 0.03]);
    } else if (kind === 'cigarette') {
      const cig = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0xe8e2d4 }));
      paper.rotation.z = Math.PI / 2;
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 3 }));
      ember.position.x = 0.036;
      const glow = new THREE.PointLight(0xff6a20, 0.25, 1.2, 2);
      glow.position.x = 0.04;
      cig.add(paper, ember, glow);
      cig.userData.ember = ember;
      cig.userData.glow = glow;
      this.props.cigarette = this.attach('RightHand', cig, [0.0, 0.1, 0.02]);
    } else if (kind === 'lantern') {
      const lan = new THREE.Group();
      const iron = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.6 });
      const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 2.5, transparent: true, opacity: 0.85 }));
      globe.position.y = -0.2;
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.06, 12), iron);
      top.position.y = -0.11;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), iron);
      base.position.y = -0.285;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 16, Math.PI), iron);
      handle.position.y = -0.06;
      const light = new THREE.PointLight(0xffa850, 4, 12, 2);
      light.position.y = -0.2;
      lan.add(globe, top, base, handle, light);
      lan.userData.upright = true;
      lan.userData.swing = 0.25;
      lan.userData.light = light;
      this.props.lantern = this.attach('RightHand', lan, [0, 0.06, 0]);
    }
  }

  update(dt) {
    this.mixer.update(dt);
    this._t = (this._t ?? 0) + dt;
    // glasses and lanterns stay upright (and a lantern swings) whatever the hand is doing
    for (const o of Object.values(this.props)) {
      if (!o.userData.upright) continue;
      o.parent.updateWorldMatrix(true, false);
      o.parent.getWorldQuaternion(_q).invert();
      o.quaternion.copy(_q);
      if (o.userData.swing) o.quaternion.multiply(_s.setFromEuler(_e.set(Math.sin(this._t * 2.3) * o.userData.swing, 0, Math.sin(this._t * 1.7) * o.userData.swing * 0.6)));
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.mixer.stopAllAction();
  }
}
