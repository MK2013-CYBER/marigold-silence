import * as THREE from 'three';

/**
 * The little mail plane that brings Hart and Cole in (cinematic intro, addendum E).
 * A 1930s high-wing cabin monoplane built in code: fabric-covered fuselage, radial engine
 * under a ring cowl, wing struts, spatted wheels, two seats side by side.
 * Local axes: +Z is forward (the nose), +Y up. About 8.4 m long, 12 m wingspan.
 * plane.userData: prop (spinning), seatL / seatR (Object3D where the pilots sit), cockpitCam.
 */
export function buildMailPlane() {
  const g = new THREE.Group();
  g.name = 'MailPlane';
  const fabric = new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.72, metalness: 0.0, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0x6e1f1c, roughness: 0.6 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.35, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1916, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.65 });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // fuselage: a lathe profile along Z (nose at +3.2, tail at -5.2)
  const prof = [];
  const L = [[0.05, -5.2], [0.18, -4.6], [0.42, -3.0], [0.62, -1.2], [0.72, 0.2], [0.74, 1.4], [0.7, 2.4], [0.62, 3.0], [0.0, 3.05]];
  for (const [r, z] of L) prof.push(new THREE.Vector2(r, z));
  const body = new THREE.LatheGeometry(prof, 20);
  body.rotateX(Math.PI / 2); // lathe Y -> Z
  body.scale(1, 1.18, 1);
  const fus = add(body, fabric, 0, 1.6, 0);
  // a trim stripe
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.735, 0.735, 0.16, 20, 1, true), trim);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, 1.58, 0.9);
  stripe.scale.set(1, 1, 1.18);
  g.add(stripe);
  const stripe2 = add(new THREE.BoxGeometry(0.02, 0.12, 6.2), trim, 0.66, 1.42, -1.9);
  stripe2.rotation.y = 0.07;
  const stripe3 = add(new THREE.BoxGeometry(0.02, 0.12, 6.2), trim, -0.66, 1.42, -1.9);
  stripe3.rotation.y = -0.07;

  // engine: ring cowl, cylinders, spinner and propeller
  const cowl = add(new THREE.CylinderGeometry(0.78, 0.72, 0.55, 28, 1, true), alu, 0, 1.6, 3.15, Math.PI / 2);
  cowl.material = alu.clone();
  cowl.material.side = THREE.DoubleSide;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    add(new THREE.CylinderGeometry(0.09, 0.1, 0.42, 8), dark, Math.cos(a) * 0.48, 1.6 + Math.sin(a) * 0.48, 3.1, 0, 0, a + Math.PI / 2);
  }
  add(new THREE.CylinderGeometry(0.32, 0.36, 0.3, 16), dark, 0, 1.6, 3.15, Math.PI / 2);
  const prop = new THREE.Group();
  prop.position.set(0, 1.6, 3.48);
  g.add(prop);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 14), alu);
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 0.12;
  prop.add(spinner);
  for (const s of [1, -1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.035), dark);
    blade.position.y = 0.6 * s;
    blade.rotation.y = 0.35 * s;
    prop.add(blade);
  }
  // a faint disc so the spinning prop reads as a blur at speed
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: 0x2a2620, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  prop.add(disc);
  g.userData.prop = prop;
  g.userData.propDisc = disc;

  // cabin windows (both sides) and windscreen
  for (const s of [1, -1]) {
    add(new THREE.BoxGeometry(0.02, 0.5, 1.5), glass, 0.71 * s, 2.0, 0.9);
    add(new THREE.BoxGeometry(0.03, 0.56, 0.06), trim, 0.72 * s, 2.0, 0.15);
  }
  const ws = add(new THREE.BoxGeometry(1.2, 0.55, 0.03), glass, 0, 2.18, 1.95, -0.55);
  ws.renderOrder = 2;

  // high wing (two panels with dihedral) + struts
  for (const s of [1, -1]) {
    const w = add(new THREE.BoxGeometry(5.6, 0.14, 1.65), fabric, 3.25 * s, 2.52 + 0.08, 0.8, 0, 0, 0.035 * s);
    w.geometry.translate(0, 0, 0);
    add(new THREE.BoxGeometry(5.6, 0.145, 0.18), trim, 3.25 * s, 2.53 + 0.08, 0.05, 0, 0, 0.035 * s);
    for (const dz of [1.3, 0.3]) {
      const strut = add(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), alu, 1.55 * s, 1.75, dz, 0, 0, -0.95 * s);
      strut.castShadow = false;
    }
  }
  add(new THREE.BoxGeometry(1.5, 0.12, 1.65), fabric, 0, 2.5, 0.8);

  // tail
  const hs = add(new THREE.BoxGeometry(3.2, 0.06, 0.95), fabric, 0, 1.75, -4.6);
  hs.scale.set(1, 1, 1);
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(-1.1, 0); fin.lineTo(-0.85, 1.2); fin.quadraticCurveTo(-0.4, 1.35, 0, 0.9); fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false });
  finGeo.rotateY(Math.PI / 2);
  add(finGeo, trim, -0.03, 1.72, -4.15);

  // undercarriage with spatted wheels, tail wheel
  for (const s of [1, -1]) {
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), alu, 0.75 * s, 0.95, 1.35, 0, 0, 0.45 * s);
    add(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 18), rubber, 1.05 * s, 0.38, 1.35, 0, 0, Math.PI / 2);
    const spat = add(new THREE.SphereGeometry(0.42, 14, 10), trim, 1.05 * s, 0.45, 1.35);
    spat.scale.set(0.32, 0.75, 1.35);
  }
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), rubber, 0, 0.62, -4.75, 0, 0, Math.PI / 2);

  // cabin interior: two seats side by side, panel, sticks
  add(new THREE.BoxGeometry(1.28, 0.06, 2.4), dark, 0, 1.05, 0.7);
  for (const s of [1, -1]) {
    add(new THREE.BoxGeometry(0.48, 0.12, 0.5), leather, 0.3 * s, 1.22, 0.45);
    add(new THREE.BoxGeometry(0.48, 0.65, 0.1), leather, 0.3 * s, 1.55, 0.15, -0.12);
    add(new THREE.CylinderGeometry(0.02, 0.025, 0.55, 6), dark, 0.3 * s, 1.35, 1.05, 0.4);
  }
  const panel = add(new THREE.BoxGeometry(1.25, 0.32, 0.08), new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.5 }), 0, 1.78, 1.7, -0.2);
  for (let i = 0; i < 5; i++) {
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), new THREE.MeshStandardMaterial({ color: 0xe9e0c8, emissive: 0x6a5a30, emissiveIntensity: 0.35 }));
    gauge.position.set(-0.45 + i * 0.22, 0, 0.045);
    panel.add(gauge);
  }

  // where people sit (hips) and a camera spot for the cockpit shot
  const seatL = new THREE.Object3D(); seatL.position.set(-0.3, 1.18, 0.38); g.add(seatL);
  const seatR = new THREE.Object3D(); seatR.position.set(0.3, 1.18, 0.38); g.add(seatR);
  g.userData.seatL = seatL;
  g.userData.seatR = seatR;

  // "U.S. AIR MAIL" style lettering, made-up line name
  const tex = textTexture('SABLE AIR MAIL  ·  NC-1127');
  for (const s of [1, -1]) {
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.32), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7 }));
    lab.position.set(0.665 * s, 1.55, -1.7);
    lab.rotation.y = (Math.PI / 2) * s + (s > 0 ? 0.07 : -0.07);
    if (s < 0) lab.scale.x = -1;
    g.add(lab);
  }
  return g;
}

function textTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#6e1f1c';
  x.font = 'bold 76px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 512, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
