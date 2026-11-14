import * as THREE from 'three';

const CENTER = new THREE.Vector2(0, 0);
const DEFAULT_COST = { inspect: 'inspect', read: 'read', pickup: 'pickup', toggle: 'search', ui: 'inspect' };
const DEFAULT_PROMPT = { inspect: 'Inspect', read: 'Read', pickup: 'Pick up' };

function visibleChain(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Data-driven interactables (bible 13.3). Each definition in interactables.json
 * either points at a named object the scene built ("object") or asks a builder
 * for a model ("model"). Looking at one outlines it and shows a prompt; E uses it.
 */
export class InteractionSystem {
  constructor(o) {
    Object.assign(this, o);
    this.byId = new Map(this.defs.map((d) => [d.id, d]));
    this.clueById = new Map(this.clues.map((c) => [c.id, c]));
    this.objects = new Map();
    this.toggles = new Map();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.range;
    this.current = null;
    this.roots = [];
    this.addLocation(this.location, this.root);
  }

  /** Register a location (the hangar at start, each streamed building when its model loads). */
  addLocation(location, root) {
    if (!this.roots.includes(root)) this.roots.push(root);
    this._build(location, root);
  }

  _parentFor(ref, root) {
    if (!ref) return root;
    const [id, part] = ref.split('.');
    const obj = this.objects.get(id);
    if (!obj) throw new Error(`Interactable parent "${ref}" not found (define the parent first)`);
    return part ? obj.userData.parts[part] : obj;
  }

  _build(location, root) {
    for (const def of this.defs) {
      if (def.location !== location || this.objects.has(def.id)) continue;
      let obj;
      if (def.object) {
        // named objects come from the scene code or, usually, from the Blender models
        obj = this.named?.[def.object] ?? root.getObjectByName(def.object);
        if (!obj) { console.warn(`No scene object named "${def.object}"`); continue; }
      } else {
        const build = this.builders[def.model];
        if (!build) { console.warn(`No model builder "${def.model}"`); continue; }
        obj = build();
        obj.position.fromArray(def.position || [0, 0, 0]);
        obj.rotation.y = def.rotationY || 0;
        obj.traverse((c) => { if (c.isMesh && !c.userData.hitProxy) { c.castShadow = true; c.receiveShadow = true; } });
        this._parentFor(def.parent, root).add(obj);
        if (def.solid) this.world.addObject(obj);
      }
      obj.userData.interactableId = def.id;
      this.objects.set(def.id, obj);

      if (def.type === 'toggle') {
        // the moving part: a named child (lid, drawer, locker door) or, for doors, the object itself
        const part = def.part ? (obj.userData.parts?.[def.part] ?? obj.getObjectByName(def.part)) : obj;
        if (!part) { console.warn(`"${def.id}" has no part "${def.part}"`); continue; }
        const t = this.state.isOpen(def.id) ? 1 : 0;
        this.toggles.set(def.id, { def, part, basePos: part.position.clone(), baseRot: part.rotation.clone(), t });
      }
    }
    for (const tg of this.toggles.values()) { this._applyToggle(tg); this._syncCollider(tg.def); }
    this.refreshVisibility();
  }

  /** Doors: their collision box is solid while closed and switched off while open. */
  _syncCollider() {
    // A collision box is solid unless any door that lists it ("collider": name or [names]) is open.
    const open = new Map();
    for (const d of this.defs) {
      if (!d.collider) continue;
      for (const name of [].concat(d.collider)) open.set(name, (open.get(name) ?? false) || this.state.isOpen(d.id));
    }
    for (const [name, isOpen] of open) this.world.setEnabled(name, !isOpen);
  }

  /** The door (toggle definition) that owns a collision box, if any. */
  doorForCollider(name) {
    return this.defs.find((d) => d.type === 'toggle' && d.collider && [].concat(d.collider).includes(name) && this.toggles.has(d.id)) ?? null;
  }

  /** Someone other than the player (Danny) opens or closes a door. */
  npcSetDoor(id, open, loudness = 1) {
    if (this.state.isOpen(id) === open) return;
    this.state.setOpen(id, open);
    this._syncCollider();
    this.audio?.creak(open ? loudness : loudness * 0.6);
    this.state.save();
  }

  /** True while a door that opens onto the storm (wind, dust) stands open. */
  stormExposed() {
    for (const def of this.defs) if (def.exposesStorm && this.state.isOpen(def.id)) return true;
    return false;
  }

  _applyToggle({ def, part, basePos, baseRot, t }) {
    const { kind, axis, to, offset } = def.motion;
    const k = ease(t);
    if (kind === 'rotate') part.rotation[axis] = baseRot[axis] + to * k;
    else if (kind === 'move') part.position.set(basePos.x + offset[0] * k, basePos.y + offset[1] * k, basePos.z + offset[2] * k);
    else part.position[axis] = basePos[axis] + to * k;
  }

  refreshVisibility() {
    for (const [id, obj] of this.objects) {
      const def = this.byId.get(id);
      const gone = (def.type === 'pickup' && this.state.hasItem(def.item)) || (def.takes && this.state.flag(`taken:${id}`));
      obj.visible = !gone;
    }
  }

  _available(def) {
    return this.state.check(def.requires) && visibleChain(this.objects.get(def.id));
  }

  _locked(def) {
    if (this.unlockAll) return false; // game.json "unlockAll": explore everything, locks ignored for now
    return def.lock && !this.state.flag(`unlocked:${def.id}`);
  }

  _cost(def) {
    if (def.timeCost != null) return def.timeCost;
    return this.costs[def.costType || DEFAULT_COST[def.type]] ?? 0;
  }

  /** What pressing E would do right now: { verb, cost }. */
  _promptFor(def) {
    if (def.type === 'toggle') {
      if (this.state.isOpen(def.id)) return { verb: def.prompts.open, cost: 0 };
      if (this._locked(def)) {
        return this.state.hasItem(def.lock.item) ? { verb: def.lock.prompt, cost: this._cost(def) } : { verb: def.prompts.closed, cost: 0 };
      }
      return { verb: def.prompts.closed, cost: this._cost(def) };
    }
    return { verb: def.prompt || DEFAULT_PROMPT[def.type], cost: this._cost(def) };
  }

  update(dt, aiming) {
    for (const tg of this.toggles.values()) {
      const goal = this.state.isOpen(tg.def.id) ? 1 : 0;
      if (tg.t !== goal) {
        const dur = tg.def.duration ?? 0.5;
        tg.t = goal > tg.t ? Math.min(goal, tg.t + dt / dur) : Math.max(goal, tg.t - dt / dur);
        this._applyToggle(tg);
      }
    }

    let target = null;
    if (aiming) {
      this.raycaster.setFromCamera(CENTER, this.camera);
      // only the interactive areas (hangar + loaded buildings), never the 100k-triangle terrain
      const hits = this.raycaster.intersectObjects(this.roots, true);
      let first = null;
      for (const h of hits) {
        const o = h.object;
        if (!o.isMesh || o.userData.noRay) continue;
        if (!o.userData.hitProxy && o.material?.visible === false) continue;
        if (!visibleChain(o)) continue;
        const a = this._ownerOf(o);
        // An invisible aiming box of something not usable yet (the note in a closed toolbox)
        // must not block the ray: look past it.
        if (o.userData.hitProxy && a && !this._available(this.byId.get(a.userData.interactableId))) continue;
        if (!first) {
          // The first solid thing in view decides...
          first = { dist: h.distance, owner: a };
          if (a) {
            const def = this.byId.get(a.userData.interactableId);
            if (this._available(def)) target = def;
          }
          if (!a) break;
          continue;
        }
        // ...unless it's a container rim with something usable just behind it
        // (a note inside an open toolbox): then the thing inside wins.
        if (h.distance - first.dist > 0.3) break;
        if (a && a !== first.owner && this._isInside(a, first.owner)) {
          const def = this.byId.get(a.userData.interactableId);
          if (this._available(def)) { target = def; break; }
        }
      }
    }

    if (target !== this.current) {
      this.current = target;
      this.outline.selectedObjects = target ? [this.objects.get(target.id)] : [];
    }
    if (target) {
      const p = this._promptFor(target);
      this.hud.setPrompt(p.verb, p.cost);
    } else {
      this.hud.setPrompt(null);
    }
  }

  _ownerOf(o) {
    while (o && o.userData.interactableId === undefined) o = o.parent;
    return o || null;
  }

  _isInside(child, container) {
    for (let p = child.parent; p; p = p.parent) if (p === container) return true;
    return false;
  }

  _spend(def) {
    const spent = this.state.advance(this._cost(def));
    if (spent > 0) this.hud.timePassed(spent, this.state.clockLabel());
  }

  _grant(def) {
    let added = false;
    for (const id of def.grants || []) if (this.state.addClue(id)) added = true;
    if (added) this.hud.toast('New entry in your notebook');
    return added;
  }

  _firstClue(def) {
    return def.grants?.length ? this.clueById.get(def.grants[0]) : null;
  }

  use() {
    const def = this.current;
    if (!def) return;
    const st = this.state;

    if (def.type === 'ui') {
      // opens a screen (board, reports, talk...) handled by main.js
      this._spend(def);
      this.onUI?.(def);
    } else if (def.type === 'inspect') {
      this._spend(def);
      this._grant(def);
      this.hud.caption((def.text ?? this._firstClue(def)?.text ?? '').replace('{time}', st.clockLabel()));
    } else if (def.type === 'read') {
      this._spend(def);
      this._grant(def);
      const clue = this._firstClue(def);
      this.hud.openReader(def.title ?? clue?.name ?? '', def.text ?? clue?.text ?? '');
      if (def.takes) { st.setFlag(`taken:${def.id}`); this.refreshVisibility(); }
      this.audio?.paper();
    } else if (def.type === 'pickup') {
      this._spend(def);
      st.addItem(def.item);
      this._grant(def);
      this.refreshVisibility();
      this.hud.caption(def.text ?? this._firstClue(def)?.text ?? '');
      this.audio?.pickup();
    } else if (def.type === 'toggle') {
      const open = st.isOpen(def.id);
      if (!open && this._locked(def)) {
        if (!st.hasItem(def.lock.item)) {
          this.hud.caption(def.lock.lockedText);
          this.audio?.rattle();
          return; // trying a locked drawer costs nothing
        }
        st.setFlag(`unlocked:${def.id}`);
        this._spend(def);
        st.setOpen(def.id, true);
        this._grant(def);
        this.hud.caption(def.lock.unlockText);
        this.audio?.creak();
      } else if (open) {
        st.setOpen(def.id, false);
        this.audio?.creak(0.6);
      } else {
        this._spend(def);
        st.setOpen(def.id, true);
        const isNew = this._grant(def);
        const text = def.openText ?? (isNew ? this._firstClue(def)?.text : null);
        if (text) this.hud.caption(text);
        this.audio?.creak();
      }
    }

    for (const f of def.setsFlags || []) st.setFlag(f);
    this._syncCollider(def);
    st.save();
    this.current = null; // re-evaluate the prompt next frame
  }
}
