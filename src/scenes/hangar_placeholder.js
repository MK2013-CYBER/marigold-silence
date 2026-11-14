import * as THREE from 'three';
import * as T from '../engine/textures.js';
import data from '../data/scenes/hangar.json';

// Interior half-extents (metres). Origin is the hangar centre at floor level.
const HX = 15;
const HZ = 12;
const WALL_H = 8;
const RIDGE_H = 11;
const ROOF_ANGLE = Math.atan2(RIDGE_H - WALL_H, HX);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Builds the hangar interior (location B) and registers its colliders.
 * Returns { spawn, update(dt, t), onLightning } .
 */
export function buildHangar(scene, world) {
  const root = new THREE.Group();
  root.name = 'hangar';
  scene.add(root);

  // ---------- helpers ----------
  const shadow = (o, cast = true, receive = true) => {
    o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = receive; } });
    return o;
  };
  const place = (o, { solid = false, cast = true, receive = true, pad = 0, parent = root } = {}) => {
    shadow(o, cast, receive);
    parent.add(o);
    if (solid) world.addObject(o, pad);
    return o;
  };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };
  const cyl = (rt, rb, h, mat, seg = 20, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  const beam = (a, b, t, mat) => {
    const dir = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.BoxGeometry(dir.length(), t, t), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(X_AXIS, dir.normalize());
    return m;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const std = (opts) => new THREE.MeshStandardMaterial(opts);
  const sheet = (rx, ry, tint, seed, extra = {}) => {
    const { map, bump } = T.corrugated(rx, ry, tint, seed);
    return std({ map, bumpMap: bump, bumpScale: 1.5, roughness: 0.72, metalness: 0.35, ...extra });
  };

  // ---------- materials ----------
  const M = {
    floor: std({ map: T.concrete(5, 4), roughness: 0.93 }),
    steel: std({ color: 0x2c2825, roughness: 0.55, metalness: 0.7 }),
    darkSteel: std({ color: 0x191715, roughness: 0.6, metalness: 0.6 }),
    alu: std({ color: 0x77736b, roughness: 0.45, metalness: 0.8 }),
    wood: std({ map: T.wood(1, 1), roughness: 0.85 }),
    darkWood: std({ map: T.wood(2, 1, [58, 38, 24], 9), roughness: 0.8 }),
    officeWood: std({ map: T.wood(2, 1, [84, 58, 34], 13), roughness: 0.78 }),
    loftWood: std({ map: T.wood(3, 2, [80, 60, 42], 17), roughness: 0.9 }),
    crateWood: std({ map: T.wood(1, 1, [120, 92, 58], 19), roughness: 0.9 }),
    enamelGreen: std({ color: 0x24382c, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }),
    enamelInner: std({ color: 0xd8d0b8, roughness: 0.5, side: THREE.BackSide }),
    rubber: std({ color: 0x0d0d0c, roughness: 0.9 }),
    red: std({ color: 0x6e1d14, roughness: 0.6, metalness: 0.3 }),
    rag: std({ color: 0x6a6150, roughness: 1, side: THREE.DoubleSide }),
    cord: std({ color: 0x0b0a09, roughness: 0.8 }),
  };

  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), M.floor);
  floor.rotation.x = -Math.PI / 2;
  place(floor, { cast: false });

  // ---------- walls (one collider each) ----------
  const wallLong = sheet(16, 1, [88, 92, 86], 11);
  const wallShort = sheet(12, 1, [84, 88, 82], 12);
  place(box(HX * 2 + 0.6, WALL_H, 0.3, wallLong, 0, WALL_H / 2, -HZ - 0.15), { solid: true });
  place(box(HX * 2 + 0.6, WALL_H, 0.3, wallLong, 0, WALL_H / 2, HZ + 0.15), { solid: true });
  place(box(0.3, WALL_H, HZ * 2, wallShort, HX + 0.15, WALL_H / 2, 0), { solid: true });
  place(box(0.3, WALL_H, HZ * 2, wallShort, -HX - 0.15, WALL_H / 2, 0), { solid: true });

  // Gable ends
  const gShape = new THREE.Shape();
  gShape.moveTo(-HX, 0); gShape.lineTo(HX, 0); gShape.lineTo(0, RIDGE_H - WALL_H); gShape.closePath();
  const gMat = sheet(0.5, 0.33, [70, 72, 68], 14, { side: THREE.DoubleSide });
  for (const z of [-HZ, HZ]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(gShape), gMat);
    g.position.set(0, WALL_H, z);
    place(g, { cast: false });
  }

  // Roof slabs with storm-lit skylights
  const slope = Math.hypot(HX, RIDGE_H - WALL_H);
  const roofMat = sheet(10, 1, [56, 56, 52], 15);
  const windowTex = T.windowPane();
  const stormGlass = new THREE.MeshBasicMaterial({ map: windowTex, color: new THREE.Color(0x4a3e2c) });
  const stormBase = stormGlass.color.clone();
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set((s * HX) / 2, (WALL_H + RIDGE_H) / 2 + 0.06, 0);
    g.rotation.z = -s * ROOF_ANGLE;
    g.add(box(slope + 0.4, 0.1, HZ * 2 + 0.8, roofMat));
    for (const z of [-7, 1, 7]) {
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), stormGlass);
      sky.rotation.x = Math.PI / 2;
      sky.position.set(s * -1.8, -0.06, z);
      g.add(sky);
    }
    place(g, { cast: false });
  }

  // ---------- steel trusses, columns, purlins ----------
  const trusses = new THREE.Group();
  for (let z = -10; z <= 10; z += 4) {
    const top = V(0, RIDGE_H - 0.18, z);
    trusses.add(beam(V(-HX, WALL_H, z), V(HX, WALL_H, z), 0.18, M.steel));
    trusses.add(beam(V(-HX, WALL_H + 0.05, z), top, 0.22, M.steel));
    trusses.add(beam(V(HX, WALL_H + 0.05, z), top, 0.22, M.steel));
    trusses.add(beam(V(0, WALL_H, z), top, 0.14, M.steel));
    for (const s of [-1, 1]) {
      const yAt = (x) => WALL_H + (HX - Math.abs(x)) * Math.tan(ROOF_ANGLE) - 0.14;
      trusses.add(beam(V((s * HX) / 2, WALL_H, z), V((s * HX) / 2, yAt(HX / 2), z), 0.12, M.steel));
      trusses.add(beam(V((s * HX) / 2, WALL_H, z), V((s * HX) / 4, yAt(HX / 4), z), 0.1, M.steel));
      trusses.add(beam(V((s * HX) / 2, WALL_H, z), V((s * HX * 3) / 4, yAt((HX * 3) / 4), z), 0.1, M.steel));
      const col = box(0.28, WALL_H, 0.28, M.steel, s * (HX - 0.14), WALL_H / 2, z);
      place(col, { solid: true });
    }
  }
  for (const x of [-11.25, -7.5, -3.75, 3.75, 7.5, 11.25]) {
    const y = WALL_H + (HX - Math.abs(x)) * Math.tan(ROOF_ANGLE) - 0.22;
    trusses.add(beam(V(x, y, -HZ), V(x, y, HZ), 0.1, M.darkSteel));
  }
  place(trusses, { receive: false });

  // ---------- clerestory windows (east and west walls) ----------
  for (const s of [-1, 1]) {
    for (const z of [-9, -4.5, 0, 4.5, 9]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), stormGlass);
      w.position.set(s * (HX - 0.01), 6.2, z);
      w.rotation.y = -s * (Math.PI / 2);
      root.add(w);
      place(box(0.12, 0.08, 2.6, M.darkSteel, s * (HX - 0.06), 5.5, z), { cast: false });
    }
  }

  // Faded paint on the north wall
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 1.4),
    new THREE.MeshStandardMaterial({
      map: T.textPanel({ w: 1024, h: 128, lines: data.signs.wallBanner, font: 'bold 76px Georgia', color: '#d9d0b6', wear: 2600, seed: 8 }),
      transparent: true, opacity: 0.55, roughness: 1, depthWrite: false,
    }),
  );
  banner.position.set(-2, 6.6, -HZ + 0.02);
  root.add(banner);

  // ---------- main hangar doors (south), with storm light leaking in ----------
  const doorMat = sheet(6, 1, [62, 64, 60], 16);
  place(box(9, 6.6, 0.14, doorMat, -4.52, 3.3, HZ - 0.08), { cast: false });
  place(box(9, 6.6, 0.14, doorMat, 4.52, 3.3, HZ - 0.08), { cast: false });
  place(box(18.4, 0.25, 0.3, M.darkSteel, 0, 6.75, HZ - 0.2));
  for (const x of [-8.6, -0.4, 0.4, 8.6]) place(box(0.08, 0.5, 0.06, M.alu, x, 1.3, HZ - 0.18));
  const leakMat = new THREE.MeshBasicMaterial({
    map: T.softGradient(), color: 0x5a3f1e, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const leakBase = leakMat.color.clone();
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 6.5), new THREE.MeshBasicMaterial({ color: 0x6b5332 }));
  seam.position.set(0, 3.3, HZ - 0.16);
  seam.rotation.y = Math.PI;
  root.add(seam);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.2), leakMat);
  sill.rotation.x = -Math.PI / 2;
  sill.position.set(0, 0.01, HZ - 0.2);
  root.add(sill);

  // ---------- Pryce's office (north-east corner, bolted) ----------
  const OX0 = 8, OZ1 = -6, OH = 3.2;
  const seg = (x0, x1, y0, y1) => place(box(x1 - x0, y1 - y0, 0.14, M.officeWood, (x0 + x1) / 2, (y0 + y1) / 2, OZ1));
  seg(OX0, 10, 0, OH);
  seg(10, 11, 2.12, OH);
  seg(11, 12.2, 0, OH);
  seg(12.2, 13.8, 0, 1.15);
  seg(12.2, 13.8, 2.2, OH);
  seg(13.8, HX, 0, OH);
  place(box(0.14, OH, 6, M.officeWood, OX0, OH / 2, -9));
  place(box(HX - OX0 + 0.1, 0.14, 6.1, M.darkWood, (OX0 + HX) / 2, OH + 0.07, -9));
  // trim
  place(box(HX - OX0, 0.12, 0.2, M.darkWood, (OX0 + HX) / 2, 0.06, OZ1 + 0.02));
  place(box(1.2, 0.1, 0.22, M.darkWood, 10.5, 2.17, OZ1));
  place(box(1.8, 0.08, 0.28, M.darkWood, 13, 1.13, OZ1 + 0.05));

  const door = new THREE.Group();
  door.position.set(10.5, 0, OZ1);
  door.add(box(0.96, 2.1, 0.06, M.darkWood, 0, 1.05, 0));
  const doorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.8),
    new THREE.MeshStandardMaterial({ map: T.frostedDoorGlass(data.signs.officeDoor), roughness: 0.25, emissive: 0x1a1006, emissiveIntensity: 1 }),
  );
  doorGlass.position.set(0, 1.55, 0.032);
  door.add(doorGlass);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.alu);
  knob.position.set(0.36, 1.0, 0.07);
  door.add(knob);
  place(door);

  const officeWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05), new THREE.MeshBasicMaterial({ map: T.blinds(), color: 0x2a1a0a }));
  officeWindow.position.set(13, 1.67, OZ1 + 0.01);
  root.add(officeWindow);
  // light seeping under the door
  const under = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({
    map: T.softGradient(), color: 0x3a2008, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  under.rotation.x = -Math.PI / 2;
  under.position.set(10.5, 0.012, OZ1 + 0.05);
  root.add(under);
  world.addBox(OX0 - 0.1, -HZ, HX, OZ1 + 0.12);

  // ---------- loft (north-west) with ladder, lockers beneath ----------
  const LX0 = -HX, LX1 = -7, LZ0 = -HZ, LZ1 = -8, LY = 3.4;
  const loft = new THREE.Group();
  loft.add(box(LX1 - LX0, 0.18, LZ1 - LZ0, M.loftWood, (LX0 + LX1) / 2, LY, (LZ0 + LZ1) / 2));
  for (let x = LX0 + 1; x < LX1; x += 1.5) loft.add(box(0.12, 0.24, LZ1 - LZ0, M.darkWood, x, LY - 0.2, (LZ0 + LZ1) / 2));
  loft.add(box(LX1 - LX0, 0.26, 0.14, M.darkWood, (LX0 + LX1) / 2, LY - 0.2, LZ1 - 0.07));
  // railing with a gap where the ladder arrives
  const railY = LY + 1;
  loft.add(box(-9.2 - LX0, 0.08, 0.08, M.darkWood, (LX0 - 9.2) / 2, railY, LZ1 - 0.06));
  loft.add(box(LX1 - -8.2, 0.08, 0.08, M.darkWood, (-8.2 + LX1) / 2, railY, LZ1 - 0.06));
  loft.add(box(0.08, 0.08, LZ1 - LZ0, M.darkWood, LX1 - 0.06, railY, (LZ0 + LZ1) / 2));
  for (let x = LX0 + 0.4; x < LX1; x += 0.8) {
    if (x > -9.2 && x < -8.2) continue;
    loft.add(box(0.05, 1, 0.05, M.darkWood, x, LY + 0.5, LZ1 - 0.06));
  }
  for (let z = LZ0 + 0.4; z < LZ1; z += 0.8) loft.add(box(0.05, 1, 0.05, M.darkWood, LX1 - 0.06, LY + 0.5, z));
  // things stored up there
  loft.add(box(1.0, 0.8, 0.8, M.crateWood, -13.6, LY + 0.49, -11.2));
  loft.add(box(0.7, 0.6, 0.7, M.crateWood, -12.4, LY + 0.39, -11.3));
  loft.add(box(0.9, 0.35, 0.5, M.darkWood, -10.6, LY + 0.27, -11.4));
  const tarp = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x3d3a2c, roughness: 1, flatShading: true }));
  tarp.scale.set(1.2, 0.7, 0.9);
  tarp.position.set(-8.6, LY + 0.09, -10.6);
  loft.add(tarp);
  place(loft);
  for (const x of [LX1 - 0.12, -11, LX0 + 0.12]) place(box(0.2, LY - 0.1, 0.2, M.darkWood, x, (LY - 0.1) / 2, LZ1 - 0.12), { solid: true });
  place(box(0.2, LY - 0.1, 0.2, M.darkWood, LX1 - 0.12, (LY - 0.1) / 2, LZ0 + 0.12), { solid: true });

  const ladder = new THREE.Group();
  const lx = -8.7, lzBottom = LZ1 + 0.85, lzTop = LZ1 - 0.02;
  for (const dx of [-0.22, 0.22]) ladder.add(beam(V(lx + dx, 0, lzBottom), V(lx + dx, LY + 0.95, lzTop), 0.06, M.darkWood));
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const y = t * (LY + 0.95), z = lzBottom + (lzTop - lzBottom) * t;
    ladder.add(box(0.44, 0.035, 0.035, M.darkWood, lx, y, z));
  }
  place(ladder);
  world.addBox(lx - 0.27, lzTop, lx + 0.27, lzBottom + 0.05);

  // six tool lockers under the loft, each with a hinged door
  const lockerSide = std({ color: 0x343b2a, roughness: 0.65, metalness: 0.4 });
  const lockerInside = std({ color: 0x15170f, roughness: 0.9 });
  const lockers = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Group();
    l.position.set(-14.55 + i * 0.62, 0, -HZ + 0.27);
    l.add(box(0.6, 1.9, 0.02, lockerSide, 0, 0.95, -0.24));
    l.add(box(0.02, 1.9, 0.5, lockerSide, -0.29, 0.95, 0));
    l.add(box(0.02, 1.9, 0.5, lockerSide, 0.29, 0.95, 0));
    l.add(box(0.6, 0.02, 0.5, lockerSide, 0, 1.89, 0));
    l.add(box(0.6, 0.02, 0.5, lockerSide, 0, 0.01, 0));
    l.add(box(0.56, 1.86, 0.005, lockerInside, 0, 0.95, -0.228));
    l.add(box(0.56, 0.015, 0.46, lockerSide, 0, 1.55, 0)); // shelf
    const front = std({ map: T.locker(i + 1), roughness: 0.6, metalness: 0.4 });
    const door = new THREE.Group();
    door.position.set(-0.3, 0, 0.25);
    door.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.025), [lockerSide, lockerSide, lockerSide, lockerSide, front, lockerSide]));
    door.children[0].position.set(0.3, 0.95, 0);
    l.add(door);
    l.userData.parts = { door };
    lockers.push(l);
    place(l);
  }
  // what's inside locker 3
  {
    const l = lockers[2];
    const overalls = box(0.34, 1.0, 0.1, std({ color: 0x1d2128, roughness: 1 }), 0.02, 0.95, -0.12);
    overalls.rotation.y = 0.15;
    l.add(overalls);
    l.add(box(0.06, 0.03, 0.06, std({ color: 0x0c0c0b, roughness: 0.5, metalness: 0.4 }), -0.18, 1.58, 0));
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.13), std({ color: 0x8c8370, roughness: 0.9 }));
    photo.position.set(0.12, 1.3, -0.224);
    l.add(photo);
    shadow(l);
  }
  world.addBox(-14.9, -HZ, -11.0, -HZ + 0.55);

  // ---------- workbench (west wall) ----------
  const bench = new THREE.Group();
  const bx = -HX + 0.5, bz = -1;
  bench.add(box(0.95, 0.08, 4, M.darkWood, bx, 0.9, bz));
  bench.add(box(0.85, 0.04, 3.8, M.darkWood, bx, 0.25, bz));
  for (const dx of [-0.4, 0.4]) for (const dz of [-1.9, 1.9]) bench.add(box(0.08, 0.86, 0.08, M.darkWood, bx + dx, 0.43, bz + dz));
  // vise
  bench.add(box(0.22, 0.12, 0.18, M.darkSteel, bx + 0.42, 1.0, bz + 1.3));
  bench.add(box(0.06, 0.12, 0.18, M.darkSteel, bx + 0.58, 1.0, bz + 1.3));
  bench.add(beam(V(bx + 0.62, 1.0, bz + 1.15), V(bx + 0.62, 1.0, bz + 1.45), 0.02, M.alu));
  // oil can, rag, coffee tin (the toolbox is an interactable, see interactables.json)
  const can = cyl(0.07, 0.09, 0.2, M.darkSteel, 14); can.position.set(bx + 0.1, 1.04, bz - 0.4); bench.add(can);
  const spout = beam(V(bx + 0.1, 1.14, bz - 0.4), V(bx + 0.28, 1.28, bz - 0.4), 0.015, M.darkSteel); bench.add(spout);
  const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.3), M.rag); rag.rotation.set(-Math.PI / 2, 0, 0.4); rag.position.set(bx + 0.2, 0.945, bz + 0.3); bench.add(rag);
  const tin = cyl(0.06, 0.06, 0.12, M.alu, 12); tin.position.set(bx - 0.25, 1.0, bz + 0.7); bench.add(tin);
  // pegboard with tool silhouettes
  bench.add(box(0.03, 1.2, 3.6, std({ color: 0x4a3a28, roughness: 0.95 }), -HX + 0.02, 1.75, bz));
  for (let i = 0; i < 9; i++) {
    const t = box(0.03, 0.25 + (i % 3) * 0.1, 0.05, M.darkSteel, -HX + 0.05, 1.85 + (i % 2) * 0.15, bz - 1.5 + i * 0.37);
    t.rotation.x = (i % 2 ? 0.3 : -0.2);
    bench.add(t);
  }
  place(bench);
  world.addObject(bench.children[0], 0.05);

  // ---------- radial engine on a stand ----------
  const engine = new THREE.Group();
  engine.position.set(-4, 0, 4);
  engine.rotation.y = 0.5;
  engine.add(box(1.4, 0.08, 1.0, M.darkSteel, 0, 0.16, 0));
  for (const dx of [-0.6, 0.6]) for (const dz of [-0.4, 0.4]) {
    const w = cyl(0.06, 0.06, 0.05, M.rubber, 10); w.rotation.x = Math.PI / 2; w.position.set(dx, 0.06, dz); engine.add(w);
  }
  for (const dx of [-0.45, 0.45]) engine.add(box(0.08, 1.15, 0.08, M.red, dx, 0.75, 0));
  engine.add(box(1.0, 0.08, 0.08, M.red, 0, 1.3, 0));
  const motor = new THREE.Group();
  motor.position.set(0, 1.5, 0.15);
  const crank = cyl(0.32, 0.32, 0.34, M.darkSteel, 24); crank.rotation.x = Math.PI / 2; motor.add(crank);
  const nose = cyl(0.14, 0.26, 0.26, M.alu, 20); nose.rotation.x = Math.PI / 2; nose.position.z = 0.3; motor.add(nose);
  const shaft = cyl(0.05, 0.05, 0.2, M.steel, 10); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.52; motor.add(shaft);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 36), M.darkSteel); ring.position.z = -0.2; motor.add(ring);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const c = new THREE.Group();
    c.rotation.z = a - Math.PI / 2;
    const barrel = cyl(0.1, 0.1, 0.4, M.darkSteel, 12); barrel.position.y = 0.48; c.add(barrel);
    for (let f = 0; f < 5; f++) { const fin = cyl(0.135, 0.135, 0.014, M.steel, 12); fin.position.y = 0.32 + f * 0.07; c.add(fin); }
    const head = box(0.2, 0.14, 0.22, M.alu); head.position.y = 0.74; c.add(head);
    const rod = beam(V(0.08, 0.3, 0.12), V(0.06, 0.7, 0.1), 0.018, M.alu); c.add(rod);
    motor.add(c);
  }
  engine.add(motor);
  place(engine);
  world.addBox(-4.85, 3.15, -3.15, 4.85);

  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), std({ color: 0x030202, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.scale.set(1, 0.6, 1);
  puddle.position.set(-3.7, 0.004, 4.4);
  root.add(puddle);

  // propeller leaning against the east wall
  const prop = new THREE.Group();
  prop.position.set(HX - 0.35, 1.4, 3.5);
  prop.rotation.z = 0.12;
  prop.add(box(0.06, 2.8, 0.2, M.darkWood));
  const hub = cyl(0.12, 0.12, 0.18, M.alu, 16); hub.rotation.z = Math.PI / 2; prop.add(hub);
  place(prop, { solid: true, pad: 0.05 });

  // ---------- drums and crates ----------
  const drumMats = [0x5c2219, 0x363b24, 0x151413, 0x4a2d16].map((c) => std({ color: c, roughness: 0.55, metalness: 0.45 }));
  const drum = (x, z, mi, lying = false, ry = 0) => {
    const d = new THREE.Group();
    d.add(cyl(0.29, 0.29, 0.88, drumMats[mi], 24));
    for (const y of [-0.22, 0.22]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.014, 6, 24), drumMats[mi]); r.rotation.x = Math.PI / 2; r.position.y = y; d.add(r); }
    const lid = cyl(0.27, 0.27, 0.01, M.darkSteel, 24); lid.position.y = 0.44; d.add(lid);
    if (lying) { d.rotation.set(0, ry, Math.PI / 2); d.position.set(x, 0.29, z); }
    else { d.rotation.y = ry; d.position.set(x, 0.44, z); }
    place(d, { solid: true });
  };
  drum(12.5, 9.4, 0); drum(13.15, 9.9, 1); drum(12.4, 10.1, 0, false, 1); drum(13.25, 10.75, 3);
  drum(-12.8, 10.5, 1); drum(-13.45, 9.8, 0); drum(-12.15, 9.75, 2); drum(-10.9, 10.5, 3, true, 0.3);
  drum(-13.9, 4.2, 2); drum(-13.9, 4.85, 1);

  const crateTex = T.textPanel({ w: 256, h: 256, bg: '#7c5e3a', lines: data.signs.crate, font: 'bold 44px Courier New', color: '#1f150b', wear: 900, seed: 12 });
  const crateMat = std({ map: crateTex, roughness: 0.9 });
  const crate = (s, x, y, z, ry = 0) => { const c = box(s, s, s, crateMat, x, y + s / 2, z); c.rotation.y = ry; place(c, { solid: y < 0.5 }); return c; };
  crate(1.2, 10.4, 0, 10.6, 0.1); crate(1.0, 9.1, 0, 10.8, -0.15); crate(0.8, 10.3, 1.2, 10.55, 0.4);
  crate(0.9, 3.5, 0, -10.8, 0.2);

  // fire buckets + no smoking sign near the office
  const firePanel = place(box(0.05, 0.9, 1.2, std({ map: T.textPanel({ w: 256, h: 192, bg: '#5a1610', lines: data.signs.fire, font: 'bold 72px Georgia', color: '#e0d4b8', wear: 400 }), roughness: 0.7 }), HX - 0.03, 2.0, -3.5));
  firePanel.rotation.y = 0;
  for (const dz of [-0.4, 0, 0.4]) {
    const b = cyl(0.14, 0.1, 0.26, M.red, 14);
    b.position.set(HX - 0.2, 1.3, -3.5 + dz);
    place(b);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), std({ map: T.textPanel({ w: 384, h: 160, bg: '#d6ccb0', lines: data.signs.noSmoking, font: 'bold 48px Georgia', color: '#2a1a12', wear: 600, seed: 22 }), roughness: 0.8 }));
  sign.position.set(5.5, 2.4, -HZ + 0.02);
  root.add(sign);

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight(0x39404c, 0x1a140c, 0.35));

  const storm = new THREE.DirectionalLight(0x8a7b5e, 0.22);
  storm.position.set(-10, 20, 4);
  scene.add(storm, storm.target);

  const lamps = [];
  const hangingLamp = (x, z, { intensity = 80, shadows = false, flicker = false, dead = false } = {}) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, WALL_H, z);
    const drop = 2.5;
    const cord = cyl(0.008, 0.008, drop, M.cord, 6); cord.position.y = -drop / 2; pivot.add(cord);
    const shade = cyl(0.06, 0.42, 0.32, M.enamelGreen, 24, true); shade.position.y = -drop - 0.12; pivot.add(shade);
    const inner = cyl(0.058, 0.4, 0.3, M.enamelInner, 24, true); inner.position.y = -drop - 0.12; pivot.add(inner);
    const bulbMat = new THREE.MeshBasicMaterial({ color: dead ? 0x1a1814 : 0xffd9a0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), bulbMat); bulb.position.y = -drop - 0.24; pivot.add(bulb);
    let light = null;
    if (!dead) {
      light = new THREE.SpotLight(0xffb36a, intensity, 22, 1.05, 0.65, 2);
      light.position.y = -drop - 0.22;
      light.target.position.set(0, -WALL_H, 0);
      pivot.add(light, light.target);
      if (shadows) {
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.03;
        light.shadow.camera.near = 0.3;
        light.shadow.camera.far = 14;
      }
    }
    shadow(pivot, false, false);
    root.add(pivot);
    lamps.push({ pivot, light, bulbMat, base: intensity, flicker, dip: 0, phase: Math.random() * 10 });
  };
  hangingLamp(-5, -1.5, { intensity: 85, shadows: true });
  hangingLamp(4, 4.5, { intensity: 70, shadows: true, flicker: true });
  hangingLamp(6, -3, { dead: true });
  hangingLamp(-1, 9.5, { intensity: 22 });

  // bench lamp
  const benchLamp = new THREE.Group();
  benchLamp.position.set(-HX + 0.6, 2.55, -1);
  const bShade = cyl(0.04, 0.2, 0.18, M.enamelGreen, 18, true); benchLamp.add(bShade);
  const bBulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); bBulb.position.y = -0.07; benchLamp.add(bBulb);
  const bLight = new THREE.PointLight(0xffc27a, 7, 6, 2); bLight.position.y = -0.1; benchLamp.add(bLight);
  benchLamp.add(beam(V(0, 0.09, 0), V(-0.58, 0.6, 0), 0.02, M.darkSteel));
  root.add(benchLamp);

  // ---------- drifting dust ----------
  const DUST = 1400;
  const pos = new Float32Array(DUST * 3);
  const vel = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * (HX - 0.5);
    pos[i * 3 + 1] = Math.random() * WALL_H;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * (HZ - 0.5);
    vel[i * 3] = (Math.random() - 0.5) * 0.05;
    vel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05 - 0.02;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.035, map: T.dustSprite(), color: 0xb89a72, transparent: true, opacity: 0.35,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  root.add(dust);

  // ---------- per-frame ----------
  let nextFlash = 5 + Math.random() * 5;
  let flashT = -1;
  const flashBright = new THREE.Color(2.2, 2.2, 2.6);
  const flashCurve = (t) => {
    if (t < 0.07) return 1;
    if (t < 0.16) return 0.1;
    if (t < 0.24) return 0.8;
    if (t < 0.4) return 0.15;
    if (t < 0.55) return 0.55 * (1 - (t - 0.4) / 0.15);
    return 0;
  };

  // Glow planes and decals must never block the interaction ray.
  for (const o of [banner, seam, sill, under, dust]) o.userData.noRay = true;

  const api = {
    spawn: data.spawn,
    root,
    named: { workbench: bench, locker_3: lockers[2] },
    onLightning: null,
    update(dt, t) {
      // lamps sway in the draught, one of them misbehaves
      for (const l of lamps) {
        l.pivot.rotation.x = Math.sin(t * 0.7 + l.phase) * 0.025;
        l.pivot.rotation.z = Math.sin(t * 0.53 + l.phase * 2) * 0.02;
        if (!l.light) continue;
        let k = 1;
        if (l.flicker) {
          if (l.dip > 0) { l.dip -= dt; k = Math.random() < 0.6 ? 0.05 + Math.random() * 0.3 : 1; }
          else if (Math.random() < dt * 0.35) l.dip = 0.15 + Math.random() * 0.5;
          k *= 0.92 + 0.08 * Math.sin(t * 31 + l.phase);
        }
        l.light.intensity = l.base * k;
        l.bulbMat.color.setRGB(k, k * 0.85, k * 0.62);
      }

      // dust drift, wrapped inside the hangar volume
      const gust = Math.sin(t * 0.3) * 0.03;
      for (let i = 0; i < DUST; i++) {
        const j = i * 3;
        pos[j] += (vel[j] + gust) * dt;
        pos[j + 1] += (vel[j + 1] + Math.sin(t + i) * 0.01) * dt;
        pos[j + 2] += vel[j + 2] * dt;
        if (pos[j] > HX) pos[j] = -HX; else if (pos[j] < -HX) pos[j] = HX;
        if (pos[j + 1] > WALL_H) pos[j + 1] = 0; else if (pos[j + 1] < 0) pos[j + 1] = WALL_H;
        if (pos[j + 2] > HZ) pos[j + 2] = -HZ; else if (pos[j + 2] < -HZ) pos[j + 2] = HZ;
      }
      dustGeo.attributes.position.needsUpdate = true;

      // lightning through the windows
      nextFlash -= dt;
      if (nextFlash <= 0 && flashT < 0) {
        flashT = 0;
        api.onLightning?.(0.8 + Math.random() * 2.2);
      }
      let f = 0;
      if (flashT >= 0) {
        flashT += dt;
        f = flashCurve(flashT);
        if (flashT > 0.6) { flashT = -1; nextFlash = 9 + Math.random() * 22; }
      }
      stormGlass.color.copy(stormBase).lerp(flashBright, f);
      storm.intensity = 0.22 + f * 5;
      leakMat.color.copy(leakBase).lerp(flashBright, f * 0.4);
    },
  };
  return api;
}
