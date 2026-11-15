import * as THREE from 'three';

/**
 * v4 Tier 3: investigations that are walks across the map.
 *  S17 The Smoke Test   take a smoke pot (maintenance shed), drop it in the culvert vent stack
 *                       (fuel farm yard), then WALK to where the smoke comes up: the hangar office,
 *                       the storage shed, the darkroom. Being near a smoking spot records it.
 *                       The smoke lasts about 40 game minutes.
 *  S18 Follow the Wire  match the telegram's rhythm at Hobbs's radio (screen), then follow the iron
 *                       conduit posts across the runway to the splice box and the hangar wall.
 *  S14 / S15            the ration ledger and the crates in the storage shed (screens), and the
 *                       drying rack in the Quarters kitchen.
 * Words: src/data/sequences.json ("walks", S14, S15, S17, S18).
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// where things are (world coordinates)
const P = {
  smokepot: V(-59.9, 0.4, 20.4), // the flare pots and the crate of smoke pots in the maintenance shed
  ventstack: V(79.5, 0, 36.2),
  radio: V(40.2, 1.0, 112.4),
  splice: V(-53.2, 0, 19.2),
  cableend: V(-21.0, 0, 4.0),
  rack: V(-86.5, 1.12, -32.9), // on the Quarters kitchen counter
  ledger: V(-56.9, 1.0, 33.8), // lying open on a drum in the storage shed
  crates: V(-59.4, 0.6, 37.6),
  hatch: V(-59.6, 0.02, 38.3),
  smoke: { hangar: V(18.6, 0.05, -7.4), storage: V(-58.0, 0.05, 37.2), darkroom: V(56.6, 0.05, -22.3) },
};
// the conduit: from the radio shelter across the runway, along the apron to the splice, then to the hangar
const ROUTE = [V(40, 0, 108), V(36, 0, 92), V(33, 0, 76), V(30, 0, 62), V(12, 0, 58), V(-14, 0, 54), V(-32, 0, 44), V(-46, 0, 30), V(-53.2, 0, 19.2), V(-44, 0, 14), V(-33, 0, 8), V(-21, 0, 4)];

export class Walks {
  constructor(o) {
    Object.assign(this, o); // scene, ground, interaction, state, evidence, hud, data, seq (SequenceScreen), openSequence, spend, audio
    this.group = new THREE.Group();
    this.group.name = 'Walks';
    this.scene.add(this.group);
    this.W = this.data.walks;
    this.state.data.smoke ??= { until: 0, seen: [] };
  }

  build() {
    const m = (c, r = 0.7, mt = 0.4) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
    const rust = m(0x5a3a22, 0.85, 0.5);
    const at = (v, y = 0) => V(v.x, this.ground.heightAt(v.x, v.z) + y, v.z);
    // culvert vent stack: a short rusty pipe with a cowl
    const stack = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 14), rust);
    pipe.position.y = 0.55;
    const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 14), rust);
    cowl.position.y = 1.22;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), m(0x3a3530, 0.9, 0.2));
    collar.position.y = 0.03;
    stack.add(pipe, cowl, collar);
    stack.position.copy(at(P.ventstack));
    stack.name = 'WK_ventstack';
    this.group.add(stack);
    // conduit marker posts (hidden until you've noticed the wire)
    this.posts = new THREE.Group();
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const a = ROUTE[i], b = ROUTE[i + 1];
      const n = Math.max(1, Math.round(a.distanceTo(b) / 9));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, k / n);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 8), rust);
        post.position.copy(at(p, 0.3));
        post.rotation.z = (Math.random() - 0.5) * 0.15;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), rust);
        cap.position.y = 0.3;
        post.add(cap);
        post.castShadow = true;
        if (i === 0 && k === 1) post.name = 'WK_post';
        this.posts.add(post);
      }
    }
    this.posts.visible = this.state.flag('wireNoticed');
    this.group.add(this.posts);
    // splice box by the maintenance shed
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), m(0x3a3a34, 0.6, 0.7));
    box.position.copy(at(P.splice, 0.17));
    box.name = 'WK_splice';
    this.group.add(box);
    const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), rust);
    conduit.position.copy(at(P.cableend, 0.2));
    conduit.name = 'WK_cableend';
    this.group.add(conduit);
    // the back-room hatch in the storage shed (appears with S15)
    this.hatch = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.75), m(0x3a2a1a, 0.85, 0));
    this.hatch.position.copy(P.hatch);
    this.hatch.name = 'WK_hatch';
    this.hatch.visible = this.state.data.solved.includes('S15');
    this.group.add(this.hatch);
    // invisible "look here" spots
    const spot = (name, pos, size) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }));
      b.userData.hitProxy = true;
      b.position.copy(pos);
      b.name = name;
      this.group.add(b);
    };
    spot('WK_smokepot', P.smokepot, [1.6, 0.8, 2.6]);
    spot('WK_ventstack_hit', at(P.ventstack, 0.7), [0.6, 1.4, 0.6]);
    spot('WK_radio', P.radio, [1.4, 0.9, 0.8]);
    spot('WK_rack', P.rack, [0.45, 0.4, 0.7]);
    spot('WK_ledger', P.ledger, [0.6, 0.3, 0.6]);
    spot('WK_crates', P.crates, [1.4, 1.2, 1.2]);
    spot('WK_post_hit', at(ROUTE[1], 0.4), [0.5, 0.9, 0.5]);
    // Tier 4 places: the darkroom, records room, Hobbs's cylinders, Lindqvist's case
    for (const t of [...(this.data.spots4 ?? []), ...(this.data.spots5 ?? [])]) spot(`WK_${t.seq}`, V(...t.pos), t.size);
    // the lounge fireplace in Operations (S11): a little cast-iron grate with warm ash
    const grate = new THREE.Group();
    const iron = m(0x1c1a18, 0.7, 0.6);
    const grateBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.45), iron);
    grateBox.position.y = 0.25;
    const ash = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 1, emissive: 0x401808, emissiveIntensity: 0.4 }));
    ash.position.set(0, 0.5, 0.02);
    grate.add(grateBox, ash);
    grate.position.set(38.4, 0, -26.1);
    this.group.add(grate);
    // the Waco's fuel cap (S16): a spot on the parked biplane's top wing
    spot('WK_wacocap', V(-3, 2.6, 46), [0.5, 0.4, 0.5]);
    spot('WK_newspaper', V(32.5, 1.0, -151.0), [0.1, 0.5, 0.42]); // pinned up on the HQ board
    this._props(m);
    // smoke plumes
    this.plumes = {};
    for (const [k, p] of Object.entries({ ...P.smoke, stack: at(P.ventstack, 1.3) })) this.plumes[k] = this._plume(p, k === 'stack' ? 0.9 : 0.5);
    this._register();
  }

  /**
   * The things the clue texts talk about, so every "look here" spot has something real in it:
   * Ox's drying rack, the ration ledger, the darkroom's chemical shelf and balance, the engine mounts,
   * the smoke pots, Hobbs's barograph and wax cylinders, Lindqvist's locked case, Tamsin's scorched
   * ledger pages on Danny's desk, and the 1931 newspaper cutting. Simple shapes, world coordinates.
   */
  _props(m) {
    const put = (o, x, y, z, ry = 0) => {
      o.position.set(x, y, z);
      o.rotation.y = ry;
      o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.userData.noRay = true; } });
      this.group.add(o);
      return o;
    };
    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); return b; };
    const cyl = (r0, r1, h, mat, x = 0, y = 0, z = 0, seg = 14) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); c.position.set(x, y, z); return c; };
    const G = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
    const wood = m(0x6a4a2c, 0.8, 0), dark = m(0x2e2016, 0.8, 0), china = m(0xece6d8, 0.3, 0), brass = m(0xb08a3c, 0.35, 0.85);
    const iron = m(0x2b2622, 0.6, 0.7), paper = m(0xe6dcc0, 0.9, 0), leather = m(0x3e2416, 0.55, 0), steel = m(0x6a6862, 0.45, 0.8);
    const brownGlass = new THREE.MeshStandardMaterial({ color: 0x4a2208, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88 });
    const clearGlass = new THREE.MeshStandardMaterial({ color: 0xd8e0e0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false });

    // Ox's drying rack on the Quarters kitchen counter: two plates standing, two cups upside down
    const rack = G(box(0.3, 0.02, 0.5, wood, 0, 0.01, 0));
    for (const z of [-0.2, 0.2]) rack.add(box(0.02, 0.22, 0.02, wood, -0.12, 0.12, z), box(0.02, 0.22, 0.02, wood, 0.0, 0.12, z));
    rack.add(box(0.02, 0.02, 0.44, wood, -0.12, 0.23, 0), box(0.02, 0.02, 0.44, wood, 0.0, 0.23, 0));
    for (const z of [-0.1, -0.02]) { const p = cyl(0.11, 0.11, 0.012, china, -0.06, 0.13, z, 24); p.rotation.x = Math.PI / 2; rack.add(p); }
    for (const z of [0.1, 0.18]) rack.add(cyl(0.04, 0.032, 0.075, china, 0.07, 0.058, z));
    put(rack, -86.5, 0.955, -32.9);

    // the ration ledger, lying open on a drum in the storage shed
    const book = G(box(0.2, 0.025, 0.28, paper, -0.1, 0.0125, 0), box(0.2, 0.025, 0.28, paper, 0.1, 0.0125, 0), box(0.42, 0.012, 0.3, m(0x3a2214, 0.7, 0), 0, -0.004, 0));
    book.children[0].rotation.z = 0.05; book.children[1].rotation.z = -0.05;
    put(book, -56.9, 0.915, 33.8, 0.3);

    // the darkroom storeroom: a chemical cabinet with the brass balance and stock ledger, jars on shelves above
    const chem = G(box(2.0, 0.9, 0.45, wood, 0, 0.45, 0), box(2.04, 0.03, 0.48, dark, 0, 0.915, 0));
    for (const y of [1.35, 1.75]) chem.add(box(2.0, 0.03, 0.26, wood, 0, y, -0.1));
    const jarX = [-0.8, -0.45, -0.1, 0.25, 0.6];
    jarX.forEach((x, i) => {
      const y = i < 3 ? 1.365 : 1.765;
      chem.add(cyl(0.065, 0.065, 0.17, brownGlass, x, y + 0.085, -0.08), cyl(0.04, 0.04, 0.03, dark, x, y + 0.185, -0.08), box(0.08, 0.06, 0.005, paper, x, y + 0.08, -0.014));
    });
    const balance = G(box(0.34, 0.03, 0.14, dark, 0, 0.015, 0), cyl(0.012, 0.012, 0.26, brass, 0, 0.16, 0), box(0.36, 0.012, 0.012, brass, 0, 0.29, 0));
    for (const x of [-0.16, 0.16]) balance.add(cyl(0.002, 0.002, 0.14, brass, x, 0.22, 0, 4), cyl(0.06, 0.06, 0.008, brass, x, 0.15, 0, 18));
    for (const [x, h] of [[0.08, 0.03], [0.11, 0.022], [0.13, 0.016]]) balance.add(cyl(0.012, 0.012, h, brass, x, 0.03 + h / 2, 0.05, 8));
    balance.position.set(-0.45, 0.93, 0.02);
    const stock = G(box(0.22, 0.03, 0.3, m(0x2a3a52, 0.7, 0), 0, 0.015, 0));
    stock.position.set(0.5, 0.93, 0.02);
    chem.add(balance, stock);
    put(chem, 56.6, 0, -22.675);

    // four old engine mounts on Ox's bench in the maintenance shed; No. 2 carries a red tag
    [23.25, 23.65, 24.05, 24.45].forEach((z, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 8, 20), steel);
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 0.16;
      const mount = G(ring);
      for (const a of [0, 2.1, 4.2]) {
        const strut = cyl(0.012, 0.012, 0.2, steel, 0, 0, 0, 6);
        strut.position.set(Math.cos(a) * 0.07 - 0.04, 0.16 + Math.sin(a) * 0.07, 0);
        strut.rotation.z = Math.PI / 2;
        mount.add(strut);
      }
      mount.add(box(0.2, 0.02, 0.06, steel, -0.04, 0.01, 0));
      if (i === 1) mount.add(box(0.005, 0.05, 0.035, m(0x9a2a1a, 0.6, 0), 0.02, 0.27, 0.06));
      put(mount, -60.5, 0.945, z);
    });

    // a crate of smoke pots beside the flare pots
    const crate = G(box(0.5, 0.32, 0.4, wood, 0, 0.16, 0));
    for (const [x, z] of [[-0.15, -0.1], [0, -0.1], [0.15, -0.1], [-0.15, 0.1], [0, 0.1], [0.15, 0.1]]) crate.add(cyl(0.05, 0.05, 0.16, m(0x7a7a70, 0.6, 0.5), x, 0.36, z), cyl(0.02, 0.02, 0.03, m(0xa03a1a, 0.6, 0), x, 0.455, z));
    put(crate, -59.9, 0, 21.55);

    // Hobbs's barograph under its glass case, on a little table in the radio shelter, with tracings
    const baro = G(box(0.55, 0.03, 0.45, wood, 0, 0.765, 0));
    for (const [x, z] of [[-0.24, -0.19], [0.24, -0.19], [-0.24, 0.19], [0.24, 0.19]]) baro.add(box(0.035, 0.75, 0.035, wood, x, 0.375, z));
    baro.add(box(0.32, 0.06, 0.17, dark, -0.03, 0.81, 0), cyl(0.05, 0.05, 0.11, paper, -0.12, 0.895, 0, 18), box(0.12, 0.004, 0.006, brass, -0.02, 0.9, 0.02), box(0.33, 0.14, 0.18, clearGlass, -0.03, 0.91, 0));
    baro.add(box(0.2, 0.002, 0.14, m(0xf0ead8, 0.9, 0), 0.17, 0.782, 0.08));
    put(baro, 41.75, 0, 110.65);

    // the cylinder phonograph and a row of wax cylinders on Hobbs's call-log cabinet
    const phono = G(box(0.26, 0.1, 0.18, dark, 0, 0.05, -0.15), cyl(0.03, 0.03, 0.12, m(0x3a2a14, 0.4, 0), 0, 0.13, -0.15));
    phono.children[1].rotation.z = Math.PI / 2;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 18, 1, true), brass);
    horn.rotation.z = -Math.PI / 2 - 0.4;
    horn.position.set(0.1, 0.24, -0.15);
    phono.add(horn);
    for (let k = 0; k < 4; k++) phono.add(cyl(0.028, 0.028, 0.1, m(0x2a1a10, 0.3, 0), -0.08 + k * 0.055, 0.05, 0.2));
    put(phono, 37.85, 1.2, 111.2, Math.PI / 2);

    // Dr. Lindqvist's locked leather case, on the office floor beside his bag
    const lcase = G(box(0.46, 0.3, 0.18, leather, 0, 0.15, 0), box(0.47, 0.02, 0.19, dark, 0, 0.3, 0), cyl(0.012, 0.012, 0.12, leather, 0, 0.34, 0, 6));
    lcase.children[2].rotation.z = Math.PI / 2;
    for (const x of [-0.14, 0.14]) lcase.add(box(0.04, 0.05, 0.01, brass, x, 0.27, 0.095));
    put(lcase, 13.75, 0, -8.5, Math.PI / 2);

    // Tamsin's ledger pages, scorched, laid out on Danny's desk at the HQ
    const scraps = new THREE.Group();
    for (const [x, z, r, w, d] of [[-0.08, -0.06, 0.3, 0.16, 0.2], [0.1, 0.04, -0.4, 0.14, 0.17], [-0.02, 0.14, 0.9, 0.12, 0.12]]) {
      const s = G(box(w, 0.002, d, paper, 0, 0.001, 0), box(w * 0.4, 0.003, d * 0.3, m(0x2a1a0e, 0.95, 0), w * 0.3, 0.0015, d * 0.35));
      s.position.set(x, 0, z);
      s.rotation.y = r;
      scraps.add(s);
    }
    scraps.scale.setScalar(1.5);
    put(scraps, 27.78, 0.782, -148.75);

    // the 1931 newspaper cutting, pinned to the HQ board
    const cut = G(box(0.004, 0.42, 0.32, m(0xd9cfa8, 0.95, 0)), box(0.006, 0.05, 0.28, m(0x3a3530, 0.9, 0), 0, 0.15, 0), cyl(0.008, 0.008, 0.012, m(0xb02020, 0.5, 0), -0.004, 0.19, 0, 8));
    cut.children[2].rotation.z = Math.PI / 2;
    put(cut, 32.55, 1.0, -151.0);
  }

  _register() {
    const W = this.W;
    const defs = [
      { id: 'wk_smokepot', ui: 'walk', key: 'smokepot', object: 'WK_smokepot', prompt: W.smokepot.prompt },
      { id: 'wk_ventstack', ui: 'walk', key: 'ventstack', object: 'WK_ventstack_hit', prompt: W.ventstack.prompt },
      { id: 'wk_radio', ui: 'seq', seq: 'S18', object: 'WK_radio', prompt: W.radio.prompt },
      { id: 'wk_post', ui: 'walk', key: 'posts', object: 'WK_post_hit', prompt: W.posts.prompt, requires: ['flag:wireNoticed'] },
      { id: 'wk_splice', ui: 'walk', key: 'splice', object: 'WK_splice', prompt: W.splice.prompt },
      { id: 'wk_cableend', ui: 'walk', key: 'cableend', object: 'WK_cableend', prompt: W.cableend.prompt },
      { id: 'wk_rack', ui: 'walk', key: 'rack', object: 'WK_rack', prompt: W.rack.prompt },
      { id: 'wk_ledger', ui: 'seq', seq: 'S14', object: 'WK_ledger', prompt: W.ledger.prompt },
      { id: 'wk_crates', ui: 'seq', seq: 'S15', object: 'WK_crates', prompt: W.crates.prompt },
      { id: 'wk_hatch', ui: 'walk', key: 'hatch', object: 'WK_hatch', prompt: W.hatch.prompt },
      { id: 'wk_newspaper', ui: 'walk', key: 'newspaper', object: 'WK_newspaper', prompt: this.W.newspaper.prompt },
      { id: 'wk_wacocap', ui: 'walk', key: 'wacocap', object: 'WK_wacocap', prompt: this.data.wacocap.prompt },
      ...[...(this.data.spots4 ?? []), ...(this.data.spots5 ?? [])].map((t) => ({ id: `wk_${t.seq}`, ui: 'seq', seq: t.seq, object: `WK_${t.seq}`, prompt: t.prompt })),
    ].map((d) => ({ type: 'ui', location: 'walks', timeCost: d.ui === 'walk' ? 2 : 0, ...d }));
    for (const d of defs) if (!this.interaction.byId.has(d.id)) { this.interaction.defs.push(d); this.interaction.byId.set(d.id, d); }
    this.interaction.addLocation('walks', this.group);
  }

  get smokeOn() { return this.state.data.minutes < this.state.data.smoke.until; }

  handle(def) {
    if (def.ui === 'seq') { this.openSequence(def.seq); return true; }
    if (def.ui !== 'walk') return false;
    const W = this.W, st = this.state;
    const show = (e) => { this.hud.openReader(e.name, e.text); if (e.note) this.evidence.note(e.note); for (const [f, s] of e.sources ?? []) this.evidence.add(f, s); };
    switch (def.key) {
      case 'smokepot':
        st.addItem('smokepot');
        show(W.smokepot);
        break;
      case 'ventstack':
        if (st.hasItem('smokepot') && !this.smokeOn && !st.data.solved.includes('S17')) {
          st.data.items = st.data.items.filter((i) => i !== 'smokepot');
          this.spend(5);
          st.data.smoke = { until: st.data.minutes + this.data.S17.minutes, seen: [] };
          this.hud.openReader(W.ventstack.name, W.ventstack_light.text);
          this.hud.toast(W.ventstack_light.lit);
        } else show(W.ventstack);
        break;
      case 'splice': case 'cableend':
        show(W[def.key]);
        if (st.flag('wireNoticed')) { st.setFlag(`wire:${def.key}`); this.seq.checkS18?.(); }
        break;
      case 'wacocap':
        show(this.data.wacocap); // a red herring: Ox fuelled her this morning (it gives no evidence)
        break;
      default:
        show(W[def.key]);
    }
    st.save();
    return true;
  }

  /** A column of grey smoke rising from a point (a few dozen soft sprites). */
  _plume(at, size) {
    const N = 40;
    const pos = new Float32Array(N * 3).fill(-999);
    const age = new Float32Array(N).map(() => Math.random() * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a948a, size, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.5, depthWrite: false }));
    pts.frustumCulled = false;
    pts.visible = false;
    this.group.add(pts);
    return { pts, pos, age, at, N };
  }

  update(dt, player) {
    this._findAcc = (this._findAcc ?? 0) + dt;
    if (this._findAcc > 2) {
      this._findAcc = 0;
      for (const t of this.data.spots5 ?? []) {
        if (!t.find || t._found) continue;
        const o = this.scene.getObjectByName(t.find);
        if (!o) continue;
        const b = new THREE.Box3().setFromObject(o);
        this.group.getObjectByName(`WK_${t.seq}`)?.position.copy(b.getCenter(new THREE.Vector3()));
        t._found = true;
      }
    }
    const on = this.smokeOn;
    const sm = this.state.data.smoke;
    for (const [k, pl] of Object.entries(this.plumes)) {
      pl.pts.visible = on;
      if (!on) continue;
      for (let i = 0; i < pl.N; i++) {
        pl.age[i] += dt;
        if (pl.age[i] > 4) pl.age[i] = 0;
        const a = pl.age[i];
        pl.pos[i * 3] = pl.at.x + Math.sin(i * 1.7 + a) * 0.15 * a + a * 0.25;
        pl.pos[i * 3 + 1] = pl.at.y + a * (k === 'stack' ? 0.6 : 0.35);
        pl.pos[i * 3 + 2] = pl.at.z + Math.cos(i * 2.3 + a) * 0.15 * a;
      }
      pl.pts.geometry.attributes.position.needsUpdate = true;
      // being near a smoking spot is the investigation
      if (k !== 'stack' && !sm.seen.includes(k) && Math.hypot(player.x - pl.at.x, player.z - pl.at.z) < 3.5) {
        sm.seen.push(k);
        this.hud.openReader(this.W[`smoke_${k}`].name, this.W[`smoke_${k}`].text);
        this.evidence.note(`Smoke from the fuel farm vent came up at: ${this.W[`smoke_${k}`].name}.`);
        if (['hangar', 'storage', 'darkroom'].every((s) => sm.seen.includes(s))) this.seq.solve('S17');
        this.state.save();
      }
    }
  }

  /** S18's screen calls this when the rhythm is matched: now you notice the posts. */
  noticeWire() {
    this.state.setFlag('wireNoticed');
    this.posts.visible = true;
  }

  onS15() { this.hatch.visible = true; }
}
