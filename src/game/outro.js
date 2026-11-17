import * as THREE from 'three';
import { Intro } from './intro.js';

/**
 * The ending montage, about 2 minutes, in the same style as the intro (it reuses the intro's
 * letterbox, subtitles, name cards, grading, music and the real mail plane):
 *
 *   1 "THE STORM HAS PASSED."     2 Danny brings Clementine out of the hangar into the light
 *   3 her face, looking up at the sky
 *   4 that evening on the apron: everyone gathered to say goodbye
 *   5 one by one, each of them thanks the Inspector (name cards, as at the dinner)
 *   6 they watch the mail plane take off, and it lifts into the evening
 *   7 in the cabin: Danny says thank you too
 *   8 the plane climbs away into a clear sky: THE MARIGOLD SILENCE, case closed
 *
 * Played for the endings where she is brought up (outro.json "endings"); the ending's own card
 * follows it. All words: src/data/scenes/outro.json.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const lerp = (a, b, k) => a + (b - a) * k;

const HART = V(4, 0, 31); // where the Inspector stands for the goodbyes, in front of the hangar doors
const HANGAR_DOOR = V(-0.5, 0, 14.2);
const HEAD_TO_HART = 1.1; // Danny's head turn in the cabin (radians), towards the seat beside him

export class Outro extends Intro {
  constructor(o) {
    super(o);
    this.castIds = ['cole', 'clementine', ...this.data.farewells.map((f) => f.id)];
    this.el.classList.add('outro');
  }

  /** Play the montage for ending `id`, then call done(). */
  play(id, done) {
    this.endingId = id;
    this.start(done);
  }

  _shots() {
    const D = this.data;
    const atm = this.atmosphere;
    const F = () => this.fig;
    const P = (x, y, z, yaw = Math.PI / 2, pitch = 0, roll = 0) => { this.plane.position.set(x, y, z); this.plane.rotation.set(pitch, yaw, roll); };
    const g = (x, z) => this._ground(x, z);
    const stand = (id, x, z, yaw, anim = 'Idle') => {
      const f = F()[id];
      if (!f) return;
      f.root.visible = true;
      f.root.position.set(x, g(x, z), z);
      f.root.rotation.y = yaw;
      f.play(anim, 0.01);
    };
    const facing = (f) => V(Math.sin(f.root.rotation.y), 0, Math.cos(f.root.rotation.y));

    // ---- 1. on black
    const open = {
      dur: 4.5,
      enter: () => { this.indoor = false; this.exposure = 0.2; this.score(0.45); },
      events: [
        [0.4, () => { this.dom.dawn.textContent = D.open; this.dom.dawn.classList.add('on'); }],
        [3.4, () => this.dom.dawn.classList.remove('on')],
      ],
    };

    // ---- 2. out of the hangar, into the light
    const walkK = (t) => smooth(clamp01((t - 0.4) / 8.2));
    const clemAt = (t) => HANGAR_DOOR.clone().lerp(V(-0.3, 0, 21.5), walkK(t));
    const out = {
      dur: 13,
      needs: true,
      enter: () => {
        atm.night = 0.05;
        atm.extraFog = 0;
        atm.clear = 1; // the storm has passed
        this.exposure = 1;
        this.grade([1.1, 0.98, 0.84], 1.08);
        this.black(false, 2.2);
        this.score(0.5);
        stand('clementine', HANGAR_DOOR.x, HANGAR_DOOR.z, 0, 'Walk');
        stand('cole', HANGAR_DOOR.x + 0.85, HANGAR_DOOR.z - 0.2, 0, 'Walk');
        this.caption(D.captions.out, 5);
        this._step = 0;
      },
      events: [
        [2.0, () => this.say((D.out[this.endingId] ?? D.out.E1)[0], 3.6)],
        [6.2, () => this.say((D.out[this.endingId] ?? D.out.E1)[1], 3.8)],
        [8.6, () => { F().clementine?.play('Idle', 0.6); F().cole?.play('Idle', 0.6); }],
      ],
      update: (t, dt, k) => {
        const c = clemAt(t);
        F().clementine?.root.position.set(c.x, g(c.x, c.z), c.z);
        F().cole?.root.position.set(c.x + 0.85, g(c.x + 0.85, c.z - 0.2), c.z - 0.2);
        // when she stops, she looks up at the sky; Danny looks at her
        if (F().clementine) F().clementine.headPitch = lerp(F().clementine.headPitch ?? 0, t > 8.8 ? -0.45 : 0, dt * 1.5);
        if (F().cole) F().cole.headYaw = lerp(F().cole.headYaw ?? 0, t > 9 ? -0.6 : 0, dt * 2);
        this._step -= dt;
        if (this._step <= 0 && walkK(t) < 0.97 && t > 0.4) { this._step = 0.55; this.audio.footstep(0.5); }
        const look = c.clone().add(V(0.4, 1.35, 0));
        this._cam(this._path([V(2.3, 0, 31), V(1.5, 0, 27.5)], smooth(k)).setY(g(2, 29) + 1.62), look, 0.012, 42);
        this.dof(0);
      },
    };

    // ---- 3. her face, turned up to the sky
    const sky = {
      dur: 6.5,
      enter: () => {
        this.nameCard(D.clementine.id, D.clementine.note, 6);
        this.key.intensity = 1.2;
      },
      update: (t, dt, k) => {
        const f = F().clementine;
        if (!f) return;
        f.headPitch = -0.45;
        const h = f.headPosition();
        const fw = facing(f), side = V(fw.z, 0, -fw.x);
        const from = h.clone().addScaledVector(fw, 1.0 - 0.2 * smooth(k)).addScaledVector(side, 0.3).add(V(0, -0.12, 0));
        this.key.position.copy(h).addScaledVector(fw, 0.7).add(V(0, 0.4, 0));
        this._cam(from, h.clone().add(V(0, 0.02, 0)), 0.004, 32);
        this.dof(from.distanceTo(h), 0.004);
      },
      exit: () => {
        this.key.intensity = 0;
        this.dof(0);
        for (const id of ['clementine', 'cole']) { if (F()[id]) { F()[id].headPitch = 0; F()[id].headYaw = 0; } }
        this._show(['clementine'], false);
      },
    };

    // ---- 4. that evening: everyone on the apron, in an arc in front of the Inspector
    const people = D.farewells.map((f) => f.id);
    const arc = (i) => {
      const a = THREE.MathUtils.degToRad(-54 + (108 * i) / Math.max(1, people.length - 1));
      return V(HART.x + Math.sin(a) * 3.4, 0, HART.z - Math.cos(a) * 3.4);
    };
    const gather = () => {
      people.forEach((id, i) => {
        const p = arc(i);
        stand(id, p.x, p.z, Math.atan2(HART.x - p.x, HART.z - p.z));
      });
      stand('cole', HART.x + 0.9, HART.z + 0.2, Math.PI);
    };
    const apron = {
      dur: 7,
      enter: () => {
        atm.night = 0.12; // the light is going
        this.grade([1.14, 0.96, 0.8], 1.1);
        gather();
        this.caption(D.captions.apron, 5.5);
        this.score(0.6);
      },
      update: (t, dt, k) => {
        const from = this._path([V(HART.x + 1.4, 0, HART.z + 5.5), V(HART.x + 0.8, 0, HART.z + 3.6)], smooth(k));
        from.y = g(from.x, from.z) + 2.3 - 0.4 * smooth(k);
        this._cam(from, V(HART.x, g(HART.x, HART.z - 3) + 1.2, HART.z - 2.6), 0.006, 46);
      },
    };

    // ---- 5. goodbyes, one by one (like the faces at Friday's dinner)
    const byes = D.farewells.map((b) => {
      const dur = Math.max(4.8, b.text.length / 13 + 2);
      return {
        dur,
        enter: () => { this.key.intensity = 1.4; this.rim.intensity = 1.2; },
        events: [
          [0.2, () => this.nameCard(b.id, b.note, dur - 0.5)],
          [0.5, () => { F()[b.id]?.play('Talk', 0.4); this.say({ speaker: this.names.get(b.id) ?? b.id, text: b.text }, dur - 0.9); }],
          [dur - 1.4, () => F()[b.id]?.play('Nod', 0.4)],
        ],
        update: (t, dt, k) => {
          const f = F()[b.id];
          if (!f) return;
          const h = f.headPosition();
          const fw = facing(f), side = V(fw.z, 0, -fw.x);
          const from = h.clone().addScaledVector(fw, 1.05 - 0.15 * smooth(k)).addScaledVector(side, 0.18).add(V(0, -0.04, 0));
          this.key.position.copy(h).addScaledVector(fw, 0.7).addScaledVector(side, 0.4).add(V(0, 0.3, 0));
          this.rim.position.copy(h).addScaledVector(fw, -0.5).addScaledVector(side, -0.3).add(V(0, 0.2, 0));
          this._cam(from, h.clone().add(V(0, -0.03, 0)), 0.003, 30);
          this.dof(from.distanceTo(h), 0.005);
        },
        exit: () => F()[b.id]?.play('Idle', 0.5),
      };
    });

    // ---- 6. they watch the mail plane go (Danny is aboard; the Inspector's seat is waiting)
    const accel = 3.2, x0 = -25, zRun = 74.5, lift = 6.6;
    const roll = (t) => {
      const x = x0 + 0.5 * accel * t * t;
      const air = Math.max(0, t - lift);
      const y = g(x, zRun) + 0.6 * air * air;
      const pitch = t < 3 ? -0.085 : t < lift ? lerp(-0.085, 0, clamp01((t - 3) / 2)) : -Math.min(0.14, air * 0.05);
      return { x, y, pitch };
    };
    const watch = {
      dur: 7.5,
      enter: () => {
        this.key.intensity = 0;
        this.rim.intensity = 0;
        this.dof(0);
        this._show(['cole'], false);
        people.forEach((id) => { if (F()[id]) F()[id].root.rotation.y = 0.35; }); // turned to the runway
        this.plane.visible = true;
        this.propSpeed = 70;
        this.sfx.engineOn();
        this.sfx.setEngine(46, 0.2, 0.3, 0);
        this.sfx.setEngine(68, 0.45, 6, 0);
        this.caption(D.captions.takeoff, 5);
        this.score(0.7);
      },
      update: (t, dt, k) => {
        const r = roll(t);
        P(r.x, r.y, zRun, Math.PI / 2, r.pitch, 0);
        if (t > 1 && Math.random() < 0.5) this._emitDust(V(r.x - 3, g(r.x, zRun) + 0.2, zRun), 2, 2, 1.2);
        // over their shoulders: they stand in a row and watch her roll down the strip
        const cam = this._path([V(HART.x - 1.2, 0, HART.z - 7.4), V(HART.x - 0.4, 0, HART.z - 7.0)], smooth(k));
        cam.y = g(cam.x, cam.z) + 1.75;
        this._cam(cam, V(18, 3, zRun), 0.008, 52);
      },
      exit: () => this._show(people, false),
    };
    const liftoff = {
      dur: 7,
      update: (t, dt, k) => {
        const r = roll(t + watch.dur);
        P(r.x, r.y, zRun, Math.PI / 2, r.pitch, 0);
        if (r.y - g(r.x, zRun) < 0.5 && Math.random() < 0.5) this._emitDust(V(r.x - 3, g(r.x, zRun) + 0.2, zRun), 2, 2, 1.2);
        const cam = V(96, 0, zRun - 14);
        cam.y = g(cam.x, cam.z) + 1.3;
        this._cam(cam, this.plane.position.clone().add(V(0, 1.4, 0)), 0.01, 40);
        const d = cam.distanceTo(this.plane.position);
        this.sfx.setEngine(70, Math.min(0.7, 25 / d), 0.2, 0);
      },
    };

    // ---- 7. in the cabin, over the desert: Danny's thank you
    const cabin = {
      dur: 13,
      enter: () => {
        const c = F().cole;
        c.root.visible = true;
        this.plane.getObjectByName('SEAT_Passenger')?.add(c.root);
        c.root.position.set(0, -0.48, -0.05);
        c.root.rotation.set(0, 0, 0);
        c.play('Sit', 0.01);
        this.sfx.setEngine(66, 0.4, 0.4, 0.75);
        this.exposure = 0.5;
        this.score(0.4);
      },
      events: [
        [1.2, () => this.say(D.cabin[0], 3.8)],
        [5.4, () => this.say(D.cabin[1], 3.2)],
        [9.0, () => this.say(D.cabin[2], 3.4)],
      ],
      update: (t, dt) => {
        P(300 + 44 * t, 110 + Math.sin(t * 1.3) * 0.8, 75, Math.PI / 2, Math.sin(t * 2.1) * 0.015, Math.sin(t * 0.7) * 0.05);
        this.plane.updateMatrixWorld(true);
        const eye = this.plane.localToWorld(V(0.26, 1.98, 0.66));
        const ahead = this.plane.localToWorld(V(0.05, 1.9, 4));
        const head = F().cole.headPosition();
        const w = smooth(clamp01((t - 0.6) / 1.2)) * (1 - smooth(clamp01((t - 12) / 1)));
        this._cam(eye, ahead.lerp(head, w), 0.008, 58);
        this.dof(w > 0.5 ? eye.distanceTo(head) : 0, 0.004);
        F().cole.headYaw = lerp(F().cole.headYaw ?? 0, HEAD_TO_HART, dt * 2); // he turns to the Inspector beside him
      },
      exit: () => { const c = F().cole; c.headYaw = 0; c.root.visible = false; this.group.add(c.root); this.dof(0); },
    };

    // ---- 8. away into a clean sky: the title
    const away = {
      dur: 15,
      enter: () => {
        this.exposure = 1;
        this.sfx.setEngine(60, 0.3, 2, 0.2);
        this.grade([1.16, 0.97, 0.8], 1.12);
        this.score(0.9);
      },
      events: [
        [2.5, () => this.dom.title.classList.add('on')],
        [6.0, () => this.sfx.engineOff(6)],
        [12.6, () => this.dom.title.classList.remove('on')],
        [13.4, () => this.black(true, 1.4)],
      ],
      update: (t) => {
        // the camera drifts after her, slower than she flies, so she shrinks into the evening
        P(890 + 30 * t, 118 + 3 * t, 75, Math.PI / 2, -0.08, Math.sin(t * 0.6) * 0.04);
        const cam = V(862 + 15 * t, 111 + 1.2 * t, 92);
        const d = cam.distanceTo(this.plane.position);
        this._cam(cam, this.plane.position.clone().add(V(0, d * 0.1, 0)), 0.02, 46); // she sits below the title
      },
    };

    return [open, out, sky, apron, ...byes, watch, liftoff, cabin, away];
  }
}
