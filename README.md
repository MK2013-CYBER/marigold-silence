# The Marigold Silence

A first-person 1930s detective game built with Three.js and Vite. It needs no API keys and no backend.

## Run it

```bash
cd ~/game/marigold-silence
npm install
npm run dev
```

Open http://localhost:5173 in Chrome or Safari, then click the screen.

| Key | Action |
|---|---|
| Mouse | Look around |
| W A S D | Move |
| Shift | Sprint |
| C | Walk slowly |
| E | Interact with what you're looking at |
| Tab | Notebook |
| M | Full airfield map (a minimap is always in the corner) |
| F | Flashlight |
| Esc | Pause |
| ` (backtick) | Debug view: colliders, position, frame rate; then 1-6 teleport (hangar, apron, runway, beacon, gate, dunes) |

## Status

- **M0:** done. Vite + Three.js project with the bible's folder layout.
- **M1:** done. Walkable dark hangar with collisions.
- **M2:** done. Interaction system (outline + prompt, E to use), notebook (Tab), action clock from 06:10, autosave to the browser.

All objects, texts and clues live in `src/data/*.json` (`interactables.json`, `clues.json`, `items.json`, `game.json`).
To start over, pause (Esc) and click **Start a new game** twice.

## Layout

```
src/engine   renderer, controller, collisions, flashlight, audio, procedural textures
src/scenes   hangar.js (location B)
src/data     JSON content (scene signs and spawn point; story data comes in later milestones)
src/ui       styles
public/      models, textures, audio, vo (empty for now)
```

## Exploration mode (everything unlocked)

`src/data/game.json` → `"unlockAll": true` ignores every lock (doors, drawers, lockers), so the whole
map can be explored. All lock data and clues stay in `interactables.json`; set it to `false` when the
story locks are wired up.

## The open world (Sable Flat)

Plan: `docs/WORLD_PLAN.md`. Layout data: `src/data/world.json` (fence, gaps, gate, road, runway,
apron, windsock, sun, Raven Ridge, streamed models, indoor zones, planned buildings).

- `src/world/terrain.js`: salt flat + dunes, ground height for walking
- `src/world/airfield.js`: runway, apron, road, faded markings, drum markers, fence, gate, windsock
- `src/world/atmosphere.js`: dust storm, fog, sun and shadows, Raven Ridge, lightning, indoor/outdoor blend
- `src/world/streamer.js`: loads buildings near you, hides them far away
- Ground textures: `blender/build_world_textures.py` → `public/textures/world/`
- Beacon tower: `blender/build_beacon_tower.py` → `public/models/beacon_tower.glb`
- Outbuildings: `blender/build_outbuildings.py` → `fuel_farm.glb`, `maint_shed.glb`, `storage_shed.glb`,
  `ops_building.glb`, `comms_shelter.glb` (add `-- ops_building` to rebuild just one). Shared toolkit:
  `blender/lib/buildings.py`; sign texts: `src/data/scenes/outbuildings.json`.
- Minimap: `src/ui/minimap.js`, painted from `world.json` (buildings, paths, fence, runway).

## Clues

All clues are removed for now (`clues.json` and `items.json` are empty; the notes and the key are gone
from the hangar). The removed practice clues are kept in `src/data/_archive/`.

## Blender models

The hangar is built by Python scripts in Blender and loaded as two compressed models:

| Model | Script | Contents |
|---|---|---|
| `public/models/hangar_shell.glb` (~2 MB) | `blender/build_hangar_shell.py` | 40 x 25 m floor, 9 m walls, arched timber trusses to 13.5 m, windows, 4-leaf sliding main door + wicket, west/east side doors, back door, Pryce's office walls/door, survey office + darkroom, the storm outside, collision boxes |
| `public/models/hangar_props.glb` (~1.6 MB) | `blender/build_hangar_props.py` | lamps, practice objects, loft, half-stripped aircraft frame, engine stand + chain hoist, hanging chains, wing on trestles, benches, shelving, stove corner, drums, crates, tyres, office furniture, survey/darkroom equipment, light markers |

Rebuild after editing a script:

```bash
/Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_hangar_shell.py
/Users/mk/Desktop/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_hangar_props.py
```

- `blender/lib/pbr_textures.py`: tileable PBR textures generated with numpy
- `blender/lib/bhelpers.py`: shared modelling helpers (game coordinates: x east, y up, z south)
- Open `blender/hangar_shell.blend` / `blender/hangar_props.blend` to look around in Blender.

Naming rules the game relies on: `COL_*` collision boxes (a `COL_Door_*` box switches off while its
door is open), `HIT_*` invisible aiming boxes, `LIGHT_*` light markers (custom properties = light
settings), `Door_*` objects pivot on their hinge.

Open http://localhost:5173/?props=none to see the empty shell. The previous 30 m version of both scripts
and models is archived in `blender/archive_30m/`.

The old code-built hangar is kept in `src/scenes/hangar_placeholder.js` (+ `src/data/interactables_placeholder.json`).
Open http://localhost:5173/?hangar=placeholder to see it.
