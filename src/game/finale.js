import * as THREE from 'three';
import { Character } from '../world/character.js';
import { Voice } from '../engine/voice.js';
import { parseTime } from '../engine/state.js';
import { pagedChoices } from '../ui/dialogue.js';

/**
 * Stage G / v4 Tier 6: the finale (first bible section 11).
 *  - The trapdoor under the rug (opened by S6) leads down to the Undercroft. The first time, Ox
 *    stands at the bottom with a wrench: persuade him (trust, or what you learned from the ration
 *    ledger), and Clementine's voice says "Let him through, Ox."
 *  - The Undercroft is a separate model deep below the desert (public/models/undercroft.glb);
 *    going down fades out and puts you there. Its walls only block you while you're down there.
 *  - Clementine sits on her bed. Present six pieces of evidence (four must be right), hear her
 *    confession, then choose: the law, the silence, or the daylight.
 *  - Endings E1-E5 (E5: 17:30 passes without an ending). Words: src/data/finale.json.
 */
const UC = new THREE.Vector3(-140, -30, -100); // where the Undercroft sits (local origin = the shaft)

export class Finale {
  constructor(o) {
    Object.assign(this, o); // scene, world, controller, streamer, interaction, state, evidence, hud, audio, dialogue, cast, data, crime, spend, trust, fade, onFreezeChange, characters
    this.names = new Map(this.characters.map((c) => [c.id, c.name]));
    this.ui = this._endingDom();
    // interactables down below (built when the Undercroft model streams in, location 'undercroft')
    const defs = [
      ...Object.keys(this.data.examine).map((k) => ({ id: `uc_${k}`, type: 'ui', ui: 'uc', key: k, location: 'undercroft', object: k, prompt: `Look at: ${this.data.examine[k].name}`, timeCost: 2 })),
      { id: 'uc_diary', type: 'ui', ui: 'ucdiary', location: 'undercroft', object: 'UC_Diary', prompt: 'Read the diary', timeCost: 5 },
      { id: 'uc_ladder', type: 'ui', ui: 'ucup', location: 'undercroft', object: 'UC_Ladder', prompt: this.data.climbPrompt, timeCost: 0 },
      { id: 'uc_clem', type: 'ui', ui: 'clementine', location: 'clem', object: 'UC_Clem', prompt: this.data.clementine.prompt, timeCost: 0 },
    ];
    for (const d of defs) if (!this.interaction.byId.has(d.id)) { this.interaction.defs.push(d); this.interaction.byId.set(d.id, d); }
    // the trapdoor itself, in the office (appears with S6)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.hitProxy = true;
    hit.name = 'CS_trap_hit';
    hit.position.set(16.85, 0.15, -9.0);
    this.crime.group.add(hit);
    const trap = { id: 'cs_trapdoor', type: 'ui', ui: 'trapdown', location: 'office', object: 'CS_trap_hit', prompt: this.data.trapPrompt, timeCost: 0, requires: ['flag:trapOpen'] };
    if (!this.interaction.byId.has(trap.id)) { this.interaction.defs.push(trap); this.interaction.byId.set(trap.id, trap); }
    this.interaction.addLocation('office', this.crime.group);
    if (this.state.data.solved.includes('S6')) this.state.setFlag('trapOpen');
  }

  get underground() { return !!this.state.data.underground; }
  get groundY() { return UC.y; }

  /** E on something that belongs to the finale. Returns true if handled. */
  handle(def) {
    switch (def.ui) {
      case 'trapdown': this.descend(); return true;
      case 'ucup': this.ascend(); return true;
      case 'uc': {
        const e = this.data.examine[def.key];
        this.hud.openReader(e.name, e.text);
        if (e.flag) this.state.setFlag(e.flag);
        for (const [f, s] of e.sources ?? []) this.evidence.add(f, s);
        this.state.save();
        return true;
      }
      case 'ucdiary': this.openDiary(); return true;
      case 'clementine': this.confront(); return true;
      default: return false;
    }
  }

  // ------------------------------------------------------------------ down and up
  descend() {
    if (this.state.flag('oxPassed')) return this._go(true);
    const S = this.data.standoff;
    const say = (who, text, choices) => this.dialogue.show(who, text, choices);
    const opts = S.options.filter((o) => !o.requires || this._req(o.requires)).map((o) => ({
      label: o.label,
      onPick: () => {
        if (o.back) return this.dialogue.close();
        this.spend(2);
        if (o.trustCost) this.trust.change('ox', -o.trustCost);
        const pass = o.id === 'ledger' || (o.trust && this.trust.get('ox') >= o.trust);
        if (!pass) return say('Ox', o.no, [{ label: 'Try something else', onPick: () => this.descend() }, { label: 'Back away', onPick: () => this.dialogue.close() }]);
        say('Ox', o.ok, [{ label: '...', onPick: () => {
          Voice.speak(S.voice, this.cast.clementine?.voice);
          say(S.voiceWho, `"${S.voice}"`, [{ label: 'Climb down', onPick: () => { this.state.setFlag('oxPassed'); this.dialogue.close(); this._go(true); } }]);
        } }]);
      },
    }));
    this.hud.openReader('The trapdoor', S.intro);
    setTimeout(() => { this.hud.closeReader?.(); say('Ox', S.ox, opts); this.onFreezeChange?.(); }, 50);
  }

  ascend() { this._go(false); }

  _go(down) {
    this.fade.classList.add('on');
    this.onFreezeChange?.(true);
    setTimeout(async () => {
      this.state.data.underground = down;
      if (down) {
        this.controller.setPosition(UC.x, UC.z - 0.6, -Math.PI / 2); // at the foot of the ladder, facing the culvert
        await this._people();
      } else {
        this.controller.setPosition(17.9, -8.4, Math.PI / 2);
      }
      this._colliders();
      this.state.save();
      this.fade.classList.remove('on');
      this.onFreezeChange?.(false);
    }, 900);
  }

  /** The Undercroft's walls exist only while you're in it (collision here is flat, from above). */
  _colliders() {
    for (const b of this.world.boxes) if (b.name?.startsWith('COL_UC')) this.world.setEnabled(b.name, this.underground);
  }

  async _people() {
    if (this.clem) return;
    const [c, ox] = await Promise.all([Character.load('clementine', this.cast.clementine), Character.load('ox', this.cast.ox)]);
    const g = new THREE.Group();
    g.name = 'UC_Clem';
    c.root.position.set(UC.x + 26.9, UC.y + 0.12, UC.z - 1.75);
    c.play('Sit', 0.01);
    g.add(c.root);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.hitProxy = true;
    hit.position.set(UC.x + 26.9, UC.y + 0.7, UC.z - 1.6);
    g.add(hit);
    this.scene.add(g);
    this.interaction.addLocation('clem', g);
    ox.root.position.set(UC.x + 10.4, UC.y, UC.z + 0.6);
    ox.root.rotation.y = -Math.PI / 2;
    ox.play('Idle', 0.01);
    this.scene.add(ox.root);
    this.clem = c;
    this.ox = ox;
  }

  _req(r) {
    const [k, v] = r.split(':');
    if (k === 'solved') return this.state.data.solved.includes(v);
    if (k === 'flag') return this.state.flag(v);
    return this.evidence.sources(r).length > 0;
  }

  // ------------------------------------------------------------------ the diary
  openDiary() {
    const D = this.data.diary;
    this.state.setFlag(D.flag);
    this.state.save();
    let i = 0;
    const page = () => this.dialogue.show(`${D.title} (${i + 1} of ${D.entries.length})`, D.entries[i], [
      ...(i < D.entries.length - 1 ? [{ label: 'Turn the page', onPick: () => { i++; page(); } }] : []),
      ...(i > 0 ? [{ label: 'Back a page', onPick: () => { i--; page(); } }] : []),
      { label: 'Close the diary', onPick: () => this.dialogue.close() },
    ]);
    page();
    this.onFreezeChange?.();
  }

  // ------------------------------------------------------------------ the confrontation
  confront() {
    if (this.state.data.ending) return;
    const C = this.data.clementine;
    const name = C.name;
    const speak = (t) => Voice.speak(t.replace(/"/g, ''), this.cast.clementine?.voice);
    const say = (t, choices) => { this.dialogue.show(name, t, choices); speak(t); this.onFreezeChange?.(); };
    const known = () => this.evidence.known();
    let right = 0;
    const prompt = (k) => {
      if (k >= C.prompts.length) return right >= C.needed ? confess(0) : say(C.notEnough, [{ label: 'Leave her for now', onPick: () => this.dialogue.close() }]);
      const p = C.prompts[k];
      const toChoice = (f) => ({
        label: f.name,
        onPick: () => {
          this.spend(2);
          const ok = p.accept.includes(f.id);
          if (ok) right++;
          if (this.clem) this.clem.headYaw = ok ? 0 : -0.7;
          say(ok ? p.right : C.wrong, [{ label: 'Go on.', onPick: () => { if (this.clem) this.clem.headYaw = 0; prompt(k + 1); } }]);
        },
      });
      const extra = [{ label: C.noIdea, onPick: () => say(C.wrong, [{ label: 'Go on.', onPick: () => prompt(k + 1) }]) }];
      const show = (pg) => this.dialogue.show(name, p.q, pagedChoices(known(), toChoice, show, extra, pg));
      say(p.q, pagedChoices(known(), toChoice, show, extra, 0));
    };
    const confess = (k) => {
      if (k < C.confession.length) return say(C.confession[k], [{ label: 'Go on.', onPick: () => confess(k + 1) }]);
      this.state.setFlag('confessed');
      this.state.save();
      this.dialogue.show('', C.papers, [{ label: '...', onPick: () => choose() }]);
    };
    const choose = () => say(C.choiceIntro, C.choices.map((ch) => ({
      label: ch.label,
      onPick: () => {
        this.dialogue.close();
        let id = ch.id;
        if (id === 'E3' && !this.data.daylightNeeds.every((r) => this._req(r))) id = 'E1short';
        this.ending(id);
      },
    })));
    say(C.open, C.openChoices.map((label) => ({ label, onPick: () => say(C.reply, [{ label: 'Go on.', onPick: () => prompt(0) }]) })));
  }

  // ------------------------------------------------------------------ the endings
  _endingDom() {
    const el = document.createElement('div');
    el.className = 'ending hidden';
    el.innerHTML = '<div class="ending-card"><h1></h1><div class="ending-lines"></div><p class="ending-score"></p><div class="ending-btns"></div></div>';
    document.body.appendChild(el);
    return el;
  }

  ending(id) {
    if (this.state.data.ending && id === 'E5') return;
    const E = this.data.endings;
    const e = E[id];
    this.state.data.ending = id;
    this.state.save();
    this.onEnding?.(id);
    const el = this.ui;
    el.querySelector('h1').textContent = e.title;
    const box = el.querySelector('.ending-lines');
    box.replaceChildren();
    el.querySelector('.ending-score').textContent = '';
    el.querySelector('.ending-btns').replaceChildren();
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('on'));
    let i = 0;
    const next = () => {
      if (i >= e.lines.length) return this._endingScore();
      const p = document.createElement('p');
      p.textContent = e.lines[i];
      box.appendChild(p);
      requestAnimationFrame(() => p.classList.add('on'));
      Voice.speak(e.lines[i], this.cast.hart?.voice);
      i++;
      this._endT = setTimeout(next, Math.max(4500, e.lines[i - 1].length * 70));
    };
    el.onclick = () => { clearTimeout(this._endT); next(); };
    next();
  }

  _endingScore() {
    const E = this.data.endings;
    const f = this.evidence.findings.filter((x) => this.evidence.isEstablished(x.id)).length;
    const s = this.state.data.solved.filter((x) => /^S\d+$/.test(x)).length;
    this.ui.querySelector('.ending-score').textContent = E.score.replace('{f}', f).replace('{s}', s).replace('{d}', this.state.flag('diaryRead') ? 'read' : 'never found');
    const btns = this.ui.querySelector('.ending-btns');
    const again = document.createElement('button');
    again.textContent = E.again;
    again.onclick = (ev) => { ev.stopPropagation(); this.state.erase(); this.state.save = () => {}; location.reload(); };
    const keep = document.createElement('button');
    keep.textContent = E.keep;
    keep.onclick = (ev) => { ev.stopPropagation(); this.ui.classList.remove('on'); this.ui.classList.add('hidden'); Voice.stop(); };
    btns.append(again, keep);
    this.ui.onclick = null;
  }

  update() {
    // the Undercroft's walls follow you down and up (and appear once the model has streamed in)
    const n = this.world.boxes.length;
    if (n !== this._nBoxes) { this._nBoxes = n; this._colliders(); }
    if (!this.state.data.ending && this.state.data.minutes >= parseTime(this.data.coldCase)) this.ending('E5');
  }
}
