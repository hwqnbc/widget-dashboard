# Puppy Rescue widget — design notes

A stealth-rescue maze game: you are a dog sneaking through a 3D maze to free
caged puppies. Each freed puppy follows you in a conga line, and you lead
them all out of the green **ESCAPE** door. Dog catchers stand guard or
patrol, and each one has a red **vision cone**. Stay out of every cone,
and keep your tail out of them too.

Modelled on the "Dog Rescue" style of mobile ads (two reference screenshots
supplied by the user). Round 1 ships the playable core: 10 levels in two
tiers.

## Decisions (settled with the user before building)

| # | Question | Decision |
|---|---|---|
| 1 | How does the dog move? | **Free movement**: drag anywhere for a floating stick, or use arrows/WASD. No inertia, so the dog stops when you let go, and corner assist slides it into gaps. |
| 2 | What happens when you're spotted? | **Caught = retry in under a second** (Round 1). Easy mode (the netted puppy goes back to its cage) and Arcade mode (catchers chase, then search) come later as difficulty settings. |
| 3 | 2D or 3D? | **3D only**, low-poly toy look like the screenshots, in a lazy three.js chunk. A 2D view is in the backlog. |
| 4 | Camera | **Fixed portrait**: the whole maze is always visible from a tilted camera fitted to the card, with the exit at the top. Fullscreen prefers portrait. |
| 5 | Round 1 scope | **Small and polished**: 10 levels, Sneak (static catchers) + Patrol (walkers). |
| 6 | Stars | ★ escaped · ★ every puppy · ★ **never spotted** (the "?" meter never started). The best time per level is kept separately. |
| 7 | Level picking | **Unlock in order** (escaping level n opens n+1), plus an **Unlock all levels** switch in the ⚙ menu. |
| 8 | Name | **Puppy Rescue** |
| 9 | Hero | One orange/tan pup; freed puppies come in 4 coat colours. "Pick your dog" is in the backlog. |
| 10 | Catchers | A new chunky model: dark round body, white collar, hat, red-handled net. |

**Detail I chose myself (not asked):** the door opens once the **first**
puppy is freed. That way you can't skip a level with 0 puppies and still
unlock the next one, but you can still escape without every puppy, at the
cost of a star.

## Gameplay rules (as built)

- **World.** One unit is one maze cell. Walls are thin segments on cell
  edges, and maps are 5×7 to 7×11 cells. Row 0 is the top, where the exit
  door is.
- **Dog.** It moves at 2.5 cells/s (`DOG_SPEED`), chosen so one cell takes
  exactly 24 fixed steps (`CELL_FRAMES`). Speed is the stick deflection,
  and letting go stops it at once.
  - **Collision:** the dog is a circle (r 0.26) sliding along wall
    capsules (half-thickness 0.07), so you never catch on a corner.
  - **Corner assist:** if the main axis is mostly blocked and you're
    within 0.45 of a cell-centre line, the dog slides onto it, Pac-Man
    style. That turns "push up just past a gap" into a clean turn.
- **Cones.** 75° wide (`CONE_HALF` = 37.5°) and 3.5 cells long. Walls block
  them: the cone drawn on the floor is built from the same rays
  (`coneRays`) that the detection test (`seenAt`) uses, so what you see is
  what catches you.
- **The "?" meter.** It fills while anyone (the dog *or* any puppy in the
  line) is inside a cone.
  - Fill time is 0.4 s at the near edge and 0.8 s at the far edge.
  - It drains in 1 s once nobody is seen.
  - When it's full you're caught. The guard shows "?" while filling and
    "!" on the catch.
- **Touching a catcher** (within 0.6) is an instant catch, cone or not, so
  you can't hug a catcher's back.
- **Caught** shows the net swing, a "Caught!" banner that says whether the
  dog or a puppy was seen, then a fresh attempt 900 ms later.
- **Puppies.** You open a cage by getting within 0.6 of it. Each puppy
  follows the dog's path at a fixed 0.55-cell spacing (a breadcrumb trail),
  so it never cuts corners through walls. Puppies don't slow the dog, but
  they are seen, and a long tail is the main source of difficulty.
- **Escape** happens when the dog reaches the door cell (y < 0.55) with the
  door open.
- **Catchers.** Each one's pose is a pure function of time (`guardPose`):
  - **Static:** one point and a facing (any angle, including diagonals).
  - **Back-and-forth walkers:** waypoints, 0.6× the dog's speed, a pause
    with a 180° turn at each end, and 0.3 s turns at inner corners.
  - **Loops:** supported (`loop: true`) but not used yet. They're Round 4.
- **The clock** (and the catchers) start on the first move. A level always
  opens in the same state, and you get time to read the tip.

## Architecture

```
puppyRescue/
  rescueModel.ts     pure sim: parseLevel, step (fixed 1/60 s), guardPose,
                     seenAt / coneRays / lineOfSight, pointBack (puppy line),
                     starsFor, routeInput (route follower for replays)
  rescueLevels.ts    the append-only level pack (ASCII maps + catcher specs)
  rescuePlanner.ts   the level prover (BFS over cell × puppies × time)
  rescueSounds.ts    Web Audio SFX (yip, door, "huh?", caught, escape)
  PuppyRescueWidget  shell: rAF loop, input, HUD, picker, ⚙ menu, overlays
  PuppyRescue3D.tsx  lazy chunk: the scene, a pure view over the sim ref
  puppyModels.tsx    Dog / Catcher / Cage / GoalMarker / AlertMark / Blob
  puppyLook.ts       Anim + coat colours (model inputs)
```

- **The shell owns the simulation.** A `requestAnimationFrame` loop runs
  fixed steps from an accumulator capped at 8 per frame, reading input
  from refs. React re-renders only when something the HUD shows changes:
  the status, the puppy count, the spotted flag, the result.
  - The timer text is written straight into the DOM.
  - Telemetry goes to the root's `data-*` every 50 ms.
- **The 3D view is a pure view.** It gets the sim ref and reads it in
  `useFrame`, moving meshes directly. So the game works the same whether or
  not the chunk has loaded, and a caught/escape is decided only by the model.
- **Map format** (`LevelSpec.map`) is an ASCII grid of `(2·rows+1)` lines
  by `(2·cols+1)` chars:
  - Odd/odd chars are cells: `.` floor, `D` dog start, `C` a caged puppy.
  - Chars between cells are edges: `-`, `|` or `#` is a wall, a space is
    open.
  - `+` marks a post (ignored).
  - One `E` on the top border is the door.
  - The parser merges edge walls into runs for collision, sight and
    rendering.
- **Low-spec look.**
  - Matte `meshStandardMaterial` only: no transmission, no emissive, no
    real shadows (dark blob discs instead).
  - Cages are bars, not glass.
  - The cone is one dynamic fan geometry per catcher (33 rays).
  - "?" and "!" are built from primitives, so no font is loaded.
- **Dog walk** uses the shared leg-gait constants on four legs, swinging
  the diagonal pairs together (front-left with back-right). The catcher's
  two legs use the same rig.

## The level pack and the planner

Levels are **hand-authored** (Car Park's lesson #126: rare, interesting
puzzles ship as a pack). Every level is **proven** escapable with 3 stars:

- `planLevel` runs a breadth-first search over (cell, puppies-freed mask,
  time step). Each action is a one-cell move or a wait of exactly one
  cell-time (0.4 s), so the plan's timeline matches the real sim's
  frame for frame.
- Every check runs against an **inflated** catcher: cone +0.3 cells and
  +4°, bodies 0.2 bigger, bump +0.35, cages picked up 0.15 early. A route the
  planner calls safe stays safe in the continuous game.
- The route is replayed through the real `step` with `routeInput`, which
  steers straight at each waypoint and lands on it exactly. The replay must
  escape with 3 stars, never spotted.
- When every catcher is static, nothing depends on the clock, so the search
  is a plain BFS with a global visited set. That takes milliseconds,
  against about a second for patrol levels.

The e2e sweep (`180-puppy-model`) re-proves every level on every run. It
also checks that catchers' paths don't cross walls and that nobody can see
the start.

**Authoring workflow used for Round 1** (scratch tooling, not committed):
1. Sketch the walls.
2. Run the planner with and without catchers. The "free" time against the
   guarded time shows whether a catcher actually matters.
3. Draw a coverage map (the share of time each cell is watched).
4. For static levels, a greedy placer tried every cell × 8 facings and kept
   the catcher that lengthened the 3-star route the most. It rejected cones
   shorter than 2.5 cells on average, because those "stare at a wall"
   placements are artifacts.

| Level | Id | Catchers | 3★ route | Unguarded |
|---|---|---|---|---|
| Sneak 1 · First Rescue | `sneak:0` | 1 static (teaches the cone) | 4.0 s | 4.0 s |
| Sneak 2 · Look Away | `sneak:1` | 1 static down the short corridor | 7.2 s | 6.4 s |
| Sneak 3 · Two Pups | `sneak:2` | 2 static | 14.4 s | 10.4 s |
| Sneak 4 · Crossfire | `sneak:3` | 2 static (one diagonal) | 18.4 s | 13.6 s |
| Sneak 5 · Back Door | `sneak:4` | 2 static, one in front of the door | 22.4 s | 12.8 s |
| Patrol 1 · On Patrol | `patrol:0` | 1 walker across the middle hall | 6.4 s | 5.6 s |
| Patrol 2 · Two Halls | `patrol:1` | 2 walkers, offset phases | 14.0 s | 12.0 s |
| Patrol 3 · Corner Watch | `patrol:2` | L-shaped walker + static | 14.8 s | 9.6 s |
| Patrol 4 · Busy Shelter | `patrol:3` | see `rescueLevels.ts` (layout after screenshot 1) | ≈21 s | 14.4 s |
| Patrol 5 · Great Escape | `patrol:4` | central-hall walker + more, 4 puppies | ≈17 s+ | 13.6 s |

Times are the planner's optimum. A human takes longer.

## Persisted state

- **Widget `data`:** `{ level, sound, unlockAll }`. That's only where you
  are and the settings.
- **App-level records** (`records.puppyRescue`, survives removing the
  widget): `stars[levelId]` (best 1–3), `bestMs[levelId]` (fastest escape,
  0 = none) and `escapes` (lifetime tally).
  - A level counts as escaped once it has a `stars` entry, which is also
    what unlocks the next one.
  - Stars and time are independent bests.
  - Reset records lives in the ⚙ menu (confirm-guarded) and uses the shared
    `resetGameRecords('puppyRescue')`.
- **Not persisted:** the run in progress. A run lasts under a minute, so a
  reload simply restarts the level.

## Test contract (`data-*`)

- **Root `puppy-root`:**
  - Rendered attributes: `data-level` (id), `data-level-index`,
    `data-unlocked` (count), `data-run`, `data-sound`.
  - Live telemetry every 50 ms: `data-status` (ready|play|caught|escaped),
    `data-x`/`data-y` (map cells), `data-t`, `data-pups`, `data-meter`,
    `data-spotted`, `data-seeing` (catcher bitmask), `data-guards`
    (x,y,h per catcher).
  - SFX counters: `data-sfx-freed`/`-alert`/`-caught`/`-escape`.
- **Hooks:**
  - Controls and readouts: `puppy-level` (NativeSelect; the `<select>` is
    inside), `puppy-count` (`data-pups`/`data-total`), `puppy-settings`,
    `puppy-stage` (the drag surface), `puppy-3d`, `puppy-timer`,
    `puppy-unseen` (`data-spotted`), `puppy-restart`.
  - Overlays: `puppy-tip` (ready), `puppy-caught`, `puppy-escaped`
    (`data-stars`), `puppy-next`, `puppy-again`.
  - ⚙ menu items: `puppy-sound`, `puppy-unlock-all`, `puppy-reset-records`.

## Verifying

```bash
npm run build && npm run lint
npm run e2e puppy        # 180-puppy-model (pure + the level sweep), 181-puppy (live)
```

## Future work (enhancement backlog)

Each item names the seam it builds on.

**Next rounds (agreed order)**
- **Round 2: rotating sentries.** A static catcher whose facing sweeps
  ±60–90°. This is a new leg kind in `buildTrack` (turn legs only); the
  planner needs no change because it's a pure function of time.
- **Round 2: gold key → padlocked pen** (screenshot 2). A key pickup plus
  a pen holding many puppies behind a padlock edge. The edge becomes
  passable once the key is held, so the planner adds a key bit to the mask.
- **Round 3: hiding spots.** Bushes or boxes: cells where the dog (not its
  tail) is unseen while it stands still. Add a `hide` cell flag in the map
  and a skip in `seenAt` for the dog.
- **Round 3: Bark lure.** A button with a cooldown. The nearest catcher
  walks to the sound and back, which needs a catcher state that departs
  from its track (the start of the Arcade AI).
- **Round 4: waypoint loops, doors and switches.** `loop: true` already
  works. Doors are edges toggled by a pressure plate.

**Modes and settings**
- **Easy mode:** a seen puppy is netted back into its cage instead of a
  full catch (`step`'s catch branch, by `caughtWho`).
- **Arcade mode:** on "!", the catcher chases at about 1.05× the dog's
  speed, using BFS to the last-seen cell, searches for about 3 s, then
  returns to its track. Caught only on contact.
- **Par-time challenges:** a fourth, optional "speedy" badge from the
  planner's optimum × a slack factor.
- **Seeded endless levels or a daily level:** generate walls, then place
  catchers with the greedy placer, keeping only levels the planner proves.
- **2D top-down view** for small cards (an SVG view over the same sim
  ref, like Car Park's toggle).
- **Bigger mazes with a follow camera:** `CameraRig` fits a window around
  the dog instead of the whole maze. Off-screen catchers need edge
  indicators.

**Enemies and obstacles**
- **Security cameras:** static sweeping cones that raise an alarm, making
  every catcher look toward the camera.
- **Guard dog:** hears you within a radius, through walls, while you move.
- **Searchlights:** a moving circle instead of a cone.
- **Animal-control van:** scenery by the entrance, maybe a timed sweep
  across the exit.
- **Terrain:** mud (slows the dog, so it can't outrun a cone), conveyor
  floors, one-way gates, puppies that wander off if left too long.

**Controls and feel**
- **Optional tap-to-move:** pathfind with `canStep` BFS, then drive with
  `routeInput`, which already exists.
- **Sneak button:** slower and quieter (once hearing exists).
- **Haptics** on "?" and on a catch (`droneSim/haptics`).
- **Puppies hopping out** through the door on escape (a short
  path-following animation instead of the happy bounce).
- **A "show me how" hint:** play the planner's route as a ghost, as Car
  Park's solution replay does (the planner is already the seam).

**Meta**
- **A shelter screen** that fills with every puppy you've rescued, with
  coins for rooms and outfits (the store game's loop).
- **Pick your dog:** breeds or coats in ⚙, using the `Coat` palette that
  already exists.
- **Two Devices co-op:** each player controls a dog with separate puppy
  lines (netplay `pos` messages, like the maze race).
- **A level editor:** the ASCII map plus catcher specs, validated live by
  the planner.
