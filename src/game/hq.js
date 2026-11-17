import { parseTime } from '../engine/state.js';
import { DialogueBox } from '../ui/dialogue.js';
import { InvestigationBoard } from '../ui/board.js';
import { CaseFileScreen, ReportsScreen, TimelineScreen } from '../ui/screens.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * The Investigator's Shed and Agent Danny Cole (addendum v2, sections C, D, G):
 * HQ screens (board, reports, case file, timeline), the cot, the typewriter, Danny's
 * conversation with three-level hints, walkie-talkie calls, clock reminders and his
 * reactions when evidence is earned. All words come from the JSON data files.
 */
export class HQ {
  constructor(o) {
    Object.assign(this, o); // state, hud, audio, cole, controller, puzzles, clues, characters, places, reports, lines
    this.puzzleById = new Map(this.puzzles.puzzles.map((p) => [p.id, p]));
    this.clueById = new Map(this.clues.map((c) => [c.id, c]));
    this.dialogue = new DialogueBox();
    this.board = new InvestigationBoard({ state: this.state, clues: this.clues, characters: this.characters, places: this.places, puzzles: this.puzzles.puzzles });
    this.reportsScreen = new ReportsScreen({ state: this.state, reports: this.reports });
    this.caseFile = new CaseFileScreen({ state: this.state, clues: this.clues, puzzles: this.puzzles.puzzles });
    this.timeline = new TimelineScreen({ message: this.lines.timelineEmpty });
    this.screen = null; // the mouse screen currently open
    for (const s of [this.board, this.reportsScreen, this.caseFile, this.timeline]) {
      s.onClose = () => { this.screen = null; this.onScreenClosed?.(); };
    }
    this.dialogue.onClose = () => { this.cole.talking = false; this.onFreezeChange?.(); };
    this.fade = document.createElement('div');
    this.fade.className = 'fade';
    document.body.appendChild(this.fade);
    this.cole.restore(this.state.data.cole);
  }

  /** Something is open that should stop the player walking. */
  get busy() { return !!this.screen || this.dialogue.open; }

  // ------------------------------------------------------------------ interactables (type "ui")
  handle(def) {
    switch (def.ui) {
      case 'board': return this.openScreen(this.board);
      case 'reports': return this.openScreen(this.reportsScreen);
      case 'casefile': return this.openScreen(this.caseFile);
      case 'timeline': return this.openScreen(this.timeline);
      case 'lab': return this.danny(this.lines.lab);
      case 'typewriter': return this.danny(this.lines.typewriter);
      case 'rest': return this.rest();
      case 'talk': return this.talk(false);
      default: return null;
    }
  }

  openScreen(screen) {
    this.screen = screen;
    this.onScreenOpened?.(screen); // main.js releases the mouse
    screen.show();
  }

  closeScreen() { this.screen?.close(); }

  danny(text, seconds = 7) { this.hud.caption(`Danny: ${text}`, seconds); }

  /** The cot: Danny says he'll wake you, THEN the screen fades and half an hour passes. */
  rest() {
    if (this._resting) return;
    this._resting = true;
    this.onFreezeChange?.(true);
    this.danny(this.lines.rest, 3);
    setTimeout(() => {
      this.fade.classList.add('on');
      setTimeout(() => {
        const spent = this.state.advance(30);
        this.hud.timePassed(spent, this.state.clockLabel());
        this.state.save();
        this.fade.classList.remove('on');
        this.onFreezeChange?.(false);
        this._resting = false;
        this.danny(this.lines.wake ?? 'Rise and shine, Chief. Half an hour, like I promised.', 4);
      }, 1800);
    }, 2400);
  }

  // ------------------------------------------------------------------ Danny's conversation
  /** Danny says a line: typed out in the box. */
  say(line, choices) {
    const L = this.lines;
    this.cole.talking = !this.remote;
    this.dialogue.show(L.speaker + (this.remote ? ' (radio)' : ''), line, choices);
    if (!this.remote && Math.random() < 0.35) this.cole.gesture(Math.random() < 0.5 ? 'Nod' : 'Talk', 2.2);
    this.onFreezeChange?.();
  }

  /** Several lines in a row, each with "Go on." until the last, which offers `then`. */
  sayLines(lines, then) {
    const [first, ...rest] = lines;
    if (!rest.length) return this.say(first, then());
    this.say(first, [{ label: 'Go on.', onPick: () => this.sayLines(rest, then) }]);
  }

  talk(remote) {
    if (this.dialogue.open) return;
    const L = this.lines;
    this.remote = false;
    if (remote) {
      const near = Math.hypot(this.cole.pos.x - this.controller.position.x, this.cole.pos.z - this.controller.position.z) < 4;
      if (!near) this._spend(5); // the walkie-talkie costs time (addendum D)
      this.remote = !near;
      this.audio.click();
      return this.menu(pick(L.walkieOpen));
    }
    const first = !this.state.flag('talkedToDanny');
    if (first) this.state.setFlag('talkedToDanny');
    this.menu(first ? L.greetingFirst : pick(L.greetings));
  }

  /** The main list of things you can say to Danny. */
  menuChoices() {
    const L = this.lines, M = L.menu;
    const unread = this.reportsScreen.unreadCount();
    const mode = this.cole.mode;
    const back = () => this.menu(pick(['Anything else, Chief?', 'What else?', 'Sure. What else?']));
    const c = [
      { label: M.situation, onPick: () => (this.state.flag('heardSituation')
        ? this.say(L.situationLater, this.menuChoices())
        : (this.state.setFlag('heardSituation'), this.sayLines(L.situation, () => this.menuChoices()))) },
      { label: M.people, onPick: () => this.people() },
      { label: M.next, onPick: () => this.next() },
      { label: M.reports + (unread ? ` (${unread} new)` : ''), onPick: () => this.say(unread ? L.reportsNew.replace('{n}', unread) : L.reportsNone, [{ label: M.back, onPick: back }]) },
    ];
    if (mode !== 'follow') c.push({ label: M.follow, onPick: () => { this._mode('follow'); this.say(this.remote ? L.radioFollow : L.follow, this.menuChoices()); } });
    if (mode === 'follow' && !this.remote) c.push({ label: M.stay, onPick: () => { this._mode('wait'); this.say(L.stay, this.menuChoices()); } });
    if (mode === 'follow' || mode === 'wait') c.push({ label: M.home, onPick: () => { this._mode('home'); this.say(L.home, this.menuChoices()); } });
    c.push({ label: M.bye, onPick: () => this.dialogue.close() });
    return c;
  }

  menu(line) { this.say(line, this.menuChoices()); }

  people() {
    const L = this.lines;
    const ids = Object.keys(L.people);
    const names = new Map(this.characters.map((ch) => [ch.id, ch.name]));
    const choices = ids.map((id) => ({
      label: names.get(id) ?? id,
      onPick: () => this.say(L.people[id], [
        { label: 'Who else?', onPick: () => this.people() },
        { label: L.menu.back, onPick: () => this.menu('Sure. What else?') },
      ]),
    }));
    choices.push({ label: L.menu.back, onPick: () => this.menu('Sure. What else?') });
    this.say(L.peopleIntro, choices);
  }

  /** "What should I do next?": a hint for the next puzzle that exists, or plain advice. */
  next() {
    const L = this.lines;
    const p = this.currentPuzzle();
    if (!p) return this.say(pick(L.nextNone), this.menuChoices());
    this.hint(p);
  }

  _mode(mode) {
    if (!this.remote) this.cole.gesture('Nod', 2);
    this.cole.setMode(mode, this.controller.position);
    this.saveCole();
  }

  saveCole() {
    Object.assign(this.state.data.cole, this.cole.snapshot());
    this.state.save();
  }

  /**
   * The first puzzle (in order) that is in the game and not solved yet. A dusk-only one (S21)
   * waits until dusk while there is something else to do before the theory.
   */
  currentPuzzle() {
    const S = this.puzzles.sequential ?? {};
    const open = this.puzzles.order.map((id) => this.puzzleById.get(id)).filter((p) => p && p.built && !this.state.isSolved(p.id));
    const early = (p) => S.afterDusk?.includes(p.id) && this.state.data.minutes < parseTime(S.duskAt);
    return open.find((p) => !early(p) && p.id !== 'S26') ?? open[0] ?? null;
  }

  hint(p = this.currentPuzzle()) {
    const L = this.lines;
    if (!p) return this.say(L.hintNone, this.menuChoices());
    const level = this.state.data.hints[p.id] ?? 0;
    if (level >= 3) return this.say(L.hintMaxed, this.menuChoices());
    this._spend(this.puzzles.hintCost);
    this.state.data.hints[p.id] = level + 1;
    this.state.save();
    if (!this.remote) this.cole.gesture(level >= 1 ? 'Point' : 'Talk', 3);
    const text = `${level === 0 ? `${pick(L.hintIntro)} ` : ''}${p.hints[level]}`;
    const choices = [];
    if (level + 1 < 3) choices.push({ label: `${L.menu.more} (costs ${this.puzzles.hintCost} minutes)`, onPick: () => this.hint(p) });
    choices.push({ label: L.menu.thanks, onPick: () => this.menu('Any time, Chief.') });
    this.say(text, choices);
  }

  _spend(minutes) {
    const spent = this.state.advance(minutes);
    if (spent > 0) this.hud.timePassed(spent, this.state.clockLabel());
  }

  // ------------------------------------------------------------------ evidence (section G)
  /** The ONLY way evidence is earned: a puzzle is solved and grants its clues. */
  solvePuzzle(pid) {
    const p = this.puzzleById.get(pid);
    if (!p) return [];
    const earned = this.state.solvePuzzle(pid, p.clues);
    this.state.save();
    if (earned.length) {
      const first = this.clueById.get(earned[0]);
      this.hud.toast(`New evidence: ${first?.name ?? earned[0]}${earned.length > 1 ? ` (+${earned.length - 1})` : ''}`);
      const r = this.lines.reactions;
      const id = earned.find((c) => r[c]);
      this.danny(id ? r[id] : r.default, 6);
    }
    return earned;
  }

  /** Debug cheat: solve the next puzzle in order (until the real puzzles exist). */
  debugSolveNext() {
    const p = this.puzzles.order.map((id) => this.puzzleById.get(id)).find((q) => q && !this.state.isSolved(q.id));
    if (!p) return null;
    this.solvePuzzle(p.id);
    return p;
  }

  debugReset() {
    const d = this.state.data;
    d.solved = [];
    d.clues = [];
    d.hints = {};
    for (const k of Object.keys(d.board.cards)) if (k.startsWith('e:')) delete d.board.cards[k];
    d.board.links = d.board.links.filter(([a, b]) => !a.startsWith('e:') && !b.startsWith('e:'));
    this.state.save();
  }

  /** Danny's reaction when a finding becomes established. */
  react(fid) {
    const r = this.lines.reactions;
    this.danny(r[fid] ?? r.default, 6);
  }

  /** The start of a new game: Danny radios in with the deadline (once). */
  startCall() {
    if (this.state.flag('startCall')) return;
    this.state.setFlag('startCall');
    this.state.save();
    this.audio.click();
    this.hud.caption(`Danny (radio): ${this.lines.startRadio}`, 14);
  }

  // ------------------------------------------------------------------ per frame
  update() {
    // clock reminders at 15:00 and 16:30, once each
    for (const [time, text] of Object.entries(this.lines.reminders)) {
      if (this.state.data.minutes >= parseTime(time) && !this.state.data.reminders.includes(time)) {
        this.state.data.reminders.push(time);
        this.state.save();
        this.audio.click();
        this.hud.caption(`Danny (radio): ${text}`, 9);
      }
    }
  }
}
