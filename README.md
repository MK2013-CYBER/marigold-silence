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
  Words: `src/data/scenes/intro.json`. The lines are subtitles.
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
| S17 The Smoke Test | maintenance shed, then fuel farm | take a smoke pot, drop it in the rusty vent pipe, then walk to where smoke comes up (40 min) |
| S18 Follow the Wire | Radio & weather, then the runway | match the telegram's rhythm by ear, then follow the iron posts to the splice box and the hangar wall |
| S14 The Ration Stores | storage shed (and Quarters kitchen rack) | do the ledger sums, turn back to the first page where they stop matching |
| S15 The Marks in the Dust | storage shed crates | push the crates back onto the scuff marks; a back room and a hatch appear |
| S8 The Chemical Shelf | Operations darkroom | weigh each jar on a balance with brass weights; find the short one the log can't explain |
| S9 The Darkroom | Operations darkroom | expose on the needle, stop the developer at ~60 s; then spot what the official photo hides |
| S10 The Manifests | Operations records room | sort six passenger cards, match five certificates, read the payout |
| S20 The Last Call | Radio & weather | scrub through the wax cylinder to the voice at the end |
| S22 The Locked Case | Lindqvist's room, Quarters | persuade him, get a warrant (45 min), or pick it (light tension, find the binding pin) |
| S7 Readied for Flight | the Trimotor 'Marigold II' in the hangar (cabin door, left side) | look at everything in the cabin, then say what it was readied for |
| S11 Raking Light | Operations lounge grate | move the lamp angle until each charred line shows |
| S12 The Blackout | maintenance shed fuse panel | balance five circuits on two generators (the hangar goes dark at 12:00 until this is done) |
| S13 The Cracked Mount | maintenance shed | dye, wait, wipe, developer, in order; find the real crack |
| S16 The Night Burn | fuel farm booth (and the Waco's fuel cap) | read four dial gauges, compare with yesterday and the issue log |
| S19 The Barograph Overlay | Radio & weather | slide the 1931 trace over the report, then match the typewriter's chipped 'e' |
| S21 The Stakeout | beacon tower keeper's room | wait for dusk, pan the binoculars, call it when the vent glows |
| S24 Tamsin's Shorthand | HQ | find the keyword that turns the cipher into words |

New on the map: the Trimotor 'Marigold II' in the hangar (`blender/build_aircraft.py`, replaces the stripped
frame) and Julian's Waco biplane on the apron.

Evidence (v4 section 4): findings need independent sources (sequences, documents, testimony).
With enough (usually 3) a finding is Established and goes on the HQ board. Tab shows your leads and
the things you noticed. Data: `src/data/findings.json`, `src/data/sequences.json`.
Code: `src/game/evidence.js`, `src/game/crimeScene.js`, `src/ui/sequences.js`.

## Stage H: music, realism

- **No voices**: all dialogue is on-screen text (subtitles and dialogue boxes); nothing is spoken.
- **Music**: three original tracks composed in code from the music-box tune (`npm run music`,
  `tools/music.py`): the theme (title, intro, endings), the investigation (quiet, all day) and the
  Undercroft. Music volume is on the pause screen.
- **Realism**: ambient occlusion on High, a gentle glow on lamps and flames on Medium/High, people
  far away are not drawn. Measured on this M1 at 1440x900: Low ~4-6 ms, Medium ~4-6 ms, High
  ~5-12 ms per frame (60 fps needs under 16.6 ms).

## Tier 6: the finale

The trapdoor in Pryce's office is a real opening in the floor (cut into `hangar_shell.glb`), hidden
under the rug by a flush hatch until S6. Then the hatch swings open onto the boards and you see the
shaft, the iron ladder and a lamp glowing far below: aim at it and press E to go down.

- **S26 The Theory** (HQ typewriter): pick WHO, HOW, WHERE and WHY. A new name appears under WHO
  once you know enough. Filing it against an innocent person ends the game (The Wrong Person).
- **The trapdoor** (after S6): Ox waits at the bottom. Win him over with trust, or with what the ration
  ledger told you (S14). Then a voice from the dark: "Let him through, Ox."
- **The Undercroft** (`blender/build_undercroft.py`): the shaft, the storeroom, the sky room, her
  bedroom and the radio nook. Her diary (14 pages), the spoon key, the scratched calendar, the mural.
- **Clementine**: answer six of her challenges with the right findings (four must be right), hear her
  confession, then choose: the law, the silence, or the daylight.
- **Endings**: The Law, The Silence, The Daylight (needs the safe papers S5, the 1931 photographs S9
  and her diary; otherwise The Daylight, Too Soon), The Wrong Person, and Cold Case (17:30 passes).
- Words: `src/data/finale.json`. Code: `src/game/finale.js`.

## Stage E: the people (addendum F)

Each person stays in one place all day, alone, so you can talk to them privately: four suspects in
their bedrooms in the Quarters (the name on each door; Vivienne and Billie on the north side, Julian
and Tamsin on the south), Dr. Lindqvist in Pryce's office by the body and his bag, Ox at work in the
maintenance shed, Hobbs in the radio shack. A warm lamp lights the
room of whoever you are near. They fidget and turn to face you. E to talk: ask about topics (some unlock as you find things
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
