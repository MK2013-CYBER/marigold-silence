import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const base = import.meta.env.BASE_URL;
const draco = new DRACOLoader();
draco.setDecoderPath(`${base}draco/`); // decoder files are shipped in public/draco (no CDN)
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

/** Loads a .glb from public/models and returns its scene graph. */
export async function loadModel(file) {
  const gltf = await loader.loadAsync(`${base}models/${file}`);
  return gltf.scene;
}

/** Loads a .glb and returns the whole glTF (scene + animations). */
export async function loadGLTF(file) {
  return loader.loadAsync(`${base}models/${file}`);
}
