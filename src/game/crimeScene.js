import * as THREE from 'three';
import { Character } from '../world/character.js';

/**
 * Stage D: Pryce's office as it was found at 06:10 on Saturday (v4 S1-S6).
 * Adds to the hangar office: Pryce's body slumped at the desk, the brandy decanter and glass,
 * the music box, calendar, pocket watch, the demand note under the door, the doctor's bag,
 * the floor vent, and invisible "look here" spots for the bolt, window, stove, ceiling,
 * floor, safe, bookshelf and photograph. Every one is an interactable; what they say lives in
 * src/data/sequences.json.
 *
 * Office coordinates (hangar space): x 13..20, z -12.5..-6.5, door in the front wall (z -6.5)
 * at x 15..16. Desk x 15.9..17.7, z -10.35..-9.45, top at 0.78 m. Chair behind it at z -10.8.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class CrimeScene {
  constructor(o) {
    Object.assign(this, o); // hangar, interaction, state, evidence, hud, audio, data, cast, openSequence, dialogue, spend, trust
    this.group = new THREE.Group();
    this.group.name = 'CrimeScene';
  }

  async build() {
    const m = (color, rough = 0.5, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    const add = (name, mesh, pos) => { mesh.name = name; mesh.position.copy(pos); mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh); return mesh; };
    const top = 0.78;

    // brandy decanter (cut glass, a third full) and his glass
    const dec = new THREE.Group();
    const glass = m(0xd8d2c4, 0.04, 0.1, { transparent: true, opacity: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.17, 8), glass);
    body.position.y = 0.085;
    const brandy = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.066, 0.06, 8), m(0x6a2c0c, 0.1, 0, { transparent: true, opacity: 0.85 }));
    brandy.position.y = 0.035;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.06, 8), glass);
    neck.position.y = 0.2;
    const stopper = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), glass);
    stopper.position.set(0.12, 0.028, 0.04); // left off, lying beside it
    dec.add(body, brandy, neck, stopper);
    add('CS_decanter', dec, V(16.25, top, -9.75));
    const tumbler = new THREE.Group();
    const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 14, 1, true), glass);
    tg.position.y = 0.04;
    const dreg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), m(0x6a2c0c, 0.1));
    dreg.position.y = 0.008;
    tumbler.add(tg, dreg);
    add('CS_glass', tumbler, V(16.62, top, -9.95));

    // music box (walnut, lid open, a brass comb)
    const box = new THREE.Group();
    const wood = m(0x4a2a14, 0.35);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.11), wood);
    base.position.y = 0.035;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.11), wood);
    lid.position.set(0, 0.11, -0.05);
    lid.rotation.x = -1.2;
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.03), m(0xc8a050, 0.3, 0.9));
    comb.position.set(0, 0.072, 0.01);
    // the brass winding key on its side: where the small print is (see sequences.json examine.musicbox)
    const brass = m(0xc8a050, 0.3, 0.9);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.025, 6), brass);
    stem.rotation.z = Math.PI / 2;
    stem.position.set(0.092, 0.035, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.034), brass);
    wing.position.set(0.106, 0.035, 0);
    box.add(base, lid, comb, stem, wing);
    add('CS_musicbox', box, V(17.35, top, -9.7));

    // calendar block, pocket watch, the note under the door
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.04), m(0xe9e1cc, 0.8));
    cal.rotation.x = -0.25;
    add('CS_calendar', cal, V(17.5, top + 0.075, -10.2));
    const watch = new THREE.Group();
    const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 18), m(0xc9a24a, 0.25, 1));
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.011, 18), m(0xf2ead6, 0.4));
    watch.add(case_, face);
    add('CS_watch', watch, V(16.95, top + 0.006, -9.55));
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.002, 0.14), m(0xe8d48a, 0.85));
    note.rotation.y = 0.3;
    add('CS_note', note, V(15.5, 0.02, -6.75));
    // the floor vent (a small iron grille)
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.1), m(0x222222, 0.6, 0.7));
    add('CS_vent', vent, V(18.6, 0.02, -7.4));
    // Lindqvist's black bag on the floor by the desk
    const bag = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.18), m(0x161210, 0.45));
    bb.position.y = 0.11;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), m(0x161210, 0.45));
    handle.position.y = 0.22;
    bag.add(bb, handle);
    add('CS_bag', bag, V(15.3, 0, -9.4));
    // Hart's camera case and evidence markers by the door
    const kit = new THREE.Group();
    const kc = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), m(0x3a2a18, 0.6));
    kc.position.y = 0.1;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 14), m(0x111111, 0.3, 0.6));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.12, 0.12);
    kit.add(kc, lens);
    add('CS_kit', kit, V(14.0, 0, -7.0));

    // invisible "look here" boxes on things that are part of the hangar model
    const spot = (name, pos, size) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }));
      b.userData.hitProxy = true;
      return add(name, b, pos);
    };
    spot('CS_body_hit', V(16.8, 0.95, -10.55), [0.7, 0.9, 0.7]);
    spot('CS_bolt', V(15.15, 1.1, -6.6), [0.25, 0.25, 0.12]);
    spot('CS_window', V(18.0, 1.67, -6.6), [1.7, 1.1, 0.14]); // the window in the front wall, onto the hangar
    // its iron bars, on the office side of the glass
    const bars = new THREE.Group();
    const barM = m(0x26221f, 0.6, 0.75);
    for (let x = 17.32; x <= 18.7; x += 0.23) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), barM); r.position.set(x, 1.67, -6.56); bars.add(r); }
    for (const y of [1.3, 2.05]) { const f = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.012), barM); f.position.set(18.0, y, -6.56); bars.add(f); }
    bars.traverse((o) => { o.userData.noRay = true; });
    add('CS_bars', bars, V(0, 0, 0));
    spot('CS_stove', V(19.3, 0.8, -7.7), [0.7, 1.4, 0.6]);
    spot('CS_ceiling', V(16.5, 3.1, -9.5), [3, 0.12, 3]);
    spot('CS_floor', V(16.85, 0.05, -9.1), [2.4, 0.08, 1.8]);
    spot('CS_safe', V(19.4, 0.55, -12.05), [0.75, 0.95, 0.7]);
    spot('CS_shelf', V(13.25, 1.1, -11.2), [0.4, 2.2, 1.8]);
    spot('CS_photo', V(19.95, 1.88, -11.33), [0.08, 0.5, 0.4]);
    spot('CS_drawer', V(16.2, 0.45, -9.42), [0.6, 0.7, 0.1]);
    spot('CS_blotter', V(16.8, top + 0.01, -9.88), [0.9, 0.03, 0.55]);
    spot('CS_book', V(13.3, 1.35, -10.9), [0.3, 0.25, 0.3]);
    // the east half of the open shaft, where the cable runs (the trapdoor's own box covers the west half)
    spot('CS_cable', V(17.05, -0.74, -9.0), [0.4, 1.72, 0.8]);

    // the trapdoor: a real 0.8 m opening in the office floor (cut into hangar_shell.glb), a shaft
    // with plank walls and an iron ladder, a lamp glowing far below. Until S6 the hatch lies flush
    // under the rug; S6 swings it open onto the floor beside the hole.
    this.trap = new THREE.Group();
    this.trap.position.set(16.85, 0, -9.0);
    const S = 0.4, DEPTH = 3.2; // half-width of the opening, depth of the shaft
    const plank = m(0x3b2c1e, 0.9);
    const shaft = new THREE.Group();
    for (const [x, z, w, d] of [[-S - 0.03, 0, 0.06, 2 * S + 0.12], [S + 0.03, 0, 0.06, 2 * S + 0.12], [0, -S - 0.03, 2 * S, 0.06], [0, S + 0.03, 2 * S, 0.06]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, DEPTH, d), plank);
      wall.position.set(x, -DEPTH / 2 - 0.005, z);
      shaft.add(wall);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2 * S, 2 * S), new THREE.MeshBasicMaterial({ color: 0x6a4214 })); // her lamp, down below
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -DEPTH;
    shaft.add(glow);
    // the ladder against the north wall, its rails poking up above the floor as handholds
    const iron = m(0x2b2622, 0.55, 0.8);
    for (const x of [-0.2, 0.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, DEPTH + 0.45, 0.04), iron);
      rail.position.set(x, -DEPTH / 2 + 0.22, -S + 0.05);
      shaft.add(rail);
    }
    for (let y = -DEPTH + 0.25; y < 0; y += 0.3) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 8), iron);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, y, -S + 0.06);
      shaft.add(rung);
    }
    // a dark timber frame around the opening so it reads as a hatchway, not a hole in a picture
    const frameM = m(0x22180f, 0.8);
    for (const [x, z, w, d] of [[-S - 0.04, 0, 0.08, 2 * S + 0.16], [S + 0.04, 0, 0.08, 2 * S + 0.16], [0, -S - 0.04, 2 * S, 0.08], [0, S + 0.04, 2 * S, 0.08]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), frameM);
      f.position.set(x, 0.008, z);
      shaft.add(f);
    }
    // the telegraph cable: comes out of the joists and runs down the middle of the east wall (the wall
    // you face from the door and from the rug).
    // A third of the way down someone has cut into it and spliced on a thinner, newer wire that goes on
    // down into the dark (S18 / F13: the tap; the spoon key at the other end is in the Undercroft).
    const cableM = m(0x111111, 0.7);
    const cx = S - 0.05, cz = 0.1;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, DEPTH, 8), cableM);
    cable.position.set(cx, -DEPTH / 2, cz);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), m(0xb08a3c, 0.35, 0.85));
    sleeve.position.set(cx, -1.0, cz);
    const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.07, 10), m(0x2a2a26, 0.95));
    tape.position.set(cx, -1.12, cz);
    // the new wire: from the splice it slants along the east wall, then runs down its north corner
    const wireM = m(0x9a7444, 0.8); // cloth-covered bell wire, newer and lighter
    const a = new THREE.Vector3(cx - 0.01, -1.08, cz - 0.02), b = new THREE.Vector3(cx - 0.01, -1.7, -S + 0.1);
    const slant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, a.distanceTo(b), 6), wireM);
    slant.position.copy(a).add(b).multiplyScalar(0.5);
    slant.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, DEPTH - 1.7, 6), wireM);
    drop.position.set(cx - 0.01, -1.7 - (DEPTH - 1.7) / 2, -S + 0.1);
    shaft.add(cable, sleeve, tape, slant, drop);
    shaft.visible = false; // drawn only once the hatch is open (closed, nothing shows through)
    this.shaft = shaft;
    // the hatch: planks with two iron straps and a ring; hinged on its east edge
    this.hatch = new THREE.Group();
    const boards = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 0.03, 2 * S), m(0x4a3523, 0.85));
    boards.position.set(-S, 0, 0);
    this.hatch.add(boards);
    for (const z of [-0.22, 0.22]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(2 * S - 0.04, 0.034, 0.05), iron);
      strap.position.set(-S, 0, z);
      this.hatch.add(strap);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16), iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-2 * S + 0.12, 0.02, 0);
    this.hatch.add(ring);
    this.hatch.position.set(S, -0.003, 0); // closed: flush with the boards, under the rug
    // her lamp, far below: lights the shaft (and the cable) once the hatch is open. It always exists,
    // at 0 until then, so opening the hatch doesn't change the number of lights (no shader rebuild).
    this.shaftLight = new THREE.PointLight(0xffb060, 0, 4.5, 1.6);
    this.shaftLight.position.set(0, -2.7, 0);
    this.trap.add(shaft, this.hatch, this.shaftLight);
    this.trap.traverse((o) => { o.userData.noRay = true; }); // aiming goes through to the trapdoor's own target box
    this.group.add(this.trap);

    // Pryce, slumped forward over the desk
    try {
      const p = await Character.load('pryce_dead', { ...this.cast.pryce, props: [] });
      p.root.position.set(16.8, 0.02, -10.78);
      p.root.rotation.y = 0;
      p.play('Sit', 0.01, { offset: 1 });
      p.mixer.update(0.6);
      // slump: lean the spine forward, drop the head onto the desk, one arm reaching for the glass
      p.bone('Spine')?.rotateX(0.35);
      p.bone('Spine1')?.rotateX(0.3);
      p.bone('Spine2')?.rotateX(0.25);
      p.bone('Neck')?.rotateX(0.35);
      p.bone('Head')?.rotateX(0.3);
      p.bone('Head')?.rotateZ(0.35);
      p.bone('RightArm')?.rotateX(-0.9);
      p.bone('LeftArm')?.rotateX(-0.6);
      p.root.name = 'CS_body';
      this.group.add(p.root);
      this.pryce = p; // never updated again: he doesn't move
    } catch (e) { console.warn('Pryce body', e); }

    this.hangar.root.add(this.group);
    if (this.state.data.solved.includes('S6')) this.openTrapdoor(true);
    this._register();
  }

  /** Interactables for everything in the office (type ui, handled by handle()). */
  _register() {
    const E = this.data.examine;
    const defs = [
      ['body', 'CS_body_hit'], ['decanter', 'CS_decanter'], ['decanter', 'CS_glass', 'glassdef'], ['musicbox', 'CS_musicbox'], ['calendar', 'CS_calendar'],
      ['blotter', 'CS_blotter'], ['note', 'CS_note'], ['revolver', 'CS_drawer'], ['watch', 'CS_watch'], ['photo', 'CS_photo'],
      ['stove', 'CS_stove'], ['window', 'CS_window'], ['bolt', 'CS_bolt'], ['ceiling', 'CS_ceiling'], ['vent', 'CS_vent'], ['floor', 'CS_floor'],
      ['cable', 'CS_cable'],
    ].map(([key, obj, id]) => ({ id: id ?? `cs_${key}`, type: 'ui', ui: 'examine', key, location: 'office', object: obj, prompt: E[key].prompt, timeCost: 2, requires: E[key].requires }));
    defs.push(
      { id: 'cs_kit', type: 'ui', ui: 'seq', seq: 'S1', location: 'office', object: 'CS_kit', prompt: 'Camera and markers: walk the room (S1)', timeCost: 0 },
      { id: 'cs_bag', type: 'ui', ui: 'bag', location: 'office', object: 'CS_bag', prompt: "Doctor Lindqvist's bag", timeCost: 0 },
      { id: 'cs_safe', type: 'ui', ui: 'seq', seq: 'S5', location: 'office', object: 'CS_safe', prompt: 'The safe (S5)', timeCost: 0 },
      { id: 'cs_shelf', type: 'ui', ui: 'shelf', location: 'office', object: 'CS_shelf', prompt: 'The bookshelf', timeCost: 0 },
    );
    for (const d of defs) {
      if (this.interaction.byId.has(d.id)) continue;
      this.interaction.defs.push(d);
      this.interaction.byId.set(d.id, d);
    }
    this.interaction.addLocation('office', this.group);
  }

  /** E on something in the office. Returns true if handled. */
  handle(def) {
    if (def.ui === 'examine') return this.examine(def.key);
    if (def.ui === 'seq') return this.openSequence(def.seq);
    if (def.ui === 'bag') {
      this.dialogue.show("Doctor Lindqvist's bag", 'His field kit: a thermometer, a stethoscope, test chemicals in little bottles, and a dropper.', [
        { label: 'Examine the body with the doctor (S2)', onPick: () => { this.dialogue.close(); this.openSequence('S2'); } },
        { label: 'Take the body temperature (S3)', onPick: () => { this.dialogue.close(); this.openSequence('S3'); } },
        { label: 'Test the drinks for poison (S4)', onPick: () => { this.dialogue.close(); this.openSequence('S4'); } },
        { label: 'Leave it', onPick: () => this.dialogue.close() },
      ]);
      return true;
    }
    if (def.ui === 'shelf') {
      this.dialogue.show('The bookshelf', 'Aviation books, ledgers, a few novels. Eight thick volumes on the middle shelf have little brass pull-rings on their spines.', [
        { label: 'Look along the shelves', onPick: () => { this.dialogue.close(); this.examine('book'); } },
        { label: 'Try the pull-books (S6)', onPick: () => { this.dialogue.close(); this.openSequence('S6'); } },
        { label: 'Leave it', onPick: () => this.dialogue.close() },
      ]);
      return true;
    }
    return false;
  }

  examine(key) {
    const e = this.data.examine[key];
    const ex = this.state.data.examined;
    if (!ex.includes(key)) ex.push(key);
    this.state.setFlag(key); // e.g. 'photo' and 'musicbox' unlock questions for the suspects
    if (e.note) this.evidence.note(e.note);
    for (const [fid, src] of e.sources ?? []) this.evidence.add(fid, src);
    if (e.sound === 'hollow') this._knock();
    if (key === 'musicbox') this.onMusicBox?.();
    this.hud.openReader(e.name, e.text);
    this.state.save();
    return true;
  }

  _knock() {
    const ctx = this.audio?.ctx;
    if (!ctx) return;
    [0, 0.35, 0.7, 1.2, 1.55].forEach((at, i) => {
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator();
      o.frequency.value = i < 3 ? 180 : 95; // solid... solid... hollow
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i < 3 ? 0.08 : 0.35));
      o.connect(g).connect(this.audio.master);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  openTrapdoor(instant = false) {
    this.shaft.visible = true;
    this.shaftLight.intensity = 2.2;
    // the hatch swings over on its hinge and lies open on the floor, east of the hole
    // (it ends upside down, lifted onto the boards so the floor doesn't swallow it)
    if (instant) { this.hatch.rotation.z = -Math.PI; this.hatch.position.y = 0.032; } else {
      const t0 = performance.now();
      const swing = () => {
        const k = Math.min(1, (performance.now() - t0) / 1400);
        this.hatch.rotation.z = -Math.PI * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
        this.hatch.position.y = -0.003 + 0.035 * k;
        if (k < 1) requestAnimationFrame(swing);
      };
      swing();
    }
    this._moveRug();
    if (!instant) this.hud.caption(this.data.S6.trapdoor, 8);
  }

  /** Drag the rug clear of the hatch (x 16.45..17.25), toward the bookshelf wall. The rug is its own
   *  object in the scene (not part of the hangar model) and may load after this, so keep trying. */
  _moveRug(tries = 30) {
    const scene = this.hangar.root.parent ?? this.hangar.root;
    const rug = scene.getObjectByName('Office_Rug');
    if (!rug) { if (tries > 0) setTimeout(() => this._moveRug(tries - 1), 1000); return; }
    if (rug.userData.moved) return;
    rug.position.x -= 1.8; // rug spans x 15.6..18.1 before, 13.8..16.3 after
    rug.userData.moved = true;
  }
}
