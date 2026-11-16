const SAVE_KEY = 'marigold-silence.save.v1';
// A second copy on disk, kept by the dev server (vite.config.js): saves/save.json in the game folder.
// The browser's own storage can be wiped (private windows, cleared site data, the in-app browser
// being restarted), so on start the game loads whichever copy is newer.
const SAVE_URL = '/__save';

export function parseTime(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The whole game state as one JSON object (bible 13.4): clock, flags, clues,
 * items, open/closed objects, player position. Saved after every action and every few seconds:
 * to the browser (localStorage) at once, and to saves/save.json on disk a moment later.
 */
export class GameState {
  constructor(config) {
    this.start = parseTime(config.clock.start);
    this.end = parseTime(config.clock.end);
    this.data = this._fresh();
  }

  _fresh() {
    return {
      version: 1, minutes: this.start, flags: {}, clues: [], items: [], open: {}, player: null,
      solved: [],              // puzzles solved (addendum G: evidence only comes from these)
      hints: {},               // puzzle id -> hint level Danny has given (0..3)
      reportsRead: [],
      visited: [],             // place ids you have been to (for board place cards and the map)
      board: { cards: {}, links: [], notes: [] },
      cole: { follow: false },
      reminders: [],
      found: {},               // finding id -> its sources (v4 evidence model)
      notes: [],               // things you noticed (notebook)
      seq: {},                 // progress inside each investigation sequence
      examined: [],            // things examined in the office
      trust: {},               // person id -> trust 0..100
      heard: {}, shown: {},    // topics heard, evidence shown, per person
      smoke: { until: 0, seen: [] },
      underground: false,
      ending: null,
    };
  }

  _apply(d) {
    const fresh = this._fresh();
    this.data = { ...fresh, ...d, board: { ...fresh.board, ...(d.board || {}) }, cole: { ...fresh.cole, ...(d.cole || {}) } };
  }

  _readLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return d?.version === 1 ? d : null;
    } catch { return null; }
  }

  /** The browser's copy only (synchronous). */
  load() {
    const d = this._readLocal();
    if (!d) return false;
    this._apply(d);
    return true;
  }

  /** The newer of the browser's copy and the disk copy. Returns true if there was a save. */
  async loadBest() {
    const local = this._readLocal();
    let disk = null;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(SAVE_URL, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) { const d = await r.json(); if (d?.version === 1) disk = d; }
    } catch { /* no dev server (a built copy), or it is slow: use the browser's copy */ }
    const best = !disk ? local : !local ? disk : ((disk.savedAt ?? 0) > (local.savedAt ?? 0) ? disk : local);
    if (!best) return false;
    this._apply(best);
    if (best === disk) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(best)); } catch { /* storage unavailable */ } }
    return true;
  }

  save() {
    if (this.locked) return; // erased: nothing may write the old game back
    this.data.savedAt = Date.now();
    this._json = JSON.stringify(this.data);
    try { localStorage.setItem(SAVE_KEY, this._json); } catch { /* storage unavailable */ }
    // to disk straight away, but at most once a second (a tab closed without warning loses ~1 s at most)
    const wait = 1000 - (Date.now() - (this._diskAt ?? 0));
    if (wait <= 0) this._toDisk(false);
    else if (!this._diskTimer) this._diskTimer = setTimeout(() => { this._diskTimer = null; this._toDisk(false); }, wait);
  }

  /** Send the latest save to disk right now (closing the tab, switching away). */
  flush() {
    clearTimeout(this._diskTimer);
    this._diskTimer = null;
    this._toDisk(true);
  }

  _toDisk(closing) {
    const json = this._json;
    if (this.locked || !json || json === this._diskSent) return;
    this._diskSent = json;
    this._diskAt = Date.now();
    try {
      // while the page is closing only sendBeacon is sure to get through
      if (closing && navigator.sendBeacon?.(SAVE_URL, new Blob([json], { type: 'application/json' }))) return;
      fetch(SAVE_URL, { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: json.length < 60000 }).catch(() => { this._diskSent = null; });
    } catch { this._diskSent = null; }
  }

  /** Start over: wipes both copies. Wait for it before reloading the page. */
  async erase() {
    this.locked = true;
    clearTimeout(this._diskTimer);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
    this.data = this._fresh();
    try { await fetch(SAVE_URL, { method: 'DELETE' }); } catch { /* no dev server */ }
  }

  /** Moves the clock forward; returns the minutes actually spent. */
  advance(min) {
    const before = this.data.minutes;
    this.data.minutes = Math.min(this.end, before + min);
    return this.data.minutes - before;
  }

  clockLabel() { return formatTime(this.data.minutes); }

  hasClue(id) { return this.data.clues.some((c) => c.id === id); }
  addClue(id) {
    if (this.hasClue(id)) return false;
    this.data.clues.push({ id, at: this.data.minutes });
    return true;
  }

  isSolved(pid) { return this.data.solved.includes(pid); }
  /** Solving a puzzle is the only way to earn evidence. Returns the newly earned clue ids. */
  solvePuzzle(pid, clueIds = []) {
    if (!this.isSolved(pid)) this.data.solved.push(pid);
    return clueIds.filter((id) => this.addClue(id));
  }

  visit(placeId) {
    if (this.data.visited.includes(placeId)) return false;
    this.data.visited.push(placeId);
    return true;
  }

  hasItem(id) { return this.data.items.includes(id); }
  addItem(id) { if (!this.hasItem(id)) this.data.items.push(id); }

  flag(name) { return !!this.data.flags[name]; }
  setFlag(name, v = true) { this.data.flags[name] = v; }

  isOpen(id) { return !!this.data.open[id]; }
  setOpen(id, v) { this.data.open[id] = v; }

  /** Requirements like "flag:x", "item:x", "clue:x", "open:x"; prefix "!" to negate. */
  check(reqs = []) {
    return reqs.every((r) => {
      const neg = r.startsWith('!');
      const [kind, id] = (neg ? r.slice(1) : r).split(':');
      let ok = false;
      if (kind === 'flag') ok = this.flag(id);
      else if (kind === 'item') ok = this.hasItem(id);
      else if (kind === 'clue') ok = this.hasClue(id);
      else if (kind === 'open') ok = this.isOpen(id);
      return neg ? !ok : ok;
    });
  }
}
