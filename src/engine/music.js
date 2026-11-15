/**
 * The score (Stage H): three tracks rendered by tools/music.py, crossfaded by situation.
 *   theme          the title, the intro and the endings
 *   investigation  the day: quiet, looping
 *   undercroft     under the hangar
 * Volume and on/off are on the pause screen.
 */
const KEY = 'marigold-silence.music.v1';

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.buffers = new Map();
    this.current = null; // { name, src, gain }
    this.level = 1;      // situation level (0..1) set by play()
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* no storage */ }
    this.volume = saved?.volume ?? 0.6;
  }

  setVolume(v) {
    this.volume = v;
    try { localStorage.setItem(KEY, JSON.stringify({ volume: v })); } catch { /* no storage */ }
  }

  _load(name) {
    if (!this.buffers.has(name)) {
      this.buffers.set(name, fetch(`/audio/music/${name}.m4a`).then((r) => r.arrayBuffer()).then((b) => this.audio.ctx.decodeAudioData(b)).catch(() => null));
    }
    return this.buffers.get(name);
  }

  /** Crossfade to a track (or stay on it and just change level). */
  async play(name, { level = 1, loop = true, fade = 3 } = {}) {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    this.level = level;
    if (this.current?.name === name) return;
    const want = (this._want = name);
    const buf = await this._load(name);
    if (!buf || want !== this._want) return;
    const old = this.current;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      old.src.stop(ctx.currentTime + fade * 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.audio.master);
    src.start();
    this.current = { name, src, gain };
  }

  stop(fade = 2) {
    const c = this.current;
    if (!c) return;
    c.gain.gain.setTargetAtTime(0, this.audio.ctx.currentTime, fade / 3);
    c.src.stop(this.audio.ctx.currentTime + fade * 2);
    this.current = null;
    this._want = null;
  }

  /** Every frame: follow the level and the player's volume. */
  update() {
    const c = this.current;
    if (!c) return;
    c.gain.gain.setTargetAtTime(this.level * this.volume * 0.55, this.audio.ctx.currentTime, 0.6);
  }
}
