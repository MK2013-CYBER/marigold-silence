import * as THREE from 'three';

/**
 * Procedural canvas textures used for the M1 blockout. They will be replaced
 * by compressed PBR texture files in the realism pass (M10).
 */

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, rx = 1, ry = 1, color = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grain(g, w, h, amount, r) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function blob(g, x, y, rad, inner, sx = 1, sy = 1) {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, rad);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(-rad, -rad, rad * 2, rad * 2);
  g.restore();
}

export function concrete(rx, ry) {
  const S = 1024, r = rng(7);
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#5f5a52';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 320; i++) {
    const light = r() < 0.5;
    blob(g, r() * S, r() * S, 20 + r() * 120, light ? 'rgba(160,150,132,0.08)' : 'rgba(28,24,18,0.11)');
  }
  for (let i = 0; i < 16; i++) {
    blob(g, r() * S, r() * S, 30 + r() * 90, `rgba(10,8,4,${0.3 + r() * 0.3})`, 1, 0.4 + r() * 0.6);
  }
  g.strokeStyle = 'rgba(22,20,16,0.85)';
  g.lineWidth = 3;
  for (const k of [1, 512]) {
    g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke();
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke();
  }
  g.strokeStyle = 'rgba(18,16,12,0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    let x = r() * S, y = r() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 14; j++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  grain(g, S, S, 26, r);
  return toTexture(c, rx, ry);
}

export function corrugated(rx, ry, tint = [92, 95, 90], seed = 11) {
  const W = 256, H = 256, r = rng(seed);
  const [c, g] = makeCanvas(W, H);
  const [b, bg] = makeCanvas(W, H);
  const ribs = 8;
  for (let x = 0; x < W; x++) {
    const v = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 2 * ribs);
    const bv = (v * 255) | 0;
    bg.fillStyle = `rgb(${bv},${bv},${bv})`;
    bg.fillRect(x, 0, 1, H);
    const s = 0.72 + 0.28 * v;
    g.fillStyle = `rgb(${(tint[0] * s) | 0},${(tint[1] * s) | 0},${(tint[2] * s) | 0})`;
    g.fillRect(x, 0, 1, H);
  }
  for (let i = 0; i < 24; i++) {
    const x = r() * W, w = 2 + r() * 6, len = H * (0.2 + r() * 0.8), y0 = r() < 0.5 ? 0 : r() * H * 0.5;
    const grd = g.createLinearGradient(0, y0, 0, y0 + len);
    grd.addColorStop(0, `rgba(${(110 + r() * 30) | 0},${(52 + r() * 20) | 0},24,${0.25 + r() * 0.35})`);
    grd.addColorStop(1, 'rgba(90,50,20,0)');
    g.fillStyle = grd;
    g.fillRect(x, y0, w, len);
  }
  const gr = g.createLinearGradient(0, H * 0.55, 0, H);
  gr.addColorStop(0, 'rgba(20,16,12,0)');
  gr.addColorStop(1, 'rgba(20,16,12,0.55)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 18, r);
  return { map: toTexture(c, rx, ry), bump: toTexture(b, rx, ry, false) };
}

export function wood(rx, ry, base = [92, 64, 40], seed = 5) {
  const S = 512, r = rng(seed);
  const [c, g] = makeCanvas(S, S);
  const planks = 8, ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const s = 0.72 + r() * 0.38;
    g.fillStyle = `rgb(${(base[0] * s) | 0},${(base[1] * s) | 0},${(base[2] * s) | 0})`;
    g.fillRect(0, p * ph, S, ph);
    for (let k = 0; k < 36; k++) {
      const y = p * ph + r() * ph;
      const amp = 1 + r() * 3, freq = 0.005 + r() * 0.02, ph0 = r() * 10;
      g.strokeStyle = `rgba(28,16,6,${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath();
      for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * freq + ph0) * amp);
      g.stroke();
    }
    if (r() < 0.4) blob(g, r() * S, p * ph + ph / 2, 10 + r() * 8, 'rgba(30,16,6,0.6)', 1.6, 1);
    g.fillStyle = 'rgba(12,8,4,0.85)';
    g.fillRect(0, p * ph, S, 2);
  }
  grain(g, S, S, 14, r);
  return toTexture(c, rx, ry);
}

export function windowPane() {
  const S = 256, r = rng(21);
  const [c, g] = makeCanvas(S, S);
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, '#b3a27c');
  grd.addColorStop(1, '#6a5a42');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) blob(g, r() * S, r() * S, 10 + r() * 50, `rgba(40,30,18,${0.2 + r() * 0.4})`);
  g.fillStyle = '#14120f';
  g.fillRect(0, 0, S, 10); g.fillRect(0, S - 10, S, 10);
  g.fillRect(0, 0, 10, S); g.fillRect(S - 10, 0, 10, S);
  for (let i = 1; i < 4; i++) g.fillRect((S / 4) * i - 3, 0, 6, S);
  g.fillRect(0, S / 2 - 3, S, 6);
  // a cracked pane
  g.strokeStyle = 'rgba(20,16,10,0.7)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(150, 30); g.lineTo(170, 70); g.lineTo(160, 110); g.moveTo(170, 70); g.lineTo(185, 85); g.stroke();
  grain(g, S, S, 16, r);
  return toTexture(c);
}

export function blinds() {
  const W = 256, H = 160;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#c38a40';
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 12) {
    g.fillStyle = 'rgba(30,18,6,0.75)';
    g.fillRect(0, y, W, 6);
  }
  g.fillStyle = '#1a120a';
  g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6); g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  return toTexture(c);
}

export function textPanel({ w = 512, h = 256, bg = null, color = '#e8dcc0', lines = [], font = 'bold 64px Georgia', lineHeight = 1.2, wear = 0, seed = 3, stroke = null }) {
  const r = rng(seed);
  const [c, g] = makeCanvas(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  // Shrink the font until the widest line fits the canvas.
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  const fontAt = (s) => font.replace(/\d+px/, `${s}px`);
  g.font = fontAt(size);
  while (size > 8 && Math.max(...lines.map((l) => g.measureText(l).width)) > w * 0.92) {
    size -= 2;
    g.font = fontAt(size);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.length * size * lineHeight;
  lines.forEach((line, i) => {
    const y = h / 2 - total / 2 + size * lineHeight * (i + 0.5);
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.strokeText(line, w / 2, y); }
    g.fillStyle = color;
    g.fillText(line, w / 2, y);
  });
  if (wear > 0) {
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < wear; i++) {
      g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 3);
    }
    g.globalCompositeOperation = 'source-over';
  }
  return toTexture(c);
}

export function frostedDoorGlass(lines) {
  const W = 256, H = 320;
  const [c, g] = makeCanvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#6d5733');
  grd.addColorStop(1, '#4a3a22');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 38px Georgia';
  g.fillStyle = '#0d0905';
  g.fillText(lines[0], W / 2 + 2, H * 0.42 + 2);
  g.fillStyle = '#d6b36c';
  g.fillText(lines[0], W / 2, H * 0.42);
  g.font = 'italic 24px Georgia';
  g.fillStyle = '#cfa95e';
  g.fillText(lines[1], W / 2, H * 0.58);
  grain(g, W, H, 22, rng(4));
  return toTexture(c);
}

export function locker(number) {
  const W = 128, H = 256, r = rng(30 + number);
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#3c4430';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { g.fillStyle = '#12140e'; g.fillRect(34, 22 + i * 9, 60, 4); }
  g.strokeStyle = 'rgba(10,12,8,0.9)';
  g.lineWidth = 3;
  g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#9b8048';
  g.fillRect(48, 86, 32, 22);
  g.fillStyle = '#1c160c';
  g.font = 'bold 18px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(number), 64, 98);
  g.fillStyle = '#20231a';
  g.fillRect(96, 120, 10, 36);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(150,140,110,${0.1 + r() * 0.2})`;
    g.lineWidth = 0.8;
    const x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 8); g.stroke();
  }
  for (let i = 0; i < 8; i++) blob(g, r() * W, H - r() * 60, 10 + r() * 20, 'rgba(100,55,20,0.35)');
  grain(g, W, H, 18, r);
  return toTexture(c);
}

/** Cream paper with illegible pencil "handwriting" (the real text is shown in the reader). */
export function paper(seed = 40) {
  const W = 256, H = 192, r = rng(seed);
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = '#ddd2b5';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) blob(g, r() * W, r() * H, 20 + r() * 40, 'rgba(150,120,70,0.15)');
  g.strokeStyle = 'rgba(70,90,120,0.18)';
  g.lineWidth = 1;
  for (let y = 30; y < H; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(40,34,28,0.75)';
  g.lineWidth = 1.4;
  for (let y = 26; y < H - 10; y += 18) {
    let x = 18;
    const end = 150 + r() * 80;
    while (x < end) {
      const w = 8 + r() * 22;
      g.beginPath();
      for (let k = 0; k <= w; k += 2) g.lineTo(x + k, y - 3 + Math.sin((x + k) * 0.9 + r()) * 3);
      g.stroke();
      x += w + 6;
    }
  }
  grain(g, W, H, 14, r);
  return toTexture(c);
}

export function softGradient() {
  const [c, g] = makeCanvas(64, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#000');
  grd.addColorStop(0.5, '#fff');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 128);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function dustSprite() {
  const [c, g] = makeCanvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
