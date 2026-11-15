import { spokenSentences, spokenText } from './speech-text.js';

/**
 * Spoken lines (Stage H). Every line in the game is pre-rendered to an audio file per character
 * (tools/voices.mjs -> public/audio/vo). speak() plays those files sentence by sentence through the
 * game's audio, so lines get the room's echo (or a crackly radio filter when Danny is on the
 * walkie-talkie). A sentence with no file (a rare, made-up-at-runtime line) falls back to the
 * computer's live voice. Voices can be switched off on the pause screen (remembered).
 */
const KEY = 'marigold-silence.voice.v1';

class VoiceEngine {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* no storage */ }
    this.enabled = saved?.enabled ?? true;
    const load = () => { this.voices = this.synth?.getVoices().filter((v) => v.lang?.startsWith('en')) ?? []; };
    load();
    this.synth?.addEventListener?.('voiceschanged', load);
    this.manifest = null;
    this.cache = new Map(); // file -> Promise<AudioBuffer>
    fetch('/audio/vo/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { this.manifest = m; }).catch(() => {});
    this._token = 0;
  }

  /** The game's audio (AmbientAudio): files play through its master and reverb. */
  attach(audio) { this.audio = audio; }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    try { localStorage.setItem(KEY, JSON.stringify({ enabled: on })); } catch { /* no storage */ }
  }

  pick(profile = {}) {
    const vs = this.voices;
    if (!vs.length) return null;
    for (const name of profile.prefer ?? []) {
      const all = vs.filter((v) => v.name.startsWith(name));
      const best = all.find((v) => /premium|enhanced/i.test(v.name)) ?? all[0];
      if (best) return best;
    }
    const lang = profile.lang ?? 'en-US';
    return vs.find((v) => v.lang === lang) ?? vs[0];
  }

  _buffer(file) {
    if (!this.cache.has(file)) {
      this.cache.set(file, fetch(`/audio/vo/${file}`).then((r) => r.arrayBuffer()).then((b) => this.audio.ctx.decodeAudioData(b)));
    }
    return this.cache.get(file);
  }

  /** Speak a line. opts.radio = through a walkie-talkie. Resolves when finished. */
  async speak(text, profile = {}, opts = {}) {
    if (!this.enabled || !text) return;
    this.stop();
    const token = ++this._token;
    const who = profile.id;
    // a whole line acted by its Gemini voice (tools/voices-gemini.mjs), if there is one
    const whole = this.manifest?.gemini?.[who]?.[spokenText(text)];
    if (this.audio?.ctx && whole) {
      try {
        const buf = await this._buffer(whole);
        if (token === this._token) await this._play(buf, opts);
        return;
      } catch { /* fall through to the sentence files */ }
    }
    const sentences = spokenSentences(text);
    const files = sentences.map((s) => this.manifest?.lines?.[who]?.[s]);
    if (this.audio?.ctx && sentences.length && files.every(Boolean)) {
      for (const f of files) {
        if (token !== this._token) return;
        let buf;
        try { buf = await this._buffer(f); } catch { break; }
        if (token !== this._token) return;
        await this._play(buf, opts);
      }
      return;
    }
    return this._live(spokenText(text), profile);
  }

  _play(buf, opts) {
    const ctx = this.audio.ctx;
    return new Promise((res) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = opts.radio ? 1.4 : 1.1;
      let head = src;
      if (opts.radio) { // a 1930s walkie-talkie: thin, boxy, a little distorted
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        const sh = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
        sh.curve = curve;
        head.connect(hp); hp.connect(lp); lp.connect(sh);
        head = sh;
        head.connect(g).connect(this.audio.master);
      } else {
        head.connect(g);
        g.connect(this.audio.fx ?? this.audio.master); // the room's echo (hangar, small rooms, outdoors)
      }
      src.onended = () => res();
      this._src = src;
      src.start();
    });
  }

  _live(clean, profile) {
    if (!this.synth || !clean) return Promise.resolve();
    const u = new SpeechSynthesisUtterance(clean);
    const v = this.pick(profile);
    if (v) u.voice = v;
    u.lang = v?.lang ?? profile.lang ?? 'en-US';
    u.pitch = profile.pitch ?? 1;
    u.rate = profile.rate ?? 1;
    return new Promise((res) => {
      u.onend = res;
      u.onerror = res;
      this.synth.speak(u);
      setTimeout(res, 1500 + clean.length * 90);
    });
  }

  stop() {
    this._token++;
    try { this._src?.stop(); } catch { /* already stopped */ }
    this._src = null;
    this.synth?.cancel();
  }

  get speaking() { return !!this._src || !!this.synth?.speaking; }
}

export const Voice = new VoiceEngine();
