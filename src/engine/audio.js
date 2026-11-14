/**
 * Procedural ambience (no audio files yet): gusting wind, a whistle through the
 * door seams, low rumble, generator hum, thunder and footsteps. Real recorded
 * sound arrives in M9; this keeps the hangar from feeling dead until then.
 */
export class AmbientAudio {
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    this.white = makeNoise(ctx, 4, false);
    this.brown = makeNoise(ctx, 6, true);

    // Room acoustics: everything the player does goes through this bus.
    // In the big hangar a long reverb with slap-back echoes off the far walls; in small rooms almost dry.
    this.fx = ctx.createGain();
    const dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 3.4);
    this.fx.connect(dry).connect(this.master);
    this.fx.connect(conv).connect(this.wet).connect(this.master);

    // Wind body
    const wind = loop(ctx, this.white);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 380;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.2;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Whistle through the hangar door seams
    const whistle = loop(ctx, this.white);
    this.whistleFilter = ctx.createBiquadFilter();
    this.whistleFilter.type = 'bandpass';
    this.whistleFilter.frequency.value = 900;
    this.whistleFilter.Q.value = 9;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0.05;
    whistle.connect(this.whistleFilter).connect(this.whistleGain).connect(this.master);

    // Low storm rumble
    const rumble = loop(ctx, this.brown);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110;
    const rg = ctx.createGain();
    rg.gain.value = 0.35;
    rumble.connect(lp).connect(rg).connect(this.master);

    // Howl: a narrow band of noise sweeping up and down, loud outdoors
    const howl = loop(ctx, this.white);
    this.howlFilter = ctx.createBiquadFilter();
    this.howlFilter.type = 'bandpass';
    this.howlFilter.frequency.value = 380;
    this.howlFilter.Q.value = 14;
    this.howlGain = ctx.createGain();
    this.howlGain.gain.value = 0;
    howl.connect(this.howlFilter).connect(this.howlGain).connect(this.master);
    this._nextRattle = 2;

    // Distant generator hum
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 150;
    const hg = ctx.createGain();
    hg.gain.value = 0.018;
    osc.connect(hf).connect(hg).connect(this.master);
    osc.start();

    this.gust = 0.5;
    this.gustTarget = 0.5;
  }

  /** 1 = the echoing hangar, ~0.1 = a small room. */
  setReverb(v) {
    if (!this.ctx) return;
    this.wet.gain.setTargetAtTime(0.6 * v, this.ctx.currentTime, 0.15);
  }

  /** 0 = sheltered indoors .. 1 = out in the open storm (louder wind, howl). */
  setExposure(v) { this.exposure = v; }

  update(dt) {
    if (!this.ctx) return;
    if (Math.random() < dt * 0.35) this.gustTarget = 0.1 + Math.random() * 0.9;
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 0.7);
    const t = this.ctx.currentTime;
    const ex = this.exposure ?? 0;
    this.master.gain.setTargetAtTime(0.8 + ex * 0.3, t, 0.3);
    this.windGain.gain.setTargetAtTime((0.1 + this.gust * 0.35) * (1 + ex * 2.2), t, 0.25);
    this.howlGain.gain.setTargetAtTime(ex * (0.03 + this.gust * 0.09), t, 0.4);
    this.howlFilter.frequency.setTargetAtTime(300 + this.gust * 380 + Math.sin(t * 0.37) * 60, t, 0.5);

    // loose sheet metal and wire rattling in the gusts (outdoors, and the hangar roof indoors)
    this._nextRattle -= dt;
    if (this._nextRattle <= 0) {
      this._nextRattle = 3 + Math.random() * 9 * (1.2 - this.gust);
      this.metalRattle(0.35 + ex * 0.65);
    }
    this.windFilter.frequency.setTargetAtTime(240 + this.gust * 520, t, 0.25);
    this.whistleGain.gain.setTargetAtTime(this.gust > 0.6 ? (this.gust - 0.6) * 0.25 : 0.0, t, 0.4);
    this.whistleFilter.frequency.setTargetAtTime(750 + this.gust * 500, t, 0.4);
  }

  thunder(delay = 1.5, strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.playbackRate.value = 0.6 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 3.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.4 * strength, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(lp).connect(g).connect(this.fx);
    src.start(t, Math.random() * 2);
    src.stop(t + 5);
  }

  footstep(amount = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520 + Math.random() * 200;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2 * amount, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(bp).connect(g).connect(this.fx);
    src.start(t, Math.random() * 3);
    src.stop(t + 0.15);
  }

  _burst(freq, q, gain, dur, type = 'bandpass', rate = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t, Math.random() * 3);
    src.stop(t + dur + 0.05);
  }

  /** Hinge / drawer creak: a short wobbling tone. */
  creak(amount = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180 + Math.random() * 60, t);
    o.frequency.linearRampToValueAtTime(120 + Math.random() * 40, t + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * amount, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(f).connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + 0.45);
  }

  /** A burst of tinny clanks somewhere around the listener. */
  metalRattle(level = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain();
    out.gain.value = level;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.fx); } else out.connect(this.fx);
    const n = 2 + Math.floor(Math.random() * 6);
    const base = 700 + Math.random() * 900;
    let at = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      at += 0.04 + Math.random() * 0.16;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = base * (0.9 + Math.random() * 0.4);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = base * 2.1;
      f.Q.value = 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.035 * (0.5 + Math.random()), at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12 + Math.random() * 0.15);
      o.connect(f).connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.3);
    }
  }

  rattle() {
    for (let i = 0; i < 3; i++) setTimeout(() => this._burst(2200, 3, 0.12, 0.05), i * 70);
  }

  paper() {
    this._burst(3500, 0.8, 0.07, 0.25, 'highpass', 0.7);
  }

  pickup() {
    this._burst(4200, 8, 0.1, 0.12);
    setTimeout(() => this._burst(5200, 10, 0.06, 0.1), 60);
  }

  click() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.04);
  }
}

function makeNoise(ctx, seconds, brown) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

function loop(ctx, buffer) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start();
  return s;
}

/** Stereo impulse response for a big tin-and-timber hangar: early slap-back echoes + a long diffuse tail. */
function makeImpulse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const echoes = [[0.075, 0.55], [0.118, 0.42], [0.16, 0.3], [0.235, 0.22], [0.31, 0.14]]; // seconds, level
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const tail = t < 0.03 ? 0 : Math.pow(1 - t / seconds, 2.6) * Math.exp(-t * 0.6);
      d[i] = (Math.random() * 2 - 1) * tail * 0.35;
    }
    for (const [time, level] of echoes) {
      const at = Math.floor((time + (ch ? 0.007 : 0)) * rate);
      for (let k = 0; k < 220; k++) d[at + k] += (Math.random() * 2 - 1) * level * Math.exp(-k / 60);
    }
  }
  return buf;
}
