/**
 * Quality presets (addendum v2, section I): Low / Medium / High, plus Auto, which starts
 * at Medium and steps down if the frame rate stays below ~50 fps.
 * The choice is remembered in the browser (separately from the saved game).
 */
export const PRESETS = {
  low: { label: 'Low', pixelRatio: 1.0, msaa: 0, sunShadowSize: 1024, lampShadows: false, dust: 0.45, grain: false, ao: false, bloom: false },
  medium: { label: 'Medium', pixelRatio: 1.25, msaa: 2, sunShadowSize: 2048, lampShadows: true, dust: 0.75, grain: true, ao: false, bloom: true },
  high: { label: 'High', pixelRatio: 1.5, msaa: 4, sunShadowSize: 2048, lampShadows: true, dust: 1.0, grain: true, ao: true, bloom: true },
};
const ORDER = ['low', 'medium', 'high'];
const KEY = 'marigold-silence.settings.v1';

export class Quality {
  constructor({ renderer, post, atmosphere, scene, onChange }) {
    this.renderer = renderer;
    this.post = post;
    this.atmosphere = atmosphere;
    this.scene = scene;
    this.onChange = onChange;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* no storage */ }
    this.mode = saved?.mode ?? 'auto';
    this.level = this.mode === 'auto' ? (saved?.autoLevel ?? 'medium') : this.mode;
    this._acc = 0;
    this._frames = 0;
    this._warm = 4;
    this.apply(this.level);
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ mode: this.mode, autoLevel: this.level })); } catch { /* no storage */ }
  }

  setMode(mode) {
    this.mode = mode;
    this.apply(mode === 'auto' ? 'medium' : mode);
    this._warm = 4;
    this.save();
  }

  apply(level) {
    const p = PRESETS[level];
    this.level = level;
    const pr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.post.composer.setPixelRatio(pr);
    for (const rt of [this.post.composer.renderTarget1, this.post.composer.renderTarget2]) {
      if (rt.samples !== p.msaa) { rt.samples = p.msaa; rt.dispose(); }
    }
    this.post.composer.setSize(window.innerWidth, window.innerHeight);
    const sun = this.atmosphere.sun;
    if (sun.shadow.mapSize.x !== p.sunShadowSize) {
      sun.shadow.mapSize.set(p.sunShadowSize, p.sunShadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    this.scene.traverse((o) => { if (o.isLight && o.userData.wantsShadow) o.castShadow = p.lampShadows; });
    this.atmosphere.setDustScale(p.dust);
    this.post.grain.enabled = p.grain;
    if (this.post.ao) this.post.ao.enabled = p.ao;
    if (this.post.bloom) this.post.bloom.enabled = p.bloom;
    this.renderer.shadowMap.needsUpdate = true;
    this.onChange?.(this);
  }

  /** Auto mode: measure the frame rate while playing and step down if it is too low. */
  update(dt, playing) {
    if (this.mode !== 'auto' || !playing) return;
    if (this._warm > 0) { this._warm -= dt; return; }
    this._acc += dt;
    this._frames++;
    if (this._acc < 4) return;
    const fps = this._frames / this._acc;
    this._acc = 0;
    this._frames = 0;
    const i = ORDER.indexOf(this.level);
    if (fps < 50 && i > 0) {
      this.apply(ORDER[i - 1]);
      this._warm = 3;
      this.save();
      return `Quality lowered to ${PRESETS[this.level].label} (${Math.round(fps)} fps)`;
    }
    return null;
  }

  /** Buttons for the pause screen. */
  mount(el) {
    const draw = () => {
      el.replaceChildren();
      const label = document.createElement('span');
      label.textContent = 'Quality: ';
      el.appendChild(label);
      for (const m of ['auto', ...ORDER]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = m === 'auto' ? `Auto (${PRESETS[this.level].label})` : PRESETS[m].label;
        b.classList.toggle('on', this.mode === m);
        b.addEventListener('click', (e) => { e.stopPropagation(); this.setMode(m); draw(); });
        el.appendChild(b);
      }
    };
    draw();
    this._redraw = draw;
  }
}
