# Sable Flat open world: plan

Bible sections 0, 4 and 13 applied to a walkable airfield. All positions are in game
metres: x = east, z = south (north is -z), y = up. The hangar stays at the origin with
its big door facing south, towards the runway. Every position lives in
`src/data/world.json`, so moving things never needs code changes.

## Layout (top view)

```
                         N (-z)
          dirt road to the north, through the gate (20, -180)
   z -180 ┌──────────────────────── fence ───────────────────────────┐
          │      bunkhouse (-90,-60)        radio shack + mast (85,-45)│
          │                    water tank (-40,-40)                    │
          │  mess hall (-80,-10)   HANGAR (0,0)   gen. shed (110,5)    │
          │                        survey office  fuel dump (125,25)   │
          │                        on its south side                   │
          │                apron (x ±45, z 13..60)  windsock (70,54)   │
   z 60   │ beacon tower ═════════════ RUNWAY 500 x 30 m ════════════ │
   z 90   │ (-262,50)        x -250 .. 250, oil-drum markers           │
          │                       open salt flat                       │
   z 320  └────────────────────────────────────────────────────────────┘
        x -350                                                  x 350
          beyond the fence: salt flat, low dunes, Raven Ridge far to the NW
```

* Fenced airfield: 700 m x 500 m. You can walk about 110 m past the fence before the
  storm turns you back.
* Distances between buildings: 30-120 m, joined by worn paths (stage 2).

## Stages

1. **Ground and runway** (this stage): salt-flat terrain, dunes, Raven Ridge, the runway
   with faded markings and drum markers, the torn windsock, the leaning beacon tower,
   the fence with gaps, the gate and road, the dust storm, fog, light, wind, sprint.
2. **Building exteriors**: mess hall, bunkhouse, radio shack + mast, generator shed +
   fuel dump, pigeon coop at the beacon tower, water tank, truck and clutter, paths.
3. **Aircraft**: the Trimotor *Marigold II* (enterable) and the Waco biplane.
4. **Interiors**, one building at a time (no Undercroft yet).
5. **Atmosphere pass**: time-of-day light, footsteps by surface, the hand-drawn map page.

## Performance rules (Apple M1, 60 fps)

* The dust fog limits sight to about 150 m outdoors, and the camera stops drawing at 2.5 km.
* Each building is its own `.glb`. It loads when you come within its load radius, and it is
  hidden beyond its cull radius (`world.json` → `models`).
* The hangar's interior props and lights are hidden when you are more than 90 m away.
  Their shader variants are compiled at start-up, so the switch doesn't stutter.
* Repeated things (fence posts, drum markers) are instanced: one draw call each.
* Collision stays simple: axis-aligned boxes, with one box per straight fence run.
* Indoors versus outdoors is decided by the zones in `world.json`. Light, fog, dust and sound
  blend between the two ("eye adaptation"), so interiors don't need extra lights.
