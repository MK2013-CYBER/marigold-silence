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

  show(speaker, line, choices) {
    this.name.textContent = speaker;
    this.text.textContent = line;
    this.list.replaceChildren();
    this.choices = choices;
    choices.forEach((c, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<kbd>${i + 1}</kbd> `;
      li.append(document.createTextNode(c.label));
      li.addEventListener('click', () => this.pick(i));
      this.list.appendChild(li);
    });
    this.el.classList.remove('hidden');
    this.open = true;
  }

  pick(i) {
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
    this.el.classList.add('hidden');
    this.open = false;
    this.onClose?.();
  }
}
