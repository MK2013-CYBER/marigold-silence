import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../engine/textures.js';

/**
 * Location A: runway, apron, road, faded markings, oil-drum markers, perimeter fence
 * with gaps, the gate, the torn windsock. Repeated things are instanced (one draw call).
 */
export function buildAirfield(scene, world, cfg, ground, textures) {
  const root = new THREE.Group();
  root.name = 'airfield';
  scene.add(root);
  const r = rng(42);

  // ---------- soft-edged surfaces: runway, apron, road ----------
  const edgeAlpha = alphaStrip(0.12);
  function stripMat(prefix, alpha = edgeAlpha) {
    return new THREE.MeshStandardMaterial({
      map: textures[`${prefix}_color`], normalMap: textures[`${prefix}_normal`], roughnessMap: textures[`${prefix}_roughness`],
      alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }

  // runway: u along (8 m tiles), v across (0..1)
  const rw = cfg.runway;
  {
    const len = rw.x[1] - rw.x[0], wid = rw.z[1] - rw.z[0];
    const g = new THREE.PlaneGeometry(len + 16, wid + 6, 64, 4);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len + 16) / 8, uv.getY(i));
    const m = new THREE.Mesh(g, stripMat('runway'));
    m.position.set((rw.x[0] + rw.x[1]) / 2, 0.02, (rw.z[0] + rw.z[1]) / 2);
    m.receiveShadow = true;
    m.renderOrder = 1;
    m.name = 'Runway';
    root.add(m);
  }
  // apron: tiles both ways (uv), soft edges on all sides (uv1)
  {
    const ap = cfg.apron;
    const w = ap.x[1] - ap.x[0], d = ap.z[1] - ap.z[0];
    const g = new THREE.PlaneGeometry(w, d, 8, 8);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    g.setAttribute('uv1', uv.clone());
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 10, uv.getY(i) * d / 10);
    const alpha = alphaBox(0.14);
    alpha.channel = 1;
    const m = new THREE.Mesh(g, stripMat('apron', alpha));
    m.position.set((ap.x[0] + ap.x[1]) / 2, 0.012, (ap.z[0] + ap.z[1]) / 2);
    m.receiveShadow = true;
    m.name = 'Apron';
    root.add(m);
  }
  // road and footpaths: ribbons along polylines, following the ground
  const roadMat = stripMat('road');
  for (const [i, path] of [cfg.road, ...(cfg.paths ?? [])].entries()) {
    const pts = resample(path.points, i === 0 ? 8 : 2);
    const half = path.width / 2;
    const P = [], U = [], I = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)];
      const [px, pz] = pts[Math.max(i - 1, 0)];
      let tx = nx - px, tz = nz - pz;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      for (const s of [-1, 1]) {
        const vx = x - tz * half * s, vz = z + tx * half * s;
        P.push(vx, ground.heightAt(vx, vz) + 0.03, vz);
        U.push(dist / 8, s < 0 ? 0 : 1);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    m.name = i === 0 ? 'Road' : `Path_${i}`;
    root.add(m);
  }

  // ---------- faded paint: threshold bars, centre dashes, circle, field name ----------
  {
    const parts = [];
    const cz = (rw.z[0] + rw.z[1]) / 2;
    const bar = (x, z, w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x, 0, z); parts.push(g); };
    for (const end of [rw.x[0] + 8, rw.x[1] - 8]) {
      for (let k = 0; k < 8; k++) bar(end, rw.z[0] + 3 + k * 3.4, 12, 1.4);
    }
    for (let x = rw.x[0] + 40; x < rw.x[1] - 40; x += 32) {
      if (Math.abs(x) < 26) continue;
      bar(x, cz, 12, 0.7);
    }
    const ring = new THREE.RingGeometry(13, 14.6, 48);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, 0, cz);
    parts.push(ring);
    const paint = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({
      color: 0xd8d2c2, map: wornPaint(), transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    paint.position.y = 0.03;
    paint.receiveShadow = true;
    paint.renderOrder = 2;
    paint.name = 'RunwayMarkings';
    root.add(paint);

    const gt = cfg.groundText;
    const tex = textTexture(cfg.fieldName);
    const tg = new THREE.PlaneGeometry(gt.size * cfg.fieldName.length * 0.62, gt.size * 1.3);
    tg.rotateX(-Math.PI / 2);
    const txt = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({
      color: 0xd8d2c2, map: tex, transparent: true, opacity: 0.45, depthWrite: false, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    txt.position.set(gt.x, 0.03, gt.z);
    txt.rotation.y = Math.PI; // reads the right way round from the hangar door
    txt.renderOrder = 2;
    txt.name = 'FieldName';
    root.add(txt);
  }

  // ---------- oil-drum runway markers (instanced) ----------
  {
    const spots = [];
    for (let x = rw.x[0]; x <= rw.x[1] + 0.1; x += rw.markerSpacing) {
      spots.push([x, rw.z[0] - 2.5], [x, rw.z[1] + 2.5]);
    }
    for (const x of [rw.x[0] - 4, rw.x[1] + 4]) for (const f of [0.2, 0.5, 0.8]) spots.push([x, rw.z[0] + f * (rw.z[1] - rw.z[0])]);
    const g = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16);
    const mat = new THREE.MeshStandardMaterial({ map: drumTexture(), roughness: 0.7, metalness: 0.3 });
    const inst = new THREE.InstancedMesh(g, mat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    spots.forEach(([x, z], i) => {
      const tipped = r() < 0.12;
      e.set(tipped ? Math.PI / 2 : (r() - 0.5) * 0.08, r() * Math.PI * 2, 0, 'YXZ');
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x + (r() - 0.5), tipped ? 0.29 : 0.44, z + (r() - 0.5)), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
      world.addBox(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.name = 'DrumMarkers';
    root.add(inst);
  }

  // ---------- perimeter fence (instanced posts, one line set for the wire) ----------
  {
    const f = cfg.fence;
    const gate = cfg.gate;
    const sides = [
      { name: 'north', a: f.x, fixed: f.z[0], along: 'x' },
      { name: 'south', a: f.x, fixed: f.z[1], along: 'x' },
      { name: 'west', a: f.z, fixed: f.x[0], along: 'z' },
      { name: 'east', a: f.z, fixed: f.x[1], along: 'z' },
    ];
    const posts = [];
    const wire = [];
    for (const s of sides) {
      const gaps = f.gaps.filter((g) => g.side === s.name).map((g) => [g.from, g.to]);
      if (s.name === 'north') gaps.push([gate.x - gate.width / 2, gate.x + gate.width / 2]);
      const inGap = (a) => gaps.some(([g0, g1]) => a > g0 && a < g1);
      const at = (a) => (s.along === 'x' ? [a, s.fixed] : [s.fixed, a]);
      let runStart = null;
      let prev = null;
      for (let a = s.a[0]; a <= s.a[1] + 0.01; a += f.postSpacing) {
        if (inGap(a)) {
          if (runStart !== null) addRun(world, s, runStart, prev);
          runStart = null;
          prev = null;
          continue;
        }
        const [x, z] = at(a);
        posts.push([x, z, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12]);
        if (prev !== null) {
          const [px, pz] = at(prev);
          for (const y of [0.45, 0.85, 1.25]) {
            const sag = 0.06 + r() * 0.05;
            const mx = (x + px) / 2, mz = (z + pz) / 2;
            wire.push(px, y, pz, mx, y - sag, mz, mx, y - sag, mz, x, y, z);
          }
        }
        if (runStart === null) runStart = a;
        prev = a;
      }
      if (runStart !== null) addRun(world, s, runStart, prev);
    }
    const pg = new THREE.CylinderGeometry(0.055, 0.07, 1.5, 6);
    pg.translate(0, 0.75, 0);
    const pm = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
    const inst = new THREE.InstancedMesh(pg, pm, posts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    posts.forEach(([x, z, tx, tz], i) => {
      e.set(tx, 0, tz);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 0.85 + r() * 0.3, 1));
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true;
    inst.name = 'FencePosts';
    root.add(inst);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2e2a25, transparent: true, opacity: 0.8 }));
    wires.name = 'FenceWire';
    root.add(wires);

    // the gate: two heavy posts, one leaf shut, one blown open
    const gm = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
    const sm = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, metalness: 0.6 });
    const gx0 = gate.x - gate.width / 2, gx1 = gate.x + gate.width / 2;
    for (const x of [gx0, gx1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), gm);
      p.position.set(x, 1.2, gate.z);
      p.castShadow = true;
      root.add(p);
      world.addBox(x - 0.25, gate.z - 0.25, x + 0.25, gate.z + 0.25);
    }
    const leaf = (hx, len, ang) => {
      const g = new THREE.Group();
      g.position.set(hx, 0, gate.z);
      g.rotation.y = ang;
      const L = Math.abs(len), s = Math.sign(len);
      for (const y of [0.35, 1.05, 1.75]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.06), sm);
        b.position.set((s * L) / 2, y, 0);
        g.add(b);
      }
      for (const x of [0.05, L / 2, L - 0.05]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), sm);
        b.position.set(s * x, 1.05, 0);
        g.add(b);
      }
      const d = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(L, 1.4), 0.05, 0.05), sm);
      d.position.set((s * L) / 2, 1.05, 0);
      d.rotation.z = s * Math.atan2(1.4, L);
      g.add(d);
      g.traverse((o) => { o.castShadow = true; });
      root.add(g);
      return g;
    };
    leaf(gx0, gate.width / 2 - 0.1, 0);
    world.addBox(gx0, gate.z - 0.1, gate.x - 0.1, gate.z + 0.1);
    leaf(gx1, -(gate.width / 2 - 0.1), -1.9); // swung open, towards the airfield
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), new THREE.MeshStandardMaterial({ map: signTexture(cfg.fieldName), roughness: 0.9 }));
    sign.position.set(gx0 - 1.6, 1.9, gate.z - 0.18);
    sign.rotation.y = Math.PI;
    root.add(sign);
  }

  // ---------- the torn windsock ----------
  const sock = windsock(cfg.windsock, world);
  root.add(sock.group);

  return {
    root,
    update(dt, t, wind) {
      sock.update(dt, t, wind);
    },
  };
}

function addRun(world, s, a0, a1) {
  if (a1 === null || a1 - a0 < 0.1) return;
  if (s.along === 'x') world.addBox(a0 - 0.1, s.fixed - 0.12, a1 + 0.1, s.fixed + 0.12);
  else world.addBox(s.fixed - 0.12, a0 - 0.1, s.fixed + 0.12, a1 + 0.1);
}

function resample(points, step) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function windsock(c, world) {
  const group = new THREE.Group();
  group.position.set(c.x, 0, c.z);
  group.name = 'Windsock';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 7, 8), new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.6, metalness: 0.5 }));
  pole.position.y = 3.5;
  pole.castShadow = true;
  group.add(pole);
  world.addBox(c.x - 0.25, c.z - 0.25, c.x + 0.25, c.z + 0.25);
  const head = new THREE.Group();
  head.position.y = 6.9;
  group.add(head);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 20), pole.material);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = 0.2;
  head.add(ring);
  const mat = new THREE.MeshStandardMaterial({ map: sockTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const segs = [];
  let parent = head;
  const n = 6, len = 0.55;
  for (let i = 0; i < n; i++) {
    const r0 = 0.45 - i * 0.045, r1 = 0.45 - (i + 1) * 0.045;
    const g = new THREE.CylinderGeometry(r1, r0, len, 14, 1, true);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (i + uv.getY(k)) / n);
    const seg = new THREE.Group();
    seg.position.x = i === 0 ? 0.2 : len;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    seg.add(mesh);
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }
  return {
    group,
    update(dt, t, wind) {
      const yaw = Math.atan2(-wind.dirZ, wind.dirX) + Math.sin(t * 0.9) * 0.18 * wind.gust;
      head.rotation.y = yaw;
      const stiff = Math.min(1, wind.speed / 12);
      segs.forEach((s, i) => {
        s.rotation.z = -(1 - stiff) * 0.25 - Math.sin(t * 7 + i * 0.9) * 0.05 * (1 + wind.gust);
        s.rotation.y = Math.sin(t * 5.3 + i * 1.3) * 0.06 * (1 + wind.gust);
      });
    },
  };
}

// ---------- small canvas textures ----------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function alphaStrip(feather) {
  const [c, g] = canvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#000');
  grd.addColorStop(feather, '#fff');
  grd.addColorStop(1 - feather, '#fff');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function alphaBox(feather) {
  const S = 128;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const e = Math.min(x, y, S - 1 - x, S - 1 - y) / S;
      const v = Math.min(1, e / feather) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

function wornPaint() {
  const S = 256, r = rng(9);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.8})`;
    const w = 1 + r() * 7;
    g.fillRect(r() * S, r() * S, w, w * (0.3 + r()));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function textTexture(text) {
  const [c, g] = canvas(2048, 256);
  g.fillStyle = '#fff';
  g.font = 'bold 200px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 1024, 136);
  g.globalCompositeOperation = 'destination-out';
  const r = rng(13);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
    g.fillRect(r() * 2048, r() * 256, 2 + r() * 10, 1 + r() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(text) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#6b5a44';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#e6dcc4';
  g.font = 'bold 54px Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const r = rng(17);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(60,48,34,${r() * 0.6})`;
    g.fillRect(r() * 512, r() * 128, 1 + r() * 4, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drumTexture() {
  const [c, g] = canvas(256, 256);
  const bands = ['#7e1e14', '#d6cfc0', '#7e1e14', '#d6cfc0', '#7e1e14'];
  bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 51.2, 256, 51.2); });
  const r = rng(21);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${90 + r() * 40},${40 + r() * 20},20,${0.2 + r() * 0.5})`;
    const x = r() * 256, y = r() * 256, rad = 2 + r() * 14;
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.4 + r()), 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sockTexture() {
  const W = 256, H = 256, r = rng(31);
  const [c, g] = canvas(W, H);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#d8d0bd' : '#b8501d'; g.fillRect(0, (i * H) / 6, W, H / 6); }
  // grime, holes and a ragged, torn tail end (transparent = cut away)
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,45,30,${r() * 0.25})`; g.fillRect(r() * W, r() * H, 2 + r() * 8, 2 + r() * 8); }
  g.globalCompositeOperation = 'destination-out';
  // canvas top (y = 0) is the tail end of the sock
  for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(r() * W, H * 0.05 + r() * H * 0.6, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, Math.PI * 2); g.fill(); }
  g.beginPath();
  g.moveTo(0, 0);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, 10 + r() * 46);
  g.lineTo(W, 0);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
