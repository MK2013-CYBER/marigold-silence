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
/**
 * The case file (J): everything the investigation has turned up, from the evidence the game really
 * keeps (src/game/evidence.js): proven findings with every source behind them, leads that still
 * need more sources, and the investigations solved so far.
 */
export class CaseFileScreen extends Screen {
  constructor({ state, text }) {
    super('casefile', 'Case File');
    this.state = state;
    this.text = text; // words: src/data/dialogue/cole.json "caseFile"
    this.evidence = null; // set by main.js once the evidence exists
    this.title = (id) => id; // investigation titles, set by main.js
    this.names = new Map(); // person id -> name, set by main.js
  }

  /** Where a source came from, in a few words: an investigation, a person, or something you found. */
  _from(src) {
    if (/^S\d+$/.test(src)) return `${src} · ${this.title(src)}`;
    if (this.names.has(src)) return this.names.get(src);
    return this.text.found;
  }

  _section(title, count) {
    const h = document.createElement('h3');
    h.className = 'cf-head';
    h.textContent = count == null ? title : `${title} (${count})`;
    this.body.appendChild(h);
  }

  _item(ul, mark, meta, name, lines) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="cf-photo"></div><div><div class="cf-meta"></div><div class="cf-name"></div><ul class="cf-sources"></ul></div>';
    li.querySelector('.cf-photo').textContent = mark;
    li.querySelector('.cf-meta').textContent = meta;
    if (name) li.querySelector('.cf-name').textContent = name;
    else li.querySelector('.cf-name').remove(); // a lead has no conclusion yet: its sources say what you know
    for (const [from, text] of lines) {
      const s = document.createElement('li');
      s.innerHTML = '<span class="cf-from"></span> <span class="cf-text"></span>';
      s.querySelector('.cf-from').textContent = from;
      s.querySelector('.cf-text').textContent = text;
      li.querySelector('.cf-sources').appendChild(s);
    }
    ul.appendChild(li);
  }

  render() {
    this.body.replaceChildren();
    const T = this.text, E = this.evidence;
    const known = E?.known() ?? [];
    const solved = this.state.data.solved.filter((id) => /^S\d+$/.test(id)).sort((a, b) => a.slice(1) - b.slice(1));
    if (!known.length && !solved.length) {
      const p = document.createElement('p');
      p.className = 'cf-empty';
      p.textContent = T.empty;
      this.body.appendChild(p);
      return;
    }
    const proven = known.filter((f) => E.isEstablished(f.id));
    const leads = known.filter((f) => !E.isEstablished(f.id));
    const sourceLines = (f) => E.sources(f.id).map((src) => [this._from(src), E.lead(f.id, src)]);

    this._section(T.proven, proven.length);
    const pu = document.createElement('ul');
    pu.className = 'cf-list';
    if (!proven.length) pu.innerHTML = `<li class="cf-empty"></li>`, pu.firstChild.textContent = T.noProven;
    for (const f of proven) this._item(pu, '✓', `${T.provenTag} · ${E.sources(f.id).length} ${T.sources}`, f.name, [['', f.text], ...sourceLines(f)]);
    this.body.appendChild(pu);

    this._section(T.leads, leads.length);
    const lu = document.createElement('ul');
    lu.className = 'cf-list';
    if (!leads.length) lu.innerHTML = `<li class="cf-empty"></li>`, lu.firstChild.textContent = T.noLeads;
    for (const f of leads) {
      const n = E.sources(f.id).length;
      this._item(lu, '?', T.leadTag.replace('{n}', n).replace('{need}', f.need), null, sourceLines(f));
    }
    this.body.appendChild(lu);

    this._section(T.solved, `${solved.length} of 26`);
    const su = document.createElement('ul');
    su.className = 'cf-solved';
    for (const id of solved) { const li = document.createElement('li'); li.textContent = `${id} · ${this.title(id)}`; su.appendChild(li); }
    if (!solved.length) { const li = document.createElement('li'); li.className = 'cf-empty'; li.textContent = T.noSolved; su.appendChild(li); }
    this.body.appendChild(su);
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
