/**
 * Conversation box: a speaker's line plus numbered choices (keys 1-9 or click).
 * Works without releasing the mouse, so it can be used mid-walk.
 */
export class DialogueBox {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'dialogue hidden';
    this.name = document.createElement('div');
    this.name.className = 'dlg-name';
    this.text = document.createElement('div');
    this.text.className = 'dlg-text';
    this.list = document.createElement('ol');
    this.list.className = 'dlg-choices';
    this.el.append(this.name, this.text, this.list);
    document.body.appendChild(this.el);
    this.open = false;
    this.choices = [];
    this.onClose = null;
  }

  /**
   * Show a line and the replies. The line types itself out (about as fast as it is spoken);
   * the replies appear once it has finished. Press a number, or click, to finish it early.
   */
  show(speaker, line, choices) {
    this.name.textContent = speaker;
    this.list.replaceChildren();
    this.choices = choices;
    choices.forEach((c, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<kbd>${i + 1}</kbd> `;
      li.append(document.createTextNode(c.label));
      li.addEventListener('click', () => this.pick(i));
      this.list.appendChild(li);
    });
    clearInterval(this._typer);
    this._full = line;
    let n = 0;
    this.text.textContent = '';
    this.list.classList.add('waiting');
    this._typer = setInterval(() => {
      n += 2;
      this.text.textContent = line.slice(0, n);
      if (n >= line.length) this._finishTyping();
    }, 28);
    this.el.classList.remove('hidden');
    this.open = true;
    this.onLine?.(speaker, line);
  }

  _finishTyping() {
    clearInterval(this._typer);
    this._typer = null;
    this.text.textContent = this._full;
    this.list.classList.remove('waiting');
  }

  pick(i) {
    if (this._typer) { this._finishTyping(); return; } // first press shows the whole line
    const c = this.choices[i];
    if (c) c.onPick();
  }

  /** Returns true if the key was used. */
  key(e) {
    if (!this.open) return false;
    const n = Number(e.key);
    if (n >= 1 && n <= this.choices.length) { this.pick(n - 1); return true; }
    if (e.code === 'Escape' || e.code === 'KeyE') { this.close(); return true; }
    return false;
  }

  close() {
    if (!this.open) return;
    clearInterval(this._typer);
    this._typer = null;
    this.el.classList.add('hidden');
    this.open = false;
    this.onClose?.();
  }
}

/**
 * Turn a long list into pages of choices for the conversation box (keys only go 1-9):
 * `extra` choices (like "I don't know" or "Back") stay on every page.
 */
export function pagedChoices(items, toChoice, show, extra = [], page = 0, size = 7) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const out = items.slice(page * size, page * size + size).map(toChoice);
  if (page < pages - 1) out.push({ label: `More... (${page + 2} of ${pages})`, onPick: () => show(page + 1) });
  if (page > 0) out.push({ label: 'Previous', onPick: () => show(page - 1) });
  return [...out, ...extra];
}
