import * as THREE from 'three';
import { Character } from '../world/character.js';
import { parseTime } from '../engine/state.js';
import { pagedChoices } from '../ui/dialogue.js';

/**
 * Stage E (addendum F): the suspects and Hobbs as people in the world.
 *  - Each stays in their own room all day (src/data/npcs.json: the suspects in their bedrooms in
 *    the Quarters, Hobbs in the radio shack), so you can talk to anyone alone. They idle with their
 *    own fidgets and turn to face you when you come close. (The schedule can still move people;
 *    if it does, they change place only when you can't see them.)
 *  - E to talk: topics (some unlock as you find things, some need trust), show them evidence,
 *    or watch them for a tell. Testimony adds sources to findings.
 *  - Trust (0-100, starts at 50): kind questions raise it, pressing lowers it; low trust locks topics.
 */
export class Trust {
  constructor(state) { this.state = state; this.state.data.trust ??= {}; }
  get(id) { return this.state.data.trust[id] ?? 50; }
  change(id, d) {
    const v = Math.max(0, Math.min(100, this.get(id) + d));
    this.state.data.trust[id] = v;
    this.state.save();
    return v;
  }
}

export class People {
  constructor(o) {
    Object.assign(this, o); // scene, ground, state, evidence, hud, cast, data, characters, dialogue, interaction, camera, trust, spend, onFreezeChange
    this.names = new Map(this.characters.map((c) => [c.id, c.name]));
    this.group = new THREE.Group();
    this.group.name = 'People';
    this.scene.add(this.group);
    this.npc = {};
    this.talking = null;
    this._acc = 10;
    // one warm lamp for the bedroom of whoever you're near (the rooms have no light of their own)
    const L = this.data.roomLamp ?? {};
    this.lamp = new THREE.PointLight(L.color ?? '#ffc27a', 0, L.distance ?? 7, 2);
    this.lamp.castShadow = false;
    this.lamp.visible = true; // stays in the scene at 0 when unused: changing the light count would recompile shaders
    this.scene.add(this.lamp);
  }

  async load() {
    const ids = Object.keys(this.data.people);
    await Promise.all(ids.map(async (id) => {
      const c = await Character.load(id, this.cast[id]);
      const g = new THREE.Group();
      g.name = `NPC_${id}`;
      g.add(c.root);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.9;
      hit.userData.hitProxy = true;
      g.add(hit);
      g.visible = false;
      this.group.add(g);
      this.npc[id] = { id, person: c, root: g, at: null, fidget: 4 + Math.random() * 8, yaw: 0 };
      const def = { id: `npc_${id}`, type: 'ui', ui: 'npc', npc: id, location: 'people', object: `NPC_${id}`, prompt: `Talk to ${this.names.get(id)?.split(' ')[0] === 'Capt.' ? 'Billie' : (this.names.get(id) ?? id).split(' ')[0]}`, timeCost: 0 };
      if (id === 'billie') def.prompt = 'Talk to Billie';
      if (id === 'lindqvist') def.prompt = 'Talk to Dr. Lindqvist';
      if (id === 'ox') def.prompt = 'Talk to Ox';
      if (!this.interaction.byId.has(def.id)) { this.interaction.defs.push(def); this.interaction.byId.set(def.id, def); }
    }));
    this.interaction.addLocation('people', this.group);
    this._place(true);
  }

  /** Where is everyone supposed to be right now? */
  _slot() {
    const m = this.state.data.minutes;
    return this.data.schedule.find((s) => m >= parseTime(s.from) && m < parseTime(s.to)) ?? this.data.schedule[this.data.schedule.length - 1];
  }

  _seen(pos) {
    const v = pos.clone().add(new THREE.Vector3(0, 1.2, 0)).project(this.camera);
    return v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && pos.distanceTo(this.camera.position) < 40;
  }

  _place(force = false) {
    const slot = this._slot();
    const used = {};
    for (const [id, n] of Object.entries(this.npc)) {
      const loc = slot.at[id] ?? 'gone';
      if (n.at === loc && !force) continue;
      const spots = this.data.spots[loc] ?? [];
      // never vanish or appear in front of you: wait until you look away
      if (!force && n.present && n.root.visible && this._seen(n.root.position)) continue;
      const k = (used[loc] = (used[loc] ?? -1) + 1);
      const s = spots[k % Math.max(1, spots.length)];
      n.at = loc;
      if (!s) { n.present = false; n.root.visible = false; continue; }
      if (!force && this._seen(new THREE.Vector3(s[0], 0, s[1]))) { n.at = null; continue; }
      n.present = true;
      n.root.visible = true;
      n.root.position.set(s[0], this.ground.heightAt(s[0], s[1]), s[1]);
      n.yaw = s[2];
      n.root.rotation.y = s[2];
      n.person.play(this.data.people[id].idle?.[0] ?? 'Idle', 0.01);
    }
  }

  update(dt, player) {
    this._acc += dt;
    if (this._acc > 2) { this._acc = 0; this._place(); }
    this._lamp(dt, player);
    for (const n of Object.values(this.npc)) {
      if (!n.present) continue;
      const d = Math.hypot(player.x - n.root.position.x, player.z - n.root.position.z);
      n.root.visible = d < 70; // people far away aren't drawn at all (skinned figures are expensive)
      if (d > 60) continue;
      // turn to face you when you're near (or talking); back to their own way otherwise
      const want = d < 4 || this.talking === n.id ? Math.atan2(player.x - n.root.position.x, player.z - n.root.position.z) : n.yaw;
      let a = want - n.root.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      n.root.rotation.y += a * Math.min(1, dt * 2.5);
      // fidgets: each person has their own
      n.fidget -= dt;
      if (this.talking === n.id) n.person.play('Talk', 0.4);
      else if (n.fidget <= 0) {
        const idle = this.data.people[n.id].idle ?? ['Idle'];
        n.person.play(idle[Math.floor(Math.random() * idle.length)], 0.6);
        n.fidget = 6 + Math.random() * 10;
      } else if (n.person.current === n.person.actions.Talk) n.person.play(this.data.people[n.id].idle?.[0] ?? 'Idle', 0.6);
      n.person.update(dt);
    }
  }

  /** Light the room of the person nearest you, if they're in a bedroom and you're close. */
  _lamp(dt, player) {
    const L = this.data.roomLamp ?? {};
    let best = null, bd = L.near ?? 6.5;
    for (const n of Object.values(this.npc)) {
      if (!n.present || !n.at?.startsWith('room_')) continue;
      const d = Math.hypot(player.x - n.root.position.x, player.z - n.root.position.z);
      if (d < bd) { bd = d; best = n; }
    }
    const want = best ? (L.intensity ?? 9) : 0;
    if (best) {
      const p = best.root.position;
      const fx = Math.sin(best.yaw), fz = Math.cos(best.yaw); // towards the door
      this.lamp.position.set(p.x + fx * 0.9, 2.1, p.z + fz * 0.9);
    }
    this.lamp.intensity += (want - this.lamp.intensity) * Math.min(1, dt * 3);
  }

  // ------------------------------------------------------------------ conversation
  _label(id) { return `${this.names.get(id) ?? id} · ${this.data.ui.trust} ${this.trust.get(id)}`; }

  _say(id, text, choices) {
    this.talking = id;
    this.dialogue.show(this._label(id), text, choices);
    this.onFreezeChange?.();
  }

  _unlocked(t) {
    for (const r of t.requires ?? []) {
      if (r.startsWith('flag:') && !this.state.flag(r.slice(5))) return false;
      if (r.startsWith('solved:') && !this.state.data.solved.includes(r.slice(7))) return false;
      if (/^F\d+$/.test(r) && !this.evidence.sources(r).length) return false;
    }
    return true;
  }

  talk(id) {
    const p = this.data.people[id];
    const first = !this.state.flag(`met:${id}`);
    this.state.setFlag(`met:${id}`);
    this.menu(id, p.greeting[first ? 0 : 1] ?? p.greeting[0]);
  }

  menu(id, line) {
    const U = this.data.ui;
    this._say(id, line, [
      { label: U.topics, onPick: () => this.topics(id) },
      { label: U.present, onPick: () => this.present(id) },
      { label: U.observe, onPick: () => this.observe(id) },
      { label: U.bye, onPick: () => { this.talking = null; this.dialogue.close(); } },
    ]);
  }

  topics(id) {
    const p = this.data.people[id];
    const U = this.data.ui;
    const heard = (this.state.data.heard ??= {});
    const list = p.topics.filter((t) => this._unlocked(t));
    const choices = [];
    for (const t of list) {
      const locked = t.minTrust && this.trust.get(id) < t.minTrust;
      const done = heard[`${id}.${t.id}`];
      choices.push({
        label: `${t.label}${done ? ' ✓' : ''}`,
        onPick: () => {
          if (locked) {
            this.trust.change(id, -1);
            return this._say(id, "I'd rather not talk about that. Not with you. Not yet.", [{ label: U.back, onPick: () => this.topics(id) }]);
          }
          this.spend(3);
          if (!done) {
            heard[`${id}.${t.id}`] = true;
            if (t.trust) this.trust.change(id, t.trust);
            for (const [fid, src] of t.gives ?? []) this.evidence.add(fid, src);
            if (t.flag) this.state.setFlag(t.flag);
            this.state.save();
          }
          const next = [{ label: U.back, onPick: () => this.topics(id) }];
          if (t.press && !heard[`${id}.${t.id}.press`]) {
            next.unshift({ label: `${t.press.label} ${U.press}`, onPick: () => {
              heard[`${id}.${t.id}.press`] = true;
              this.trust.change(id, t.press.trust ?? -5);
              for (const [fid, src] of t.press.gives ?? []) this.evidence.add(fid, src);
              this._say(id, t.press.text, [{ label: U.back, onPick: () => this.topics(id) }]);
            } });
          }
          this._say(id, t.text, next);
        },
      });
    }
    choices.push({ label: U.back, onPick: () => this.menu(id, 'Anything else, Inspector?') });
    this._say(id, 'What do you want to know?', choices);
  }

  present(id) {
    const p = this.data.people[id];
    const U = this.data.ui;
    const known = this.evidence.known();
    if (!known.length) return this._say(id, U.nothingToPresent, [{ label: U.back, onPick: () => this.menu(id, 'Anything else?') }]);
    const shown = (this.state.data.shown ??= {});
    const toChoice = (f) => ({
      label: f.name,
      onPick: () => {
        this.spend(3);
        const r = p.present?.[f.id];
        if (!r) return this._say(id, p.presentDefault, [{ label: U.back, onPick: () => this.present(id) }]);
        if (!shown[`${id}.${f.id}`]) {
          shown[`${id}.${f.id}`] = true;
          if (r.trust) this.trust.change(id, r.trust);
          for (const [fid, src] of r.gives ?? []) this.evidence.add(fid, src);
          this.state.save();
        }
        this._say(id, r.text, [{ label: U.back, onPick: () => this.menu(id, 'Anything else?') }]);
      },
    });
    const extra = [{ label: U.back, onPick: () => this.menu(id, 'Anything else?') }];
    const show = (pg) => this.dialogue.show(this._label(id), U.presentIntro, pagedChoices(known, toChoice, show, extra, pg));
    const choices = pagedChoices(known, toChoice, show, extra, 0);
    this._say(id, U.presentIntro, choices);
  }

  observe(id) {
    const p = this.data.people[id];
    this.spend(2);
    this.evidence.note(`${this.names.get(id)}: ${p.observe}`);
    this.talking = id;
    this.dialogue.show(this._label(id), p.observe, [{ label: this.data.ui.back, onPick: () => this.menu(id, 'Inspector?') }]);
  }
}
