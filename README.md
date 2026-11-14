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
| R | Radio Danny Cole (walkie-talkie, 5 min); 1-6 pick a reply |
| J | Case file (all your evidence) |
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

## Stage A + B (addendum v2)

- **Places** (`src/data/places.json`): every location and its purpose; shown in the map legend (M).
- **New buildings**: Quarters (mess hall, kitchen, six bedrooms) and the Investigator's Shed (HQ) by
  the entrance road. The survey office and darkroom moved from the hangar to an annex on Operations.
- **HQ**: investigation board, timeline wall, report desk, lab table, case-file box, typewriter, cot,
  clock and stove. Screens: `src/ui/board.js`, `src/ui/screens.js`; logic: `src/game/hq.js`.
- **Agent Danny Cole** (`src/world/cole.js`, model `blender/build_character_cole.py` from the Mixamo
  files): talk with E, hints at three levels (each costs 5 min), follow / wait, radio with R,
  reminders at 15:00 and 16:30. Words: `src/data/dialogue/cole.json`.
- **Evidence rule** (section G): clues only come from solving puzzles (`src/data/puzzles.json` →
  `clues`). The catalogue is `src/data/clues.json`; reports are `src/data/reports.json`.
- **Quality**: Auto / Low / Medium / High on the title and pause screen (`src/engine/quality.js`).
- **Debug cheats** (press ` first): P solves the next puzzle, O resets puzzles, T adds 30 minutes,
  7 jumps to the HQ, 8 to the Quarters.

## Stage C: the cinematic intro (addendum section E)

- Plays the first time you click into a new game (about 2 min 20 s). **Skip intro** button, hold
  **Space** for a second, or **Esc** to skip. **Watch the intro** on the title screen replays it.
- Shots: telegram, title, the mail plane in the dust (outside and in the cabin with Danny), the
  landing, beacon tower, windsock, Hobbs and his lantern at the hangar, Friday dinner (Pryce's toast
  and six close-ups), dust on a window at night with a music box, the scream, "SATURDAY, 6:10 A.M.".
- Code: `src/game/intro.js` (shots and camera), `src/world/plane.js` (the plane, built in code),
  `src/world/silhouettes.js` (placeholder figures), `src/engine/introAudio.js` (sounds made in code).
  Words: `src/data/scenes/intro.json`. Voices come in Stage H; for now the lines are subtitles.
- Danny now walks like a person: follows your footsteps through doors, opens and closes doors,
  turns before walking, eases in and out of his stride, looks at you, nods and points. He can
  wait where you leave him or walk back to HQ. **J** opens the case file anywhere.

## Stage D: the crime scene (v4, S1-S6)

Pryce's office in the hangar (north-east corner), as found at 06:10: the body slumped at the desk,
the brandy decanter and glass, the music box, calendar, blotter, pocket watch, the demand note under
the door, the doctor's bag and Hart's camera case. Press E on anything to examine it.

| Sequence | Where | How |
|---|---|---|
| S1 Walk the Room | camera case by the door | mark each way out possible/impossible; photograph (12 plates) |
| S2 The Body | doctor's bag | direct Lindqvist's examination; find what doesn't fit heart failure |
| S3 Time of Death | doctor's bag | cooling arithmetic; set a time window with two sliders |
| S4 The Bench Test | doctor's bag | get the chart (persuade / book / force), 6 drops, 5 samples, 3 chemicals |
| S5 The Safe | the safe | three-number dial (clues on the walls and the watch), or drill it |
| S6 Box and Latch | bookshelf | knock the floor, play the music box, pull the books in tune order |
| S23 The Prints | HQ lab table | collect prints (openly or covertly), measure with callipers, match pattern/width/scars |
| S25 The Timeline | HQ timeline wall | put the events you've learned in order around the fixed points |

Evidence (v4 section 4): findings need independent sources (sequences, documents, testimony).
With enough (usually 3) a finding is Established and goes on the HQ board. Tab shows your leads and
the things you noticed. Data: `src/data/findings.json`, `src/data/sequences.json`.
Code: `src/game/evidence.js`, `src/game/crimeScene.js`, `src/ui/sequences.js`.

## Stage E: the people (addendum F)

Vivienne, Billie, Lindqvist, Julian, Ox, Tamsin and Hobbs stand where the schedule puts them for the
time of day, fidget, and turn to face you. E to talk: ask about topics (some unlock as you find things
or need trust), show them something you found, or watch them for a tell. Trust starts at 50: kind
questions raise it, pressing lowers it. Data: `src/data/npcs.json`. Code: `src/game/npcs.js`.

## Clues

The old practice clues (notes, key) are archived in `src/data/_archive/`. The real clue catalogue from
the bibles is in `src/data/clues.json`; clues are earned only by solving puzzles (Stage F builds them).

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
