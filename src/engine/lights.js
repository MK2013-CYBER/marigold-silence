import * as THREE from 'three';

/**
 * Turns LIGHT_* marker nodes (custom properties from Blender) into real lights.
 * Returns a list for animation (flicker, bulb glow).
 */
export function lightsFromMarkers(root) {
  const lamps = [];
  const markers = [];
  root.traverse((o) => { if (o.userData.light) markers.push(o); });
  for (const m of markers) {
    const d = m.userData;
    const color = new THREE.Color(d.color ?? '#ffb36a');
    let light;
    if (d.light === 'spot') {
      light = new THREE.SpotLight(color, d.intensity, d.distance ?? 22, d.angle ?? 1.05, d.penumbra ?? 0.65, 2);
      light.target.position.set(0, -8, 0);
      m.add(light.target);
    } else {
      light = new THREE.PointLight(color, d.intensity, d.distance ?? 5, 2);
    }
    if (d.shadow) {
      light.userData.wantsShadow = true; // quality presets may switch this off
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.03;
      light.shadow.camera.near = 0.3;
      light.shadow.camera.far = 14;
    }
    light.position.set(0, 0, 0); // three.js puts new spot lights 1 m up by default
    m.add(light);
    let bulbMat = null;
    const bulb = d.bulb ? root.getObjectByName(d.bulb) : null;
    if (bulb?.material) {
      bulb.material = bulb.material.clone();
      bulbMat = bulb.material;
    }
    lamps.push({ light, base: d.intensity, flicker: !!d.flicker, bulbMat, bulbBase: bulbMat?.emissiveIntensity ?? 1, dip: 0, phase: Math.random() * 10 });
  }
  return lamps;
}

export function animateLamps(lamps, dt, t) {
  for (const l of lamps) {
    let k = 1;
    if (l.flicker) {
      if (l.dip > 0) { l.dip -= dt; k = Math.random() < 0.6 ? 0.05 + Math.random() * 0.3 : 1; }
      else if (Math.random() < dt * 0.35) l.dip = 0.15 + Math.random() * 0.5;
      k *= 0.92 + 0.08 * Math.sin(t * 31 + l.phase);
    }
    l.light.intensity = l.base * k;
    if (l.bulbMat) l.bulbMat.emissiveIntensity = l.bulbBase * k;
  }
}
