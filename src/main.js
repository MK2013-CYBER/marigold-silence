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
import { Cole } from './world/cole.js';
import { HQ } from './game/hq.js';
import { Quality } from './engine/quality.js';
import { Intro } from './game/intro.js';
import introData from './data/scenes/intro.json';
import config from './data/game.json';
import interactables from './data/interactables.json';
import placeholderInteractables from './data/interactables_placeholder.json';
import clues from './data/clues.json';
import items from './data/items.json';
import worldCfg from './data/world.json';
import placesData from './data/places.json';
import puzzlesData from './data/puzzles.json';
import characters from './data/characters.json';
import reportsData from './data/reports.json';
import coleLines from './data/dialogue/cole.json';

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
streamer.onLoad = (id, root) => {
  interaction.addLocation(id, root);
  interaction._syncCollider();
  const it = streamer.items.find((i) => i.id === id);
  if (it?.lamps?.length) { // prepare both 'lamp on' and 'lamp off' shaders now (no stutter later)
    for (const l of it.lamps) l.light.visible = true;
    renderer.compile(scene, camera);
    for (const l of it.lamps) l.light.visible = false;
    renderer.compile(scene, camera);
  }
};
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

// ---------- Agent Danny Cole and the HQ (addendum v2: sections C, D, G) ----------
status.textContent = 'Waking Danny\u2026';
const cole = await Cole.create(scene, world, ground, worldCfg.cole, camera);
interaction.addLocation('npc', cole.root);
cole.interaction = interaction; // Danny opens doors himself
const hq = new HQ({
  state, hud, audio, cole, controller,
  puzzles: puzzlesData, clues, characters, places: placesData.places, reports: reportsData.reports, lines: coleLines,
});
interaction.onUI = (def) => hq.handle(def);
let releasingForScreen = false;
hq.onScreenOpened = () => {
  syncFreeze();
  if (controller.locked) { releasingForScreen = true; document.exitPointerLock(); } // screens need the mouse
};
hq.onScreenClosed = () => {
  syncFreeze();
  if (controller.active && !controller.locked) controller.lock();
};
let resting = false;
hq.onFreezeChange = (rest) => { if (rest !== undefined) resting = rest; syncFreeze(); };

// ---------- quality presets (Low / Medium / High / Auto) ----------
const quality = new Quality({ renderer, post, atmosphere, scene });
quality.mount(document.getElementById('settings'));
const minimap = new Minimap(worldCfg, placesData.places);

// ---------- the cinematic intro (addendum v2, section E) ----------
const intro = new Intro({ scene, camera, post, atmosphere, streamer, ground, cole, audio, hangar, data: introData, characters });
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
const HANGAR_RECT = { x: [-20.3, 20.3], z: [-12.8, 12.8] };
function hangarDistance(p) {
  const dx = Math.max(HANGAR_RECT.x[0] - p.x, 0, p.x - HANGAR_RECT.x[1]);
  const dz = Math.max(HANGAR_RECT.z[0] - p.z, 0, p.z - HANGAR_RECT.z[1]);
  return Math.hypot(dx, dz);
}

function savePlayer() {
  const pos = controller.position;
  state.data.player = { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: +controller.yaw.toFixed(3) };
  Object.assign(state.data.cole, cole.snapshot());
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
const HINT = 'E interact · Tab notebook · J case file · M map · R radio Danny · F flashlight · Shift sprint';
const DRAG_HINT = 'Hold mouse button and drag to look · ' + HINT;

status.textContent = 'Click to enter Sable Flat';
if (hasSave) {
  status.textContent = `Click to continue (${state.clockLabel()})`;
  actions.classList.remove('hidden');
}

function syncFreeze() { controller.frozen = hud.readerOpen || hud.notebookOpen || hq.busy || resting; }

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
  hq.closeScreen();
  hq.dialogue.close();
  syncFreeze();
  controller.setActive(false);
  savePlayer();
  overlay.classList.remove('hidden');
  actions.classList.remove('hidden');
  status.textContent = 'Paused — click to resume';
}

function playIntro() {
  audio.start();
  controller.setActive(false);
  overlay.classList.add('hidden');
  actions.classList.add('hidden');
  hud.showClock(false);
  minimap.show(false);
  hint.classList.add('hidden');
  document.getElementById('crosshair').classList.add('hidden');
  intro.start(() => {
    // gameplay begins at the hangar at 06:10 on Saturday (a new game), or where you were
    if (!state.data.introSeen && !state.data.player) controller.setPosition(hangar.spawn.x, hangar.spawn.z, hangar.spawn.yaw);
    state.data.introSeen = true;
    state.save();
    hint.classList.remove('hidden');
    document.getElementById('crosshair').classList.remove('hidden');
    enter();
  });
}

overlay.addEventListener('click', () => {
  if (intro.active) return;
  if (!state.data.introSeen && !hasSave) playIntro(); // a brand-new game opens with the intro
  else enter();
});
const watchIntro = document.getElementById('watch-intro');
watchIntro.addEventListener('click', (e) => { e.stopPropagation(); savePlayer(); playIntro(); });
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
  // Esc released the mouse -> pause (but not when we released it ourselves for an HQ screen)
  if (!locked && controller.active && !releasingForScreen && !hq.screen) pause();
  releasingForScreen = false;
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
  Digit7: [26, -151.5, -Math.PI / 2], // outside the HQ door
  Digit8: [-83, -19, 0], // outside the Quarters
};

window.addEventListener('keydown', (e) => {
  if (!controller.active) return;
  // an HQ screen (board, reports...) is open: only Esc matters
  if (hq.screen) { if (e.code === 'Escape') hq.closeScreen(); return; }
  // talking to Danny: number keys pick, E or Esc closes
  if (hq.dialogue.key(e)) { e.preventDefault(); syncFreeze(); return; }
  if (e.code === 'KeyJ' && !e.repeat && !hud.readerOpen && !hud.notebookOpen) { hq.openScreen(hq.caseFile); audio.paper(); return; }
  if (e.code === 'KeyR' && !e.repeat && !hud.readerOpen && !hud.notebookOpen) { hq.talk(true); syncFreeze(); return; }
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
  // debug cheats (only with the ` debug view on): P solves the next puzzle, O un-solves all, T +30 min
  if (world.debug.visible && e.code === 'KeyP') { const p = hq.debugSolveNext(); hud.toast(p ? `DEBUG: solved ${p.id} ${p.name}` : 'DEBUG: all puzzles solved'); }
  if (world.debug.visible && e.code === 'KeyO') { hq.debugReset(); hud.toast('DEBUG: puzzles and evidence reset'); }
  if (world.debug.visible && e.code === 'KeyT') { const s = state.advance(30); hud.timePassed(s, state.clockLabel()); state.save(); }
  if (world.debug.visible && TELEPORTS[e.code]) {
    const [x, z, yaw] = TELEPORTS[e.code];
    controller.setPosition(x, z, yaw);
  }
});
window.addEventListener('beforeunload', savePlayer);

// ---------- loop ----------
const clock = new THREE.Clock();
const hangarCentre = new THREE.Vector3(0, 0, 0);
let fpsAcc = 0, fpsFrames = 0, fps = 0, saveAcc = 0, shadowTick = 1, visitTick = 0;

// places you have been near appear as cards on the investigation board
const PLACE_SPOTS = [{ id: 'hangar', x: 0, z: 0, r: 30 }, ...worldCfg.models.map((m) => ({
  id: m.id, x: m.position[0], z: m.position[2], r: Math.max(...(m.footprint ?? [10, 10])) / 2 + 10,
}))];
function markVisited(p) {
  for (const s of PLACE_SPOTS) {
    if (Math.hypot(p.x - s.x, p.z - s.z) < s.r && state.visit(s.id)) state.save();
  }
}
const lastShadowPos = new THREE.Vector3(1e9, 0, 0);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (intro.active) { introFrame(dt, t); return; }
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
  cole.update(dt, pos);
  hq.update();
  const qmsg = quality.update(dt, controller.active);
  if (qmsg) hud.toast(qmsg);
  post.grain.uniforms.time.value = t % 100;
  visitTick += dt;
  if (visitTick > 0.5) { visitTick = 0; markVisited(pos); }

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
      + `quality ${quality.level} (${quality.mode})\n`
      + 'teleport: 1 hangar 2 apron 3 runway\n4 beacon 5 gate 6 dunes 7 HQ 8 quarters\n'
      + 'cheats: P solve next puzzle, O reset, T +30 min';
  }
});

/** While the intro plays, the camera is the director's: stream, light and sound around it. */
function introFrame(dt, t) {
  intro.update(dt);
  const pos = intro.focus;
  atmosphere.update(dt, t, pos, intro.indoor);
  airfield.update(dt, t, atmosphere.wind);
  streamer.update(dt, pos);
  if (hangar.props) hangar.props.visible = pos.distanceTo(hangarCentre) < worldCfg.hangar.propsCull;
  hangar.setLights?.(hangarDistance(pos) < 10);
  hangar.update(dt, t, atmosphere.flash);
  interaction.update(dt, false);
  cole.update(dt, controller.position);
  audio.setExposure(intro.exposure);
  audio.setReverb(intro.indoor ? 0.3 : worldCfg.outdoorReverb);
  audio.update(dt);
  post.grain.uniforms.time.value = t % 100;
  renderer.shadowMap.needsUpdate = true;
  post.composer.render();
}

// Test hook for automated checks in dev builds only.
if (import.meta.env.DEV) window.__game = { intro, THREE, scene, camera, controller, world, flashlight, renderer, state, interaction, hud, atmosphere, ground, streamer, hangar, cole, hq, quality };
