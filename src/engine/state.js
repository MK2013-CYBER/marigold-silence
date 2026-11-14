const SAVE_KEY = 'marigold-silence.save.v1';

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
 * items, open/closed objects, player position. Saved to localStorage after
 * every action.
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
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d?.version !== 1) return false;
      const fresh = this._fresh();
      this.data = { ...fresh, ...d, board: { ...fresh.board, ...(d.board || {}) }, cole: { ...fresh.cole, ...(d.cole || {}) } };
      return true;
    } catch {
      return false;
    }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  erase() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
    this.data = this._fresh();
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
