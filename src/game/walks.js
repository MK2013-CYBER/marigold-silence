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
  smokepot: V(-57.4, 0.6, 24.6),
  ventstack: V(79.5, 0, 36.2),
  radio: V(40.2, 1.0, 112.4),
  splice: V(-53.2, 0, 19.2),
  cableend: V(-21.0, 0, 4.0),
  rack: V(-81.5, 1.0, -33.1),
  ledger: V(-56.4, 1.0, 34.2),
  crates: V(-59.4, 0.6, 37.6),
  hatch: V(-59.6, 0.02, 38.3),
  smoke: { hangar: V(18.6, 0.05, -7.4), storage: V(-58.0, 0.05, 37.2), darkroom: V(55.8, 0.05, -21.5) },
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
    spot('WK_smokepot', P.smokepot, [0.8, 0.8, 0.6]);
    spot('WK_ventstack_hit', at(P.ventstack, 0.7), [0.6, 1.4, 0.6]);
    spot('WK_radio', P.radio, [1.4, 0.9, 0.8]);
    spot('WK_rack', P.rack, [0.8, 0.8, 0.4]);
    spot('WK_ledger', P.ledger, [0.6, 0.5, 0.5]);
    spot('WK_crates', P.crates, [1.4, 1.2, 1.2]);
    spot('WK_post_hit', at(ROUTE[1], 0.4), [0.5, 0.9, 0.5]);
    // smoke plumes
    this.plumes = {};
    for (const [k, p] of Object.entries({ ...P.smoke, stack: at(P.ventstack, 1.3) })) this.plumes[k] = this._plume(p, k === 'stack' ? 0.9 : 0.5);
    this._register();
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
