import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { createPostFX } from './engine/postfx.js';
import { CollisionWorld } from './engine/collisions.js';
import { FirstPersonController } from './engine/controller.js';
import { Flashlight } from './engine/flashlight.js';
import { AmbientAudio } from './engine/audio.js';
import { GameState } from './engine/state.js';
import { InteractionSystem } from './engine/interaction.js';
import { Hud } from './ui/hud.js';
import { buildHangar } from './scenes/hangar.js';
import { buildHangar as buildPlaceholderHangar } from './scenes/hangar_placeholder.js';
import { loadModel } from './engine/assets.js';
import { builders } from './scenes/props.js';
import { createTerrain, loadGroundTextures } from './world/terrain.js';
import { buildAirfield } from './world/airfield.js';
import { Atmosphere } from './world/atmosphere.js';
import { Streamer } from './world/streamer.js';
import { Minimap } from './ui/minimap.js';
import config from './data/game.json';
import interactables from './data/interactables.json';
import placeholderInteractables from './data/interactables_placeholder.json';
import clues from './data/clues.json';
import items from './data/items.json';
import worldCfg from './data/world.json';

const { renderer, scene, camera } = createRenderer(document.getElementById('app'));
const post = createPostFX(renderer, scene, camera);
const status = document.getElementById('overlay-status');
const params = new URLSearchParams(location.search);

const world = new CollisionWorld();
scene.add(world.debug);

// ---------- the open world: ground, airfield, storm ----------
status.textContent = 'Loading Sable Flat…';
const groundTex = await loadGroundTextures(renderer);
const ground = createTerrain(scene, worldCfg, groundTex);
const airfield = buildAirfield(scene, world, worldCfg, ground, groundTex);
const atmosphere = new Atmosphere(scene, renderer, worldCfg);
const streamer = new Streamer(scene, world, worldCfg.models);

// ---------- the hangar (always loaded: the game starts inside it) ----------
// ?hangar=placeholder brings back the old code-built hangar; ?props=none shows the empty shell.
let hangar;
if (params.get('hangar') === 'placeholder') {
  hangar = buildPlaceholderHangar(scene, world);
  hangar.isPlaceholder = true;
} else {
  try {
    const [shell, props] = await Promise.all([
      loadModel('hangar_shell.glb'),
      params.get('props') === 'none' ? Promise.resolve(new THREE.Group()) : loadModel('hangar_props.glb'),
    ]);
    hangar = buildHangar(scene, world, shell, props);
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not load the hangar model. Falling back to the placeholder.';
    hangar = buildPlaceholderHangar(scene, world);
    hangar.isPlaceholder = true;
  }
}

const state = new GameState(config);
const hasSave = state.load();

const hud = new Hud({ clues, items, config });
const audio = new AmbientAudio();

const interaction = new InteractionSystem({
  scene, camera, world, state, hud, audio,
  outline: post.outline,
  root: hangar.root,
  named: hangar.named,
  builders,
  defs: hangar.isPlaceholder ? placeholderInteractables : interactables,
  clues,
  costs: config.costs,
  range: config.interactRange,
  location: 'hangar',
  unlockAll: !!config.unlockAll,
});

// doors and props inside streamed buildings become interactive when each model arrives
streamer.onLoad = (id, root) => { interaction.addLocation(id, root); interaction._syncCollider(); };
for (const it of streamer.items) if (it.root) streamer.onLoad(it.id, it.root);

const controller = new FirstPersonController(camera, renderer.domElement, world);
controller.groundHeight = ground.heightAt;
controller.bounds = worldCfg.walkBounds;
let boundaryCool = 0;
controller.onBoundary = () => {
  if (boundaryCool > 0) return;
  boundaryCool = 6;
  hud.caption(worldCfg.boundaryText, 5);
};
const p0 = state.data.player;
if (p0) controller.setPosition(p0.x, p0.z, p0.yaw);
else controller.setPosition(hangar.spawn.x, hangar.spawn.z, hangar.spawn.yaw);
hud.setClock(state.clockLabel());

const flashlight = new Flashlight(camera);
const minimap = new Minimap(worldCfg);
controller.onFootstep = (amt) => audio.footstep(amt);
atmosphere.onLightning = (delay) => audio.thunder(delay, 0.6 + Math.random() * 0.5);

// Compile shaders for both "hangar interior visible" and "hidden" now, so walking away
// from the hangar never stutters.
if (hangar.props) {
  hangar.props.visible = false;
  renderer.compile(scene, camera);
  hangar.props.visible = true;
}
if (hangar.setLights) { hangar.setLights(false); renderer.compile(scene, camera); hangar.setLights(true); }
renderer.compile(scene, camera);

// distance from a point to the hangar's footprint (0 inside)
const HANGAR_RECT = { x: [-20.3, 20.3], z: [-12.8, 19.6] };
function hangarDistance(p) {
  const dx = Math.max(HANGAR_RECT.x[0] - p.x, 0, p.x - HANGAR_RECT.x[1]);
  const dz = Math.max(HANGAR_RECT.z[0] - p.z, 0, p.z - HANGAR_RECT.z[1]);
  return Math.hypot(dx, dz);
}

function savePlayer() {
  const pos = controller.position;
  state.data.player = { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: +controller.yaw.toFixed(3) };
  state.save();
}

// ---------- where am I? (interior zones from world.json) ----------
function zoneAt(p) {
  for (const z of worldCfg.zones) {
    if (p.x >= z.x[0] && p.x <= z.x[1] && p.z >= z.z[0] && p.z <= z.z[1]) return z;
  }
  return null;
}

// ---------- overlay / pause ----------
const overlay = document.getElementById('overlay');
const hint = document.getElementById('hint');
const debugEl = document.getElementById('debug');
const actions = document.getElementById('overlay-actions');
const newGame = document.getElementById('new-game');
const HINT = 'E interact · Tab notebook · M map · F flashlight · Shift sprint';
const DRAG_HINT = 'Hold mouse button and drag to look · ' + HINT;

status.textContent = 'Click to enter Sable Flat';
if (hasSave) {
  status.textContent = `Click to continue (${state.clockLabel()})`;
  actions.classList.remove('hidden');
}

const syncFreeze = () => { controller.frozen = hud.readerOpen || hud.notebookOpen; };

function enter() {
  audio.start();
  controller.setActive(true);
  overlay.classList.add('hidden');
  actions.classList.add('hidden');
  hud.showClock(true);
  minimap.show(true);
  controller.lock(); // may be refused; the game works either way
  setTimeout(() => { if (!controller.locked) hint.textContent = DRAG_HINT; }, 400);
}
function pause() {
  hud.closeAll();
  syncFreeze();
  controller.setActive(false);
  savePlayer();
  overlay.classList.remove('hidden');
  actions.classList.remove('hidden');
  status.textContent = 'Paused — click to resume';
}

overlay.addEventListener('click', enter);
let confirmArmed = false;
newGame.addEventListener('click', (e) => {
  e.stopPropagation(); // don't also enter the game
  if (!confirmArmed) {
    confirmArmed = true;
    newGame.textContent = 'Click again to erase your progress';
    setTimeout(() => { confirmArmed = false; newGame.textContent = 'Start a new game'; }, 4000);
    return;
  }
  state.erase();
  window.removeEventListener('beforeunload', savePlayer);
  location.reload();
});

controller.onLockChange = (locked) => {
  if (!locked && controller.active) pause(); // Esc released the mouse
  hint.textContent = locked ? HINT : DRAG_HINT;
};

// Debug teleports (only while the ` debug view is on): quick way to cross the airfield when testing.
const TELEPORTS = {
  Digit1: [0, 9, 0], // inside the hangar
  Digit2: [-2, 16, Math.PI], // apron, just outside the main door
  Digit3: [0, 75, -Math.PI / 2], // middle of the runway, looking east
  Digit4: [-245, 62, 1.9], // west end, beacon tower
  Digit5: [20, -172, Math.PI], // the gate
  Digit6: [-140, -260, 0.6], // out past the fence, in the dunes
};

window.addEventListener('keydown', (e) => {
  if (!controller.active) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    hud.closeReader();
    hud.toggleNotebook(state);
    audio.paper();
    syncFreeze();
    return;
  }
  if (e.code === 'KeyE') {
    if (e.repeat) return;
    if (hud.readerOpen) hud.closeReader();
    else if (!hud.notebookOpen) interaction.use();
    syncFreeze();
    return;
  }
  if (e.code === 'Escape' && !controller.locked) {
    if (hud.readerOpen || hud.notebookOpen) { hud.closeAll(); syncFreeze(); } else pause();
    return;
  }
  if (e.code === 'KeyF') { flashlight.toggle(); audio.click(); }
  if (e.code === 'KeyM') { minimap.toggleBig(controller.position, controller.yaw); audio.paper(); }
  if (e.code === 'Backquote') {
    world.debug.visible = !world.debug.visible;
    debugEl.classList.toggle('hidden', !world.debug.visible);
  }
  if (world.debug.visible && TELEPORTS[e.code]) {
    const [x, z, yaw] = TELEPORTS[e.code];
    controller.setPosition(x, z, yaw);
  }
});
window.addEventListener('beforeunload', savePlayer);

// ---------- loop ----------
const clock = new THREE.Clock();
const hangarCentre = new THREE.Vector3(0, 0, 0);
let fpsAcc = 0, fpsFrames = 0, fps = 0, saveAcc = 0, shadowTick = 1;
const lastShadowPos = new THREE.Vector3(1e9, 0, 0);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const pos = controller.position;
  boundaryCool = Math.max(0, boundaryCool - dt);

  controller.update(dt);
  flashlight.update(dt);

  const zone = zoneAt(pos);
  const inside = !!zone?.indoor;
  atmosphere.update(dt, t, pos, inside);
  airfield.update(dt, t, atmosphere.wind);
  streamer.update(dt, pos);

  // the hangar's interior (props + their lights) is only drawn when you are near it
  if (hangar.props) hangar.props.visible = inside || pos.distanceTo(hangarCentre) < worldCfg.hangar.propsCull;
  hangar.setLights?.(inside || hangarDistance(pos) < 10);
  hangar.update(dt, t, atmosphere.flash);
  interaction.update(dt, controller.active && !controller.frozen);

  minimap.update(dt, pos, controller.yaw, zone ? zone.name : 'outdoors');
  audio.setExposure(inside ? (interaction.stormExposed() ? 0.45 : 0) : 1);
  audio.setReverb(zone ? zone.reverb : worldCfg.outdoorReverb);
  audio.update(dt);
  // Shadows: the scene is almost static, so redraw shadow maps ~15x a second, or at once when you move.
  shadowTick += dt;
  if (shadowTick > 0.066 || pos.distanceToSquared(lastShadowPos) > 0.25) {
    shadowTick = 0;
    lastShadowPos.copy(pos);
    renderer.shadowMap.needsUpdate = true;
  }
  post.composer.render();

  saveAcc += dt;
  if (saveAcc > 3 && controller.active) { saveAcc = 0; savePlayer(); }

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  if (world.debug.visible) {
    debugEl.textContent = `fps ${fps}\nx ${pos.x.toFixed(1)}  z ${pos.z.toFixed(1)}  ${zone ? zone.name : 'outdoors'}\n`
      + `yaw ${(controller.yaw * 57.3).toFixed(0)}°\ncolliders ${world.boxes.length}\ndraw calls ${renderer.info.render.calls}\n`
      + 'teleport: 1 hangar 2 apron 3 runway\n4 beacon 5 gate 6 dunes';
  }
});

// Test hook for automated checks in dev builds only.
if (import.meta.env.DEV) window.__game = { THREE, scene, camera, controller, world, flashlight, renderer, state, interaction, hud, atmosphere, ground, streamer, hangar };
