/**
 * The evidence model (v4 section 4, v3 section 1): FINDINGS are facts about the case. Each one
 * needs independent SOURCES: a solved investigation sequence (S1...), a document, or someone's
 * testimony. With enough sources (usually three) a finding is ESTABLISHED and goes up on the
 * board. Observations (small things you notice) go in the notebook.
 *
 * state.data.found = { F01: ['S1', 'billie'], ... }
 */
export class Evidence {
  constructor({ state, data, hud, onEstablished }) {
    this.state = state;
    this.findings = data.findings;
    this.byId = new Map(this.findings.map((f) => [f.id, f]));
    this.hud = hud;
    this.onEstablished = onEstablished;
    this.state.data.found ??= {};
    this.state.data.notes ??= [];
  }

  sources(fid) { return this.state.data.found[fid] ?? []; }

  isEstablished(fid) {
    const f = this.byId.get(fid);
    return !!f && this.sources(fid).length >= f.need;
  }

  /** Add a source to a finding. Returns 'new', 'established' or null (already had it). */
  add(fid, source, quiet = false) {
    const f = this.byId.get(fid);
    if (!f) return null;
    const list = (this.state.data.found[fid] ??= []);
    if (list.includes(source)) return null;
    const was = this.isEstablished(fid);
    list.push(source);
    const now = this.isEstablished(fid);
    if (now && !was) {
      if (!this.state.data.clues.some((c) => c.id === fid)) this.state.data.clues.push({ id: fid, t: this.state.data.minutes });
      if (!quiet) this.hud.toast(`Established: ${f.name}`);
      this.onEstablished?.(fid);
      this.state.save();
      return 'established';
    }
    if (!quiet) this.hud.toast(`New lead: ${f.name} (${list.length} of ${f.need})`);
    this.state.save();
    return 'new';
  }

  addMany(pairs) { for (const [fid, src] of pairs) this.add(fid, src); }

  /** Something the player noticed: kept in the notebook (and never repeated). */
  note(text) {
    if (this.state.data.notes.includes(text)) return false;
    this.state.data.notes.push(text);
    this.state.save();
    return true;
  }

  /** Findings the player knows something about (for "present evidence"). */
  known() {
    return this.findings.filter((f) => this.sources(f.id).length > 0);
  }
}
