/**
 * Finding a walking route around walls (used by Danny when he walks back to HQ).
 *
 * The collision world is a set of flat boxes (walls, furniture, closed doors). This lays a grid
 * over the area between the start and the goal, marks every cell a person of the given radius
 * would bump into, and searches the grid with A* (the classic shortest-path search). Doors count
 * as open if `canOpen(box)` says the walker can open them (default: any COL_Door box); a door that
 * never opens (the hangar's back door) is a wall. The grid route is then straightened
 * ("string pulling") so the walk looks natural: straight lines between corners.
 *
 *   findPath(world, from, to, { radius }) -> [{x, z}, ...] ending at `to`, or null if no route
 */
export function findPath(world, from, to, { radius = 0.35, margin = 18, maxCells = 320000, canOpen = null } = {}) {
  const x0 = Math.min(from.x, to.x) - margin, x1 = Math.max(from.x, to.x) + margin;
  const z0 = Math.min(from.z, to.z) - margin, z1 = Math.max(from.z, to.z) + margin;
  let cell = 0.5;
  while (((x1 - x0) / cell) * ((z1 - z0) / cell) > maxCells) cell *= 1.5;
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((z1 - z0) / cell);
  const blocked = new Uint8Array(W * H);
  const r = radius + 0.02;
  const inView = (b) => !(b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1);
  const mark = (minX, maxX, minZ, maxZ, v) => {
    const i0 = Math.max(0, Math.floor((minX - x0) / cell)), i1 = Math.min(W - 1, Math.floor((maxX - x0) / cell));
    const j0 = Math.max(0, Math.floor((minZ - z0) / cell)), j1 = Math.min(H - 1, Math.floor((maxZ - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * W + i] = v;
  };
  const doors = [], doorRects = [];
  for (const b of world.boxes) {
    if (!inView(b)) continue;
    const door = b.name?.startsWith('COL_Door');
    if (door && (!b.enabled || (canOpen ? canOpen(b) : true))) { doors.push(b); continue; } // he opens doors as he goes
    if (b.enabled) mark(b.minX - r, b.maxX + r, b.minZ - r, b.maxZ + r, 1);
  }
  // Walls are thickened by his body width, which would close every doorway on the grid: carve
  // each doorway back open, across its width and right through the thickness of the wall.
  for (const b of doors) {
    const thinX = b.maxX - b.minX < b.maxZ - b.minZ;
    const t = r + cell;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const hx = thinX ? (b.maxX - b.minX) / 2 + t : Math.max(cell * 0.5, (b.maxX - b.minX) / 2 - 0.1);
    const hz = thinX ? Math.max(cell * 0.5, (b.maxZ - b.minZ) / 2 - 0.1) : (b.maxZ - b.minZ) / 2 + t;
    mark(cx - hx, cx + hx, cz - hz, cz + hz, 0);
    doorRects.push({ cx, cz, thinX, minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });
  }
  const ci = (x) => Math.max(0, Math.min(W - 1, Math.floor((x - x0) / cell)));
  const cj = (z) => Math.max(0, Math.min(H - 1, Math.floor((z - z0) / cell)));
  const free = (i, j) => i >= 0 && j >= 0 && i < W && j < H && !blocked[j * W + i];
  const nearestFree = (i, j) => { // start or goal squeezed against something: step to open floor
    if (free(i, j)) return [i, j];
    for (let k = 1; k < 8; k++) for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) if (free(i + di, j + dj)) return [i + di, j + dj];
    return null;
  };
  const s = nearestFree(ci(from.x), cj(from.z)), g = nearestFree(ci(to.x), cj(to.z));
  if (!s || !g) return null;
  const S = s[1] * W + s[0], G = g[1] * W + g[0];

  // A*: 8 directions, no cutting corners past a wall
  const cost = new Float32Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const heap = new Heap();
  const h = (n) => { const dx = Math.abs((n % W) - g[0]), dz = Math.abs(((n / W) | 0) - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  cost[S] = 0;
  heap.push(S, h(S));
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false;
  while (heap.size) {
    const n = heap.pop();
    if (n === G) { found = true; break; }
    const i = n % W, j = (n / W) | 0;
    for (const [di, dj, c] of dirs) {
      const a = i + di, b = j + dj;
      if (!free(a, b) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue;
      const m = b * W + a, nc = cost[n] + c;
      if (nc < cost[m]) { cost[m] = nc; prev[m] = n; heap.push(m, nc + h(m)); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let n = G; n !== -1; n = prev[n]) cells.push(n);
  cells.reverse();
  const pt = (n) => ({ x: x0 + ((n % W) + 0.5) * cell, z: z0 + (((n / W) | 0) + 0.5) * cell });

  // straighten: from each corner, jump to the furthest cell still in plain sight
  const clear = (a, b) => {
    const A = pt(a), B = pt(b);
    const steps = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / (cell * 0.5));
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (!free(ci(A.x + (B.x - A.x) * t), cj(A.z + (B.z - A.z) * t))) return false;
    }
    return true;
  };
  const pull = (a, b) => { // smoothed points for cells a..b (not including a itself)
    const pts = [];
    let k = a;
    while (k < b) {
      let best = k + 1;
      for (let m = b; m > k + 1; m--) if (clear(cells[k], cells[m])) { best = m; break; }
      pts.push(pt(cells[best]));
      k = best;
    }
    return pts;
  };
  // Doorways are walked like a person walks them: to a point just before the middle of the door,
  // straight through, and out the other side (a diagonal cut would catch a shoulder on the frame).
  const inside = (r, p) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
  const crossings = [];
  for (let k = 0; k < cells.length; k++) {
    const p = pt(cells[k]);
    const r = doorRects.find((d) => inside(d, p));
    if (!r) continue;
    const last = crossings[crossings.length - 1];
    if (last && last.r === r && last.i1 >= k - 2) last.i1 = k; else crossings.push({ r, i0: k, i1: k });
  }
  const out = [];
  let k = 0;
  for (const c of crossings) {
    if (c.i0 > k) out.push(...pull(k, Math.max(k, c.i0 - 1)));
    const A = pt(cells[Math.max(0, c.i0 - 1)]), B = pt(cells[Math.min(cells.length - 1, c.i1 + 1)]);
    const sgn = c.r.thinX ? Math.sign(B.x - A.x) || 1 : Math.sign(B.z - A.z) || 1;
    const off = 0.7;
    out.push(c.r.thinX ? { x: c.r.cx - sgn * off, z: c.r.cz } : { x: c.r.cx, z: c.r.cz - sgn * off });
    out.push(c.r.thinX ? { x: c.r.cx + sgn * off, z: c.r.cz } : { x: c.r.cx, z: c.r.cz + sgn * off });
    k = Math.min(cells.length - 1, c.i1 + 1);
  }
  out.push(...pull(k, cells.length - 1));
  if (out.length) out[out.length - 1] = { x: to.x, z: to.z };
  else out.push({ x: to.x, z: to.z });
  return out;
}

/** A small binary min-heap of (node, priority). */
class Heap {
  constructor() { this.n = []; this.p = []; }
  get size() { return this.n.length; }
  push(node, pri) {
    const n = this.n, p = this.p;
    let i = n.length;
    n.push(node); p.push(pri);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (p[up] <= pri) break;
      n[i] = n[up]; p[i] = p[up]; i = up;
    }
    n[i] = node; p[i] = pri;
  }
  pop() {
    const n = this.n, p = this.p;
    const top = n[0];
    const lastN = n.pop(), lastP = p.pop();
    if (n.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n.length) break;
        if (c + 1 < n.length && p[c + 1] < p[c]) c++;
        if (p[c] >= lastP) break;
        n[i] = n[c]; p[i] = p[c]; i = c;
      }
      n[i] = lastN; p[i] = lastP;
    }
    return top;
  }
}
