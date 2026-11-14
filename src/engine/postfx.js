import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Render pipeline: scene -> soft outline on the hovered object -> tone mapping. */
export function createPostFX(renderer, scene, camera) {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));

  const outline = new OutlinePass(new THREE.Vector2(w, h), scene, camera);
  outline.edgeStrength = 2.6;
  outline.edgeGlow = 0.7;
  outline.edgeThickness = 1.6;
  outline.visibleEdgeColor.set(0xf0d39a);
  outline.hiddenEdgeColor.set(0x2a1e10);
  composer.addPass(outline);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => composer.setSize(window.innerWidth, window.innerHeight));
  return { composer, outline };
}
