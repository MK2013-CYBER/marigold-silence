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
    const d = this.data[id];
    for (const [fid, src] of d.sources ?? []) this.evidence.add(fid, src);
    this.state.save();
    this.onSolved?.(id);
  }

  render() {
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
