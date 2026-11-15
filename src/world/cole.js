import * as THREE from 'three';
import { loadGLTF } from '../engine/assets.js';
import { Character } from './character.js';
import { findPath } from '../engine/pathfind.js';

/**
 * Agent Danny Cole (addendum v2, section D). Mixamo "Remy" with Idle / Walk / Talk /
 * LookAround animations.
 *
 * How he moves like a person, not a game object:
 * - He never walks through walls. When following, he walks along the trail of footsteps
 *   you left (so he uses the same doors you used), cutting corners only where he can see
 *   straight ahead. A closed door in his way gets opened (you hear it creak).
 * - Going back to HQ he walks to the HQ door, opens it, goes in and then to his spot.
 * - He only "catches up" by jumping when you can't see him (far away or behind you).
 * - He speeds up and slows down gradually, turns on the spot before setting off when he
 *   has to face the other way, keeps a polite distance a little to one side of you, and
 *   turns his head to look at you when you are near.
 *
 * Modes: 'home' (at his HQ spot), 'follow', 'wait' (standing where you left him),
 * 'return' (walking back to HQ).
 */
const WALK = 1.2;      // m/s, a calm walk
const BRISK = 1.9;     // m/s, a brisk walk to catch up
const RADIUS = 0.28;

export class Cole {
  static async create(scene, world, ground, cfg, camera, castSpec) {
    const person = await Character.load('cole', castSpec);
    return new Cole(scene, world, ground, cfg, person, camera);
  }

  constructor(scene, world, ground, cfg, person, camera) {
    this.world = world;
    this.ground = ground;
    this.camera = camera;
    this.cfg = cfg;
    this.home = new THREE.Vector3(cfg.home[0], 0, cfg.home[1]);
    this.homeYaw = cfg.yaw;
    this.followDistance = cfg.followDistance ?? 2.2;
    this.mode = 'home';
    this.talking = false;
    this.interaction = null; // set by main.js so he can open doors
    this.paused = false;     // the cinematic intro borrows him

    // his body, clothes, fedora and animations come from the shared Character loader
    this.person = person;
    this.root = new THREE.Group();
    this.root.name = 'ColeNPC';
    this.root.add(person.root);
    this.model = person.body;
    this.head = person.bone('Head');
    this.neck = person.bone('Neck');
    this._look = 0; // current head turn (radians)

    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    hit.name = 'HIT_Cole';
    hit.userData.hitProxy = true;
    this.root.add(hit);

    this.mixer = person.mixer;
    this.actions = person.actions;
    this.strideSpeed = person.strideSpeed;
    this.current = null;
    this.play('Idle');

    this.root.position.copy(this.home);
    this.root.rotation.y = this.homeYaw;
    this.pos = this.root.position;
    this.speed = 0;
    this.trail = [];      // your footsteps (newest last)
    this.route = [];      // fixed waypoints (the way back to HQ)
    this._fidget = 6 + Math.random() * 6;
    this._los = 0;
    this._stuck = 0;
    scene.add(this.root);
  }

  // ------------------------------------------------------------------ public
  play(name, fade = 0.35) {
    const next = this.actions[name] ?? this.actions.Idle;
    if (!next || next === this.current) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  /** A short gesture (Nod, Point...) that plays once, then he goes back to what he was doing. */
  gesture(name, seconds = 2.5) {
    if (!this.actions[name]) return;
    this.play(name, 0.25);
    this._gesture = seconds;
  }

  get following() { return this.mode === 'follow'; }
  get atHome() { return this.mode === 'home'; }

  /** 'follow' | 'wait' | 'home' (walk back) — keeps the old boolean API working too. */
  setMode(mode, player) {
    if (mode === true) mode = 'follow';
    if (mode === false) mode = 'return';
    if (mode === 'home' || mode === 'return') {
      if (this.mode === 'home') return;
      this.mode = 'return';
      this.route = this._routeHome();
      return;
    }
    if (mode === 'follow') {
      // start the trail where he stands, so he first walks to you along a sensible line
      this.trail = player ? [new THREE.Vector3(player.x, 0, player.z)] : [];
    }
    this.mode = mode;
  }
  setFollow(on) { this.setMode(on); }

  /** Restore a saved mode/position. */
  restore(saved) {
    if (!saved) return;
    if (saved.mode === 'wait' && saved.pos) {
      this.pos.set(saved.pos[0], 0, saved.pos[1]);
      this.root.rotation.y = saved.yaw ?? 0;
      this.mode = 'wait';
    } else if (saved.mode === 'follow' || saved.follow) {
      this.mode = 'follow';
    }
  }

  snapshot() {
    return { mode: this.mode === 'return' ? 'home' : this.mode, follow: this.mode === 'follow', pos: [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2)], yaw: +this.root.rotation.y.toFixed(2) };
  }

  // ------------------------------------------------------------------ helpers
  _yawTo(x, z) { return Math.atan2(x - this.pos.x, z - this.pos.z); }

  _turnTo(yaw, dt, rate) {
    let a = yaw - this.root.rotation.y;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const step = Math.sign(a) * Math.min(Math.abs(a), rate * dt);
    this.root.rotation.y += step;
    return Math.abs(a);
  }

  /** First solid box between a and b (2D), or null. Boxes are grown by his radius. */
  _blocker(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const box of this.world.boxes) {
      if (!box.enabled) continue;
      if (segBox(a.x, a.z, dx, dz, box.minX - RADIUS * 0.8, box.minZ - RADIUS * 0.8, box.maxX + RADIUS * 0.8, box.maxZ + RADIUS * 0.8)) return box;
    }
    return null;
  }

  /** Can you see him right now? (Then he must not teleport.) */
  _seen(player) {
    const d = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
    if (d > 45) return false; // lost in the dust
    if (!this.camera) return true;
    const v = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z).project(this.camera);
    return v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
  }

  /** HQ door outside -> inside -> his spot, worked out from the door's collision box. */
  _doorPoints() {
    const box = this.world.byName.get(this.cfg.door ?? 'COL_Door_HQ');
    if (!box) return [this.home.clone(), this.home.clone(), this.home.clone()];
    const c = new THREE.Vector3((box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2);
    // the door's thin side tells which way it faces
    const alongX = box.maxX - box.minX < box.maxZ - box.minZ;
    const n = alongX ? new THREE.Vector3(Math.sign(this.home.x - c.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(this.home.z - c.z));
    return [c.clone().addScaledVector(n, -1.3), c.clone().addScaledVector(n, 0.9), this.home.clone()];
  }

  /**
   * The whole walk home: a route around walls and through doorways to the HQ door (A*, see
   * src/engine/pathfind.js), then in through the door to his spot. The last two points are
   * always "just inside the door" and "his spot".
   */
  _routeHome() {
    const [out, inside, home] = this._doorPoints();
    this._doorOut = out;
    if (this._insideHQ()) return [inside, home];
    // only through doors that actually open (and aren't locked): those he can open as he walks
    const canOpen = (box) => {
      const def = this.interaction?.doorForCollider(box.name);
      return !!def && !this.interaction._locked(def);
    };
    const path = findPath(this.world, this.pos, out, { radius: RADIUS, canOpen }) ?? [{ x: out.x, z: out.z }];
    return [...path.map((p) => new THREE.Vector3(p.x, 0, p.z)), inside, home];
  }

  /** Is he inside the HQ shed (between its door and his spot)? */
  _insideHQ() {
    const r = this.cfg.hqRect;
    return !!r && this.pos.x > r.x[0] && this.pos.x < r.x[1] && this.pos.z > r.z[0] && this.pos.z < r.z[1];
  }

  /**
   * Move towards a point like a person: turn first if facing away, then accelerate
   * along the way he faces (so he walks in gentle curves, not sideways slides).
   */
  _locomote(target, dt, maxSpeed, arrive = 0.25) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const err = this._turnTo(Math.atan2(dx, dz), dt, this.speed > 0.5 ? 3.2 : 4.2);
    // slow down near the goal; nearly stop while turning sharply
    let want = Math.min(maxSpeed, Math.max(0, d - arrive) * 1.4 + 0.35);
    if (err > 1.1) want = 0;
    else if (err > 0.5) want = Math.min(want, 0.6);
    if (d <= arrive) want = 0;
    const acc = want > this.speed ? 2.2 : 4.5;
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), acc * dt);
    if (this.speed > 0.01) {
      const yaw = this.root.rotation.y;
      const before = this.pos.clone();
      this.pos.x += Math.sin(yaw) * this.speed * dt;
      this.pos.z += Math.cos(yaw) * this.speed * dt;
      this._openDoorAhead(dt);
      this.world.resolve(this.pos, RADIUS);
      // pushed back by a wall: count it, so we can work around it
      const moved = before.distanceTo(this.pos);
      this._stuck = moved < this.speed * dt * 0.3 ? this._stuck + dt : Math.max(0, this._stuck - dt);
    }
    return d;
  }

  /** A closed door right in front of him: open it (people open doors). */
  _openDoorAhead() {
    if (!this.interaction) return;
    const yaw = this.root.rotation.y;
    const ahead = { x: this.pos.x + Math.sin(yaw) * 0.9, z: this.pos.z + Math.cos(yaw) * 0.9 };
    const box = this._blocker(this.pos, ahead);
    if (!box?.name?.startsWith('COL_Door')) return;
    const door = this.interaction.doorForCollider(box.name);
    if (door && !this.interaction.state.isOpen(door.id)) {
      this.interaction.npcSetDoor(door.id, true, 0.7);
      // on his way home he shuts the HQ door behind him (it keeps the dust out)
      if (this.mode === 'return') this._closeBehind = { id: door.id, box };
    }
  }

  _closeDoorBehind() {
    const c = this._closeBehind;
    if (!c) return;
    const cx = (c.box.minX + c.box.maxX) / 2, cz = (c.box.minZ + c.box.maxZ) / 2;
    if (Math.hypot(this.pos.x - cx, this.pos.z - cz) > 1.6) {
      this.interaction.npcSetDoor(c.id, false, 0.7);
      this._closeBehind = null;
    }
  }

  _animate() {
    if (this.speed > 0.08) {
      this.play('Walk', 0.25);
      if (this.actions.Walk) this.actions.Walk.timeScale = THREE.MathUtils.clamp(this.speed / (this.strideSpeed ?? 1.1), 0.5, 2.2);
    } else if (this.current === this.actions.Walk) {
      this.play('Idle', 0.4);
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, player) {
    if (this.paused) { this.person.update(dt); return; }
    const toPlayer = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);

    // remember your footsteps while he follows you (one every 0.5 m)
    if (this.mode === 'follow') {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(player.x - last.x, player.z - last.z) > 0.5) this.trail.push(new THREE.Vector3(player.x, 0, player.z));
      if (this.trail.length > 600) this.trail.splice(0, this.trail.length - 600);
    }

    if (this._gesture > 0) this._gesture -= dt;
    if (this.talking) {
      this.speed = 0;
      this._turnTo(this._yawTo(player.x, player.z), dt, 3);
      if (!(this._gesture > 0)) this.play('Talk', 0.4);
    } else if (this.mode === 'follow') {
      this._follow(dt, player, toPlayer);
    } else if (this.mode === 'return') {
      this._returnHome(dt, player);
    } else {
      this._idle(dt, player, toPlayer, this.mode === 'home' ? this.homeYaw : null);
    }
    if (!this.talking) this._animate();
    this.pos.y = this.ground.heightAt(this.pos.x, this.pos.z);
    this.person.update(dt);
    this._headLook(dt, player, toPlayer);
  }

  _follow(dt, player, toPlayer) {
    // far behind and out of sight: catch up quietly along your trail, a few steps back
    if (toPlayer > 30 && !this._seen(player)) {
      const back = this.trail.length > 14 ? this.trail[this.trail.length - 14] : null;
      if (back && !this._seenAt(back)) {
        this.pos.set(back.x, 0, back.z);
        this.trail.splice(0, this.trail.length - 14);
        this.speed = 0;
      }
    }
    // drop footsteps he has reached, and any he can skip because he can see past them
    this._los -= dt;
    if (this._los <= 0 && this.trail.length > 1) {
      this._los = 0.2;
      for (let i = this.trail.length - 1; i > 0; i--) {
        if (Math.hypot(this.trail[i].x - this.pos.x, this.trail[i].z - this.pos.z) > 14) continue;
        if (!this._blocker(this.pos, this.trail[i])) { this.trail.splice(0, i); break; }
      }
    }
    while (this.trail.length > 1 && Math.hypot(this.trail[0].x - this.pos.x, this.trail[0].z - this.pos.z) < 0.6) this.trail.shift();

    // the trail ends at you: stop a polite distance away, a little to your side
    const direct = this.trail.length <= 1;
    const gap = this.followDistance;
    if (direct) {
      const moving = this.speed > 0.05;
      if (toPlayer > gap + (moving ? 0 : 0.9)) {
        const side = new THREE.Vector3(player.x - this.pos.x, 0, player.z - this.pos.z).normalize();
        const goal = new THREE.Vector3(player.x, 0, player.z).addScaledVector(side, -gap * 0.9)
          .add(new THREE.Vector3(-side.z, 0, side.x).multiplyScalar(0.5));
        this._locomote(goal, dt, toPlayer > 7 ? BRISK : WALK, 0.2);
      } else {
        this.speed = Math.max(0, this.speed - 4 * dt);
        this._idle(dt, player, toPlayer, null);
      }
    } else {
      this._locomote(this.trail[0], dt, toPlayer > 7 ? BRISK : WALK, 0.05);
    }
  }

  _seenAt(p) {
    if (!this.camera) return false;
    const v = new THREE.Vector3(p.x, this.ground.heightAt(p.x, p.z) + 1.2, p.z).project(this.camera);
    return v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 && Math.hypot(p.x - this.camera.position.x, p.z - this.camera.position.z) < 45;
  }

  _returnHome(dt, player) {
    if (!this.route.length) this.route = this._routeHome();
    // nobody watching and still far from HQ: he's already made his way to the HQ door
    const out = this._doorOut;
    if (out && this.route.length > 2 && !this._seen(player) && this.pos.distanceTo(out) > 6 && !this._seenAt(out)) {
      this.pos.set(out.x, 0, out.z);
      this.speed = 0;
      this.route = this.route.slice(-2);
    }
    if (this.route.length > 2 && this._insideHQ()) this.route = this.route.slice(-2); // already indoors
    if (this.route.length === 1) this._closeDoorBehind();
    const goal = this.route[0];
    const last = this.route.length === 1;
    const d = this._locomote(goal, dt, WALK, last ? 0.15 : 0.35);
    if (d < (last ? 0.2 : 0.45)) { this.route.shift(); this._replans = 0; }
    // pushed back by something for a while (a door that swung shut, a building that just loaded
    // its walls): plan the route again from where he stands
    if (this._stuck > 1.2) {
      this._stuck = 0;
      this._replans = (this._replans ?? 0) + 1;
      if (this._replans <= 3) this.route = this._routeHome();
      else if (this.route.length > 1) { this.route.shift(); this._replans = 0; } // still stuck: next point
    }
    if (!this.route.length) {
      this.mode = 'home';
      this.speed = 0;
      this.onArrivedHome?.();
    }
  }

  _idle(dt, player, toPlayer, restYaw) {
    this.speed = Math.max(0, this.speed - 4 * dt);
    if (toPlayer < 5) this._turnTo(this._yawTo(player.x, player.z), dt, toPlayer < 2.5 ? 2.2 : 1.2);
    else if (restYaw != null) this._turnTo(restYaw, dt, 0.8);
    // fidget now and then: looks around nervously, then back to idle
    this._fidget -= dt;
    if (this._fidget <= 0 && this.current === this.actions.Idle && toPlayer > 2) {
      // mostly a calm glance around; now and then the nervous look over his shoulder
      this.play(Math.random() < 0.7 && this.actions.Glance ? 'Glance' : 'LookAround', 0.6);
      this._fidget = 14 + Math.random() * 12;
      this._fidgetEnd = 5 + Math.random() * 2;
    }
    if (this._fidgetEnd !== undefined) {
      this._fidgetEnd -= dt;
      if (this._fidgetEnd <= 0 || toPlayer < 2) { this.play('Idle', 0.6); this._fidgetEnd = undefined; }
    }
    const fidgeting = this.current === this.actions.LookAround || this.current === this.actions.Glance;
    if (!fidgeting && !(this._gesture > 0)) this.play('Idle', 0.5);
  }

  /** Turn the head (neck + head bones) towards you when you're close, after the animation. */
  _headLook(dt, player, toPlayer) {
    if (!this.head) return;
    let want = 0;
    if (toPlayer < 6 && this.current !== this.actions.LookAround && this.current !== this.actions.Glance) {
      let a = this._yawTo(player.x, player.z) - this.root.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < 1.9) want = THREE.MathUtils.clamp(a, -1.0, 1.0);
    }
    this._look += (want - this._look) * Math.min(1, dt * 4);
    // Mixamo bones point up their local Y axis, so turning the head is a twist about Y
    this.neck?.rotateY(this._look * 0.4);
    this.head.rotateY(this._look * 0.6);
  }
}

/** Does segment (x, z) + t*(dx, dz), t in [0,1], cross the box? (slab test) */
function segBox(x, z, dx, dz, minX, minZ, maxX, maxZ) {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x, dx, minX, maxX], [z, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
