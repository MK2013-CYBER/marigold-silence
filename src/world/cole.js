import * as THREE from 'three';
import { loadGLTF } from '../engine/assets.js';

/**
 * Agent Danny Cole (addendum v2, section D). Mixamo "Remy" with Idle / Walk / Talk /
 * LookAround animations. He waits at HQ, faces you when you talk, and follows you when asked.
 */
export class Cole {
  static async create(scene, world, ground, cfg) {
    const gltf = await loadGLTF('cole.glb');
    return new Cole(scene, world, ground, cfg, gltf);
  }

  constructor(scene, world, ground, cfg, gltf) {
    this.world = world;
    this.ground = ground;
    this.home = new THREE.Vector3(cfg.home[0], 0, cfg.home[1]);
    this.homeYaw = cfg.yaw;
    this.followDistance = cfg.followDistance ?? 2.2;
    this.following = false;
    this.talking = false;

    this.root = new THREE.Group();
    this.root.name = 'ColeNPC';
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned meshes: the bind-pose bounds are not reliable
      }
    });
    // normalise to 1.78 m tall, feet on the ground
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    const k = h > 0 ? 1.78 / h : 1;
    model.scale.multiplyScalar(k);
    model.position.y -= box.min.y * k;
    this.root.add(model);

    // an invisible capsule-ish box so he is easy to aim at with E
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    hit.name = 'HIT_Cole';
    hit.userData.hitProxy = true;
    this.root.add(hit);

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) {
      if (clip.name === 'Walk') stripRootMotion(clip);
      const a = this.mixer.clipAction(clip);
      this.actions[clip.name] = a;
    }
    this.current = null;
    this.play('Idle');

    this.root.position.copy(this.home);
    this.root.rotation.y = this.homeYaw;
    this.pos = this.root.position;
    this._fidget = 6 + Math.random() * 6;
    scene.add(this.root);
  }

  play(name, fade = 0.35) {
    const next = this.actions[name] ?? this.actions.Idle;
    if (!next || next === this.current) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  setFollow(on) { this.following = on; }

  /** Walk towards a point; returns the remaining distance. */
  _walkTo(target, dt, speed) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this.world.resolve(this.pos, 0.28);
    this._turnTo(Math.atan2(dx, dz), dt, 8);
    return d;
  }

  _turnTo(yaw, dt, rate = 5) {
    let a = yaw - this.root.rotation.y;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    this.root.rotation.y += a * Math.min(1, dt * rate);
  }

  update(dt, player, playerYaw) {
    const toPlayer = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
    if (this.talking) {
      this._turnTo(Math.atan2(player.x - this.pos.x, player.z - this.pos.z), dt);
      this.play('Talk');
    } else if (this.following) {
      if (toPlayer > 30) {
        // lost you in the dust: catch up out of sight, a few steps behind
        this.pos.set(player.x + Math.sin(playerYaw) * 3, 0, player.z + Math.cos(playerYaw) * 3);
      }
      if (toPlayer > this.followDistance + 0.4) {
        const speed = toPlayer > 6 ? 6.5 : 3.0;
        this._walkTo(player, dt, speed);
        this.play('Walk', 0.2);
        this.actions.Walk && (this.actions.Walk.timeScale = speed / 1.6);
      } else {
        this._turnTo(Math.atan2(player.x - this.pos.x, player.z - this.pos.z), dt, 3);
        this.play('Idle');
      }
    } else {
      const toHome = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
      if (toHome > 0.3) {
        if (toPlayer > 40 && toHome > 8) {
          this.pos.copy(this.home); // nobody watching: he's back at HQ
        } else {
          this._walkTo(this.home, dt, 1.6);
          this.play('Walk', 0.2);
          this.actions.Walk && (this.actions.Walk.timeScale = 1);
        }
      } else {
        if (toPlayer < 6) this._turnTo(Math.atan2(player.x - this.pos.x, player.z - this.pos.z), dt, 2);
        else this._turnTo(this.homeYaw, dt, 1);
        // fidget now and then: looks around nervously, then back to idle
        this._fidget -= dt;
        if (this._fidget <= 0 && this.current === this.actions.Idle && this.actions.LookAround) {
          this.play('LookAround');
          this._fidget = 14 + Math.random() * 10;
          this._fidgetEnd = 6;
        }
        if (this._fidgetEnd !== undefined) {
          this._fidgetEnd -= dt;
          if (this._fidgetEnd <= 0) { this.play('Idle'); this._fidgetEnd = undefined; }
        }
        if (this.current !== this.actions.LookAround) this.play('Idle');
      }
    }
    this.pos.y = this.ground.heightAt(this.pos.x, this.pos.z);
    this.mixer.update(dt);
  }
}

/** Mixamo walks move the hips forward; keep him walking in place (we move the root). */
function stripRootMotion(clip) {
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values;
    const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
}
