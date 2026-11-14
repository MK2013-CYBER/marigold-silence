import * as THREE from 'three';
import { buildMailPlane } from '../world/plane.js';
import { Figure } from '../world/silhouettes.js';
import { IntroAudio } from '../engine/introAudio.js';

/**
 * The cinematic intro (addendum v2, section E), about 2 minutes 20 seconds, rendered in
 * the game engine: letterbox bars, film grain, slow camera moves, subtitles for the
 * voice-over (the voices themselves arrive in Stage H), wind and engine sound.
 * No gameplay input; Skip button, or hold Space, to skip.
 *
 *  1 telegram on black      2 title card        3 the plane in the dust (3 shots)
 *  4 landing, beacon, windsock                  5 the hangar: Hobbs and his lantern
 *  6 Friday dinner: Pryce's toast and six close-ups
 *  7 night: dust on a window, a music box stops mid-note
 *  8 a scream; "SATURDAY, 6:10 A.M."  -> gameplay
 *
 * All words come from src/data/scenes/intro.json. Characters are placeholder silhouettes.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));

export class Intro {
  constructor(o) {
    Object.assign(this, o); // scene, camera, post, atmosphere, streamer, ground, cole, audio, data, characters, hangar
    this.active = false;
    this.focus = new THREE.Vector3();
    this.indoor = false;
    this.exposure = 1;
    this.sfx = new IntroAudio(this.audio);
    this.names = new Map(this.characters.map((c) => [c.id, c.name]));
    this._buildDom();
  }

  // ------------------------------------------------------------------ DOM: bars, subtitles, cards
  _buildDom() {
    const el = (this.el = document.createElement('div'));
    el.className = 'intro hidden';
    el.innerHTML = `
      <div class="intro-black on"></div>
      <div class="intro-bar top"></div><div class="intro-bar bottom"></div>
      <div class="intro-caption"></div>
      <div class="intro-telegram"><div class="tg-head"></div><div class="tg-body"></div></div>
      <div class="intro-title"><h1></h1><p></p></div>
      <div class="intro-dawn"></div>
      <div class="intro-sub"><b></b><span></span></div>
      <div class="intro-name"><b></b><span></span></div>
      <button class="intro-skip" type="button"></button>
      <div class="intro-hold"><i></i></div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.dom = {
      black: q('.intro-black'), caption: q('.intro-caption'), tg: q('.intro-telegram'), tgHead: q('.tg-head'), tgBody: q('.tg-body'),
      title: q('.intro-title'), dawn: q('.intro-dawn'), sub: q('.intro-sub'), subWho: q('.intro-sub b'), subText: q('.intro-sub span'),
      name: q('.intro-name'), nameWho: q('.intro-name b'), nameNote: q('.intro-name span'), skip: q('.intro-skip'), hold: q('.intro-hold i'),
    };
    this.dom.skip.textContent = `${this.data.skipLabel} ›`;
    this.dom.skip.title = this.data.skipHold;
    this.dom.skip.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    this.dom.title.querySelector('h1').textContent = this.data.title;
    this.dom.title.querySelector('p').textContent = this.data.titleSub;
    this.dom.tgHead.textContent = this.data.telegram.header;
    this._hold = 0;
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space') { this._holding = true; e.preventDefault(); }
      if (e.code === 'Escape') this.skip();
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this._holding = false; });
  }

  black(on, secs = 0.8) {
    this.dom.black.style.transitionDuration = `${secs}s`;
    this.dom.black.classList.toggle('on', on);
  }

  say(line, secs = 4) {
    const { sub, subWho, subText } = this.dom;
    subWho.textContent = line.speaker ? `${line.speaker}:` : '';
    subText.textContent = ` ${line.text}`;
    sub.classList.add('on');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => sub.classList.remove('on'), secs * 1000);
  }

  caption(text, secs = 4) {
    const c = this.dom.caption;
    c.textContent = text;
    c.classList.add('on');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => c.classList.remove('on'), secs * 1000);
  }

  nameCard(id, note, secs) {
    const { name, nameWho, nameNote } = this.dom;
    nameWho.textContent = this.names.get(id) ?? id;
    nameNote.textContent = note ? ` — ${note}` : '';
    name.classList.add('on');
    clearTimeout(this._nameT);
    this._nameT = setTimeout(() => name.classList.remove('on'), secs * 1000);
  }

  // ------------------------------------------------------------------ start / end
  start(onDone) {
    this.onDone = onDone;
    this.active = true;
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('bars'));
    this.black(true, 0);
    this.cole.paused = true;
    this.cole.root.visible = false;
    // every building streams in now (the camera jumps all over the airfield)
    for (const it of this.streamer.items) if (it.state === 'idle') this.streamer._load(it);
    this._grain = { amount: this.post.grain.uniforms.amount.value, enabled: this.post.grain.enabled };
    this.post.grain.uniforms.amount.value = 0.075;
    this.post.grain.enabled = true;
    this._fov = this.camera.fov;

    this.group = new THREE.Group();
    this.group.name = 'Intro';
    this.scene.add(this.group);
    this.plane = buildMailPlane();
    this.plane.rotation.order = 'YXZ';
    this.plane.visible = false;
    this.group.add(this.plane);
    this.cabinLight = new THREE.PointLight(0xffd9a8, 0.8, 3, 2);
    this.cabinLight.position.set(0, 2.1, 0.6);
    this.plane.add(this.cabinLight);

    const clips = Object.values(this.cole.actions).map((a) => a.getClip());
    this.fig = {};
    for (const id of ['cole', 'hobbs', 'pryce', 'vivienne', 'billie', 'lindqvist', 'julian', 'ox', 'tamsin']) {
      const f = new Figure(id, this.cole.model, clips);
      f.root.visible = false;
      this.group.add(f.root);
      this.fig[id] = f;
    }
    this.dust = this._dustBurst();
    this.group.add(this.dust.points);

    // window glass glows like daylight; at night it must go dark (restored at the end)
    this._glass = [];
    this.scene.traverse((o) => {
      const m = o.material;
      if (o.isMesh && m?.name === 'WindowDust' && !this._glass.some((g) => g.m === m)) this._glass.push({ m, e: m.emissiveIntensity, op: m.opacity, tr: m.transparent });
    });
    this.shots = this._shots();
    this.si = -1;
    this.t = 0;
    this._next();
  }

  /** 1 = normal daylight glow in the windows, 0 = black night; see = how see-through the glass is. */
  _windows(glow, see = 0) {
    for (const g of this._glass) {
      g.m.emissiveIntensity = g.e * glow;
      g.m.transparent = see > 0 || g.tr;
      g.m.opacity = see > 0 ? 1 - see : g.op;
      g.m.needsUpdate = true;
    }
  }

  skip() {
    if (!this.active || this._ending) return;
    this.finish();
  }

  finish() {
    if (this._ending) return;
    this._ending = true;
    this.black(true, 0.5);
    setTimeout(() => {
      this.sfx.staticOff(0.2);
      this.sfx.engineOff(0.3);
      this.shot?.exit?.();
      for (const f of Object.values(this.fig)) f.dispose();
      this.group.removeFromParent();
      this.atmosphere.night = 0;
      for (const g of this._glass) { g.m.emissiveIntensity = g.e; g.m.opacity = g.op; g.m.transparent = g.tr; g.m.needsUpdate = true; }
      this.atmosphere.extraFog = 0;
      this.streamer.lampsOff = false;
      this.post.grain.uniforms.amount.value = this._grain.amount;
      this.post.grain.enabled = this._grain.enabled;
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
      this.cole.paused = false;
      this.cole.root.visible = true;
      for (const k of ['sub', 'caption', 'name', 'tg', 'title', 'dawn']) this.dom[k].classList.remove('on');
      this.el.classList.remove('bars');
      this.active = false;
      this._ending = false;
      this.onDone?.();
      this.black(false, 1.2);
      setTimeout(() => this.el.classList.add('hidden'), 1300);
    }, 550);
  }

  // ------------------------------------------------------------------ timeline
  _next() {
    this.shot?.exit?.();
    this.si++;
    if (this.si >= this.shots.length) { this.finish(); return; }
    this.shot = this.shots[this.si];
    this.t = 0;
    this._fired = new Set();
    this.shot.enter?.();
  }

  update(dt) {
    if (!this.active) return;
    // hold Space for a second to skip
    this._hold = this._holding ? this._hold + dt : 0;
    this.dom.hold.style.width = `${Math.min(1, this._hold) * 100}%`;
    if (this._hold >= 1) { this._holding = false; this.skip(); }
    if (this._ending) return;

    this.t += dt;
    const s = this.shot;
    for (let i = 0; i < (s.events?.length ?? 0); i++) {
      const [at, fn] = s.events[i];
      if (this.t >= at && !this._fired.has(i)) { this._fired.add(i); fn(); }
    }
    s.update?.(this.t, dt, clamp01(this.t / s.dur));
    for (const f of Object.values(this.fig)) if (f.root.visible) f.update(dt);
    this._updateDust(dt);
    if (this.plane.visible) this.plane.userData.prop.rotation.z += dt * (this.propSpeed ?? 0);
    this.focus.copy(this.camera.position);
    if (this.t >= s.dur) this._next();
  }

  /** Point the camera from p at l, with an optional small hand-held shake. */
  _cam(p, l, shake = 0, fov = 55) {
    const c = this.camera;
    c.position.copy(p);
    if (shake) {
      const tt = performance.now() / 1000;
      c.position.x += Math.sin(tt * 13.1) * shake + Math.sin(tt * 31.7) * shake * 0.4;
      c.position.y += Math.sin(tt * 17.3) * shake;
    }
    c.lookAt(l);
    if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
  }

  _path(points, k) {
    if (points.length === 2) return points[0].clone().lerp(points[1], k);
    return new THREE.CatmullRomCurve3(points).getPoint(k);
  }

  _ground(x, z) { return this.ground.heightAt(x, z); }

  _show(ids, on = true) { for (const id of ids) this.fig[id].root.visible = on; }

  // ------------------------------------------------------------------ dust kicked up by the wheels
  _dustBurst() {
    const N = 260;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const life = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({ color: 0x9c8462, size: 2.2, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    life.fill(-1);
    return { points, pos, vel, life, N, i: 0 };
  }

  _emitDust(at, n, spread = 1, up = 1.5) {
    const d = this.dust;
    for (let k = 0; k < n; k++) {
      const i = d.i++ % d.N, j = i * 3;
      d.pos[j] = at.x + (Math.random() - 0.5) * spread;
      d.pos[j + 1] = at.y + Math.random() * 0.3;
      d.pos[j + 2] = at.z + (Math.random() - 0.5) * spread;
      d.vel[j] = (Math.random() - 0.5) * 3 + 4; // the wind takes it east
      d.vel[j + 1] = Math.random() * up;
      d.vel[j + 2] = (Math.random() - 0.5) * 3;
      d.life[i] = 2.5 + Math.random() * 1.5;
    }
  }

  _updateDust(dt) {
    const d = this.dust;
    for (let i = 0; i < d.N; i++) {
      const j = i * 3;
      if (d.life[i] <= 0) { d.pos[j + 1] = -999; continue; }
      d.life[i] -= dt;
      d.pos[j] += d.vel[j] * dt;
      d.pos[j + 1] += d.vel[j + 1] * dt;
      d.pos[j + 2] += d.vel[j + 2] * dt;
      d.vel[j + 1] *= 1 - dt * 0.8;
    }
    d.points.geometry.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the shots
  _shots() {
    const D = this.data;
    const atm = this.atmosphere;
    const plane = this.plane;
    const P = (x, y, z, yaw = -Math.PI / 2, pitch = 0, roll = 0) => { plane.position.set(x, y, z); plane.rotation.set(pitch, yaw, roll); };

    // ---- 1. telegram on black
    const telegram = {
      dur: 16,
      enter: () => {
        this.exposure = 0.15;
        this.indoor = true;
        this._cam(V(0, 2, 30), V(0, 2, 0));
        this.sfx.staticOn(0.1);
        this.dom.tgBody.textContent = '';
      },
      events: [
        [1.0, () => this.dom.tg.classList.add('on')],
        [2.8, () => this.say({ speaker: 'Hart (voice-over)', text: D.telegram.vo }, 10.5)],
        [14.4, () => { this.dom.tg.classList.remove('on'); this.sfx.staticOff(1.2); }],
      ],
      update: (t) => {
        // type the telegram, one sounder click per letter
        const all = D.telegram.lines.join('\n');
        const n = Math.floor(clamp01((t - 1.6) / 10.5) * all.length);
        if (n !== this._typed) {
          if (n > (this._typed ?? 0) && all[n - 1] !== ' ' && all[n - 1] !== '\n') this.sfx.sounder(all[n - 1] === 'P');
          this._typed = n;
          this.dom.tgBody.textContent = all.slice(0, n);
        }
      },
      exit: () => { this._typed = 0; },
    };

    // ---- 2. title card
    const title = {
      dur: 6.5,
      events: [
        [0.4, () => this.dom.title.classList.add('on')],
        [3.0, () => { this.sfx.engineOn(); this.sfx.setEngine(58, 0.12, 3, 0.6); }],
        [5.4, () => this.dom.title.classList.remove('on')],
      ],
    };

    // ---- 3a. the plane punches through the wall of dust
    const sky1 = {
      dur: 8.5,
      enter: () => {
        atm.night = 0.3;
        atm.extraFog = 0.75;
        this.exposure = 1;
        this.indoor = false;
        plane.visible = true;
        this.propSpeed = 70;
        this.sfx.setEngine(64, 0.0, 0.1, 0);
        this.black(false, 1.2);
        this.caption(D.captions.sky, 5);
      },
      update: (t) => {
        const x = 780 - 44 * t;
        P(x, 118 + Math.sin(t * 0.8) * 1.4, 75 + Math.sin(t * 0.5) * 2, -Math.PI / 2, 0.02, Math.sin(t * 0.9) * 0.09);
        const cam = V(560, 116.5, 86);
        const d = cam.distanceTo(plane.position);
        this.sfx.setEngine(64 * (x > 560 ? 1.04 : 0.95), Math.min(0.6, 18 / d), 0.2, 0); // louder as it nears (and a Doppler drop after)
        this._cam(cam, plane.position.clone().add(V(-6, 0, 0)), 0.05, 50);
      },
    };

    // ---- 3b. in the cabin: Cole grips his hat
    const cole = this.fig.cole;
    const sky2 = {
      dur: 10.5,
      enter: () => {
        cole.root.visible = true;
        plane.userData.seatR.add(cole.root);
        cole.root.position.set(0, -0.45, -0.02);
        cole.play('Sit', 0);
        this.sfx.setEngine(66, 0.45, 0.4, 0.75);
        this.exposure = 0.5;
      },
      events: [
        [1.6, () => this.say(D.lines.coleSky, 3.4)],
        [5.8, () => this.say(D.lines.hartSky, 3.6)],
      ],
      update: (t) => {
        P(420 - 44 * t, 100 + Math.sin(t * 1.3) * 0.8, 75, -Math.PI / 2, Math.sin(t * 2.1) * 0.015, Math.sin(t * 0.7) * 0.06);
        plane.updateMatrixWorld(true);
        const eye = plane.localToWorld(V(-0.36, 1.93, 0.62));
        // look ahead, turn to Danny as he speaks, then back to the dust
        const ahead = plane.localToWorld(V(-0.2, 1.95, 6));
        const danny = new THREE.Vector3();
        (cole.bone('Head') ?? cole.root).getWorldPosition(danny);
        const w = smooth(clamp01((t - 1.0) / 1.2)) * (1 - smooth(clamp01((t - 5.6) / 1.4)));
        const look = ahead.lerp(danny, w);
        this._cam(eye, look, 0.012, 62);
      },
      exit: () => { cole.root.visible = false; },
    };

    // ---- 3c. far below the storm: the plane comes down
    const sky3 = {
      dur: 6,
      enter: () => { atm.extraFog = 0.25; this.exposure = 1; this.sfx.setEngine(54, 0.25, 1, 0.2); },
      update: (t) => {
        P(560 - 40 * t, 78 - 7.5 * t, 75, -Math.PI / 2, 0.06, Math.sin(t * 0.8) * 0.05);
        this._cam(V(262, this._ground(262, 98) + 4.5, 98), plane.position, 0.03, 40);
      },
    };

    // ---- 4a. touchdown and a skid on the gravel
    let touched = false;
    const land = {
      dur: 10,
      enter: () => { touched = false; atm.night = 0.45; this.sfx.setEngine(50, 0.35, 0.6, 0); },
      update: (t, dt) => {
        const T = 4.5;
        let x, y, yaw = -Math.PI / 2, pitch, roll = 0, z = 75;
        if (t < T) {
          const k = t / T;
          x = 330 - 160 * k;
          y = this._ground(x, z) + 22 * (1 - smooth(k)) ** 1.2;
          pitch = -0.02 - 0.08 * k; // flare: nose up
          roll = Math.sin(t * 1.9) * 0.05 * (1 - k);
        } else {
          const u = t - T;
          const uu = Math.min(u, 11.6); // braking at 3 m/s² from 35 m/s
          x = 170 - (35 * uu - 1.5 * uu * uu);
          z = 75 + 1.8 * (1 - Math.exp(-u * 0.6));
          y = this._ground(x, z) + Math.abs(Math.sin(u * 5)) * 0.25 * Math.exp(-u * 1.5); // a bounce or two
          pitch = -0.085;
          yaw = -Math.PI / 2 + Math.sin(u * 2.6) * 0.2 * Math.exp(-u * 0.35);
          roll = Math.sin(u * 3.1) * 0.04 * Math.exp(-u * 0.5);
          if (!touched) { touched = true; this.sfx.thump(1); this._emitDust(V(x, y, z), 60, 3, 2.5); this.sfx.setEngine(40, 0.25, 1.5, 0); this.propSpeed = 35; }
          if (Math.random() < dt * 30) this._emitDust(V(x + 1, this._ground(x, z) + 0.2, z), 3, 2, 1.4);
        }
        P(x, y, z, yaw, pitch, roll);
        const cam = V(150, this._ground(150, 95) + 1.3, 95);
        this._cam(cam, plane.position.clone().add(V(0, 1.2, 0)), 0.02, 42);
      },
    };

    // ---- 4b. the beacon tower flickers in the dust
    const beacon = {
      dur: 6,
      enter: () => {
        const it = this.streamer.items.find((i) => i.id === 'beacon_tower');
        this._beaconTop = 18;
        if (it?.root) { const b = new THREE.Box3().setFromObject(it.root); this._beaconTop = b.max.y; }
        this.sfx.setEngine(36, 0.1, 2, 0.4);
      },
      update: (t, dt, k) => {
        const top = V(-262, this._beaconTop - 1.2, 50);
        this._cam(this._path([V(-226, 2.5, 66), V(-236, 4.5, 60)], smooth(k)), top, 0.02, 38);
      },
    };

    // ---- 4c. the windsock tearing sideways
    const sock = {
      dur: 5.5,
      enter: () => { this.sfx.engineOff(4); },
      update: (t, dt, k) => this._cam(this._path([V(63, 2.0, 63), V(65, 2.6, 61)], smooth(k)), V(71, 5.8, 54), 0.03, 40),
    };

    // ---- 5. the hangar looms; Hobbs waves a lantern
    const hobbs = this.fig.hobbs;
    const hangar = {
      dur: 14,
      enter: () => {
        atm.night = 0.62;
        this._windows(0.35);
        this.propSpeed = 0;
        P(14, this._ground(14, 46), 46, -2.4, -0.085, 0);
        this._show(['hobbs', 'cole']);
        this.group.add(hobbs.root, cole.root);
        hobbs.root.position.set(-2.6, 0, 15.4);
        hobbs.root.rotation.y = 0.15;
        hobbs.play('Idle', 0);
        cole.root.position.set(1.8, 0, 30);
        cole.root.rotation.y = Math.PI;
        cole.play('Walk', 0);
        this.caption(D.captions.landing, 4);
        this._step = 0;
      },
      events: [
        [1.2, () => hobbs.play('Point', 0.5)],
        [4.6, () => hobbs.play('Idle', 0.6)],
        [6.4, () => { hobbs.play('Talk', 0.4); this.say(D.lines.hobbs, 5); }],
        [11.5, () => hobbs.play('Idle', 0.6)],
      ],
      update: (t, dt, k) => {
        // Hart walks towards the hangar; Danny walks a step ahead to the right
        const walk = smooth(clamp01(t / 12.5));
        const pos = this._path([V(1.2, 0, 36), V(0.4, 0, 21.5)], walk);
        pos.y = this._ground(pos.x, pos.z) + 1.65 + Math.abs(Math.sin(t * 5.6)) * 0.03 * (1 - walk ** 4);
        const cp = this._path([V(1.8, 0, 30), V(1.5, 0, 18.6)], smooth(clamp01(t / 12)));
        cole.root.position.set(cp.x, this._ground(cp.x, cp.z), cp.z);
        if (t > 11.6) cole.play('Idle', 0.6);
        this._step -= dt;
        if (this._step <= 0 && walk < 0.97) { this._step = 0.56; this.audio.footstep(0.8); }
        this._cam(pos, V(-2.2, 1.55, 15.4), 0.01, 55);
      },
      exit: () => this._show(['hobbs', 'cole'], false),
    };

    // ---- 6. Friday dinner in the mess hall
    const dinner = this._dinnerShots(D);

    // ---- 7. night: dust on the window, the music box stops mid-note
    const night = {
      dur: 14,
      enter: () => {
        atm.night = 1;
        this._windows(0, 0.7);
        this.indoor = true;
        this.exposure = 0.25;
        this.streamer.lampsOff = true;
        this._show(Object.keys(this.fig), false);
        this.caption(D.captions.night, 4);
        this._windowDust(true);
      },
      events: [[1.0, () => { this._boxEnd = this.sfx.musicBox(15, 0.44); }]],
      update: (t, dt, k) => {
        this._cam(this._path([V(-79.75, 1.5, -32.1), V(-79.9, 1.56, -32.9)], smooth(k)), V(-80, 1.62, -36), 0, 50);
        this._windowDust(false, dt);
      },
      exit: () => { this.streamer.lampsOff = false; this._windowDustOff(); },
    };

    // ---- 8. a scream; dawn
    const scream = {
      dur: 8,
      enter: () => this.black(true, 0.05),
      events: [
        [0.5, () => { this.sfx.scream(); this.say({ speaker: '', text: D.scream }, 2.8); }],
        [3.6, () => { this.dom.dawn.textContent = D.dawn; this.dom.dawn.classList.add('on'); }],
        [7.0, () => this.dom.dawn.classList.remove('on')],
      ],
    };

    return [telegram, title, sky1, sky2, sky3, land, beacon, sock, hangar, ...dinner, night, scream];
  }

  _dinnerShots(D) {
    const atm = this.atmosphere;
    const F = this.fig;
    const seated = ['vivienne', 'julian', 'tamsin', 'cole', 'billie', 'lindqvist', 'ox'];
    let table = { cx: -81.9, cz: -28, lx: 5, wz: 1, top: 0.78 };
    const extras = new THREE.Group();
    const cups = [];

    const setup = () => {
      atm.night = 0.95;
      this._windows(0.04);
      this.indoor = true;
      this.exposure = 0.25;
      const q = this.streamer.items.find((i) => i.id === 'quarters');
      const t = q?.root?.getObjectByName('Quarters_MessTable');
      if (t) {
        const b = new THREE.Box3().setFromObject(t);
        // the table top is the widest part above the benches
        table = { cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, lx: b.max.x - b.min.x, wz: 0.95, top: 0.78 };
      }
      const xs = [-1.85, -0.62, 0.62, 1.85].map((d) => table.cx + d * (table.lx / 5.2));
      const side = table.wz / 2 + 0.36;
      const place = (id, x, s) => {
        const f = F[id];
        this.group.add(f.root);
        f.root.visible = true;
        f.root.position.set(x, 0.02, table.cz + s * side);
        f.root.rotation.y = s < 0 ? 0 : Math.PI;
        f.play('Sit', 0.01);
      };
      place('vivienne', xs[0], -1); place('julian', xs[1], -1); place('tamsin', xs[2], -1); place('cole', xs[3], -1);
      place('billie', xs[0], 1); place('lindqvist', xs[1], 1); place('ox', xs[2], 1);
      const p = F.pryce;
      this.group.add(p.root);
      p.root.visible = true;
      p.root.position.set(table.cx - table.lx / 2 - 0.55, 0.02, table.cz);
      p.root.rotation.y = Math.PI / 2;
      p.play('Idle', 0);
      // candles on the table, the only warm light
      this.group.add(extras);
      for (const dx of [-1.2, 1.2]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xeee4cc, roughness: 0.6 }));
        c.position.set(table.cx + dx, table.top + 0.08, table.cz);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
        flame.scale.y = 2;
        flame.position.set(table.cx + dx, table.top + 0.19, table.cz);
        const l = new THREE.PointLight(0xffa050, 1.6, 6, 2);
        l.position.set(table.cx + dx, table.top + 0.3, table.cz);
        extras.add(c, flame, l);
        this._candles = (this._candles ?? []).concat(l);
      }
      // Ox's two cups (they appear in his close-up)
      for (const dx of [-0.13, 0.13]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.35 }));
        cup.position.set(xs[2] + dx, -10, table.cz + 0.25);
        extras.add(cup);
        cups.push(cup);
      }
      this.caption(D.captions.dinner, 4.5);
    };
    const flicker = (dt) => {
      for (const l of this._candles ?? []) l.intensity = 1.4 + Math.sin(performance.now() / 90 + l.position.x) * 0.15 + Math.random() * 0.15;
    };
    const headOf = (id) => { const v = new THREE.Vector3(); (F[id].bone('Head') ?? F[id].root).getWorldPosition(v); return v; };
    const facing = (id) => new THREE.Vector3(Math.sin(F[id].root.rotation.y), 0, Math.cos(F[id].root.rotation.y));

    const wide = {
      dur: 6,
      enter: setup,
      update: (t, dt, k) => {
        flicker(dt);
        const c = V(table.cx, 0.9, table.cz);
        this._cam(this._path([V(table.cx + 4.2, 2.3, table.cz + 3.6), V(table.cx + 3.4, 2.1, table.cz + 3.0)], smooth(k)), c, 0, 50);
      },
    };
    const toast = {
      dur: 6.5,
      events: [
        [0.5, () => F.pryce.play('Point', 0.5, 0.5, 0.3)],
        [1.0, () => this.say(D.lines.pryce, 4)],
        [4.8, () => this.sfx.clink()],
        [5.6, () => F.pryce.play('Idle', 0.8)],
      ],
      update: (t, dt, k) => {
        flicker(dt);
        const h = headOf('pryce');
        // from the far end, down the length of the table: both rows lead the eye to Pryce
        this._cam(this._path([V(table.cx + table.lx / 2 + 0.9, 1.55, table.cz + 0.05), V(table.cx + table.lx / 2 - 0.2, 1.5, table.cz)], smooth(k)), h.clone().add(V(0, -0.15, 0)), 0, 38);
      },
    };
    const closes = D.closeups.map((c) => ({
      dur: 3.4,
      enter: () => {
        if (!this._rim) { this._rim = new THREE.PointLight(0xffb070, 2.4, 2.2, 2); this.group.add(this._rim); }
        this._rim.visible = true;
        this.nameCard(c.id, c.note, 3.2);
        if (c.id === 'tamsin') this._puff = 0;
      },
      events: c.id === 'ox' ? [[0.9, () => { this._cupsT = 0; this.sfx.cupDown(); }]] : [],
      update: (t, dt, k) => {
        flicker(dt);
        const h = headOf(c.id);
        const f = facing(c.id);
        const side = new THREE.Vector3(f.z, 0, -f.x);
        let look = h.clone().add(V(0, -0.04, 0));
        let from = h.clone().addScaledVector(f, 0.95 - 0.18 * smooth(k)).addScaledVector(side, 0.28).add(V(0, 0.03, 0));
        if (c.id === 'ox') {
          // his hands and the two cups
          look = V(h.x, table.top + 0.15, h.z).addScaledVector(f, 0.35);
          from = look.clone().addScaledVector(f, 1.1).addScaledVector(side, 0.45).add(V(0, 0.45, 0));
          this._cupsT = (this._cupsT ?? -1);
          if (this._cupsT >= 0) {
            this._cupsT += dt;
            cups.forEach((cup, i) => {
              const u = clamp01((this._cupsT - i * 0.4) / 0.35);
              cup.position.y = u > 0 ? table.top + 0.04 + (1 - smooth(u)) * 0.12 : -10;
            });
          }
        }
        if (c.id === 'lindqvist') {
          const g = F.lindqvist.props.glass;
          if (g) { g.position.x = Math.sin(t * 47) * 0.004; g.position.z = Math.sin(t * 39) * 0.004; }
          look = h.clone().add(V(0, -0.25, 0)).addScaledVector(f, 0.2);
        }
        if (c.id === 'tamsin') {
          const cig = F.tamsin.props.cigarette;
          if (cig) {
            const glow = 1 + Math.max(0, Math.sin((t - 1) * 2.5)) * 3;
            cig.userData.ember.material.emissiveIntensity = 3 * glow;
            cig.userData.glow.intensity = 0.25 * glow;
          }
        }
        this._rim.position.copy(h).addScaledVector(f, -0.55).addScaledVector(side, -0.2).add(V(0, 0.22, 0));
        this._cam(from, look, 0.003, 32);
      },
    }));
    const pull = {
      dur: 4,
      update: (t, dt, k) => {
        flicker(dt);
        this._cam(this._path([V(table.cx - 0.5, 2.0, table.cz + 2.2), V(table.cx - 1.5, 2.6, table.cz + 3.4)], smooth(k)), V(table.cx, 0.85, table.cz), 0, 48);
      },
      enter: () => { if (this._rim) this._rim.visible = false; },
      exit: () => {
        extras.removeFromParent();
        this._candles = [];
        this._show(Object.keys(F), false);
      },
    };
    return [wide, toast, ...closes, pull];
  }

  // ------------------------------------------------------------------ dust streaming past the window at night
  _windowDust(init, dt = 0) {
    if (init) {
      const N = 500;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = -83 + Math.random() * 6;
        pos[i * 3 + 1] = 0.9 + Math.random() * 1.6;
        pos[i * 3 + 2] = -34.4 - Math.random() * 2.5;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this._wd = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6a5c4a, size: 0.025, transparent: true, opacity: 0.8, depthWrite: false }));
      this._wd.frustumCulled = false;
      this._wdLight = new THREE.PointLight(0x8a90a8, 2.2, 8, 2); // a pale glow outside (a yard lamp)
      this._wdLight.position.set(-79.4, 2.6, -36.5);
      this.group.add(this._wd, this._wdLight);
      return;
    }
    const p = this._wd.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dt * (9 + (i % 7));
      if (x > -77) x -= 6;
      p.setX(i, x);
      p.setY(i, p.getY(i) + Math.sin(x * 3 + i) * dt * 0.4);
    }
    p.needsUpdate = true;
  }

  _windowDustOff() { this._wd?.removeFromParent(); this._wdLight?.removeFromParent(); }
}
