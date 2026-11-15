import * as THREE from 'three';
import { loadGLTF } from '../engine/assets.js';
import { Character } from '../world/character.js';
import { IntroAudio } from '../engine/introAudio.js';

/**
 * The cinematic intro (addendum v2, section E), about 2 minutes 20 seconds, rendered in
 * the game engine with the real cast and the real mail plane (the one parked on the apron
 * afterwards). Letterbox bars, film grain and colour grading, depth of field on faces,
 * a small score, wind and engine, dialogue as subtitles.
 * No gameplay input. Skip button, Esc, or hold Space to skip.
 *
 *   1 telegram            2 title over the dust       3 the plane out of the dust
 *   4 the cabin: Danny    5 alongside the wing        6 landing, beacon, windsock
 *   7 Hobbs and his lantern at the hangar
 *   8 Friday dinner: Pryce's toast, six faces          9 night: dust, a music box stops
 *  10 "SATURDAY, 6:10 A.M.", then a scream: the body is found  -> gameplay
 *
 * All words: src/data/scenes/intro.json. People: src/data/cast.json.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const lerp = (a, b, k) => a + (b - a) * k;

export class Intro {
  constructor(o) {
    Object.assign(this, o); // scene, camera, post, atmosphere, streamer, ground, cole, audio, data, characters, cast, quality
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

  /** A line of dialogue: a subtitle on screen. */
  say(line, secs) {
    const { sub, subWho, subText } = this.dom;
    subWho.textContent = line.speaker ? `${line.speaker}:` : '';
    subText.textContent = ` ${line.text}`;
    sub.classList.add('on');
    clearTimeout(this._subT);
    const dur = secs ?? Math.max(2.5, line.text.length / 13);
    this._subT = setTimeout(() => sub.classList.remove('on'), dur * 1000);
    if (!this.music) this.sfx.setScore(0.2, 0.6); // the music dips under dialogue (the score ducks itself)
    clearTimeout(this._duckT);
    if (!this.music) this._duckT = setTimeout(() => this.sfx.setScore(this._scoreLevel ?? 0.5, 2), dur * 1000);
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

  /** Music level for this part of the intro: the rendered score ("The Marigold"), or the code score as a fallback. */
  score(level) {
    this._scoreLevel = level;
    if (this.music) this.music.play('theme', { level: Math.min(1, level * 1.6), loop: true });
    else this.sfx.setScore(level, 2.5);
  }

  /** Colour grade: warm or cold tint and contrast, eased in. */
  grade(tint, contrast = 1.05) { this._gradeTo = { tint: new THREE.Vector3(...tint), contrast }; }

  /** Depth of field: focus distance in metres (0 = off). Skipped on Low quality. */
  dof(focus, aperture = 0.0025) {
    const b = this.post.bokeh;
    if (!b) return;
    b.enabled = focus > 0 && this.quality?.level !== 'low';
    if (focus > 0) {
      b.uniforms.focus.value = focus;
      b.uniforms.aperture.value = aperture;
      b.uniforms.maxblur.value = 0.008;
    }
  }

  // ------------------------------------------------------------------ start / end
  start(onDone) {
    this.onDone = onDone;
    this.active = true;
    this._loaded = false;
    this.el.classList.remove('hidden');
    requestAnimationFrame(() => this.el.classList.add('bars'));
    this.black(true, 0);
    this.cole.paused = true;
    this.cole.root.visible = false;
    for (const it of this.streamer.items) if (it.state === 'idle') this.streamer._load(it);
    this.parked = this.streamer.items.find((i) => i.id === 'mail_plane');
    if (this.parked) this.parked.hidden = true; // until the plane has landed and parked
    const g = this.post.grain.uniforms;
    this._grain = { amount: g.amount.value, enabled: this.post.grain.enabled, vignette: g.vignette.value };
    g.amount.value = 0.06;
    g.vignette.value = 0.6;
    this.post.grain.enabled = true;
    this._fov = this.camera.fov;
    this.group = new THREE.Group();
    this.group.name = 'Intro';
    this.scene.add(this.group);
    this.dust = this._dustBurst();
    this.group.add(this.dust.points);
    this.key = new THREE.PointLight(0xffc890, 0, 3, 2); // a face light that follows the close-ups
    this.rim = new THREE.PointLight(0xffa860, 0, 2.5, 2);
    this.fill = new THREE.HemisphereLight(0xffe2c4, 0x3a2614, 0); // dinner room light
    this.group.add(this.key, this.rim, this.fill);

    // the people and the plane load while the telegram is on screen
    this.fig = {};
    const ids = ['cole', 'hobbs', 'pryce', 'vivienne', 'billie', 'lindqvist', 'julian', 'ox', 'tamsin'];
    this.ready = Promise.all([
      loadGLTF('mail_plane.glb').then((gl) => {
        this.plane = gl.scene.clone(true);
        this.plane.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.name.startsWith('COL_')) o.visible = false; } });
        this.plane.rotation.order = 'YXZ';
        this.plane.visible = false;
        this.prop = this.plane.getObjectByName('Plane_Prop');
        this.cabin = new THREE.PointLight(0xffe0b0, 0.6, 2.6, 2);
        this.cabin.position.set(0, 2.25, 0.5);
        this.plane.add(this.cabin);
        this.group.add(this.plane);
      }),
      ...ids.map((id) => Character.load(id, this.cast[id]).then((c) => {
        c.root.visible = false;
        this.group.add(c.root);
        this.fig[id] = c;
      })),
    ]).catch((e) => console.error('intro assets', e));

    if (!this.music) this.sfx.scoreOn();
    this.score(0.0);
    this.grade([1, 1, 1], 1);
    this.shots = this._shots();
    this.si = -1;
    this.t = 0;
    this._next();
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
      if (!this.music) this.sfx.scoreOff(1.5);
      this.shot?.exit?.();
      for (const f of Object.values(this.fig)) f.dispose();
      this.group.removeFromParent();
      this.atmosphere.night = 0;
      this.atmosphere.extraFog = 0;
      this.streamer.lampsOff = false;
      if (this.parked) this.parked.hidden = false;
      for (const gl of this._glass ?? []) { gl.m.emissiveIntensity = gl.e; gl.m.opacity = gl.op; gl.m.transparent = gl.tr; gl.m.needsUpdate = true; }
      const g = this.post.grain.uniforms;
      g.amount.value = this._grain.amount;
      g.vignette.value = this._grain.vignette;
      g.tint.value.set(1, 1, 1);
      g.contrast.value = 1;
      this._gradeTo = null;
      this.post.grain.enabled = this._grain.enabled;
      if (this.post.bokeh) this.post.bokeh.enabled = false;
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
      this.cole.paused = false;
      this.cole.root.visible = true;
      for (const k of ['sub', 'caption', 'name', 'tg', 'title', 'dawn']) this.dom[k].classList.remove('on');
      this.el.classList.remove('bars');
      this.active = false;
      this._ending = false;
      this.onDone?.();
      this.black(false, 1.4);
      setTimeout(() => this.el.classList.add('hidden'), 1500);
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
    // a shot that needs the people or the plane waits (on the last frame) until they have loaded
    if (this.shot.needs && !this._loaded) {
      this._waiting = true;
      this.ready.then(() => { this._loaded = true; this._waiting = false; this.shot.enter?.(); });
      return;
    }
    this.shot.enter?.();
  }

  update(dt) {
    if (!this.active) return;
    this._hold = this._holding ? this._hold + dt : 0;
    this.dom.hold.style.width = `${Math.min(1, this._hold) * 100}%`;
    if (this._hold >= 1) { this._holding = false; this.skip(); }
    if (this._ending || this._waiting) return;

    this.t += dt;
    const s = this.shot;
    for (let i = 0; i < (s.events?.length ?? 0); i++) {
      const [at, fn] = s.events[i];
      if (this.t >= at && !this._fired.has(i)) { this._fired.add(i); fn(); }
    }
    s.update?.(this.t, dt, clamp01(this.t / s.dur));
    for (const f of Object.values(this.fig)) if (f.root.visible) f.update(dt);
    this._updateDust(dt);
    if (this.prop && this.plane?.visible) this.prop.rotation.z += dt * (this.propSpeed ?? 0);
    if (this._gradeTo) {
      const u = this.post.grain.uniforms, k = Math.min(1, dt * 1.5);
      u.tint.value.lerp(this._gradeTo.tint, k);
      u.contrast.value = lerp(u.contrast.value, this._gradeTo.contrast, k);
    }
    this.focus.copy(this.camera.position);
    if (this.t >= s.dur) this._next();
  }

  /** Point the camera from p at l, with a little hand-held drift (shake) and a field of view. */
  _cam(p, l, shake = 0, fov = 50) {
    const c = this.camera;
    c.position.copy(p);
    if (shake) {
      const tt = performance.now() / 1000;
      c.position.x += Math.sin(tt * 1.3) * shake + Math.sin(tt * 7.1) * shake * 0.25;
      c.position.y += Math.sin(tt * 1.7 + 1) * shake * 0.8 + Math.sin(tt * 9.3) * shake * 0.2;
    }
    c.lookAt(l);
    if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
  }

  _path(points, k) {
    if (points.length === 2) return points[0].clone().lerp(points[1], k);
    return new THREE.CatmullRomCurve3(points).getPoint(k);
  }

  _ground(x, z) { return this.ground.heightAt(x, z); }

  _show(ids, on = true) { for (const id of ids) if (this.fig[id]) this.fig[id].root.visible = on; }

  /** Window glass glows like daylight; at night it must go dark (restored at the end). */
  _windows(glow, see = 0) {
    if (!this._glass) {
      this._glass = [];
      this.scene.traverse((o) => {
        const m = o.material;
        if (o.isMesh && m?.name === 'WindowDust' && !this._glass.some((g) => g.m === m)) this._glass.push({ m, e: m.emissiveIntensity, op: m.opacity, tr: m.transparent });
      });
    }
    for (const g of this._glass) {
      g.m.emissiveIntensity = g.e * glow;
      g.m.transparent = see > 0 || g.tr;
      g.m.opacity = see > 0 ? 1 - see : g.op;
      g.m.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ dust kicked up by the wheels
  _dustBurst() {
    const N = 300;
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
    const mat = new THREE.PointsMaterial({ color: 0x9c8462, size: 2.4, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false });
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
      d.vel[j] = (Math.random() - 0.5) * 3 + 4;
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
    const P = (x, y, z, yaw = -Math.PI / 2, pitch = 0, roll = 0) => { this.plane.position.set(x, y, z); this.plane.rotation.set(pitch, yaw, roll); };
    const cole = () => this.fig.cole;
    const hobbs = () => this.fig.hobbs;

    // ---- 1. telegram on black
    const telegram = {
      dur: 14,
      enter: () => {
        this.exposure = 0.15;
        this.indoor = true;
        this._cam(V(0, 2, 30), V(0, 2, 0));
        this.sfx.staticOn(0.08);
        this.dom.tgBody.textContent = '';
        this._typed = 0;
      },
      events: [
        [0.8, () => this.dom.tg.classList.add('on')],
        [2.4, () => this.say({ who: D.telegram.who, speaker: 'Hart (voice-over)', text: D.telegram.vo }, 9.5)],
        [12.6, () => { this.dom.tg.classList.remove('on'); this.sfx.staticOff(1.2); }],
      ],
      update: (t) => {
        const all = D.telegram.lines.join('\n');
        const n = Math.floor(clamp01((t - 1.4) / 9) * all.length);
        if (n !== this._typed) {
          if (n > this._typed && all[n - 1] !== ' ' && all[n - 1] !== '\n') this.sfx.sounder(all[n - 1] === 'P');
          this._typed = n;
          this.dom.tgBody.textContent = all.slice(0, n);
        }
      },
    };

    // ---- 2. title over drifting dust at dusk
    const title = {
      dur: 7.5,
      enter: () => {
        atm.night = 0.35;
        atm.extraFog = 1.0;
        this.exposure = 0.9;
        this.indoor = false;
        this.grade([1.08, 0.98, 0.86], 1.08);
        this.black(false, 2.5);
        this.score(0.55);
        this.sfx.engineOn();
        this.sfx.setEngine(58, 0.06, 3, 0.7);
      },
      events: [[0.6, () => this.dom.title.classList.add('on')], [5.8, () => this.dom.title.classList.remove('on')]],
      update: (t, dt, k) => this._cam(this._path([V(900, 120, 60), V(860, 118, 70)], k), V(700, 112, 80), 0.3, 55),
    };

    // ---- 3. the mail plane punches through the wall of dust
    const sky1 = {
      dur: 9,
      needs: true,
      enter: () => {
        atm.extraFog = 0.7;
        this.plane.visible = true;
        this.propSpeed = 75;
        this.caption(D.captions.sky, 5);
        this.dof(0);
      },
      update: (t) => {
        const x = 780 - 44 * t;
        P(x, 118 + Math.sin(t * 0.8) * 1.4, 75 + Math.sin(t * 0.5) * 2, -Math.PI / 2, 0.02, Math.sin(t * 0.9) * 0.09);
        const cam = V(560, 116.5, 86);
        const d = cam.distanceTo(this.plane.position);
        this.sfx.setEngine(64 * (x > 560 ? 1.04 : 0.95), Math.min(0.6, 20 / d), 0.2, 0);
        this._cam(cam, this.plane.position.clone().add(V(-6, 1.6, 0)), 0.05, 48);
      },
    };

    // ---- 4. in the cabin: Danny can't see the ground; Hart answers
    const sky2 = {
      dur: 12,
      enter: () => {
        const c = cole();
        c.root.visible = true;
        this.plane.getObjectByName('SEAT_Passenger').add(c.root);
        c.root.position.set(0, -0.48, -0.05);
        c.root.rotation.set(0, 0, 0);
        c.play('Sit', 0.01);
        this.sfx.setEngine(66, 0.42, 0.4, 0.75);
        this.exposure = 0.5;
        this.grade([1.05, 0.97, 0.88], 1.1);
        this.score(0.35);
      },
      events: [
        [1.4, () => this.say(D.lines.coleSky, 3.4)],
        [5.6, () => this.say(D.lines.hartSky, 3.6)],
      ],
      update: (t, dt) => {
        P(420 - 44 * t, 100 + Math.sin(t * 1.3) * 0.8, 75, -Math.PI / 2, Math.sin(t * 2.1) * 0.015, Math.sin(t * 0.7) * 0.06);
        this.plane.updateMatrixWorld(true);
        const eye = this.plane.localToWorld(V(0.26, 1.98, 0.66));
        const ahead = this.plane.localToWorld(V(0.05, 1.9, 4));
        const head = cole().headPosition();
        const w = smooth(clamp01((t - 0.6) / 1.2)) * (1 - smooth(clamp01((t - 6.2) / 1.6)));
        this._cam(eye, ahead.lerp(head, w), 0.008 + Math.abs(Math.sin(t * 3.1)) * 0.004, 58);
        this.dof(w > 0.5 ? eye.distanceTo(head) : 0, 0.004);
        // he looks at Hart while he talks, then nervously out of his window
        cole().headYaw = lerp(cole().headYaw ?? 0, t < 5.4 ? 0.5 : -0.35, dt * 2);
      },
      exit: () => { cole().headYaw = 0; cole().root.visible = false; this.group.add(cole().root); this.dof(0); },
    };

    // ---- 5. alongside the wing as she comes down through the murk
    const sky3 = {
      dur: 7,
      enter: () => { atm.extraFog = 0.45; this.exposure = 1; this.sfx.setEngine(56, 0.38, 1, 0.1); },
      update: (t) => {
        P(560 - 40 * t, 78 - 6 * t, 75, -Math.PI / 2, 0.05, Math.sin(t * 0.8) * 0.05);
        this.plane.updateMatrixWorld(true);
        this._cam(this.plane.localToWorld(V(-7.5, 3.4, -7.5)), this.plane.localToWorld(V(0, 1.8, 2.5)), 0.03, 50);
      },
    };

    // ---- 6a. touchdown and a skid on the gravel
    let touched = false;
    const land = {
      dur: 10.6,
      enter: () => { touched = false; atm.night = 0.45; this.sfx.setEngine(50, 0.35, 0.6, 0); this.grade([1.06, 0.97, 0.86], 1.08); },
      events: [[6.0, () => this.say(D.lines.coleLand, 3.6)], [9.6, () => this.black(true, 0.9)]],
      exit: () => { this.plane.visible = false; this.sfx.engineOff(2); if (this.parked) this.parked.hidden = false; },
      update: (t, dt) => {
        const T = 4.5;
        let x, y, yaw = -Math.PI / 2, pitch, roll = 0, z = 75;
        if (t < T) {
          const k = t / T;
          x = 330 - 160 * k;
          y = this._ground(x, z) + 22 * (1 - smooth(k)) ** 1.2;
          pitch = -0.02 - 0.08 * k;
          roll = Math.sin(t * 1.9) * 0.05 * (1 - k);
        } else {
          const u = Math.min(t - T, 11.6);
          x = 170 - (35 * u - 1.5 * u * u);
          z = 75 + 1.8 * (1 - Math.exp(-u * 0.6));
          y = this._ground(x, z) + Math.abs(Math.sin(u * 5)) * 0.25 * Math.exp(-u * 1.5);
          pitch = -0.085;
          yaw = -Math.PI / 2 + Math.sin(u * 2.6) * 0.2 * Math.exp(-u * 0.35);
          roll = Math.sin(u * 3.1) * 0.04 * Math.exp(-u * 0.5);
          if (!touched) { touched = true; this.sfx.thump(1); this._emitDust(V(x, y, z), 80, 3, 2.5); this.sfx.setEngine(40, 0.25, 1.5, 0); this.propSpeed = 35; }
          if (Math.random() < dt * 30) this._emitDust(V(x + 1, this._ground(x, z) + 0.2, z), 3, 2, 1.4);
        }
        P(x, y, z, yaw, pitch, roll);
        this._cam(V(150, this._ground(150, 95) + 1.3, 95), this.plane.position.clone().add(V(0, 1.4, 0)), 0.02, 40);
      },
    };

    // ---- 6b. the beacon tower turning in the dust; 6c. the windsock tearing sideways
    const beacon = {
      dur: 5.5,
      enter: () => {
        const it = this.streamer.items.find((i) => i.id === 'beacon_tower');
        this._beaconTop = 18;
        if (it?.root) { const b = new THREE.Box3().setFromObject(it.root); this._beaconTop = b.max.y; }
        this.sfx.setEngine(34, 0.1, 2, 0.4);
        this.plane.visible = false;
      },
      update: (t, dt, k) => this._cam(this._path([V(-226, 2.5, 66), V(-236, 4.5, 60)], smooth(k)), V(-262, this._beaconTop - 1.2, 50), 0.02, 36),
    };
    const sock = {
      dur: 5,
      enter: () => this.sfx.engineOff(4),
      update: (t, dt, k) => this._cam(this._path([V(63, 2.0, 63), V(65, 2.6, 61)], smooth(k)), V(71, 5.8, 54), 0.03, 38),
    };

    // ---- 7. the hangar looms; Hobbs waves his lantern
    const hangar = {
      dur: 15,
      enter: () => {
        atm.night = 0.65;
        this._windows(0.35);
        if (this.parked) this.parked.hidden = false; // the plane is parked on the apron now
        this.grade([1.04, 0.95, 0.85], 1.1);
        this._show(['hobbs', 'cole']);
        const h = hobbs(), c = cole();
        h.root.position.set(-2.6, this._ground(-2.6, 15.4), 15.4);
        h.root.rotation.y = 0.15;
        h.play('Idle', 0.01);
        c.root.position.set(1.8, 0, 30);
        c.root.rotation.y = Math.PI;
        c.play('Walk', 0.01);
        this.caption(D.captions.landing, 4);
        this._step = 0;
        this.score(0.45);
      },
      events: [
        [1.2, () => hobbs().play('Point', 0.5)],
        [4.4, () => hobbs().play('Idle', 0.6)],
        [6.2, () => { hobbs().play('Talk', 0.4); this.say(D.lines.hobbs); }],
        [11.5, () => hobbs().play('Idle', 0.6)],
      ],
      update: (t, dt) => {
        const walk = smooth(clamp01(t / 12.5));
        const pos = this._path([V(1.2, 0, 36), V(0.4, 0, 21.0)], walk);
        pos.y = this._ground(pos.x, pos.z) + 1.65 + Math.abs(Math.sin(t * 5.6)) * 0.025 * (1 - walk ** 4);
        const c = cole();
        const cp = this._path([V(1.8, 0, 30), V(1.5, 0, 18.6)], smooth(clamp01(t / 12)));
        c.root.position.set(cp.x, this._ground(cp.x, cp.z), cp.z);
        if (t > 11.6) c.play('Idle', 0.6);
        this._step -= dt;
        if (this._step <= 0 && walk < 0.97) { this._step = 0.56; this.audio.footstep(0.8); }
        const hh = hobbs().headPosition();
        this._cam(pos, hh.clone().add(V(0, -0.3, 0)), 0.01, 50);
        this.dof(pos.distanceTo(hh), 0.0015);
      },
      exit: () => { this._show(['hobbs', 'cole'], false); this.dof(0); },
    };

    const dinner = this._dinnerShots(D);

    // ---- 9. night: dust on the window, the music box stops mid-note
    const night = {
      dur: 13,
      enter: () => {
        atm.night = 1;
        this._windows(0, 0.7);
        this.indoor = true;
        this.exposure = 0.25;
        this.streamer.lampsOff = true;
        this.fill.intensity = 0;
        this._show(Object.keys(this.fig), false);
        this.caption(D.captions.night, 4);
        this.grade([0.86, 0.92, 1.08], 1.12);
        this.score(0.0);
        this._windowDust(true);
      },
      events: [[1.0, () => { this.sfx.musicBox(15, 0.44); }]],
      update: (t, dt, k) => {
        this._cam(this._path([V(-79.75, 1.5, -32.1), V(-79.9, 1.56, -32.9)], smooth(k)), V(-80, 1.62, -36), 0, 50);
        this._windowDust(false, dt);
      },
      exit: () => { this.streamer.lampsOff = false; this._windowDustOff(); },
    };

    // ---- 10. a scream; dawn
    const scream = {
      dur: 7.5,
      enter: () => this.black(true, 0.05),
      events: [
        // dawn first, then the scream: it's the body being found at 6:10, not something in the night
        [0.4, () => { this.dom.dawn.textContent = D.dawn; this.dom.dawn.classList.add('on'); }],
        [3.4, () => this.dom.dawn.classList.remove('on')],
        [3.9, () => { this.sfx.scream(); this.say({ speaker: '', text: D.scream }, 3.2); }],
      ],
    };

    return [telegram, title, sky1, sky2, sky3, land, ...dinner, night, scream];
  }

  // ------------------------------------------------------------------ 8. Friday dinner
  _dinnerShots(D) {
    const atm = this.atmosphere;
    const F = () => this.fig;
    let table = { cx: -81.9, cz: -28, lx: 5, wz: 0.95, top: 0.78 };
    const extras = new THREE.Group();
    const cups = [];
    let candles = [];
    let smoke = null;

    const setup = () => {
      atm.night = 0.9;
      this._windows(0.04);
      this.indoor = true;
      this.exposure = 0.3;
      this.black(false, 1.4);
      this.fill.intensity = 1.1; // warm room light so every face reads
      this.grade([1.1, 0.96, 0.82], 1.1);
      this.score(0.5);
      const q = this.streamer.items.find((i) => i.id === 'quarters');
      const t = q?.root?.getObjectByName('Quarters_MessTable');
      if (t) {
        const b = new THREE.Box3().setFromObject(t);
        table = { cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, lx: b.max.x - b.min.x, wz: 0.95, top: 0.78 };
      }
      const xs = [-1.85, -0.62, 0.62, 1.85].map((d) => table.cx + d * (table.lx / 5.2));
      const side = table.wz / 2 + 0.36;
      const place = (id, x, s) => {
        const f = F()[id];
        f.root.visible = true;
        f.root.position.set(x, 0.02, table.cz + s * side);
        f.root.rotation.y = s < 0 ? 0 : Math.PI;
        f.play('Sit', 0.01);
      };
      place('vivienne', xs[0], -1); place('julian', xs[1], -1); place('tamsin', xs[2], -1); place('cole', xs[3], -1);
      place('billie', xs[0], 1); place('lindqvist', xs[1], 1); place('ox', xs[2], 1);
      const p = F().pryce;
      p.root.visible = true;
      p.root.position.set(table.cx - table.lx / 2 - 0.55, 0.02, table.cz);
      p.root.rotation.y = Math.PI / 2;
      p.play('Idle', 0.01);
      this.group.add(extras);
      candles = [];
      for (const dx of [-1.3, 0, 1.3]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.17, 8), new THREE.MeshStandardMaterial({ color: 0xeee4cc, roughness: 0.6 }));
        c.position.set(table.cx + dx, table.top + 0.085, table.cz);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090 }));
        flame.scale.y = 2.2;
        flame.position.set(table.cx + dx, table.top + 0.2, table.cz);
        const l = new THREE.PointLight(0xffa860, 3.2, 6, 1.6);
        l.position.set(table.cx + dx, table.top + 0.3, table.cz);
        extras.add(c, flame, l);
        candles.push(l);
      }
      for (const dx of [-0.13, 0.13]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.35 }));
        cup.position.set(xs[2] + dx, -10, table.cz + 0.22);
        extras.add(cup);
        cups.push(cup);
      }
      this.caption(D.captions.dinner, 4.5);
    };
    const flicker = () => {
      for (const l of candles) l.intensity = 3.0 + Math.sin(performance.now() / 90 + l.position.x * 7) * 0.25 + Math.random() * 0.25;
    };
    const facing = (id) => new THREE.Vector3(Math.sin(F()[id].root.rotation.y), 0, Math.cos(F()[id].root.rotation.y));

    const wide = {
      dur: 6,
      enter: setup,
      update: (t, dt, k) => {
        flicker();
        this._cam(this._path([V(table.cx + 4.2, 2.2, table.cz + 3.4), V(table.cx + 3.2, 1.9, table.cz + 2.7)], smooth(k)), V(table.cx, 0.95, table.cz), 0.01, 46);
        this.dof(0);
      },
    };
    const toast = {
      dur: 7,
      events: [
        [0.6, () => F().pryce.play('Point', 0.6, { timeScale: 0.5, offset: 0.3 })],
        [1.2, () => this.say(D.lines.pryce, 4)],
        [5.0, () => this.sfx.clink()],
        [6.2, () => F().pryce.play('Idle', 0.8)],
      ],
      update: (t, dt, k) => {
        flicker();
        const h = F().pryce.headPosition();
        const from = this._path([V(table.cx + table.lx / 2 + 0.9, 1.5, table.cz + 0.05), V(table.cx + table.lx / 2 - 0.4, 1.45, table.cz)], smooth(k));
        this._cam(from, h.clone().add(V(0, -0.12, 0)), 0.006, 34);
        this.dof(from.distanceTo(h), 0.003);
      },
    };
    const closes = D.closeups.map((c) => ({
      dur: 3.6,
      enter: () => {
        this.nameCard(c.id, c.note, 3.4);
        this.key.intensity = 2.6;
        this.rim.intensity = 2.2;
        if (c.id === 'ox') this._cupsT = -1;
      },
      events: c.id === 'ox' ? [[0.9, () => { this._cupsT = 0; this.sfx.cupDown(); }]] : [],
      update: (t, dt, k) => {
        flicker();
        const person = F()[c.id];
        const h = person.headPosition();
        const f = facing(c.id);
        const side = new THREE.Vector3(f.z, 0, -f.x);
        let look = h.clone().add(V(0, -0.03, 0));
        let from = h.clone().addScaledVector(f, 0.85 - 0.15 * smooth(k)).addScaledVector(side, 0.22).add(V(0, 0.02, 0));
        // small performances on top of the sitting pose
        if (c.id === 'vivienne') person.headYaw = lerp(0, -0.55, smooth(clamp01((t - 0.6) / 1.2))); // she turns to watch Billie
        if (c.id === 'billie') person.headYaw = Math.sin(t * 6) * 0.12 * smooth(clamp01((t - 1) / 0.5)) * (1 - clamp01((t - 2.6) / 0.6)); // a short, tight shake
        if (c.id === 'julian') { person.headYaw = 0.25; person.headPitch = -0.05; } // a polite stare, straight at us
        if (c.id === 'lindqvist') {
          const g = person.props.glass;
          if (g) { g.position.x = Math.sin(t * 47) * 0.004; g.position.z = Math.sin(t * 39) * 0.004; }
          look = h.clone().add(V(0, -0.22, 0)).addScaledVector(f, 0.15);
          from = look.clone().addScaledVector(f, 0.8).addScaledVector(side, 0.3).add(V(0, 0.1, 0));
        }
        if (c.id === 'ox') {
          look = V(h.x, table.top + 0.2, h.z).addScaledVector(f, 0.3);
          from = look.clone().addScaledVector(f, 1.15).addScaledVector(side, 0.45).add(V(0, 0.5, 0));
          if (this._cupsT >= 0) {
            this._cupsT += dt;
            cups.forEach((cup, i) => {
              const u = clamp01((this._cupsT - i * 0.42) / 0.35);
              cup.position.y = u > 0 ? table.top + 0.04 + (1 - smooth(u)) * 0.12 : -10;
            });
          }
        }
        if (c.id === 'tamsin') {
          const cig = person.props.cigarette;
          if (cig) {
            const glow = 1 + Math.max(0, Math.sin((t - 1) * 2.5)) * 3;
            cig.userData.ember.material.emissiveIntensity = 3 * glow;
            if (!smoke) smoke = this._smoke();
            const p = new THREE.Vector3();
            cig.userData.ember.getWorldPosition(p);
            this._puffSmoke(smoke, p, dt);
          }
        }
        // a soft key light on the face from the camera side, a warm rim from behind
        this.key.position.copy(h).addScaledVector(f, 0.7).addScaledVector(side, 0.5).add(V(0, 0.25, 0));
        this.rim.position.copy(h).addScaledVector(f, -0.5).addScaledVector(side, -0.3).add(V(0, 0.2, 0));
        this._cam(from, look, 0.003, 30);
        this.dof(from.distanceTo(look), 0.006);
      },
      exit: () => {
        const person = F()[c.id];
        person.headYaw = 0;
        person.headPitch = 0;
      },
    }));
    const pull = {
      dur: 4.5,
      enter: () => { this.key.intensity = 0; this.rim.intensity = 0; this.dof(0); },
      update: (t, dt, k) => {
        flicker();
        this._cam(this._path([V(table.cx - 0.5, 1.9, table.cz + 2.1), V(table.cx - 1.6, 2.5, table.cz + 3.4)], smooth(k)), V(table.cx, 0.9, table.cz), 0.004, 46);
      },
      exit: () => {
        extras.removeFromParent();
        smoke?.points.removeFromParent();
        this._show(Object.keys(F()), false);
      },
    };
    return [wide, toast, ...closes, pull];
  }

  // ------------------------------------------------------------------ cigarette smoke
  _smoke() {
    const N = 60;
    const pos = new Float32Array(N * 3).fill(-999);
    const life = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbab2a6, size: 0.05, map: this.dust.points.material.map, transparent: true, opacity: 0.25, depthWrite: false }));
    points.frustumCulled = false;
    this.group.add(points);
    return { points, pos, life, N, i: 0, acc: 0 };
  }

  _puffSmoke(s, at, dt) {
    s.acc += dt;
    while (s.acc > 0.06) {
      s.acc -= 0.06;
      const i = s.i++ % s.N;
      s.pos[i * 3] = at.x; s.pos[i * 3 + 1] = at.y; s.pos[i * 3 + 2] = at.z;
      s.life[i] = 2;
    }
    for (let i = 0; i < s.N; i++) {
      if (s.life[i] <= 0) continue;
      s.life[i] -= dt;
      s.pos[i * 3] += Math.sin(i + s.life[i] * 3) * 0.02 * dt;
      s.pos[i * 3 + 1] += 0.09 * dt;
      s.pos[i * 3 + 2] += Math.cos(i + s.life[i] * 2) * 0.02 * dt;
    }
    s.points.geometry.attributes.position.needsUpdate = true;
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
      this._wdLight = new THREE.PointLight(0x8a90a8, 2.2, 8, 2);
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
