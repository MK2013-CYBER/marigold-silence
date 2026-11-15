import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Render pipeline: scene -> soft outline on the hovered object -> tone mapping. */
export function createPostFX(renderer, scene, camera) {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));

  // ambient occlusion: soft contact shadows in corners and under things (High quality only)
  const ao = new GTAOPass(scene, camera, w, h);
  ao.enabled = false;
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.0, scale: 1.0 });
  composer.addPass(ao);

  const outline = new OutlinePass(new THREE.Vector2(w, h), scene, camera);
  outline.edgeStrength = 2.6;
  outline.edgeGlow = 0.7;
  outline.edgeThickness = 1.6;
  outline.visibleEdgeColor.set(0xf0d39a);
  outline.hiddenEdgeColor.set(0x2a1e10);
  composer.addPass(outline);

  // depth of field: only the cinematic intro switches it on (soft backgrounds behind faces)
  const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.002, maxblur: 0.006 });
  bokeh.enabled = false;
  composer.addPass(bokeh);

  // a gentle glow around bright things: bulbs, flames, the lantern (Medium and High)
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.4, 0.92);
  bloom.enabled = false;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // film grain + vignette (addendum section I), applied after tone mapping
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.045 }, vignette: { value: 0.42 }, tint: { value: new THREE.Vector3(1, 1, 1) }, contrast: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time; uniform float amount; uniform float vignette; uniform vec3 tint; uniform float contrast; varying vec2 vUv;
      float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + time) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        c.rgb = (c.rgb - 0.5) * contrast + 0.5;   // colour grade (the intro sets these per scene)
        c.rgb *= tint;
        c.rgb += (rand(vUv * 1000.0) - 0.5) * amount;
        vec2 d = vUv - 0.5;
        c.rgb *= 1.0 - vignette * dot(d, d) * 1.6;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grain);

  window.addEventListener('resize', () => composer.setSize(window.innerWidth, window.innerHeight));
  window.addEventListener('resize', () => bokeh.setSize(window.innerWidth, window.innerHeight));
  window.addEventListener('resize', () => { ao.setSize(window.innerWidth, window.innerHeight); bloom.setSize(window.innerWidth, window.innerHeight); });
  return { composer, outline, grain, bokeh, ao, bloom };
}
