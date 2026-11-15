import { parseTime } from '../engine/state.js';

/**
 * Screens for the office investigation sequences (v4 S1-S6). Each has its own mechanic:
 *   S1 Walk the Room      mark every exit possible / impossible, photograph with 12 plates
 *   S2 The Body           direct the doctor's examination; spot what doesn't fit heart failure
 *   S3 Time of Death      cooling arithmetic; set a time window with two sliders
 *   S4 The Bench Test     find the chart, then 6 drops x 5 samples x 3 chemicals
 *   S5 The Safe           three-number dial (or drill it)
 *   S6 The Box and Latch  listen to the music box, pull the books in the same order
 * Words and answers: src/data/sequences.json. Progress is saved in state.data.seq.
 */
const fmt = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class SequenceScreen {
  constructor({ data, state, evidence, hud, audio, spend, onSolved, trust, cole }) {
    Object.assign(this, { data, state, evidence, hud, audio, spend, onSolved, trust, cole });
    this.state.data.seq ??= {};
    this.state.data.examined ??= [];
    this.el = document.createElement('div');
    this.el.className = 'seq hidden';
    this.el.innerHTML = '<div class="seq-card"><div class="seq-head"><span class="seq-title"></span><button class="seq-close">Close (Esc)</button></div><div class="seq-body"></div><div class="seq-msg"></div></div>';
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.seq-body');
    this.msgEl = this.el.querySelector('.seq-msg');
    this.el.querySelector('.seq-close').addEventListener('click', () => this.close());
    this.open = false;
    this.onClose = null;
    this.id = null;
  }

  s(id = this.id) { return (this.state.data.seq[id] ??= {}); }
  solved(id) { return this.state.data.solved.includes(id); }

  setId(id) { this.id = id; return this; }

  show() {
    this.el.classList.remove('hidden');
    this.open = true;
    this.msg('');
    this.render();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.open = false;
    this.state.save();
    this.onClose?.();
  }

  msg(t, good = false) {
    this.msgEl.textContent = t;
    this.msgEl.classList.toggle('good', good);
  }

  solve(id) {
    if (this.solved(id)) return;
    this.state.data.solved.push(id);
    const d = this.data[id] ?? {}; // S26's words live in finale.json
    for (const [fid, src] of d.sources ?? []) this.evidence.add(fid, src);
    this.state.save();
    this.onSolved?.(id);
  }

  render() {
    if (this.id === 'S26') { this.body.replaceChildren(); const p0 = document.createElement('p'); p0.className = 'seq-intro'; this.body.appendChild(p0); return this.renderS26(); }
    const d = this.data[this.id];
    this.el.querySelector('.seq-title').textContent = `${this.id} · ${d.title}`;
    this.body.replaceChildren();
    const intro = document.createElement('p');
    intro.className = 'seq-intro';
    intro.textContent = this.solved(this.id) ? `Solved. ${d.done}` : d.intro;
    this.body.appendChild(intro);
    this[`render${this.id}`]?.(d);
  }

  _btn(label, fn, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `seq-btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  _row(parent, html) {
    const r = document.createElement('div');
    r.className = 'seq-row';
    r.innerHTML = html;
    parent.appendChild(r);
    return r;
  }

  // ------------------------------------------------------------------ S1 Walk the Room
  renderS1(d) {
    const st = this.s();
    st.marks ??= {};
    st.photos ??= [];
    const ex = this.state.data.examined;
    const exits = document.createElement('div');
    exits.className = 'seq-section';
    exits.innerHTML = '<h3>Ways in or out</h3>';
    for (const e of d.exits) {
      const seen = ex.includes(e.id === 'flue' ? 'stove' : e.id);
      const r = this._row(exits, `<span class="seq-label">${esc(e.name)}</span>`);
      if (!seen) { r.insertAdjacentHTML('beforeend', `<span class="seq-dim">${esc(d.notExamined)}</span>`); continue; }
      for (const v of ['possible', 'impossible', 'unsure']) {
        r.appendChild(this._btn(v, () => { st.marks[e.id] = v; this.render(); }, st.marks[e.id] === v ? 'on' : ''));
      }
    }
    this.body.appendChild(exits);

    const ph = document.createElement('div');
    ph.className = 'seq-section';
    ph.innerHTML = `<h3>Camera plates: ${d.plates - st.photos.length} of ${d.plates} left</h3>`;
    const ex2 = this.state.data.examined.filter((k) => this.data.examine[k]);
    if (!ex2.length) ph.insertAdjacentHTML('beforeend', '<p class="seq-dim">Examine things in the room (E), then photograph them here.</p>');
    for (const k of ex2) {
      const r = this._row(ph, `<span class="seq-label">${esc(this.data.examine[k].name)}</span>`);
      if (st.photos.includes(k)) r.insertAdjacentHTML('beforeend', '<span class="seq-ok">photographed</span>');
      else if (st.photos.length < d.plates) r.appendChild(this._btn('Photograph', () => { st.photos.push(k); this.audio?.click(); this.spend(1); this.render(); }));
    }
    this.body.appendChild(ph);
    if (this.solved('S1')) return;
    this.body.appendChild(this._btn('Check my findings', () => {
      const allMarked = d.exits.every((e) => st.marks[e.id]);
      if (!allMarked) return this.msg('Mark every way in or out first.');
      const ok = d.exits.every((e) => st.marks[e.id] === e.answer);
      if (!ok) return this.msg(d.wrong);
      const missing = d.mustPhotograph.filter((k) => !st.photos.includes(k));
      if (missing.length) return this.msg(`You haven't photographed everything that matters yet (${missing.length} left). If you run out of plates, Danny has a spare box at the HQ.`);
      this.solve('S1');
      this.render();
      this.msg(d.done, true);
    }, 'primary'));
    if (st.photos.length >= d.plates) this.body.appendChild(this._btn('Fetch a spare box of plates from HQ (20 min)', () => { st.photos = st.photos.filter((k) => d.mustPhotograph.includes(k)); this.spend(20); this.render(); }));
  }

  // ------------------------------------------------------------------ S2 The Body
  renderS2(d) {
    const st = this.s();
    st.marks ??= {};
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    for (const a of d.areas) {
      const r = this._row(sec, `<span class="seq-label">${esc(a.name)}</span>`);
      if (!st.marks[a.id]) {
        r.appendChild(this._btn('Examine', () => { st.marks[a.id] = 'seen'; this.spend(1); this.render(); }));
        continue;
      }
      r.insertAdjacentHTML('beforeend', `<div class="seq-text"><i>Lindqvist:</i> "${esc(a.doc)}"<br><b>You see:</b> ${esc(a.see)}</div>`);
      if (st.marks[a.id] === 'seen') {
        r.appendChild(this._btn('Fits a heart attack', () => { st.marks[a.id] = 'fits'; if (!a.fits) this.msg('Are you sure? Look again at what you saw.'); this.render(); }));
        r.appendChild(this._btn("Doesn't fit", () => {
          if (a.fits) { this.msg(d.wrong); this.spend(2); return; }
          st.marks[a.id] = 'nofit';
          this.render();
        }));
      } else r.insertAdjacentHTML('beforeend', `<span class="${st.marks[a.id] === 'nofit' ? 'seq-ok' : 'seq-dim'}">${st.marks[a.id] === 'nofit' ? "doesn't fit" : 'fits'}</span>`);
    }
    this.body.appendChild(sec);
    const found = d.areas.filter((a) => st.marks[a.id] === 'nofit').length;
    if (!this.solved('S2') && found >= d.need) { this.solve('S2'); this.msg(d.done, true); }
    else if (!this.solved('S2')) this.msg(`Signs that don't fit heart failure: ${found} of ${d.need}.`);
  }

  // ------------------------------------------------------------------ S3 Time of Death
  renderS3(d) {
    const st = this.s();
    const lo = parseTime(d.range[0]), hi = parseTime(d.range[1]) + 1440;
    st.from ??= lo + 120;
    st.to ??= lo + 360;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    sec.innerHTML = `<ul class="seq-facts">${d.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <label class="seq-slider">Earliest: <b class="f"></b><input type="range" class="from" min="${lo}" max="${hi}" step="15"></label>
      <label class="seq-slider">Latest: <b class="t"></b><input type="range" class="to" min="${lo}" max="${hi}" step="15"></label>
      <div class="seq-bar"><i></i></div>`;
    const from = sec.querySelector('.from'), to = sec.querySelector('.to');
    from.value = st.from;
    to.value = st.to;
    const draw = () => {
      st.from = +from.value;
      st.to = Math.max(+to.value, st.from);
      sec.querySelector('.f').textContent = fmt(st.from);
      sec.querySelector('.t').textContent = fmt(st.to);
      const bar = sec.querySelector('.seq-bar i');
      bar.style.left = `${((st.from - lo) / (hi - lo)) * 100}%`;
      bar.style.width = `${((st.to - st.from) / (hi - lo)) * 100}%`;
    };
    from.addEventListener('input', draw);
    to.addEventListener('input', draw);
    for (const el of [from, to]) el.addEventListener('keydown', (e) => e.stopPropagation());
    draw();
    this.body.appendChild(sec);
    if (this.solved('S3')) return;
    this.body.appendChild(this._btn('This is my answer', () => {
      const c = d.check;
      const death = parseTime(c.mustInclude);
      if (!(st.from <= death && st.to >= death) || st.from < parseTime(c.earliest) || st.to > parseTime(c.latest)) { this.spend(2); return this.msg(d.wrong); }
      if (st.to - st.from > c.maxWidth) return this.msg(d.tooWide);
      this.spend(10); // the arithmetic and the checks take a while
      this.solve('S3');
      this.render();
      this.msg(d.done, true);
    }, 'primary'));
  }

  // ------------------------------------------------------------------ S4 The Bench Test
  renderS4(d) {
    const st = this.s();
    st.tests ??= {};
    st.drops ??= d.drops;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    if (!st.chart) {
      sec.innerHTML = '<h3>The reference chart is missing</h3>';
      for (const r of d.chartRoutes) {
        sec.appendChild(this._btn(r.label, () => {
          this.spend(r.minutes);
          if (r.trustNeeded && this.trust.get(r.who) < r.trustNeeded) { this.trust.change(r.who, -2); return this.msg(r.no); }
          if (r.trustCost) this.trust.change(r.who, -r.trustCost);
          if (r.id === 'ask') this.evidence.add('F29', 'S4', true);
          st.chart = r.id;
          this.render();
          this.msg(r.ok, true);
        }));
      }
      this.body.appendChild(sec);
      return;
    }
    sec.innerHTML = `<h3>Chart</h3><ul class="seq-facts">${d.chart.map((c) => `<li>${esc(c)}</li>`).join('')}</ul><h3>Drops left: ${st.drops}</h3>`;
    const grid = document.createElement('table');
    grid.className = 'seq-grid';
    grid.innerHTML = `<tr><th></th>${d.reagents.map((r) => `<th>${r}</th>`).join('')}</tr>`;
    for (const smp of d.samples) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(smp.name)}</td>`;
      for (const rg of d.reagents) {
        const td = document.createElement('td');
        const key = `${smp.id}:${rg}`;
        if (st.tests[key]) td.textContent = st.tests[key];
        else if (st.drops > 0 && !this.solved('S4')) td.appendChild(this._btn('test', () => { st.drops--; st.tests[key] = d.results[key] ?? d.results.default; this.audio?.click(); this.spend(2); this.render(); }));
        tr.appendChild(td);
      }
      grid.appendChild(tr);
    }
    sec.appendChild(grid);
    this.body.appendChild(sec);
    if (this.solved('S4')) return;
    if (st.drops === 0) this.body.appendChild(this._btn(d.refill, () => { st.drops = d.drops; this.spend(30); this.render(); }));
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    st.pick ??= [];
    for (const smp of d.samples) {
      q.appendChild(this._btn(smp.name, () => {
        st.pick = st.pick.includes(smp.id) ? st.pick.filter((x) => x !== smp.id) : [...st.pick, smp.id];
        this.render();
      }, st.pick.includes(smp.id) ? 'on' : ''));
    }
    q.appendChild(this._btn('Confirm', () => {
      const ok = d.answer.length === st.pick.length && d.answer.every((a) => st.pick.includes(a));
      const tested = d.answer.every((a) => st.tests[`${a}:B`]);
      if (!ok || !tested) return this.msg(tested ? d.wrong : "You haven't proved that with a test yet.");
      this.solve('S4');
      this.render();
      this.msg(d.done, true);
    }, 'primary'));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S5 The Safe
  renderS5(d) {
    const st = this.s();
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    if (!st.open) {
      sec.innerHTML = '<div class="seq-dial"><label>Left <input type="number" min="0" max="39" class="n0"></label><label>Right <input type="number" min="0" max="39" class="n1"></label><label>Left <input type="number" min="0" max="39" class="n2"></label></div>';
      for (const i of [0, 1, 2]) sec.querySelector(`.n${i}`).addEventListener('keydown', (e) => e.stopPropagation());
      sec.appendChild(this._btn('Try the combination', () => {
        const v = [0, 1, 2].map((i) => Number(sec.querySelector(`.n${i}`).value));
        this.spend(d.tryMinutes);
        this.audio?.click();
        if (v.every((n, i) => n === d.combo[i])) { st.open = 'dial'; this.render(); this.msg('Click. The handle turns.', true); }
        else this.msg(d.wrong);
      }, 'primary'));
      sec.appendChild(this._btn(d.drill.label, () => { this.spend(d.drill.minutes); st.open = 'drill'; this.render(); this.msg(d.drill.note); }));
      this.body.appendChild(sec);
      return;
    }
    st.read ??= [];
    sec.innerHTML = '<h3>Inside the safe</h3>';
    for (const c of d.contents) {
      const lost = st.open === 'drill' && c.id === 'letter';
      const r = this._row(sec, `<span class="seq-label">${esc(c.name)}</span>`);
      if (st.read.includes(c.id)) r.insertAdjacentHTML('beforeend', `<div class="seq-text">${esc(lost ? 'Too badly scorched by the drill to read more than "...forgive me, my girl..."' : c.text)}</div>`);
      else r.appendChild(this._btn('Read', () => {
        st.read.push(c.id);
        this.spend(3);
        if (!lost) for (const [fid, src] of c.sources) this.evidence.add(fid, src);
        this.render();
      }));
    }
    this.body.appendChild(sec);
    if (!this.solved('S5') && st.read.length === d.contents.length) { this.solve('S5'); this.msg(d.done, true); }
  }

  // ------------------------------------------------------------------ S6 The Floor, the Box and the Latch
  renderS6(d) {
    const st = this.s();
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    if (!this.state.data.examined.includes('floor') && !this.solved('S6')) {
      sec.innerHTML = `<p class="seq-dim">${esc(d.needsKnock)}</p>`;
      this.body.appendChild(sec);
      return;
    }
    const teeth = document.createElement('div');
    teeth.className = 'seq-teeth';
    for (let i = 1; i <= 8; i++) teeth.insertAdjacentHTML('beforeend', `<i data-n="${i}">${i}</i>`);
    sec.appendChild(teeth);
    sec.appendChild(this._btn('Play the music box', () => this.playTune(d.tune, teeth)));
    const shelf = document.createElement('div');
    shelf.className = 'seq-books';
    st.pulled ??= [];
    d.books.forEach((name, i) => {
      const b = this._btn(name, () => {
        if (this.solved('S6')) return;
        const n = i + 1;
        this.bell(n, 0.25);
        this.spend(1);
        if (d.tune[st.pulled.length] === n) {
          st.pulled.push(n);
          if (st.pulled.length === d.tune.length) { this.solve('S6'); this.render(); this.msg(d.done, true); return; }
          this.render();
        } else { st.pulled = []; this.msg(d.wrongBook); this.render(); this.audio?.rattle?.(); }
      }, st.pulled.includes(i + 1) ? 'on' : '');
      shelf.appendChild(b);
    });
    sec.insertAdjacentHTML('beforeend', `<h3>The pull-books (${st.pulled.length} of ${d.tune.length})</h3>`);
    sec.appendChild(shelf);
    if (!this.solved('S6')) sec.appendChild(this._btn(d.crowbar.label, () => { this.spend(d.crowbar.minutes); this.audio?.thunder?.(0, 0.25); this.solve('S6'); this.render(); this.msg(d.done, true); }));
    this.body.appendChild(sec);
  }

  // ------------------------------------------------------------------ S23 The Prints
  /** A fingerprint drawing: loop, whorl or arch ridges, scaled to its width; scars break the ridges. */
  _print(p, px = 4) {
    const w = p.width * px, h = w * 1.35, cx = w / 2 + 6, cy = h / 2 + 6;
    let path = '';
    for (let i = 1; i <= 9; i++) {
      const r = (i / 9) * (w / 2 - 2);
      if (p.pattern === 'whorl') path += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.3}"/>`;
      else if (p.pattern === 'loop') path += `<path d="M${cx - r} ${cy + h / 2 - 4} L${cx - r} ${cy - r * 0.3} A${r} ${r * 1.2} 0 0 1 ${cx + r} ${cy - r * 0.3} L${cx + r * 0.6} ${cy + h / 2 - 4}"/>`;
      else path += `<path d="M6 ${cy + h / 2 - i * (h / 11)} Q${cx} ${cy + h / 2 - i * (h / 11) - r * 0.9} ${w + 6} ${cy + h / 2 - i * (h / 11)}"/>`;
    }
    const scars = p.scar ? `<path d="M${cx - w * 0.3} ${cy - 6} L${cx + w * 0.25} ${cy + 10}" stroke="#e9dfc6" stroke-width="5"/><path d="M${cx - w * 0.1} ${cy + 18} L${cx + w * 0.3} ${cy + 8}" stroke="#e9dfc6" stroke-width="4"/>` : '';
    return `<svg class="seq-print" width="${w + 12}" height="${h + 12}" viewBox="0 0 ${w + 12} ${h + 12}"><g fill="none" stroke="#2a2116" stroke-width="1.6">${path}</g>${scars}</svg>`;
  }

  renderS23(d) {
    const st = this.s();
    if (!this.solved(d.needs)) { this.body.insertAdjacentHTML('beforeend', `<p class="seq-dim">${esc(d.needsText)}</p>`); return; }
    if (!st.collected) {
      const sec = document.createElement('div');
      sec.className = 'seq-section';
      sec.innerHTML = '<h3>Comparison prints</h3>';
      for (const c of d.collect) sec.appendChild(this._btn(c.label, () => {
        this.spend(c.minutes);
        if (c.trust) for (const id of Object.keys(d.people)) if (id !== 'pryce') this.trust.change(id, c.trust);
        st.collected = c.id;
        this.render();
        this.msg(c.text, true);
      }));
      this.body.appendChild(sec);
      return;
    }
    st.measured ??= {};
    st.match ??= {};
    const names = { nobody: d.nobody };
    for (const id of Object.keys(d.people)) names[id] = id[0].toUpperCase() + id.slice(1);
    // the reference cards
    const ref = document.createElement('div');
    ref.className = 'seq-section';
    ref.innerHTML = '<h3>Everyone\'s prints</h3><div class="seq-cards">' + Object.entries(d.people).map(([id, p]) =>
      `<div class="seq-pcard">${this._print(p, 2.4)}<b>${names[id]}</b><span>${p.pattern}, ${p.width} mm${p.scar ? ', scarred' : ''}</span></div>`).join('') + '</div>';
    this.body.appendChild(ref);
    // each lifted print: measure with callipers, then match
    for (const L of d.lifted) {
      const sec = document.createElement('div');
      sec.className = 'seq-section';
      sec.innerHTML = `<h3>${esc(L.name)}</h3><div class="seq-lift">${this._print(L, 4)}<div class="seq-cal"><div class="seq-jaws"><i></i><i></i></div>
        <label>Callipers: <b class="mm"></b> mm <input type="range" min="8" max="24" step="1"></label></div></div>`;
      const inp = sec.querySelector('input'), mm = sec.querySelector('.mm'), jaws = sec.querySelector('.seq-jaws');
      inp.value = st.measured[L.id] ?? 10;
      const draw = () => { mm.textContent = inp.value; jaws.style.width = `${inp.value * 4}px`; };
      inp.addEventListener('input', () => { draw(); st.measured[L.id] = +inp.value; });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      draw();
      if (st.match[L.id]) sec.insertAdjacentHTML('beforeend', `<p class="seq-ok">Matched: ${esc(names[st.match[L.id]])}</p>`);
      else {
        const row = document.createElement('div');
        for (const id of [...Object.keys(d.people), 'nobody']) row.appendChild(this._btn(names[id], () => {
          if (st.measured[L.id] !== L.width) return this.msg(st.measured[L.id] ? `Your callipers say ${st.measured[L.id]} mm. Close them on the print's edges first.` : d.measureFirst);
          this.spend(3);
          if (id !== L.answer) return this.msg(d.wrong);
          st.match[L.id] = id;
          this.render();
          if (d.lifted.every((x) => st.match[x.id])) { this.solve('S23'); this.render(); this.msg(d.done, true); }
        }));
        sec.appendChild(row);
      }
      this.body.appendChild(sec);
    }
  }

  // ------------------------------------------------------------------ S25 The Timeline
  _knows(req) {
    if (!req) return true;
    const [k, v] = req.includes(':') ? req.split(':') : ['F', req];
    if (k === 'solved') return this.solved(v);
    if (k === 'heard') return !!this.state.data.heard?.[v];
    if (k === 'examined') return this.state.data.examined.includes(v);
    return this.evidence.sources(req).length > 0;
  }

  renderS25(d) {
    const st = this.s();
    const known = d.cards.filter((c) => this._knows(c.requires));
    st.order = (st.order ?? []).filter((id) => known.some((c) => c.id === id));
    // newly learned events arrive in a scrambled spot: putting them in order is the puzzle
    for (const c of known) {
      if (st.order.includes(c.id)) continue;
      const h = [...c.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      st.order.splice(h % (st.order.length + 1), 0, c.id);
    }
    const sec = document.createElement('div');
    sec.className = 'seq-section seq-strip';
    st.order.forEach((id, i) => {
      const c = d.cards.find((x) => x.id === id);
      const r = this._row(sec, `<span class="seq-label seq-pin">${c.fixed ? '📌 ' : ''}${esc(c.text)}</span>`);
      if (this.solved('S25')) return;
      r.appendChild(this._btn('▲ earlier', () => { if (i > 0) { [st.order[i - 1], st.order[i]] = [st.order[i], st.order[i - 1]]; this.render(); } }));
      r.appendChild(this._btn('▼ later', () => { if (i < st.order.length - 1) { [st.order[i + 1], st.order[i]] = [st.order[i], st.order[i + 1]]; this.render(); } }));
    });
    for (const c of d.cards.filter((x) => !this._knows(x.requires))) this._row(sec, `<span class="seq-label seq-dim">? ${esc(d.locked)}</span>`);
    this.body.appendChild(sec);
    if (this.solved('S25')) return;
    this.body.appendChild(this._btn('Pin it up', () => {
      this.spend(5);
      const cards = st.order.map((id) => d.cards.find((x) => x.id === id));
      const inOrder = cards.every((c, i) => i === 0 || cards[i - 1].t <= c.t);
      if (!inOrder) return this.msg(d.wrong);
      if (!d.need.every((id) => st.order.includes(id))) return this.msg(`${d.missing} (${st.order.length} of ${d.need.length} events known.)`);
      this.solve('S25');
      this.render();
      this.msg(d.done, true);
    }, 'primary'));
  }

  // ------------------------------------------------------------------ S18 Follow the Wire (the rhythm part)
  /** Morse for "--.-" drawn as a paper tape: dash 3 units, dot 1, gaps 1, plus the sender's hitch and wobble. */
  _timing(smp, pattern) {
    let seed = [...(smp.id ?? 'tape')].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
    const out = [];
    let t = 0;
    [...pattern].forEach((ch, i) => {
      const len = (ch === '-' ? 3 : 1) * smp.unit * (1 + rnd() * smp.jitter * 2);
      out.push([t, len]);
      t += len + smp.unit * (1 + rnd() * smp.jitter * 2) + (i === 0 ? smp.hitch : 0);
    });
    return { marks: out, total: t };
  }

  _tapeSvg(tm) {
    const k = 26;
    return `<svg class="seq-tape" width="${Math.max(260, tm.total * k + 20)}" height="26"><rect width="100%" height="26" fill="#f4ecda"/>${tm.marks.map(([t, l]) => `<rect x="${10 + t * k}" y="9" width="${l * k}" height="8" fill="#2a2116"/>`).join('')}</svg>`;
  }

  _playMorse(tm) {
    const ctx = this.audio?.ctx;
    if (!ctx) return;
    const scale = 0.09;
    for (const [t, l] of tm.marks) {
      const at = ctx.currentTime + 0.05 + t * scale;
      const o = ctx.createOscillator();
      o.frequency.value = 760;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.12, at + 0.005);
      g.gain.setValueAtTime(0.12, at + l * scale);
      g.gain.linearRampToValueAtTime(0.0001, at + l * scale + 0.01);
      o.connect(g).connect(this.audio.master);
      o.start(at);
      o.stop(at + l * scale + 0.05);
    }
  }

  renderS18(d) {
    const st = this.s();
    st.played ??= [];
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const tape = this._timing({ ...d.tape, id: 'tape' }, d.tape.pattern);
    sec.innerHTML = `<h3>${esc(d.tape.name)}</h3>${this._tapeSvg(tape)}`;
    sec.appendChild(this._btn('Play the tape', () => this._playMorse(tape)));
    for (const smp of d.samples) {
      const tm = this._timing(smp, d.tape.pattern);
      const r = this._row(sec, `<span class="seq-label">${esc(smp.name)}</span>`);
      r.appendChild(this._btn('Listen', () => { this._playMorse(tm); if (!st.played.includes(smp.id)) { st.played.push(smp.id); this.render(); } }));
      if (st.played.includes(smp.id)) {
        r.insertAdjacentHTML('beforeend', this._tapeSvg(tm));
        if (!st.matched) r.appendChild(this._btn('This one matches', () => {
          this.spend(3);
          if (smp.id !== d.answer) return this.msg(d.wrong);
          st.matched = true;
          this.walks?.noticeWire();
          this.render();
          this.msg(d.matched, true);
        }));
      }
    }
    this.body.appendChild(sec);
    if (st.matched) {
      const w = document.createElement('div');
      w.className = 'seq-section';
      w.innerHTML = '<h3>Follow the wire</h3>' + d.need.map((k) => `<div class="seq-row"><span class="seq-label">${k === 'splice' ? 'The splice box' : 'Where the cable goes under the hangar'}</span><span class="${this.state.flag(`wire:${k}`) ? 'seq-ok' : 'seq-dim'}">${this.state.flag(`wire:${k}`) ? 'found' : 'follow the iron posts across the runway'}</span></div>`).join('');
      this.body.appendChild(w);
    }
  }

  /** Called when you reach the splice box or the hangar wall. */
  checkS18() {
    const d = this.data.S18;
    if (this.s('S18').matched && d.need.every((k) => this.state.flag(`wire:${k}`)) && !this.solved('S18')) {
      this.solve('S18');
      this.hud.toast(d.done);
    }
  }

  // ------------------------------------------------------------------ S14 The Ration Stores
  renderS14(d) {
    const st = this.s();
    st.diff ??= {};
    st.page ??= 0;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const t = document.createElement('table');
    t.className = 'seq-grid';
    t.innerHTML = `<tr><th></th><th>${esc(d.colOut)}</th><th>${esc(d.colFed)}</th><th>${esc(d.colDiff)}</th></tr>`;
    d.rows.forEach(([day, out, fed], i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(day)}</td><td>${out}</td><td>${fed}</td><td></td>`;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'seq-num';
      inp.value = st.diff[i] ?? '';
      inp.disabled = !!st.sumsOk;
      inp.addEventListener('input', () => { st.diff[i] = inp.value; });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      tr.lastChild.appendChild(inp);
      t.appendChild(tr);
    });
    sec.appendChild(t);
    this.body.appendChild(sec);
    if (!st.sumsOk) {
      this.body.appendChild(this._btn('Check my sums', () => {
        this.spend(5);
        const ok = d.rows.every(([, out, fed], i) => Number(st.diff[i]) === out - fed);
        if (!ok) return this.msg(d.wrong);
        st.sumsOk = true;
        this.evidence.note(d.signed);
        this.render();
        this.msg(d.signed, true);
      }, 'primary'));
      return;
    }
    const pg = document.createElement('div');
    pg.className = 'seq-section';
    const page = d.pages[st.page];
    pg.innerHTML = `<h3>Ledger page: ${esc(page.label)}</h3><p>${esc(page.text)}</p>`;
    if (st.page < d.pages.length - 1) pg.appendChild(this._btn('◀ Turn back a page (5 min)', () => { st.page++; this.spend(5); this.render(); }));
    if (st.page > 0) pg.appendChild(this._btn('Forward a page ▶', () => { st.page--; this.render(); }));
    this.body.appendChild(pg);
    if (this.solved('S14')) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    d.options.forEach((o, i) => q.appendChild(this._btn(o, () => {
      if (i !== d.answer || st.page < d.pages.length - 1) return this.msg(i === d.answer ? d.wrongStart : d.wrongStart);
      this.solve('S14');
      this.render();
      this.msg(d.done, true);
    })));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S15 The Marks in the Dust (crate pushing)
  renderS15(d) {
    const st = this.s();
    if (!st.grid) this._resetS15(d);
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const g = document.createElement('div');
    g.className = 'seq-soko';
    g.style.gridTemplateColumns = `repeat(${d.level[0].length}, 34px)`;
    const isT = (r, c) => d.targets.some(([a, b]) => a === r && b === c);
    d.level.forEach((row, r) => [...row].forEach((ch, c) => {
      const cell = document.createElement('i');
      const crate = st.crates.some(([a, b]) => a === r && b === c);
      cell.className = ch === '#' ? 'wall' : crate ? (isT(r, c) ? 'crate home' : 'crate') : st.p[0] === r && st.p[1] === c ? 'me' : isT(r, c) ? 'mark' : 'floor';
      g.appendChild(cell);
    }));
    sec.appendChild(g);
    if (!this.solved('S15')) {
      const pad = document.createElement('div');
      pad.className = 'seq-pad';
      for (const [lbl, dr, dc] of [['▲', -1, 0], ['◀', 0, -1], ['▶', 0, 1], ['▼', 1, 0]]) pad.appendChild(this._btn(lbl, () => this._moveS15(d, dr, dc)));
      pad.appendChild(this._btn(d.reset, () => { this._resetS15(d); this.render(); }));
      sec.appendChild(pad);
      sec.insertAdjacentHTML('beforeend', `<p class="seq-dim">Pushes: ${st.pushes}</p>`);
    }
    this.body.appendChild(sec);
    if (!this._sokoKeys) {
      this._sokoKeys = (e) => {
        if (!this.open || this.id !== 'S15' || this.solved('S15')) return;
        const k = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1] }[e.code];
        if (k) { e.preventDefault(); e.stopPropagation(); this._moveS15(this.data.S15, k[0], k[1]); }
      };
      window.addEventListener('keydown', this._sokoKeys, true);
    }
  }

  _resetS15(d) {
    const st = this.s('S15');
    st.crates = [];
    d.level.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'C') st.crates.push([r, c]); if (ch === 'P') st.p = [r, c]; }));
    st.grid = true;
    st.pushes = 0;
  }

  _moveS15(d, dr, dc) {
    const st = this.s('S15');
    const wall = (r, c) => d.level[r]?.[c] === '#' || d.level[r]?.[c] === undefined;
    const crateAt = (r, c) => st.crates.findIndex(([a, b]) => a === r && b === c);
    const n = [st.p[0] + dr, st.p[1] + dc];
    if (wall(...n)) return;
    const ci = crateAt(...n);
    if (ci >= 0) {
      const b = [n[0] + dr, n[1] + dc];
      if (wall(...b) || crateAt(...b) >= 0) return;
      st.crates[ci] = b;
      st.pushes++;
      this.audio?.footstep?.(0.6);
    }
    st.p = n;
    if (d.targets.every(([a, b]) => crateAt(a, b) >= 0)) {
      this.spend(10 + st.pushes);
      this.solve('S15');
      this.walks?.onS15();
      this.render();
      this.msg(d.done, true);
      return;
    }
    this.render();
  }

  // ------------------------------------------------------------------ S8 The Chemical Shelf (balance scale)
  renderS8(d) {
    const st = this.s();
    st.weighed ??= {};
    st.pan ??= [];
    st.jar ??= null;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const t = document.createElement('table');
    t.className = 'seq-grid';
    t.innerHTML = '<tr><th>Jar</th><th>Ledger says</th><th>You weighed</th><th></th></tr>';
    for (const j of d.jars) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(j.name)}</td><td>${j.ledger} g</td><td>${st.weighed[j.id] != null ? `${st.weighed[j.id]} g` : '-'}</td><td></td>`;
      if (st.weighed[j.id] == null) tr.lastChild.appendChild(this._btn(st.jar === j.id ? 'on the scale' : 'Put on the scale', () => { st.jar = j.id; st.pan = []; this.render(); }, st.jar === j.id ? 'on' : ''));
      else if (j.why) tr.lastChild.textContent = j.why;
      t.appendChild(tr);
    }
    sec.appendChild(t);
    this.body.appendChild(sec);
    if (st.jar) {
      const j = d.jars.find((x) => x.id === st.jar);
      const sum = st.pan.reduce((a, b) => a + b, 0);
      const diff = j.actual - sum; // >0: the jar side is heavier
      const tilt = Math.max(-14, Math.min(14, diff / 6));
      const sc = document.createElement('div');
      sc.className = 'seq-section';
      sc.innerHTML = `<h3>The balance: ${esc(j.name)}</h3>
        <svg width="320" height="120" viewBox="0 0 320 120"><rect x="155" y="40" width="10" height="70" fill="#5a4630"/><rect x="110" y="108" width="100" height="8" fill="#5a4630"/>
        <g transform="rotate(${tilt} 160 40)"><rect x="40" y="36" width="240" height="6" fill="#8a6a3a"/>
        <path d="M40 42 L20 80 L80 80 Z" fill="none" stroke="#5a4630"/><path d="M280 42 L260 80 L300 80 Z" fill="none" stroke="#5a4630"/>
        <rect x="35" y="66" width="30" height="14" fill="#c8b890"/><text x="290" y="76" font-size="11" text-anchor="middle">${sum} g</text></g>
        <text x="160" y="22" font-size="13" text-anchor="middle">${diff === 0 ? 'Level!' : diff > 0 ? 'The jar is heavier' : 'The weights are heavier'}</text></svg>`;
      const row = document.createElement('div');
      for (const w of d.weights) row.appendChild(this._btn(`+${w} g`, () => { st.pan.push(w); this.render(); }));
      row.appendChild(this._btn('Take the last weight off', () => { st.pan.pop(); this.render(); }));
      if (diff === 0) row.appendChild(this._btn('Record the weight', () => { st.weighed[j.id] = sum; st.jar = null; this.spend(3); this.render(); }, 'primary'));
      sc.appendChild(row);
      this.body.appendChild(sc);
    }
    if (this.solved('S8') || !d.jars.every((j) => st.weighed[j.id] != null)) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    for (const j of d.jars) q.appendChild(this._btn(j.name, () => {
      if (j.id !== d.answer) return this.msg(d.wrong);
      this.evidence.note(d.scuffs);
      this.solve('S8');
      this.render();
      this.msg(`${d.done} ${d.scuffs}`, true);
    }));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S9 The Darkroom (develop, then compare)
  _scene(extra) {
    return `<svg width="400" height="260" viewBox="0 0 400 260" class="seq-photo"><rect width="400" height="260" fill="#cfc4ae"/>
      <path d="M0 70 Q100 40 200 60 T400 50 L400 0 L0 0Z" fill="#8a8070"/>
      <path d="M170 120 l40 -12 l50 20 l-20 14 l-60 -4z" fill="#3a332a"/><path d="M200 112 l-30 -30 l8 -4 l32 30z" fill="#4a4238"/>
      <g stroke="#9a8e78" stroke-width="2" fill="none"><path d="M60 250 L120 200 L170 150"/><path d="M80 252 L140 202 L188 152"/></g>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${70 + i * 22}" cy="${240 - i * 14}" r="3" fill="#7a6e5a"/>`).join('')}${extra}</svg>`;
  }

  renderS9(d) {
    const st = this.s();
    st.plates ??= Array(d.plates).fill('new'); // new | done | ruined | lost
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    st.plates.forEach((p, i) => {
      const r = this._row(sec, `<span class="seq-label">Plate ${i + 1}</span><span class="${p === 'done' ? 'seq-ok' : 'seq-dim'}">${{ new: 'undeveloped', done: 'developed', ruined: 'ruined (one retry left)', lost: 'lost' }[p]}</span>`);
      if ((p === 'new' || p === 'ruined') && !this._dev) r.appendChild(this._btn('Develop', () => this._develop(d, i, sec)));
    });
    this.body.appendChild(sec);
    if (st.plates[3] !== 'done') return;
    st.found ??= [];
    const cmp = document.createElement('div');
    cmp.className = 'seq-section';
    cmp.innerHTML = `<p>${esc(d.compare)}</p><div class="seq-photos"><div><b>Official report photo</b>${this._scene('')}</div><div><b>Your print, plate 4</b>${this._scene(
      `<g stroke="#6a5a42" stroke-width="2.5" fill="none"><path d="M10 230 Q80 215 125 198"/><path d="M14 240 Q84 225 129 208"/></g>
       <path d="M200 132 Q240 150 300 196" stroke="#6a5a42" stroke-width="5" fill="none" stroke-dasharray="3 4"/>
       <rect x="300" y="180" width="60" height="28" fill="#2a241c"/><rect x="312" y="196" width="40" height="14" fill="#b8ac94" rx="3"/>`)}</div></div>`;
    const svg = cmp.querySelectorAll('svg')[1];
    svg.style.cursor = 'crosshair';
    svg.addEventListener('click', (e) => {
      if (this.solved('S9')) return;
      const b = svg.getBoundingClientRect();
      const x = ((e.clientX - b.left) / b.width) * 400, y = ((e.clientY - b.top) / b.height) * 260;
      const hit = d.spots.find((s2) => Math.hypot(s2.x - x, s2.y - y) < s2.r);
      if (!hit) return this.msg(d.miss);
      if (!st.found.includes(hit.id)) st.found.push(hit.id);
      if (st.found.length === d.spots.length) { this.solve('S9'); this.render(); this.msg(d.done, true); return; }
      this.render();
      this.msg(`Found: ${hit.name}. (${st.found.length} of ${d.spots.length})`, true);
    });
    cmp.insertAdjacentHTML('beforeend', `<ul class="seq-facts">${st.found.map((id) => `<li>${esc(d.spots.find((x) => x.id === id).name)}</li>`).join('')}</ul>`);
    this.body.appendChild(cmp);
  }

  /** Expose when the wandering needle is in the green band, then stop the developer at ~60 s. */
  _develop(d, i, sec) {
    const st = this.s();
    const box = document.createElement('div');
    box.className = 'seq-dev';
    box.innerHTML = '<div class="seq-meter"><span class="band"></span><span class="needle"></span></div><div class="seq-timer">Developer: <b>0</b> s</div>';
    sec.appendChild(box);
    const needle = box.querySelector('.needle'), timer = box.querySelector('b');
    let phase = 'expose', t0 = performance.now(), secs = 0, pos = 0;
    const btn = this._btn('Expose now', () => {
      if (phase === 'expose') {
        if (pos < 0.42 || pos > 0.58) return fail();
        phase = 'develop';
        t0 = performance.now();
        btn.textContent = 'Into the stop bath!';
      } else if (phase === 'develop') {
        if (secs < 55 || secs > 65) return fail();
        phase = 'done';
        clearInterval(this._dev);
        this._dev = null;
        st.plates[i] = 'done';
        this.spend(8);
        this.render();
        this.msg(`Plate ${i + 1} developed and fixed.`, true);
      }
    }, 'primary');
    box.appendChild(btn);
    const fail = () => {
      clearInterval(this._dev);
      this._dev = null;
      this.spend(8);
      st.plates[i] = st.plates[i] === 'ruined' ? 'lost' : 'ruined';
      if (st.plates[i] === 'lost' && i === 3) st.plates[i] = 'ruined'; // plate 4 is the one that matters: Danny finds spare chemicals
      this.render();
      this.msg(st.plates[i] === 'lost' ? d.lost : d.ruined);
    };
    this._dev = setInterval(() => {
      if (!this.open) { clearInterval(this._dev); this._dev = null; return; }
      const t = (performance.now() - t0) / 1000;
      if (phase === 'expose') { pos = 0.5 + 0.45 * Math.sin(t * 2.1) * Math.cos(t * 0.7); needle.style.left = `${pos * 100}%`; }
      if (phase === 'develop') { secs = Math.floor(t * 12); timer.textContent = secs; if (secs > 80) fail(); }
    }, 30);
  }

  // ------------------------------------------------------------------ S10 The Manifests and the Payout
  renderS10(d) {
    const st = this.s();
    if (!st.order) { st.order = [3, 0, 5, 1, 4, 2]; st.match = {}; }
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    if (!st.sorted) {
      sec.innerHTML = '<h3>Passenger cards</h3>';
      st.order.forEach((ci, i) => {
        const [seat, name] = d.cards[ci];
        const r = this._row(sec, `<span class="seq-label">Seat ${seat}: ${esc(name)}</span>`);
        r.appendChild(this._btn('▲', () => { if (i) { [st.order[i - 1], st.order[i]] = [st.order[i], st.order[i - 1]]; this.render(); } }));
        r.appendChild(this._btn('▼', () => { if (i < st.order.length - 1) { [st.order[i + 1], st.order[i]] = [st.order[i], st.order[i + 1]]; this.render(); } }));
      });
      sec.appendChild(this._btn('These are in seat order', () => { if (st.order.every((ci, i) => ci === i)) { st.sorted = true; this.spend(5); this.render(); } else this.msg(d.wrongOrder); }, 'primary'));
      this.body.appendChild(sec);
      return;
    }
    sec.innerHTML = '<h3>Match each passenger to a death certificate</h3>';
    d.cards.forEach(([seat, name]) => {
      const r = this._row(sec, `<span class="seq-label">Seat ${seat}: ${esc(name)}</span>`);
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">choose...</option>${[...d.certs, d.none].map((c) => `<option ${st.match[seat] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
      sel.addEventListener('change', () => { st.match[seat] = sel.value; });
      sel.addEventListener('keydown', (e) => e.stopPropagation());
      r.appendChild(sel);
    });
    this.body.appendChild(sec);
    const extra = document.createElement('div');
    extra.className = 'seq-section';
    extra.innerHTML = `<p>${esc(d.payout)}</p><p>${esc(d.receipt)}</p><h3>${esc(d.question)}</h3>`;
    if (!this.solved('S10')) for (const [seat, name] of d.cards) extra.appendChild(this._btn(`Seat ${seat}`, () => {
      const ok = d.cards.every(([s2, n2]) => (s2 === d.answer ? st.match[s2] === d.none : !!st.match[s2] && st.match[s2] !== d.none && n2.startsWith(st.match[s2])));
      if (!ok) return this.msg(d.wrongMatch);
      if (seat !== d.answer) return this.msg(d.wrongMatch);
      this.solve('S10');
      this.render();
      this.msg(d.done, true);
    }));
    this.body.appendChild(extra);
  }

  // ------------------------------------------------------------------ S20 The Last Call (wax cylinder)
  renderS20(d) {
    const st = this.s();
    st.at ??= 0;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const mmss = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
    sec.innerHTML = `<label class="seq-slider">Needle: <b>${mmss(st.at)}</b><input type="range" min="0" max="${d.length}" step="1" value="${st.at}"></label><p class="seq-text">${esc(st.heard ?? 'Scrub to a moment, then listen.')}</p>`;
    const inp = sec.querySelector('input');
    inp.addEventListener('input', () => { st.at = +inp.value; sec.querySelector('b').textContent = mmss(st.at); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    sec.appendChild(this._btn('Listen here', () => {
      const seg = d.segments.find(([a, b]) => st.at >= a && st.at < b) ?? d.segments[d.segments.length - 1];
      this._hiss(2.5, seg[2] === 'VOICE' ? 0.04 : 0.1, st.at >= 60 && st.at < 158);
      if (seg[2] === 'VOICE') { st.heard = `${d.voice.speaker}: "${d.voice.text}"`; }
      else st.heard = seg[2];
      this.spend(1);
      this.render();
    }));
    if (!st.marked) sec.appendChild(this._btn(d.markLabel, () => {
      const seg = d.segments.find(([a, b]) => st.at >= a && st.at < b);
      if (seg?.[2] !== 'VOICE') return this.msg(d.wrongMark);
      st.marked = true;
      this.render();
    }, 'primary'));
    this.body.appendChild(sec);
    if (!st.marked || this.solved('S20')) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    d.options.forEach((o, i) => q.appendChild(this._btn(o, () => {
      if (i !== d.answer) return this.msg(d.wrong);
      this.solve('S20');
      this.render();
      this.msg(d.done, true);
    })));
    this.body.appendChild(q);
  }

  /** Surface noise of an old wax cylinder (and an engine drone in the middle of the call). */
  _hiss(secs, level, engine) {
    const ctx = this.audio?.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.linearRampToValueAtTime(0, t + secs);
    n.connect(bp).connect(g).connect(this.audio.master);
    n.start(t);
    n.stop(t + secs);
    if (engine) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90, t);
      o.frequency.linearRampToValueAtTime(140, t + secs);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.04, t);
      og.gain.linearRampToValueAtTime(0, t + secs);
      o.connect(og).connect(this.audio.master);
      o.start(t);
      o.stop(t + secs);
    }
  }

  // ------------------------------------------------------------------ S22 The Locked Case (pin tumblers)
  renderS22(d) {
    const st = this.s();
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    if (st.open) {
      sec.innerHTML = `<p class="seq-text">${esc(d.contents)}</p>`;
      this.body.appendChild(sec);
      if (!this.solved('S22')) { this.solve('S22'); this.msg(d.done, true); }
      return;
    }
    if (!st.route) {
      for (const r of d.routes) sec.appendChild(this._btn(r.label, () => {
        if (r.id === 'ask') {
          this.spend(3);
          if (this.trust.get('lindqvist') < r.trustNeeded) return this.msg(r.no);
          st.open = 'ask';
        } else if (r.id === 'warrant') { this.spend(r.minutes); st.open = 'warrant'; }
        else { st.route = 'pick'; st.set = []; st.picks = d.picks; st.tension = 'light'; this.trust.change('lindqvist', -10); }
        this.render();
        this.msg(r.ok, true);
      }));
      this.body.appendChild(sec);
      return;
    }
    // picking
    sec.innerHTML = `<h3>Tension</h3>`;
    for (const tn of d.tension) sec.appendChild(this._btn(tn, () => { st.tension = tn; this.render(); }, st.tension === tn ? 'on' : ''));
    sec.insertAdjacentHTML('beforeend', `<h3>Pins (picks left: ${st.picks})</h3>`);
    const pins = document.createElement('div');
    pins.className = 'seq-pins';
    for (let p = 1; p <= d.pins; p++) {
      const set = st.set.includes(p);
      pins.appendChild(this._btn(set ? `pin ${p} ✓` : `pin ${p}`, () => {
        if (set || st.picks <= 0) return;
        this.spend(1);
        if (st.tension === 'heavy') { st.picks--; st.set = []; this.audio?.click(); this.render(); return this.msg(st.picks > 0 ? d.broke : d.outOfPicks); }
        if (d.order[st.set.length] === p) {
          st.set.push(p);
          this.audio?.click();
          if (st.set.length === d.pins) { st.open = 'pick'; this.render(); return; }
          this.render();
          return this.msg(d.binding, true);
        }
        this.msg(d.springy);
      }, set ? 'on' : ''));
    }
    sec.appendChild(pins);
    if (st.picks <= 0) sec.appendChild(this._btn('Try another way', () => { st.route = null; this.render(); }));
    this.body.appendChild(sec);
  }

  // ------------------------------------------------------------------ S7 Readied for Flight
  renderS7(d) {
    const st = this.s();
    st.seen ??= [];
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    for (const it of d.items) {
      const r = this._row(sec, `<span class="seq-label">${esc(it.name)}</span>`);
      if (st.seen.includes(it.id)) r.insertAdjacentHTML('beforeend', `<div class="seq-text">${esc(it.text)}</div>`);
      else r.appendChild(this._btn('Look', () => { st.seen.push(it.id); this.spend(2); for (const [f, src] of it.sources ?? []) this.evidence.add(f, src); this.render(); }));
    }
    this.body.appendChild(sec);
    if (this.solved('S7')) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    d.options.forEach((o, i) => q.appendChild(this._btn(o, () => {
      if (st.seen.length < d.items.length) return this.msg(d.needAll);
      if (i !== d.answer) return this.msg(d.wrong);
      this.solve('S7'); this.render(); this.msg(d.done, true);
    })));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S11 Raking Light
  renderS11(d) {
    const st = this.s();
    st.read ??= {};
    st.angle ??= 90;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    sec.innerHTML = `<label class="seq-slider">Lamp angle: <b>${st.angle}°</b><input type="range" min="0" max="180" value="${st.angle}"></label><div class="seq-char"></div>`;
    const inp = sec.querySelector('input'), board = sec.querySelector('.seq-char');
    const draw = () => {
      board.replaceChildren();
      d.sheets.forEach((sh, si) => {
        const div = document.createElement('div');
        div.className = 'seq-sheet';
        div.innerHTML = `<b>${esc(sh.name)}</b>`;
        sh.lines.forEach(([txt, ang], li) => {
          const k = `${si}.${li}`;
          const near = Math.abs(st.angle - ang) <= d.tolerance;
          if (near) st.read[k] = true;
          const p2 = document.createElement('p');
          p2.textContent = near || st.read[k] ? txt : txt.replace(/[^ ]/g, '▒');
          p2.style.opacity = near ? 1 : st.read[k] ? 0.75 : 0.35;
          div.appendChild(p2);
        });
        board.appendChild(div);
      });
      sec.querySelector('b').textContent = `${st.angle}°`;
    };
    inp.addEventListener('input', () => { st.angle = +inp.value; draw(); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    draw();
    this.body.appendChild(sec);
    const total = d.sheets.reduce((a, sh) => a + sh.lines.length, 0);
    if (this.solved('S11')) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    d.options.forEach((o, i) => q.appendChild(this._btn(o, () => {
      if (Object.keys(st.read).length < total) return this.msg(`Read every line first (${Object.keys(st.read).length} of ${total}).`);
      this.spend(5);
      if (i !== d.answer) return this.msg(d.wrong);
      this.solve('S11'); this.render(); this.msg(d.done, true);
    })));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S12 The Blackout (load balancing)
  renderS12(d) {
    const st = this.s();
    st.on ??= {};
    const load = [0, 0];
    for (const c of d.circuits) if (st.on[c.id] != null) load[st.on[c.id]] += c.load;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    sec.innerHTML = `<h3>Generator 1: ${load[0]} of ${d.caps[0]} &nbsp; · &nbsp; Generator 2: ${load[1]} of ${d.caps[1]}</h3>`;
    for (const c of d.circuits) {
      const r = this._row(sec, `<span class="seq-label">${esc(c.name)} (${c.load})${c.must ? ' *' : ''}</span>`);
      for (const [lbl, v] of [['Off', null], ['Generator 1', 0], ['Generator 2', 1]]) {
        if (this.solved('S12')) continue;
        r.appendChild(this._btn(lbl, () => { if (v == null) delete st.on[c.id]; else st.on[c.id] = v; this.render(); }, (st.on[c.id] ?? null) === v ? 'on' : ''));
      }
    }
    this.body.appendChild(sec);
    if (this.solved('S12')) { this.body.insertAdjacentHTML('beforeend', `<p class="seq-text">${esc(d.observe)}</p>`); return; }
    this.body.appendChild(this._btn('Throw the main switch', () => {
      this.spend(5);
      if (load[0] > d.caps[0] || load[1] > d.caps[1]) return this.msg(d.over);
      if (d.circuits.some((c) => c.must && st.on[c.id] == null)) return this.msg(d.missing);
      this.solve('S12'); this.render(); this.msg(d.done, true);
    }, 'primary'));
  }

  // ------------------------------------------------------------------ S13 The Cracked Mount (dye penetrant)
  renderS13(d) {
    const st = this.s();
    st.done ??= {};
    st.step ??= {};
    const crackSvg = (kind) => kind === 'crack'
      ? '<svg width="140" height="60"><rect width="140" height="60" fill="#eeeae0"/><path d="M20 40 L45 30 L52 38 L70 22 L78 30 L96 14 M52 38 L60 50 M78 30 L90 40" stroke="#b01818" stroke-width="2" fill="none"/></svg>'
      : kind === 'straight' ? '<svg width="140" height="60"><rect width="140" height="60" fill="#eeeae0"/><path d="M10 20 H130 M10 28 H130 M10 36 H130" stroke="#c84040" stroke-width="1" fill="none"/></svg>'
        : '<svg width="140" height="60"><rect width="140" height="60" fill="#eeeae0"/></svg>';
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    for (const m of d.mounts) {
      const r = this._row(sec, `<span class="seq-label">${esc(m)}</span>`);
      const at = st.step[m] ?? 0;
      if (at >= d.steps.length) { r.insertAdjacentHTML('beforeend', crackSvg(d.patterns[m])); continue; }
      // the four steps in a scrambled row: pressing them in the wrong order smears the test
      [2, 0, 3, 1].forEach((si) => r.appendChild(this._btn(d.steps[si], () => {
        this.spend(si === 1 ? 5 : 1);
        if (si !== at) { st.step[m] = 0; this.render(); return this.msg(d.wrongStep); }
        st.step[m] = at + 1;
        this.render();
      }, si < at ? 'on' : '')));
    }
    this.body.appendChild(sec);
    if (this.solved('S13') || !d.mounts.every((m) => (st.step[m] ?? 0) >= d.steps.length)) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3>`;
    for (const m of d.mounts) q.appendChild(this._btn(m, () => {
      if (d.patterns[m] !== 'crack') return this.msg(d.wrong);
      this.solve('S13'); this.render(); this.msg(`${d.ox} ${d.done}`, true);
    }));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S16 The Night Burn (dial gauges)
  renderS16(d) {
    const st = this.s();
    st.read ??= {};
    const dial = (v) => {
      const a = -135 + (v / 500) * 270, rad = (a - 90) * Math.PI / 180;
      const ticks = Array.from({ length: 11 }, (_, i) => { const t = (-135 + i * 27 - 90) * Math.PI / 180; return `<line x1="${50 + Math.cos(t) * 36}" y1="${50 + Math.sin(t) * 36}" x2="${50 + Math.cos(t) * 44}" y2="${50 + Math.sin(t) * 44}" stroke="#2a2116"/><text x="${50 + Math.cos(t) * 28}" y="${53 + Math.sin(t) * 28}" font-size="7" text-anchor="middle">${i * 50}</text>`; }).join('');
      return `<svg width="110" height="110" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#f4ecda" stroke="#2a2116" stroke-width="2"/>${ticks}<line x1="50" y1="50" x2="${50 + Math.cos(rad) * 38}" y2="${50 + Math.sin(rad) * 38}" stroke="#8a1010" stroke-width="2"/><circle cx="50" cy="50" r="3"/></svg>`;
    };
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const t = document.createElement('table');
    t.className = 'seq-grid';
    t.innerHTML = '<tr><th>Tank</th><th>Gauge</th><th>Your reading</th><th>Yesterday</th></tr>';
    for (const k of d.tanks) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(k.name)}</td><td>${dial(k.now)}</td><td></td><td>${k.yesterday}</td>`;
      if (st.read[k.id] != null) tr.children[2].textContent = `${st.read[k.id]} gal`;
      else {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'seq-num';
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        tr.children[2].appendChild(inp);
        tr.children[2].appendChild(this._btn('Write it down', () => {
          this.spend(2);
          if (Math.abs(Number(inp.value) - k.now) > 4) return this.msg(d.wrongRead);
          st.read[k.id] = k.now;
          this.render();
        }));
      }
      t.appendChild(tr);
    }
    sec.appendChild(t);
    sec.insertAdjacentHTML('beforeend', `<p class="seq-text">${esc(d.log)}</p>`);
    this.body.appendChild(sec);
    if (this.solved('S16') || Object.keys(st.read).length < d.tanks.length) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<h3>${esc(d.question)}</h3><label>Tank <select class="tk">${d.tanks.map((k) => `<option>${k.id}</option>`).join('')}</select></label> <label>Gallons <input type="number" class="seq-num gal"></label>`;
    q.querySelector('.gal').addEventListener('keydown', (e) => e.stopPropagation());
    q.appendChild(this._btn('That\'s it', () => {
      const tk = q.querySelector('.tk').value, g = Number(q.querySelector('.gal').value);
      if (tk !== d.answer[0] || g !== d.answer[1]) return this.msg(d.wrong);
      this.solve('S16'); this.render(); this.msg(d.done, true);
    }, 'primary'));
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S19 The Barograph Overlay
  renderS19(d) {
    const st = this.s();
    st.x ??= 0;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    const trace = 'M0 30 L60 32 L110 31 L150 34 L175 70 L190 95 L215 92 L250 60 L300 40 L360 36';
    sec.innerHTML = `<p class="seq-text">${esc(d.report)}</p>
      <svg width="380" height="120" viewBox="0 0 380 120" class="seq-baro"><rect width="380" height="120" fill="#f4ecda"/>
      ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 30}" y1="0" x2="${i * 30}" y2="120" stroke="#d8c8a0"/>`).join('')}
      <path d="M0 32 L380 32" stroke="#2a2116" stroke-width="2"/>
      <g transform="translate(${st.x - d.offset} 0)" opacity="0.75"><path d="${trace}" stroke="#8a1010" stroke-width="2" fill="none"/>${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 30}" y1="108" x2="${i * 30}" y2="120" stroke="#8a1010" stroke-width="2"/>`).join('')}</g>
      ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 30}" y1="108" x2="${i * 30}" y2="120" stroke="#2a2116"/>`).join('')}</svg>
      <label class="seq-slider">Slide the tracing: <input type="range" min="0" max="80" value="${st.x}"></label>`;
    const inp = sec.querySelector('input');
    inp.addEventListener('input', () => { st.x = +inp.value; sec.querySelector('g').setAttribute('transform', `translate(${st.x - d.offset} 0)`); });
    inp.addEventListener('change', () => { if (Math.abs(st.x - d.offset) <= d.tolerance && !st.aligned) { st.aligned = true; this.spend(5); this.render(); this.msg(d.aligned, true); } });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    this.body.appendChild(sec);
    if (!st.aligned || this.solved('S19')) return;
    const q = document.createElement('div');
    q.className = 'seq-section';
    q.innerHTML = `<p>${esc(d.reportE)}</p><h3>${esc(d.question)}</h3>`;
    d.samples.forEach(([name, txt], i) => {
      const r = this._row(q, `<span class="seq-label">${esc(name)}</span><span class="seq-text">${esc(txt)}</span>`);
      r.appendChild(this._btn('This one', () => { if (i !== d.answer) return this.msg(d.wrong); this.solve('S19'); this.render(); this.msg(d.done, true); }));
    });
    this.body.appendChild(q);
  }

  // ------------------------------------------------------------------ S21 The Stakeout (binoculars at dusk)
  renderS21(d) {
    const st = this.s();
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    if (this.state.data.minutes < parseTime(d.from) && !this.solved('S21')) {
      sec.innerHTML = `<p>${esc(d.early)}</p>`;
      sec.appendChild(this._btn(d.waitLabel, () => { this.spend(parseTime(d.from) - this.state.data.minutes); this.render(); }));
      this.body.appendChild(sec);
      return;
    }
    st.pan ??= 20;
    sec.innerHTML = `<p>${esc(d.scan)}</p><div class="seq-bino"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><rect width="100" height="40" fill="#1a1612"/>
      <path d="M0 26 Q50 6 100 26 L100 40 L0 40Z" fill="#2c2620"/><rect x="${d.vent - 2}" y="13" width="4" height="2" fill="#3a3028"/>
      <circle class="glow" cx="${d.vent}" cy="14" r="2.4" fill="#ffcf70" opacity="0"/></svg><div class="lens"></div></div>
      <label class="seq-slider">Pan: <input type="range" min="0" max="100" value="${st.pan}"></label>`;
    const svg = sec.querySelector('svg'), lens = sec.querySelector('.lens'), inp = sec.querySelector('input'), glow = sec.querySelector('.glow');
    const place = () => { svg.style.transform = `translateX(${(50 - st.pan) * 4}%) scale(4)`; };
    inp.addEventListener('input', () => { st.pan = +inp.value; place(); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    place();
    let t0 = performance.now();
    clearInterval(this._glowT);
    this._glowT = setInterval(() => {
      if (!this.open || this.id !== 'S21') { clearInterval(this._glowT); return; }
      const t = ((performance.now() - t0) / 1000) % 6;
      glow.setAttribute('opacity', t > 3.5 ? String(0.9 * Math.sin(((t - 3.5) / 2.5) * Math.PI)) : '0');
    }, 50);
    this.body.appendChild(sec);
    if (this.solved('S21')) return;
    this.body.appendChild(this._btn(d.spot, () => {
      this.spend(2);
      const lit = Number(glow.getAttribute('opacity')) > 0.25;
      if (!lit || Math.abs(st.pan - d.vent) > d.window) return this.msg(d.miss);
      this.evidence.note(d.seeds);
      this.solve('S21'); this.render(); this.msg(`${d.done} ${d.seeds}`, true);
    }, 'primary'));
    void lens;
  }

  // ------------------------------------------------------------------ S24 Tamsin's Shorthand (keyword cipher)
  renderS24(d) {
    const st = this.s();
    st.key ??= '';
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const keyed = (w) => [...new Set((w.toUpperCase().replace(/[^A-Z]/g, '') + A).split(''))].join('');
    const decode = (w) => { const k = keyed(w); return d.cipher.split('').map((c) => (A.includes(c) ? A[k.indexOf(c)] : c)).join(''); };
    const counts = {};
    for (const c of d.cipher) if (A.includes(c)) counts[c] = (counts[c] ?? 0) + 1;
    const sec = document.createElement('div');
    sec.className = 'seq-section';
    sec.innerHTML = `<p class="seq-cipher">${esc(d.cipher)}</p><p class="seq-dim">Letter counts: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join('  ')}</p><p class="seq-dim">${esc(d.hint)}</p>
      <label class="seq-slider">Keyword: <input type="text" maxlength="14" value="${esc(st.key)}"></label><p class="seq-cipher plain"></p>`;
    const inp = sec.querySelector('input'), out = sec.querySelector('.plain');
    const show = () => { out.textContent = st.key ? decode(st.key) : '...'; };
    inp.addEventListener('input', () => { st.key = inp.value; show(); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    show();
    this.body.appendChild(sec);
    if (this.solved('S24')) return;
    this.body.appendChild(this._btn('That reads right', () => {
      this.spend(5);
      if (decode(st.key) !== d.plain) return this.msg(d.wrong);
      this.solve('S24'); this.render(); this.msg(d.done, true);
    }, 'primary'));
  }

  // ------------------------------------------------------------------ S26 The Board and the Theory
  renderS26() {
    const d = this.finale.S26;
    const st = this.s('S26');
    const unlocked = d.unlock.every((f) => this.evidence.sources(f).length > 0);
    const names = { clementine: unlocked ? d.clementineName : d.hiddenName };
    for (const c of this.characters ?? []) if (!names[c.id]) names[c.id] = c.name;
    this.el.querySelector('.seq-title').textContent = `S26 · ${d.title}`;
    this.body.firstChild.textContent = this.solved('S26') ? d.filed : d.intro;
    const pick = (key, label, options) => {
      const sec = document.createElement('div');
      sec.className = 'seq-section';
      sec.innerHTML = `<h3>${label}</h3>`;
      for (const [id, text] of options) {
        const locked = key === 'who' && id === 'clementine' && !unlocked;
        sec.appendChild(this._btn(text, () => { if (locked) return this.msg('You don\'t know who that is yet.'); st[key] = id; this.render(); }, st[key] === id ? 'on' : ''));
      }
      this.body.appendChild(sec);
    };
    pick('who', 'Who', d.who.map((id) => [id, names[id] ?? id]));
    pick('how', 'How', d.how);
    pick('where', 'Where they came from', d.where);
    pick('why', 'Why', d.why);
    if (this.solved('S26')) return;
    this.body.appendChild(this._btn('Type it up and file it', () => {
      if (!st.who || !st.how || !st.where || !st.why) return this.msg('Fill in all four first.');
      const a = d.answer;
      if (st.who !== a.who) {
        if (st.confirmWrong !== st.who) { st.confirmWrong = st.who; return this.msg(`${d.wrongWho} (Press again to file it.)`); }
        this.close();
        this.msg(d.wrongFiled);
        return this.onWrongTheory?.(st.who);
      }
      if (st.how !== a.how || st.where !== a.where || st.why !== a.why) return this.msg("That doesn't hold together, Chief. Look at the board again.");
      const missing = [a.how, a.where, a.why].filter((f) => !this.evidence.isEstablished(f));
      if (missing.length) return this.msg(d.notEstablished + missing.map((f) => this.evidence.byId.get(f).name).join('; '));
      this.spend(15);
      this.solve('S26');
      this.state.setFlag('theoryFiled');
      this.render();
      this.msg(d.filed, true);
    }, 'primary'));
  }

  /** The music box: each comb tooth is a note; the tune lights the teeth as it plays. */
  playTune(tune, teeth) {
    if (this._playing) return;
    this._playing = true;
    tune.forEach((n, i) => setTimeout(() => {
      this.bell(n, 0.9);
      const el = teeth?.querySelector(`[data-n="${n}"]`);
      el?.classList.add('lit');
      setTimeout(() => el?.classList.remove('lit'), 380);
      if (i === tune.length - 1) setTimeout(() => { this._playing = false; }, 600);
    }, i * 520));
  }

  bell(n, len = 0.8) {
    const ctx = this.audio?.ctx;
    if (!ctx) return;
    const scale = [0, 2, 3, 5, 7, 8, 10, 12]; // a minor scale: tooth 1 is the lowest
    const f = 440 * 2 ** ((scale[n - 1] + 3) / 12) * 2;
    const t = ctx.currentTime;
    for (const [mul, lvl] of [[1, 0.12], [3.01, 0.03]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(this.audio.master);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }
}
