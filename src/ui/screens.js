import { formatTime, parseTime } from '../engine/state.js';

/** Base for full-screen panels that need the mouse (reports, case file, timeline). */
class Screen {
  constructor(cls, title) {
    this.el = document.createElement('div');
    this.el.className = `screen ${cls} hidden`;
    this.el.innerHTML = `<div class="screen-page"><header><h2></h2><button class="board-btn screen-close">Close (Esc)</button></header><div class="screen-body"></div></div>`;
    this.el.querySelector('h2').textContent = title;
    this.body = this.el.querySelector('.screen-body');
    this.el.querySelector('.screen-close').addEventListener('click', () => this.close());
    document.body.appendChild(this.el);
    this.open = false;
    this.onClose = null;
  }

  show() { this.render(); this.el.classList.remove('hidden'); this.open = true; }
  close() { if (!this.open) return; this.el.classList.add('hidden'); this.open = false; this.onClose?.(); }
  render() {}
}

/** The report desk: typed pages that arrive as the day goes on (reports.json). */
export class ReportsScreen extends Screen {
  constructor({ state, reports }) {
    super('reports', 'Report Desk');
    this.state = state;
    this.reports = reports;
    this.current = null;
  }

  available() {
    return this.reports.filter((r) => parseTime(r.unlockAt) <= this.state.data.minutes);
  }

  unreadCount() {
    return this.available().filter((r) => !this.state.data.reportsRead.includes(r.id)).length;
  }

  render() {
    const list = this.available();
    this.body.replaceChildren();
    const cols = document.createElement('div');
    cols.className = 'rep-cols';
    const ul = document.createElement('ul');
    ul.className = 'rep-list';
    const page = document.createElement('div');
    page.className = 'rep-page';
    const open = (r) => {
      this.current = r.id;
      if (!this.state.data.reportsRead.includes(r.id)) this.state.data.reportsRead.push(r.id);
      this.state.save();
      page.replaceChildren();
      const h = document.createElement('h3');
      h.textContent = r.title;
      const from = document.createElement('div');
      from.className = 'rep-from';
      from.textContent = r.from;
      page.append(h, from);
      for (const text of r.pages) {
        const p = document.createElement('p');
        p.textContent = text;
        page.appendChild(p);
      }
      [...ul.children].forEach((li) => li.classList.toggle('active', li.dataset.id === r.id));
      [...ul.children].find((li) => li.dataset.id === r.id)?.classList.remove('unread');
    };
    for (const r of list) {
      const li = document.createElement('li');
      li.dataset.id = r.id;
      li.textContent = r.title;
      if (!this.state.data.reportsRead.includes(r.id)) li.classList.add('unread');
      li.addEventListener('click', () => open(r));
      ul.appendChild(li);
    }
    const next = this.reports.filter((r) => parseTime(r.unlockAt) > this.state.data.minutes)
      .sort((a, b) => parseTime(a.unlockAt) - parseTime(b.unlockAt))[0];
    if (next) {
      const li = document.createElement('li');
      li.className = 'rep-pending';
      li.textContent = `More expected around ${next.unlockAt}`;
      ul.appendChild(li);
    }
    cols.append(ul, page);
    this.body.appendChild(cols);
    const first = list.find((r) => r.id === this.current) ?? list[0];
    if (first) open(first);
    else page.textContent = 'Nothing on the desk yet. Danny is still on the wire.';
  }
}

/** Case file: every piece of evidence you have earned. */
export class CaseFileScreen extends Screen {
  constructor({ state, clues, puzzles }) {
    super('casefile', 'Case File');
    this.state = state;
    this.clueById = new Map(clues.map((c) => [c.id, c]));
    this.puzzleById = new Map(puzzles.map((p) => [p.id, p]));
  }

  render() {
    this.body.replaceChildren();
    const earned = this.state.data.clues.filter(({ id }) => this.clueById.has(id));
    if (!earned.length) {
      const p = document.createElement('p');
      p.className = 'cf-empty';
      p.textContent = 'The file is empty. Evidence goes in here when you solve a puzzle.';
      this.body.appendChild(p);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'cf-list';
    for (const { id, at } of earned) {
      const c = this.clueById.get(id);
      const li = document.createElement('li');
      li.innerHTML = '<div class="cf-photo"></div><div><div class="cf-meta"></div><div class="cf-name"></div><div class="cf-text"></div></div>';
      li.querySelector('.cf-photo').textContent = c.kind[0];
      li.querySelector('.cf-meta').textContent = `${c.kind} · ${this.puzzleById.get(c.puzzle)?.name ?? ''} · ${formatTime(at)}`;
      li.querySelector('.cf-name').textContent = c.name;
      li.querySelector('.cf-text').textContent = c.text;
      ul.appendChild(li);
    }
    this.body.appendChild(ul);
  }
}

/** The timeline wall (puzzle P9 comes in Stage F): for now the empty strip and Danny's note. */
export class TimelineScreen extends Screen {
  constructor({ message }) {
    super('timeline', 'Timeline: Friday night');
    this.message = message;
  }

  render() {
    this.body.replaceChildren();
    const strip = document.createElement('div');
    strip.className = 'tl-strip';
    for (let h = 18; h <= 30; h++) {
      const tick = document.createElement('div');
      tick.className = 'tl-tick';
      tick.textContent = String(h % 24).padStart(2, '0');
      strip.appendChild(tick);
    }
    const p = document.createElement('p');
    p.className = 'cf-empty';
    p.textContent = this.message;
    this.body.append(strip, p);
  }
}
