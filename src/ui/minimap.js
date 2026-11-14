/**
 * Hand-drawn-style airfield map. The whole map is painted once from world.json onto a
 * parchment canvas; the corner minimap shows a north-up window around the player, and
 * M opens the full map.
 */
const INK = '#3b2d1f';
const PAPER = '#d9caa4';

export class Minimap {
  constructor(cfg, places = []) {
    this.cfg = cfg;
    this.places = places;
    const b = cfg.walkBounds;
    this.x0 = b.x[0];
    this.z0 = b.z[0];
    this.s = 1.25; // map pixels per metre
    this.base = this._paint();

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.box = document.createElement('div');
    this.box.className = 'minimap hidden';
    this.canvas = document.createElement('canvas');
    this.size = 176;
    this.canvas.width = this.canvas.height = this.size * this.dpr;
    this.box.appendChild(this.canvas);
    this.label = document.createElement('div');
    this.label.className = 'minimap-label';
    this.box.appendChild(this.label);
    document.body.appendChild(this.box);

    this.big = document.createElement('div');
    this.big.className = 'bigmap hidden';
    this.bigCanvas = document.createElement('canvas');
    this.big.appendChild(this.bigCanvas);
    const foot = document.createElement('div');
    foot.className = 'bigmap-foot';
    foot.textContent = 'M — close map';
    this.big.appendChild(foot);
    document.body.appendChild(this.big);
    this.bigOpen = false;
    this._acc = 1;
  }

  show(on) { this.box.classList.toggle('hidden', !on); }

  toggleBig(pos, yaw) {
    this.bigOpen = !this.bigOpen;
    this.big.classList.toggle('hidden', !this.bigOpen);
    if (this.bigOpen) this._drawBig(pos, yaw);
  }

  /** Call every frame; redraws ~20x a second. */
  update(dt, pos, yaw, zoneName) {
    this._acc += dt;
    if (this._acc < 0.05) return;
    this._acc = 0;
    this.label.textContent = zoneName;
    const c = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const viewM = 85; // metres from centre to edge
    const src = viewM * this.s;
    const [mx, my] = this._m(pos.x, pos.z);
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2 * this.dpr, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, W);
    c.drawImage(this.base, mx - src, my - src, src * 2, src * 2, 0, 0, W, W);
    this._arrow(c, W / 2, W / 2, yaw, 9 * this.dpr);
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = 2 * this.dpr;
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2 * this.dpr, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = INK;
    c.font = `bold ${12 * this.dpr}px Georgia`;
    c.textAlign = 'center';
    c.fillText('N', W / 2, 16 * this.dpr);
    if (this.bigOpen) this._drawBig(pos, yaw);
  }

  _m(x, z) { return [(x - this.x0) * this.s, (z - this.z0) * this.s]; }

  _arrow(c, x, y, yaw, r) {
    c.save();
    c.translate(x, y);
    c.rotate(-yaw);
    c.fillStyle = '#9a2a14';
    c.strokeStyle = '#2a1a10';
    c.lineWidth = Math.max(1, r / 6);
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.62, r * 0.75);
    c.lineTo(0, r * 0.35);
    c.lineTo(-r * 0.62, r * 0.75);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  _drawBig(pos, yaw) {
    const maxW = window.innerWidth * 0.86, maxH = window.innerHeight * 0.8;
    const k = Math.min(maxW / this.base.width, maxH / this.base.height);
    const dpr = this.dpr;
    const w = Math.round(this.base.width * k), h = Math.round(this.base.height * k);
    if (this.bigCanvas.width !== w * dpr) {
      this.bigCanvas.width = w * dpr;
      this.bigCanvas.height = h * dpr;
      this.bigCanvas.style.width = `${w}px`;
      this.bigCanvas.style.height = `${h}px`;
    }
    const c = this.bigCanvas.getContext('2d');
    c.drawImage(this.base, 0, 0, w * dpr, h * dpr);
    const [mx, my] = this._m(pos.x, pos.z);
    this._arrow(c, mx * k * dpr, my * k * dpr, yaw, 11 * dpr);
  }

  // ------------------------------------------------------------ the parchment map, painted once
  _paint() {
    const cfg = this.cfg;
    const b = cfg.walkBounds;
    const W = Math.round((b.x[1] - b.x[0]) * this.s), H = Math.round((b.z[1] - b.z[0]) * this.s);
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    const m = (x, z) => this._m(x, z);
    const s = this.s;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // paper with blotches and a darker desert beyond the fence
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(110,85,50,${rnd() * 0.06})`;
      const r = 3 + rnd() * 40;
      c.beginPath(); c.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2); c.fill();
    }
    const f = cfg.fence;
    const [fx0, fz0] = m(f.x[0], f.z[0]);
    const [fx1, fz1] = m(f.x[1], f.z[1]);
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.rect(fx0, fz0, fx1 - fx0, fz1 - fz0);
    c.clip('evenodd');
    c.fillStyle = 'rgba(120,90,55,0.16)';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(80,60,35,0.25)';
    c.lineWidth = 1;
    for (let i = 0; i < 260; i++) { // dune hatching
      const x = rnd() * W, y = rnd() * H, L = 8 + rnd() * 18;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + L / 2, y - 4, x + L, y); c.stroke();
    }
    c.restore();

    // runway, apron
    const rw = cfg.runway;
    const [rx0, rz0] = m(rw.x[0], rw.z[0]);
    const [rx1, rz1] = m(rw.x[1], rw.z[1]);
    c.fillStyle = '#b29a74';
    c.fillRect(rx0, rz0, rx1 - rx0, rz1 - rz0);
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.strokeRect(rx0, rz0, rx1 - rx0, rz1 - rz0);
    c.setLineDash([12, 14]);
    c.strokeStyle = 'rgba(240,232,210,0.8)';
    c.beginPath(); c.moveTo(rx0 + 40, (rz0 + rz1) / 2); c.lineTo(rx1 - 40, (rz0 + rz1) / 2); c.stroke();
    c.setLineDash([]);
    const ap = cfg.apron;
    const [ax0, az0] = m(ap.x[0], ap.z[0]);
    const [ax1, az1] = m(ap.x[1], ap.z[1]);
    c.fillStyle = 'rgba(178,154,116,0.55)';
    c.fillRect(ax0, az0, ax1 - ax0, az1 - az0);

    // road and footpaths
    const line = (pts, w, col, dash) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.setLineDash(dash || []);
      c.beginPath();
      pts.forEach(([x, z], i) => { const [px, pz] = m(x, z); if (i) c.lineTo(px, pz); else c.moveTo(px, pz); });
      c.stroke();
      c.setLineDash([]);
    };
    line(cfg.road.points, cfg.road.width * s, '#9c7f58');
    line(cfg.road.points, 1, 'rgba(59,45,31,0.5)', [4, 6]);
    for (const p of cfg.paths ?? []) line(p.points, Math.max(2, p.width * s), 'rgba(140,110,75,0.8)', [3, 3]);

    // fence (dashed, with gaps) and the gate
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.setLineDash([6, 4]);
    c.strokeRect(fx0, fz0, fx1 - fx0, fz1 - fz0);
    c.setLineDash([]);
    c.strokeStyle = PAPER;
    c.lineWidth = 4;
    const gap = (side, a0, a1) => {
      c.beginPath();
      if (side === 'north' || side === 'south') {
        const z = side === 'north' ? f.z[0] : f.z[1];
        c.moveTo(...m(a0, z)); c.lineTo(...m(a1, z));
      } else {
        const x = side === 'west' ? f.x[0] : f.x[1];
        c.moveTo(...m(x, a0)); c.lineTo(...m(x, a1));
      }
      c.stroke();
    };
    for (const g of f.gaps) gap(g.side, g.from, g.to);
    gap('north', cfg.gate.x - cfg.gate.width / 2, cfg.gate.x + cfg.gate.width / 2);

    // buildings: ink footprints with labels
    const building = (x, z, w, d, rot, label, filled = true) => {
      const [px, pz] = m(x, z);
      c.save();
      c.translate(px, pz);
      c.rotate(-rot);
      c.fillStyle = filled ? '#5b4a35' : 'rgba(0,0,0,0)';
      c.strokeStyle = INK;
      c.lineWidth = 1.2;
      c.fillRect((-w / 2) * s, (-d / 2) * s, w * s, d * s);
      c.strokeRect((-w / 2) * s, (-d / 2) * s, w * s, d * s);
      c.restore();
      if (label) {
        c.fillStyle = INK;
        c.font = 'italic 13px Georgia';
        c.textAlign = 'left';
        c.fillText(label, px + (Math.max(w, d) / 2) * s + 5, pz + 4);
      }
    };
    const hg = cfg.hangar;
    building(0, 0, hg.footprint[0], hg.footprint[1], 0, null);
    for (const r of hg.rooms ?? []) building((r.x[0] + r.x[1]) / 2, (r.z[0] + r.z[1]) / 2, r.x[1] - r.x[0], r.z[1] - r.z[0], 0, null);
    c.fillStyle = INK;
    c.font = 'bold italic 15px Georgia';
    c.textAlign = 'center';
    const [hx, hz] = m(0, -18);
    c.fillText(hg.label, hx, hz);
    for (const it of cfg.models) {
      if (it.id === 'beacon_tower') continue;
      if (it.rects) {
        // several local rectangles (e.g. Operations + its annex), turned with the building
        const [px, pz] = m(it.position[0], it.position[2]);
        c.save();
        c.translate(px, pz);
        c.rotate(-(it.rotationY ?? 0));
        c.fillStyle = '#5b4a35';
        c.strokeStyle = INK;
        c.lineWidth = 1.2;
        for (const [x0, x1, z0, z1] of it.rects) {
          c.fillRect(x0 * s, z0 * s, (x1 - x0) * s, (z1 - z0) * s);
          c.strokeRect(x0 * s, z0 * s, (x1 - x0) * s, (z1 - z0) * s);
        }
        c.restore();
        c.fillStyle = INK;
        c.font = 'italic 13px Georgia';
        c.textAlign = 'left';
        c.fillText(it.label, px + 16 * s, pz + 4);
      } else {
        building(it.position[0], it.position[2], it.footprint[0], it.footprint[1], it.rotationY ?? 0, it.label);
      }
    }
    // beacon tower + windsock symbols
    const bt = cfg.models.find((i) => i.id === 'beacon_tower');
    if (bt) {
      const [bx, bz] = m(bt.position[0], bt.position[2]);
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        c.moveTo(bx, bz);
        c.lineTo(bx + Math.cos(a) * (k % 2 ? 4 : 8), bz + Math.sin(a) * (k % 2 ? 4 : 8));
      }
      c.stroke();
      c.font = 'italic 13px Georgia';
      c.textAlign = 'left';
      c.fillText(bt.label, bx + 10, bz + 4);
    }
    const [wx, wz] = m(cfg.windsock.x, cfg.windsock.z);
    c.fillStyle = '#9a4a1c';
    c.beginPath(); c.moveTo(wx, wz - 6); c.lineTo(wx + 9, wz - 3); c.lineTo(wx, wz); c.fill();
    c.fillStyle = INK;
    c.fillRect(wx - 0.7, wz - 7, 1.4, 9);

    // title and compass rose
    c.fillStyle = INK;
    c.font = 'bold 26px Georgia';
    c.textAlign = 'left';
    c.fillText(cfg.fieldName, 20, 36);
    c.font = 'italic 14px Georgia';
    c.fillText('airfield & environs', 22, 56);
    const rx = W - 60, ry = 60;
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(rx, ry, 26, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(rx, ry - 34); c.lineTo(rx + 6, ry); c.lineTo(rx, ry + 34); c.lineTo(rx - 6, ry); c.closePath(); c.stroke();
    c.font = 'bold 14px Georgia';
    c.textAlign = 'center';
    c.fillText('N', rx, ry - 38);
    // legend: every place and what it is for (places.json)
    if (this.places.length) {
      const lx = 20, ly = H - 22 - this.places.length * 17;
      c.fillStyle = 'rgba(217,202,164,0.85)';
      c.fillRect(lx - 8, ly - 26, 430, this.places.length * 17 + 36);
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.strokeRect(lx - 8, ly - 26, 430, this.places.length * 17 + 36);
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.font = 'bold 13px Georgia';
      c.fillText('PLACES', lx, ly - 8);
      this.places.forEach((pl, i) => {
        c.font = 'bold italic 12px Georgia';
        c.fillText(pl.label, lx, ly + 10 + i * 17);
        c.font = 'italic 12px Georgia';
        c.fillText(pl.mapNote, lx + 128, ly + 10 + i * 17);
      });
    }
    // vignette
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(70,45,20,0.35)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    return cv;
  }
}
