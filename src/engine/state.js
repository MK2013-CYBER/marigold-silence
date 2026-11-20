const SAVE_KEY = 'marigold-silence.save.v1';
// A second copy on disk, kept by the dev server (vite.config.js): saves/save.json in the game folder.
// The browser's own storage can be wiped (private windows, cleared site data, the in-app browser
// being restarted), so on start the game loads whichever copy is newer.
const SAVE_URL = '/__save';
// That disk copy only exists while the game runs from this Mac's dev server (npm run dev). The
// published game (npm run build, e.g. on Cloudflare) saves in the player's browser only, and never
// asks for it.
const DISK = import.meta.env.DEV;
// Several copies of the game can be open at once (two browser tabs, the app's browser pane).
// Each one is a "tab" with its own id. A tab only writes once you actually play in it, and it never
// overwrites progress another tab saved after the save it started from: it reloads that instead.
const TAB = Math.random().toString(36).slice(2, 10);
const content = (d) => JSON.stringify({ ...d, savedAt: undefined, writer: undefined });

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
    this.tab = TAB;
    this.idle = true; // true until you play in this tab (main.js enter()): an idle tab never writes
    this.startBase = 0; // savedAt of the save this tab loaded
    this.base = 0;      // savedAt of the save this tab is built on (the one it loaded, then its own)
    this.stale = false;
    this.onStale = null; // another tab has newer progress: main.js reloads the page
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
    if (DISK) try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(SAVE_URL, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) { const d = await r.json(); if (d?.version === 1) disk = d; }
    } catch { /* no dev server (a built copy), or it is slow: use the browser's copy */ }
    const best = !disk ? local : !local ? disk : ((disk.savedAt ?? 0) > (local.savedAt ?? 0) ? disk : local);
    if (!best) return false;
    this._apply(best);
    this.base = this.startBase = best.savedAt ?? 0;
    this._content = content(this.data);
    if (best === disk) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(best)); } catch { /* storage unavailable */ } }
    return true;
  }

  /** Is there a save from another tab, newer than the one this tab is built on? */
  _newerElsewhere(d) { return !!d && d.writer !== this.tab && (d.savedAt ?? 0) > this.base; }

  /**
   * This tab is out of date. If the disk refused it, the disk has the real game: put that in this
   * browser's storage too, so the old copy this tab just wrote there can't win when it reloads.
   */
  async _goStale(fromDisk = false) {
    if (this.stale) return;
    this.stale = true;
    clearTimeout(this._diskTimer);
    if (fromDisk && DISK) {
      try {
        const r = await fetch(SAVE_URL, { cache: 'no-store' });
        if (r.ok) localStorage.setItem(SAVE_KEY, await r.text());
      } catch { /* storage or server unavailable */ }
    }
    this.onStale?.();
  }

  /** Called when this tab comes back into view: has another tab moved the game on meanwhile? */
  async checkNewer() {
    if (this.locked || this.stale) return;
    if (this._newerElsewhere(this._readLocal())) return this._goStale();
    if (!DISK) return;
    try {
      const r = await fetch(SAVE_URL, { cache: 'no-store' });
      if (r.ok && this._newerElsewhere(await r.json())) this._goStale(true);
    } catch { /* no dev server */ }
  }

  save() {
    if (this.locked || this.stale) return; // erased, or out of date: nothing may write an old game back
    if (this.idle) return; // you haven't played in this tab: it has nothing new to save
    const c = content(this.data);
    if (c === this._content) return; // nothing changed since the last save
    if (this._newerElsewhere(this._readLocal())) return this._goStale(); // another tab in this browser saved since
    this._content = c;
    this.data.savedAt = Math.max(Date.now(), this.base + 1);
    this.data.writer = this.tab;
    this.base = this.data.savedAt;
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
    if (!DISK || this.locked || !json || json === this._diskSent) return;
    this._diskSent = json;
    this._diskAt = Date.now();
    try {
      // while the page is closing only sendBeacon is sure to get through
      // the server refuses (409) if another tab saved newer progress after the save this one is built on
      const url = `${SAVE_URL}?base=${this.startBase}`;
      if (closing && navigator.sendBeacon?.(url, new Blob([json], { type: 'application/json' }))) return;
      fetch(url, { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: json.length < 60000 })
        .then((r) => { if (r.status === 409) this._goStale(true); })
        .catch(() => { this._diskSent = null; });
    } catch { this._diskSent = null; }
  }

  /** Start over: wipes both copies. Wait for it before reloading the page. */
  async erase() {
    this.locked = true;
    clearTimeout(this._diskTimer);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
    this.data = this._fresh();
    if (DISK) try { await fetch(SAVE_URL, { method: 'DELETE' }); } catch { /* no dev server */ }
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
