/**
 * The Investigation Board (bible section 9, addendum section C): a cork wall with cards
 * for suspects, places you have visited and EVIDENCE YOU HAVE EARNED (addendum section G:
 * clues only come from solved puzzles). Drag cards, Shift+click two cards to tie a string
 * between them (again to untie it), and add typed notes. Everything is saved in the game state.
 */
export class InvestigationBoard {
  constructor({ state, clues, characters, places, puzzles }) {
    this.state = state;
    this.clueById = new Map(clues.map((c) => [c.id, c]));
    this.characters = characters;
    this.places = places;
    this.puzzleById = new Map(puzzles.map((p) => [p.id, p]));

    this.el = document.createElement('div');
    this.el.className = 'board hidden';
    this.el.innerHTML = `
      <div class="board-bar">
        <span class="board-title">Investigation Board</span>
        <span class="board-help">Drag cards &middot; <b>Shift + click</b> two cards to tie or untie a string &middot; notes save as you type</span>
        <button class="board-btn" data-act="note">+ Note</button>
        <button class="board-btn" data-act="close">Close (Esc)</button>
      </div>
      <div class="board-cork"><svg class="board-strings"></svg><div class="board-empty"></div></div>`;
    document.body.appendChild(this.el);
    this.cork = this.el.querySelector('.board-cork');
    this.svg = this.el.querySelector('.board-strings');
    this.empty = this.el.querySelector('.board-empty');
    this.el.querySelector('[data-act="note"]').addEventListener('click', () => this.addNote());
    this.el.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    this.open = false;
    this.onClose = null;
    this._pending = null;
  }

  get board() { return this.state.data.board; }

  /** Every card the player is allowed to see right now. */
  cards() {
    const out = [];
    for (const c of this.characters) {
      if (c.card === 'suspect' || c.card === 'witness' || c.card === 'victim') {
        out.push({ id: `p:${c.id}`, kind: c.card, title: c.name, sub: c.role, body: c.blurb });
      }
    }
    for (const pl of this.places) {
      if (this.state.data.visited.includes(pl.id)) out.push({ id: `l:${pl.id}`, kind: 'place', title: pl.label, sub: 'Place', body: pl.mapNote });
    }
    for (const { id } of this.state.data.clues) {
      const c = this.clueById.get(id);
      if (!c) continue;
      const pz = this.puzzleById.get(c.puzzle);
      out.push({ id: `e:${id}`, kind: 'evidence', title: c.name, sub: `${c.kind}${pz ? ` · ${pz.name}` : ''}`, body: c.text });
    }
    return out;
  }

  show() {
    this.el.classList.remove('hidden');
    this.open = true;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.open = false;
    this.state.save();
    this.onClose?.();
  }

  _defaultPos(card, i, counts) {
    // First time a card appears, place it in its own area: people on the left, places next,
    // evidence filling the rest. Column width follows the real board size, so cards don't pile up.
    const r = this.cork.getBoundingClientRect();
    const colW = Math.max(12, (160 / Math.max(r.width, 400)) * 100);
    const rowH = Math.max(14, (120 / Math.max(r.height, 300)) * 100);
    const cols = Math.max(4, Math.floor(96 / colW));
    const area = { victim: [0, 2], suspect: [0, 2], witness: [0, 2], place: [2, 1] }[card.kind] ?? [3, cols - 3];
    const key = area[0];
    const n = (counts[key] = (counts[key] ?? 0) + 1) - 1;
    const c = area[0] + (n % area[1]);
    const row = Math.floor(n / area[1]);
    return { x: 2 + c * colW, y: Math.min(86, 3 + row * rowH) + (row * rowH > 83 ? (row % 3) * 2 : 0) };
  }

  render() {
    for (const n of [...this.cork.querySelectorAll('.bcard, .note')]) n.remove();
    const cards = this.cards();
    const counts = {};
    let evidence = 0;
    cards.forEach((card, i) => {
      if (card.kind === 'evidence') evidence++;
      const pos = this.board.cards[card.id] ?? (this.board.cards[card.id] = this._defaultPos(card, i, counts));
      const el = document.createElement('div');
      el.className = `bcard bcard-${card.kind}`;
      el.dataset.id = card.id;
      el.style.left = `${pos.x}%`;
      el.style.top = `${pos.y}%`;
      el.innerHTML = '<i class="pin"></i><div class="bcard-title"></div><div class="bcard-sub"></div><div class="bcard-body"></div>';
      el.querySelector('.bcard-title').textContent = card.title;
      el.querySelector('.bcard-sub').textContent = card.sub;
      el.querySelector('.bcard-body').textContent = card.body;
      this._draggable(el, card.id);
      this.cork.appendChild(el);
    });
    for (const note of this.board.notes) this._noteEl(note);
    this.empty.textContent = evidence ? '' : 'No evidence yet. Evidence appears here when you solve a puzzle.';
    this.drawStrings();
  }

  _draggable(el, id) {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.classList.contains('note-x')) return;
      if (e.shiftKey) { this._tie(id, el); e.preventDefault(); return; }
      const rect = this.cork.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY };
      const pos = { ...(this._posOf(id)) };
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const move = (ev) => {
        const x = Math.max(0, Math.min(92, pos.x + ((ev.clientX - start.x) / rect.width) * 100));
        const y = Math.max(0, Math.min(90, pos.y + ((ev.clientY - start.y) / rect.height) * 100));
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
        this._setPos(id, { x, y });
        this.drawStrings();
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        this.state.save();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }

  _posOf(id) {
    if (id.startsWith('n:')) return this.board.notes.find((n) => `n:${n.id}` === id);
    return this.board.cards[id];
  }

  _setPos(id, p) {
    if (id.startsWith('n:')) Object.assign(this.board.notes.find((n) => `n:${n.id}` === id), p);
    else this.board.cards[id] = p;
  }

  _tie(id, el) {
    if (!this._pending) {
      this._pending = { id, el };
      el.classList.add('pending');
      return;
    }
    const a = this._pending.id, b = id;
    this._pending.el.classList.remove('pending');
    this._pending = null;
    if (a === b) return;
    const links = this.board.links;
    const i = links.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (i >= 0) links.splice(i, 1); else links.push([a, b]);
    this.state.save();
    this.drawStrings();
  }

  drawStrings() {
    const r = this.cork.getBoundingClientRect();
    this.svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    this.svg.replaceChildren();
    const center = (id) => {
      const el = this.cork.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [b.left - r.left + b.width / 2, b.top - r.top + 10];
    };
    for (const [a, b] of this.board.links) {
      const p = center(a), q = center(b);
      if (!p || !q) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const sag = Math.min(40, Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.12);
      line.setAttribute('d', `M${p[0]},${p[1]} Q${(p[0] + q[0]) / 2},${(p[1] + q[1]) / 2 + sag} ${q[0]},${q[1]}`);
      line.setAttribute('class', 'string');
      this.svg.appendChild(line);
    }
  }

  addNote() {
    const note = { id: Date.now().toString(36), text: '', x: 40 + Math.random() * 10, y: 40 + Math.random() * 10 };
    this.board.notes.push(note);
    this._noteEl(note).querySelector('textarea').focus();
    this.state.save();
  }

  _noteEl(note) {
    const el = document.createElement('div');
    el.className = 'note';
    el.dataset.id = `n:${note.id}`;
    el.style.left = `${note.x}%`;
    el.style.top = `${note.y}%`;
    el.innerHTML = '<i class="pin"></i><button class="note-x" title="Remove note">&times;</button><textarea placeholder="Type a note…"></textarea>';
    const ta = el.querySelector('textarea');
    ta.value = note.text;
    ta.addEventListener('input', () => { note.text = ta.value; });
    ta.addEventListener('change', () => this.state.save());
    ta.addEventListener('keydown', (e) => e.stopPropagation()); // typing never moves the player
    el.querySelector('.note-x').addEventListener('click', () => {
      this.board.notes = this.board.notes.filter((n) => n !== note);
      this.board.links = this.board.links.filter(([a, b]) => a !== `n:${note.id}` && b !== `n:${note.id}`);
      el.remove();
      this.drawStrings();
      this.state.save();
    });
    this._draggable(el, `n:${note.id}`);
    this.cork.appendChild(el);
    return el;
  }
}
