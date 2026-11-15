import { spokenText } from './speech-text.js';

/**
 * Spoken lines (Stage H). Lines are acted by Gemini voices, one designed voice per character,
 * rendered ahead of time by tools/voices-gemini.mjs into public/audio/vo (listed in gemini.json).
 * speak() plays a line's file through the game's audio, so it gets the room's echo (or a crackly
 * radio filter when Danny is on the walkie-talkie). A line with no file yet is shown as a subtitle
 * only, in silence. The game never calls any online service. Voices can be switched off on the
 * pause screen (remembered).
 */
const KEY = 'marigold-silence.voice.v1';

class VoiceEngine {
  constructor() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* no storage */ }
    this.enabled = saved?.enabled ?? true;
    this.cache = new Map(); // file -> Promise<AudioBuffer>
    this.gemini = null;     // who -> spoken words -> file
    fetch('/audio/vo/gemini.json').then((r) => (r.ok ? r.json() : null)).then((m) => { this.gemini = m; }).catch(() => {});
    this._token = 0;
  }

  /** The game's audio (AmbientAudio): files play through its master and reverb. */
  attach(audio) { this.audio = audio; }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    try { localStorage.setItem(KEY, JSON.stringify({ enabled: on })); } catch { /* no storage */ }
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
    const file = this.gemini?.lines?.[profile.id]?.[spokenText(text)];
    if (!this.audio?.ctx || !file) return; // no take yet: subtitle only
    try {
      const buf = await this._buffer(file);
      if (token === this._token) await this._play(buf, opts);
    } catch { /* a missing or broken file: stay silent */ }
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

  stop() {
    this._token++;
    try { this._src?.stop(); } catch { /* already stopped */ }
    this._src = null;
  }

  get speaking() { return !!this._src; }
}

export const Voice = new VoiceEngine();
