import { formatTime } from '../engine/state.js';

function el(tag, cls, parent = document.body, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** On-screen UI: interaction prompt, captions, note reader, notebook, clock. */
export class Hud {
  constructor({ clues, items, config }) {
    this.clueById = new Map(clues.map((c) => [c.id, c]));
    this.items = items;
    this.config = config;

    this.clockEl = el('div', 'hud-clock hidden');
    this.toastEl = el('div', 'hud-toast');
    this.promptEl = el('div', 'hud-prompt hidden');
    this.captionEl = el('div', 'hud-caption');

    this.reader = el('div', 'reader hidden');
    const paper = el('div', 'paper', this.reader);
    this.readerTitle = el('h2', '', paper);
    this.readerText = el('p', '', paper);
    el('div', 'paper-hint', paper, 'E — put it away');

    this.notebook = el('div', 'notebook hidden');
    this.nbPage = el('div', 'nb-page', this.notebook);

    this.readerOpen = false;
    this.notebookOpen = false;
    this._captionTimer = 0;
    this._toastTimer = 0;
  }

  showClock(on) { this.clockEl.classList.toggle('hidden', !on); }
  setClock(label) { this.clockEl.textContent = label; }

  setPrompt(verb, cost = 0) {
    if (!verb) { this.promptEl.classList.add('hidden'); this._prompt = null; return; }
    const key = `${verb}|${cost}`;
    if (key === this._prompt) return;
    this._prompt = key;
    this.promptEl.replaceChildren();
    el('kbd', '', this.promptEl, 'E');
    el('span', '', this.promptEl, verb);
    if (cost > 0) el('span', 'cost', this.promptEl, `${cost} min`);
    this.promptEl.classList.remove('hidden');
  }

  caption(text, seconds = 7) {
    if (!text) return;
    this.captionEl.textContent = text;
    this.captionEl.classList.add('show');
    clearTimeout(this._captionTimer);
    this._captionTimer = setTimeout(() => this.captionEl.classList.remove('show'), seconds * 1000);
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  timePassed(minutes, label) {
    this.setClock(label);
    this.clockEl.dataset.delta = `+${minutes} min`;
    this.clockEl.classList.remove('tick');
    void this.clockEl.offsetWidth; // restart the animation
    this.clockEl.classList.add('tick');
  }

  openReader(title, text) {
    this.readerTitle.textContent = title;
    this.readerText.textContent = text;
    this.reader.classList.remove('hidden');
    this.readerOpen = true;
  }

  closeReader() {
    this.reader.classList.add('hidden');
    this.readerOpen = false;
  }

  toggleNotebook(state) {
    if (this.notebookOpen) this.closeNotebook();
    else this.openNotebook(state);
  }

  openNotebook(state) {
    const p = this.nbPage;
    p.replaceChildren();
    const head = el('header', '', p);
    el('h2', '', head, 'Notebook');
    el('div', 'nb-time', head, `${this.config.clock.dayLabel} · ${state.clockLabel()}`);

    this._myNotes(p, state);

    // (your leads and proven findings are in the case file, J)
    el('h3', '', p, 'Things you noticed');
    const notes = el('ol', 'nb-list', p);
    if (!state.data.notes?.length) el('li', 'nb-empty', notes, 'Nothing yet.');
    for (const t of state.data.notes ?? []) el('li', '', notes, t);

    el('h3', '', p, 'In your pocket');
    const pocket = el('ul', 'nb-pocket', p);
    if (state.data.items.length === 0) el('li', 'nb-empty', pocket, 'Empty.');
    for (const id of state.data.items) {
      const it = this.items[id];
      if (it) el('li', '', pocket, `${it.name} — ${it.text}`);
    }
    el('footer', '', p, 'Tab or Esc — close');

    this.notebook.classList.remove('hidden');
    const was = this.notebookOpen;
    this.notebookOpen = true;
    if (!was) this.onNotebook?.(true); // main.js frees the mouse so you can click and type
    this._noteBox?.focus();
  }

  /**
   * "Your notes": anything you want to write down, kept in your save (state.data.myNotes), each
   * stamped with the time on the game clock. Enter adds it (Shift+Enter for a new line).
   */
  _myNotes(p, state) {
    const d = state.data;
    d.myNotes ??= [];
    el('h3', '', p, 'Your notes');
    const form = el('div', 'nb-write', p);
    const box = this._noteBox = el('textarea', 'nb-box', form);
    box.placeholder = 'Write a note… (Enter to add it, Shift+Enter for a new line)';
    box.maxLength = 2000;
    box.rows = 2;
    box.value = d.noteDraft ?? '';
    const add = el('button', 'nb-add', form, 'Add note');
    add.type = 'button';
    const save = () => {
      const text = box.value.trim();
      if (!text) return;
      d.myNotes.unshift({ t: d.minutes, text });
      d.noteDraft = '';
      state.save();
      this.openNotebook(state); // redraw with the new note at the top
    };
    // while you type, keys are words, not game controls (Tab and Esc still close the notebook)
    box.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Escape') return;
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    });
    box.addEventListener('keyup', (e) => e.stopPropagation());
    box.addEventListener('input', () => { d.noteDraft = box.value; });
    add.addEventListener('click', (e) => { e.stopPropagation(); save(); });

    const list = el('ol', 'nb-list nb-mine', p);
    if (!d.myNotes.length) el('li', 'nb-empty', list, 'No notes yet.');
    d.myNotes.forEach((n, i) => {
      const li = el('li', '', list);
      const meta = el('div', 'nb-meta', li);
      el('span', 'nb-kind', meta, formatTime(n.t));
      const del = el('button', 'nb-del', meta, 'delete');
      del.type = 'button';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'click again to delete'; return; }
        d.myNotes.splice(i, 1);
        state.save();
        this.openNotebook(state);
      });
      el('div', 'nb-text nb-own', li, n.text);
    });
  }

  closeNotebook() {
    if (!this.notebookOpen) return;
    this._noteBox?.blur();
    this.notebook.classList.add('hidden');
    this.notebookOpen = false;
    this.onNotebook?.(false); // main.js takes the mouse back for looking around
  }

  closeAll() {
    this.closeReader();
    this.closeNotebook();
  }
}
