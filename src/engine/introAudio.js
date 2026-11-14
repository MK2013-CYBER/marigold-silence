/**
 * Sounds for the cinematic intro (addendum E), all made in code like the rest of the
 * ambience: radio static, telegraph sounder clicks, the mail plane's radial engine,
 * the touchdown thump, a lantern creak, glass clink, a music-box tune that stops
 * mid-note, and a distant scream. Real recordings and voice-over come in Stage H.
 */
export class IntroAudio {
  constructor(ambient) {
    this.a = ambient; // AmbientAudio: shares its context, noise buffers and reverb bus
  }

  get ctx() { return this.a.ctx; }

  _out(gain = 1, toFx = false) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(toFx ? this.a.fx : this.a.master);
    return g;
  }

  _noise(buf = this.a.white) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    return s;
  }

  // ---------------------------------------------------------------- radio static (looping)
  staticOn(level = 0.12) {
    if (!this.ctx || this.static) return;
    const ctx = this.ctx;
    const src = this._noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2300;
    bp.Q.value = 0.7;
    const crackle = ctx.createGain();
    crackle.gain.value = level;
    const out = this._out(1);
    src.connect(bp).connect(crackle).connect(out);
    src.start();
    // irregular crackle: wobble the level
    this.static = { src, crackle, out, timer: setInterval(() => {
      const t = ctx.currentTime;
      crackle.gain.setTargetAtTime(level * (0.4 + Math.random() * 1.4), t, 0.02);
    }, 70) };
  }

  staticOff(fade = 0.6) {
    const s = this.static;
    if (!s) return;
    clearInterval(s.timer);
    s.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    s.src.stop(this.ctx.currentTime + fade * 2);
    this.static = null;
  }

  /** Telegraph sounder: a dry wooden click (and its release clack). */
  sounder(long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [at, f, lvl] of [[0, 1700, 0.25], [long ? 0.22 : 0.08, 1300, 0.15]]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(lvl, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.025);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 3;
      o.connect(bp).connect(g).connect(this.a.master);
      o.start(t + at);
      o.stop(t + at + 0.04);
    }
  }

  // ---------------------------------------------------------------- the radial engine
  engineOn() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const out = this._out(0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.connect(out);
    // cylinder firing: a low sawtooth, its octave, and a propeller beat (amplitude wobble)
    const oscs = [[1, 'sawtooth', 0.35], [2.01, 'sawtooth', 0.18], [0.5, 'triangle', 0.4]].map(([mul, type, lvl]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = lvl;
      o.connect(g).connect(lp);
      o.start();
      return { o, mul };
    });
    const beat = ctx.createOscillator();
    beat.frequency.value = 17;
    const beatG = ctx.createGain();
    beatG.gain.value = 0.25;
    beat.connect(beatG).connect(out.gain);
    beat.start();
    const rush = this._noise(this.a.brown);
    const rg = ctx.createGain();
    rg.gain.value = 0.5;
    rush.connect(rg).connect(lp);
    rush.start();
    this.engine = { out, lp, oscs, beat, rush };
    this.setEngine(62, 0.0, 0.01);
  }

  /** base frequency (Hz), level, and how muffled (0 open .. 1 inside the cabin). */
  setEngine(freq, level, ramp = 1.5, muffle = 0) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    for (const { o, mul } of e.oscs) o.frequency.setTargetAtTime(freq * mul, t, ramp / 3);
    e.beat.frequency.setTargetAtTime(freq * 0.27, t, ramp / 3);
    e.out.gain.setTargetAtTime(level, t, ramp / 3);
    e.lp.frequency.setTargetAtTime(900 - muffle * 520, t, ramp / 3);
  }

  engineOff(fade = 2) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, fade / 3);
    for (const { o } of e.oscs) { o.frequency.setTargetAtTime(20, t, fade / 2); o.stop(t + fade * 2); }
    e.beat.stop(t + fade * 2);
    e.rush.stop(t + fade * 2);
    this.engine = null;
  }

  // ---------------------------------------------------------------- one-shots
  thump(level = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.a.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(2.2 * level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(lp).connect(g).connect(this.a.fx);
    src.start(t, Math.random());
    src.stop(t + 0.8);
    // gravel spray
    const s2 = ctx.createBufferSource();
    s2.buffer = this.a.white;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.18 * level, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    s2.connect(hp).connect(g2).connect(this.a.master);
    s2.start(t);
    s2.stop(t + 1.7);
  }

  clink() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, lvl] of [[2480, 0.08], [3720, 0.05], [5310, 0.03]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(lvl, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(this.a.fx);
      o.start(t);
      o.stop(t + 1.2);
    }
  }

  cupDown() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const at of [0, 0.42]) {
      const o = ctx.createOscillator();
      o.frequency.value = 820 + Math.random() * 60;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.07, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.18);
      o.connect(g).connect(this.a.fx);
      o.start(t + at);
      o.stop(t + at + 0.2);
    }
  }

  /**
   * A small music box: a slow, original minor-key tune on bright bell tones.
   * stopAfter = how many notes it plays before it stops dead, mid-note.
   */
  musicBox(stopAfter = 15, tempo = 0.42) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const A4 = 440;
    // semitones from A4 (A minor), a lullaby-like phrase
    const tune = [3, 7, 10, 7, 8, 7, 3, 5, 2, 5, 8, 7, 5, 3, 0, 3, 7, 12, 10];
    const out = this._out(0.5, true);
    const t0 = ctx.currentTime + 0.1;
    const nodes = [];
    for (let i = 0; i < Math.min(stopAfter + 1, tune.length); i++) {
      const at = t0 + i * tempo * (i % 4 === 3 ? 1.5 : 1);
      const f = A4 * 2 ** (tune[i] / 12) * 2;
      for (const [mul, lvl, dec] of [[1, 0.1, 1.6], [3.01, 0.025, 0.5], [5.4, 0.012, 0.25]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(lvl, at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dec);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + dec + 0.05);
        nodes.push(o);
      }
    }
    // the last note is cut off almost as soon as it sounds (the spring runs out / a hand stops it)
    const lastAt = t0 + stopAfter * tempo * 1.08;
    out.gain.setValueAtTime(0.5, lastAt + 0.09);
    out.gain.linearRampToValueAtTime(0, lastAt + 0.11);
    return lastAt - ctx.currentTime;
  }

  /** A distant human scream: two voices of shaped noise and buzz through vowel formants. */
  scream() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(0.0, true);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    out.gain.setValueAtTime(0.5, t + 1.1);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(620, t);
    src.frequency.linearRampToValueAtTime(980, t + 0.25);
    src.frequency.linearRampToValueAtTime(900, t + 1.2);
    src.frequency.linearRampToValueAtTime(560, t + 1.9);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vg = ctx.createGain();
    vg.gain.value = 22;
    vib.connect(vg).connect(src.frequency);
    const breath = ctx.createBufferSource();
    breath.buffer = this.a.white;
    const bg = ctx.createGain();
    bg.gain.value = 0.25;
    const mix = ctx.createGain();
    src.connect(mix);
    breath.connect(bg).connect(mix);
    for (const [f, q, lvl] of [[950, 6, 0.6], [1500, 8, 0.45], [2900, 10, 0.2]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = lvl;
      mix.connect(bp).connect(g).connect(out);
    }
    for (const n of [src, vib, breath]) { n.start(t); n.stop(t + 2); }
  }
}

/**
 * A small film score made in code: a slow minor-key string pad (detuned saw waves through a
 * soft filter) moving Am - F - Dm - E, with a low cello-like root. setScore(level) fades it.
 */
IntroAudio.prototype.scoreOn = function scoreOn() {
  if (!this.ctx || this.score) return;
  const ctx = this.ctx;
  const out = this._out(0, true);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 0.4;
  lp.connect(out);
  const A = 220;
  const chords = [[0, 3, 7, -12], [-4, 0, 3, -16], [-7, -4, 0, -19], [-5, -1, 2, -17]]; // Am F Dm E (semitones from A3)
  const voices = [0, 1, 2, 3].map(() => {
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.connect(lp);
    const oscs = [-6, 6].map((det) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.connect(g);
      o.start();
      return o;
    });
    return { g, oscs };
  });
  let i = 0;
  const step = () => {
    const t = ctx.currentTime;
    const ch = chords[i++ % chords.length];
    voices.forEach((v, k) => {
      const f = A * 2 ** (ch[k] / 12);
      for (const o of v.oscs) o.frequency.setTargetAtTime(f, t, 0.6);
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setTargetAtTime(k === 3 ? 0.07 : 0.045, t, 1.2);
    });
  };
  step();
  this.score = { out, voices, timer: setInterval(step, 7000) };
};

IntroAudio.prototype.setScore = function setScore(level, secs = 2) {
  if (!this.score) return;
  this.score.out.gain.setTargetAtTime(level, this.ctx.currentTime, secs / 3);
};

IntroAudio.prototype.scoreOff = function scoreOff(secs = 2) {
  const s = this.score;
  if (!s) return;
  clearInterval(s.timer);
  const t = this.ctx.currentTime;
  s.out.gain.setTargetAtTime(0, t, secs / 3);
  for (const v of s.voices) for (const o of v.oscs) o.stop(t + secs * 2);
  this.score = null;
};
