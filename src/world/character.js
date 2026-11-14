import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF } from '../engine/assets.js';
import { stripRootMotion } from '../engine/anim.js';

/**
 * A person of Sable Flat as a 3D figure: the model from blender/build_characters.py,
 * scaled to their height (src/data/cast.json), feet on the ground, with their animations
 * (Idle, Walk, Talk, Sit, Nod, Point, Glance, LookAround, SadIdle, HeadShake) and props
 * (Danny's fedora, Hobbs's lantern, Pryce's glass, Tamsin's cigarette...).
 */
const cache = new Map();
const _q = new THREE.Quaternion(), _s = new THREE.Quaternion(), _e = new THREE.Euler();

export class Character {
  static async load(id, spec) {
    if (!cache.has(spec.file)) cache.set(spec.file, loadGLTF(spec.file));
    const gltf = await cache.get(spec.file);
    return new Character(id, spec, gltf);
  }

  constructor(id, spec, gltf) {
    this.id = id;
    this.spec = spec;
    this.root = new THREE.Group();
    this.root.name = `Person_${id}`;
    const body = SkeletonUtils.clone(gltf.scene);
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned: bind-pose bounds are not reliable
    });
    // Measure the height from the skeleton (top of the head to the feet). The mesh bounding box
    // of a freshly cloned skinned model is not reliable and can make people giant.
    body.updateMatrixWorld(true);
    const find = (n) => body.getObjectByName(`mixamorig${n}`) ?? body.getObjectByName(`mixamorig:${n}`);
    const top = find('HeadTop_End') ?? find('Head');
    const feet = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].map(find).filter(Boolean);
    const v = new THREE.Vector3();
    let k, floor;
    if (top && feet.length) {
      const yTop = top.getWorldPosition(v).y + (top.name.endsWith('Head') ? 0.12 : 0);
      floor = Math.min(...feet.map((b) => b.getWorldPosition(v).y));
      k = (spec.height ?? 1.75) / Math.max(0.01, (yTop - floor) * 1.03);
      floor -= 0.03 * (yTop - floor); // soles are a little below the toe joints
    } else {
      const box = new THREE.Box3().setFromObject(body);
      k = (spec.height ?? 1.75) / Math.max(0.01, box.max.y - box.min.y);
      floor = box.min.y;
    }
    body.scale.multiplyScalar(k);
    body.position.y -= floor * k;
    this.root.add(body);
    this.body = body;

    this.mixer = new THREE.AnimationMixer(body);
    this.actions = {};
    this.strideSpeed = 1.1; // how fast the walk animation's feet travel (m/s), so feet don't slide
    body.updateMatrixWorld(true);
    for (const clip of gltf.animations) {
      const c = clip.clone();
      if (c.name === 'Walk') {
        const hips = this.bone('Hips');
        const sc = new THREE.Vector3(1, 1, 1);
        hips?.parent?.getWorldScale(sc);
        const metres = stripRootMotion(c) * sc.x;
        if (metres > 0.2) this.strideSpeed = metres / c.duration;
      }
      this.actions[c.name] = this.mixer.clipAction(c);
    }
    this.current = null;
    this.props = {};
    this.root.updateMatrixWorld(true);
    for (const p of spec.props ?? []) this.addProp(p);
    this.play('Idle', 0);
  }

  bone(name) { return this.body.getObjectByName(`mixamorig${name}`) ?? this.body.getObjectByName(`mixamorig:${name}`) ?? this.body.getObjectByName(`mixamorig9${name}`); }

  headPosition(out = new THREE.Vector3()) { return (this.bone('Head') ?? this.root).getWorldPosition(out); }

  play(name, fade = 0.4, { timeScale = 1, offset = Math.random() * 2, once = false } = {}) {
    const a = this.actions[name];
    if (!a || a === this.current) return a;
    a.reset();
    a.time = offset;
    a.timeScale = timeScale;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(Math.max(0.01, fade)).play();
    this.current?.fadeOut(Math.max(0.01, fade));
    this.current = a;
    return a;
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

  addProp(kind) {
    const m = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    if (kind === 'fedora') {
      const g = new THREE.Group();
      const felt = m(0x3b3229, 0.85);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.092, 0.085, 20), felt);
      crown.scale.z = 1.12;
      crown.position.y = 0.045;
      const dent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), felt);
      dent.position.y = 0.088;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.008, 24), felt);
      brim.scale.z = 1.12;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.022, 20), m(0x15110d));
      band.scale.z = 1.12;
      band.position.y = 0.014;
      g.add(crown, dent, brim, band);
      g.rotation.x = -0.1;
      this.props.fedora = this.attach('Head', g, [0, 0.13, 0.005]);
    } else if (kind === 'glass' || kind === 'glassL') {
      const glass = new THREE.Group();
      const gm = m(0xd8d0bc, 0.05, 0.1, { transparent: true, opacity: 0.45 });
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.07, 14, 1, true), gm);
      bowl.position.y = 0.075;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), gm);
      stem.position.y = 0.03;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.003, 14), gm);
      const wine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.035, 14), m(0x4a0c14, 0.15));
      wine.position.y = 0.062;
      glass.add(bowl, stem, foot, wine);
      glass.userData.upright = true;
      this.props.glass = this.attach(kind === 'glass' ? 'RightHand' : 'LeftHand', glass, [0, 0.08, 0.03]);
    } else if (kind === 'cigarette') {
      const cig = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), m(0xe8e2d4));
      paper.rotation.z = Math.PI / 2;
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), m(0x220800, 0.6, 0, { emissive: 0xff5a10, emissiveIntensity: 3 }));
      ember.position.x = 0.036;
      cig.add(paper, ember);
      cig.userData.ember = ember;
      this.props.cigarette = this.attach('RightHand', cig, [0.0, 0.1, 0.02]);
    } else if (kind === 'lantern') {
      const lan = new THREE.Group();
      const iron = m(0x2a2520, 0.6, 0.6);
      const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 14), m(0xffd8a0, 0.3, 0, { emissive: 0xffa040, emissiveIntensity: 2.5, transparent: true, opacity: 0.85 }));
      globe.position.y = -0.2;
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.06, 14), iron);
      top.position.y = -0.11;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), iron);
      base.position.y = -0.285;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 16, Math.PI), iron);
      handle.position.y = -0.06;
      const light = new THREE.PointLight(0xffa850, 5, 14, 2);
      light.position.y = -0.2;
      lan.add(globe, top, base, handle, light);
      lan.userData.upright = true;
      lan.userData.swing = 0.22;
      lan.userData.light = light;
      this.props.lantern = this.attach('RightHand', lan, [0, 0.06, 0]);
    } else if (kind === 'spectacles') {
      const g = new THREE.Group();
      const wire = m(0x8a7a50, 0.3, 0.9);
      for (const s of [1, -1]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0016, 6, 18), wire);
        rim.position.x = s * 0.03;
        g.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.024, 4), wire);
      bridge.rotation.z = Math.PI / 2;
      g.add(bridge);
      this.props.spectacles = this.attach('Head', g, [0, 0.07, 0.085]);
    } else if (kind === 'pearls') {
      const g = new THREE.Group();
      const pm = m(0xf1ece0, 0.25, 0.1);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), pm);
        p.position.set(Math.sin(a) * 0.058, -Math.max(0, Math.cos(a)) * 0.03, Math.cos(a) * 0.052);
        g.add(p);
      }
      this.props.pearls = this.attach('Neck', g, [0, 0.02, 0.01]);
    }
  }

  update(dt) {
    this.mixer.update(dt);
    // extra head turn on top of the animation (radians): used to make someone look at something
    if (this.headYaw || this.headPitch) {
      const nk = this.bone('Neck'), hd = this.bone('Head');
      nk?.rotateY((this.headYaw ?? 0) * 0.4);
      hd?.rotateY((this.headYaw ?? 0) * 0.6);
      hd?.rotateX(this.headPitch ?? 0);
    }
    this._t = (this._t ?? 0) + dt;
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
