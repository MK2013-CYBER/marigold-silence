/**
 * Spoken lines with the voices built into the computer (the browser's speech synthesis):
 * no internet, no keys. Each character has a voice profile: a list of preferred voice
 * names (the first one installed wins), pitch and speed. Proper recorded voices come in
 * Stage H; this keeps the game from being silent until then.
 * Turn it off with Voice.enabled = false (the setting is remembered).
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
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    try { localStorage.setItem(KEY, JSON.stringify({ enabled: on })); } catch { /* no storage */ }
  }

  /** Pick the best installed voice for a profile. Enhanced / premium voices first. */
  pick(profile = {}) {
    const vs = this.voices;
    if (!vs.length) return null;
    for (const name of profile.prefer ?? []) {
      const all = vs.filter((v) => v.name.startsWith(name));
      const best = all.find((v) => /premium|enhanced/i.test(v.name)) ?? all[0];
      if (best) return best;
    }
    const lang = profile.lang ?? 'en-US';
    return vs.find((v) => v.lang === lang && /premium|enhanced/i.test(v.name)) ?? vs.find((v) => v.lang === lang) ?? vs[0];
  }

  /** Speak a line. Resolves when it has finished (or at once if voices are off). */
  speak(text, profile = {}) {
    if (!this.enabled || !this.synth || !text) return Promise.resolve();
    this.stop();
    const clean = text.replace(/\*[^*]*\*/g, '').replace(/\[[^\]]*\]/g, '').trim();
    if (!clean) return Promise.resolve();
    const u = new SpeechSynthesisUtterance(clean);
    const v = this.pick(profile);
    if (v) u.voice = v;
    u.lang = v?.lang ?? profile.lang ?? 'en-US';
    u.pitch = profile.pitch ?? 1;
    u.rate = profile.rate ?? 1;
    u.volume = profile.volume ?? 1;
    return new Promise((res) => {
      u.onend = res;
      u.onerror = res;
      this.synth.speak(u);
      // some browsers never fire onend for very short lines
      setTimeout(res, 1500 + clean.length * 90);
    });
  }

  stop() { this.synth?.cancel(); }

  get speaking() { return !!this.synth?.speaking; }
}

export const Voice = new VoiceEngine();
