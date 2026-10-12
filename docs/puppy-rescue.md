# Puppy Rescue widget — design notes

A stealth-rescue maze game: you are a dog sneaking through a 3D maze to free
caged puppies. Each freed puppy follows you in a conga line, and you lead
them all out of the green **ESCAPE** door. Dog catchers stand guard or
patrol, and each one has a red **vision cone**. Stay out of every cone,
and keep your tail out of them too.

Modelled on the "Dog Rescue" style of mobile ads (two reference screenshots
supplied by the user). Round 1 shipped the playable core: 10 levels in two
tiers. Round 2 added **sweeping sentries** and the **gold key → padlocked
pen**, bringing the pack to 20 levels in four tiers. Round 3 added
**hiding spots (bushes)** and a fifth tier, **Hide**, for 25 levels.

## Decisions (settled with the user before building)

| # | Question | Decision |
|---|---|---|
| 1 | How does the dog move? | **Free movement** with a **fixed joystick in its own strip under the maze** (any direction, full speed past a small dead zone; Left / Centre / Right in ⚙, default Centre), or arrows/WASD. Revised twice after play-testing; see *Touch control*. No inertia, so the dog stops when you let go, and corner assist slides it into gaps. |
| 2 | What happens when you're spotted? | **Caught = retry in under a second** (Round 1). Easy mode (the netted puppy goes back to its cage) and Arcade mode (catchers chase, then search) come later as difficulty settings. |
| 3 | 2D or 3D? | **3D only**, low-poly toy look like the screenshots, in a lazy three.js chunk. A 2D view is in the backlog. |
| 4 | Camera | **Fixed portrait**: the whole maze is always visible from a tilted camera fitted to the card, with the exit at the top. Fullscreen prefers portrait. |
| 5 | Round 1 scope | **Small and polished**: 10 levels, Sneak (static catchers) + Patrol (walkers). |
| 6 | Stars | ★ escaped · ★ every puppy · ★ **never spotted** (the "?" meter never started). The best time per level is kept separately. |
| 7 | Level picking | **Unlock in order** (escaping level n opens n+1), plus an **Unlock all levels** switch in the ⚙ menu. |
| 8 | Name | **Puppy Rescue** |
| 9 | Hero | One orange/tan pup; freed puppies come in 4 coat colours. "Pick your dog" is in the backlog. |
| 10 | Catchers | A new chunky model: dark round body, white collar, hat, red-handled net. |

### Round 2 decisions (sentries, key and pen)

| # | Question | Decision |
|---|---|---|
| R2-1 | How does the pen count toward the stars? | **The pen is the goal.** In a key-and-pen level, the "every puppy" star needs the whole pen crowd out of the door. |
| R2-2 | How long does the line get? | **Pen puppies huddle closer**, at `PEN_GAP` = 0.3 cells (caged puppies keep 0.55), so a pen of 6–8 makes a tail of about 2–2½ cells. |
| R2-3 | How do sentries move? | **A smooth sweep back and forth** across a 90–120° arc (default 45°/s), with a 0.6 s pause at each end. |
| R2-4 | Tier order | **Sentry first (levels 11–15), then Key & Pen (16–20).** Key & Pen levels use all three catcher types. |
| R2-5 | The tip covering the maze | **A compact banner above the maze**, gone on the first move. |

### Round 3 decisions (hiding spots)

| # | Question | Decision |
|---|---|---|
| R3-0 | What's next? | **Hiding spots now; the Bark lure in its own later round.** Bark pulls a catcher off its fixed track, which breaks the "pose is a pure function of time" rule the solver depends on. |
| R3-1 | How does hiding work? | **Hidden only while standing still** in a bush. Moving, even inside it, reveals the dog. Puppies are never hidden. |
| R3-2 | Can a catcher catch a hidden dog by walking into it? | **Yes.** Touching still catches, so a bush on a walker's route is a trap. |
| R3-3 | Where do the levels go? | **A new Hide tier, levels 21–25, after Key & Pen.** |

**Detail I chose myself (not asked):** the door opens once the **first**
puppy is freed. That way you can't skip a level with 0 puppies and still
unlock the next one, but you can still escape without every puppy, at the
cost of a star.

## Gameplay rules (as built)

- **World.** One unit is one maze cell. Walls are thin segments on cell
  edges, and maps are 5×7 to 7×11 cells. Row 0 is the top, where the exit
  door is.
- **Dog.** It moves at 2.5 cells/s (`DOG_SPEED`), chosen so one cell takes
  exactly 24 fixed steps (`CELL_FRAMES`). Letting go stops it at once.
  - **Collision:** the dog is a circle (r 0.26) sliding along wall
    capsules (half-thickness 0.07), so you never catch on a corner.
  - **Corner assist:** if the main axis is mostly blocked and you're
    within 0.45 of a cell-centre line, the dog slides onto it, Pac-Man
    style. That turns "push up just past a gap" into a clean turn.
- **Touch control: a fixed stick in a strip under the maze** (third
  version, after two rounds of play-testing).
  - **The stick never moves.** It's the shared `droneSim/VirtualJoystick`
    (it tracks its own finger, zero renders), sitting in a dark control
    strip (`puppy-stick-strip`) below the maze, so it never covers the
    board, the dog's start row included.
  - **Any direction, full speed past a small dead zone.** The stick's
    rescaled output is normalised to a unit vector once it passes
    `STICK_DEAD` (0.15, about 10 px on the 76 px stick), so speed doesn't
    ramp with how far you push. Lift to stop.
  - **Position:** Left / Centre / Right in the ⚙ menu (`stickSide`,
    default Centre).
  - **Only the stick steers.** A drag on the maze does nothing, so looking
    or a stray palm never moves the dog. The arrow keys and WASD don't
    change.
  - **History:**
    - v1 was a floating stick that appeared wherever you touched, with
      speed ramping across a 28–56 px throw. Holding it felt sluggish.
    - v2 kept it floating but gave full speed past 10 px, plus a ring
      leashed to a sliding thumb.
    - The play-tester then pinned the real problem on the floating ring
      itself: "the joystick keeps shifting". A control that moves under
      the thumb gives it no home, hence v3.
  - **Framing:** the strip eats the vertical slack a tilted 7×11 maze
    leaves in a tall card. `CameraRig` hugs the maze (wall tops plus the
    door marker only, 98.5% fit), so there are no empty bands above and
    below.
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
  - **Sentries (Round 2):** one point plus `sweep` (total arc, °) around
    `facing`. The cone turns smoothly at `sweepRate` (default
    `SWEEP_RATE` = 45°/s) from one edge of the arc to the other, holds
    `pause` (default 0.6 s), and turns back. Facing is still a pure
    function of time, so the planner treats sentries like walkers (time
    matters), with no special code.
  - **Loops:** supported (`loop: true`) but not used yet. They're Round 4.
- **Gold key, padlock and pen (Round 2).**
  - **Key:** a key in the maze (`K`) is picked up within `KEY_R` (0.5).
    It floats above the dog (and a key icon shows in the HUD) until it's
    used.
  - **Padlock:** an edge (`L`) that blocks movement **and** sight like a
    wall while shut.
  - **Opening:** carrying the key within `LOCK_R` (0.65) of the padlock's
    centre opens it. The padlock lifts away and the edge becomes open floor.
  - **The pen joins at once:** its `PEN_PER_CELL` (2) puppies per `P`
    cell join the end of the line together, huddled at `PEN_GAP`. That
    counts as one "freed" event (one yip), and opens the door if it's the
    first rescue.
  - **Stars:** the pen counts toward "every puppy"
    (`puppyCount = cages + pen`).
  - **Parse check:** a level must have all of key, padlock and pen, or none
    of them; anything else is rejected at parse time.
- **Bushes (Round 3).**
  - **Map:** a `B` cell is walkable floor with a leafy bush on it.
  - **Hidden:** the dog is hidden when it's in a bush cell and didn't move
    this frame (`RescueState.hidden`). Cones skip it entirely, and a
    hidden dog never turns a cone hot.
  - **Not covered:** puppies are always tested; a catcher's touch
    (`BUMP_R`) still nets the dog.
  - **Feedback:** settling in plays a rustle (`ev.hide`), the dog crouches
    into the leaves, and a green "hidden" badge shows in the HUD.
- **The clock** (and the catchers) start on the first move. A level always
  opens in the same state, and you get time to read the tip.
- **The tip** is a slim banner between the level picker and the maze, never
  over it, so the door and cages stay visible. It disappears on the first
  move. (Round 1's overlay covered the top rows once the camera hugged the
  maze.)

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
- **Round 3: bushes in the search.** A *wait* action in a bush cell hides
  the dog for that whole step; every move sample counts as visible. That
  matches the game, where the frame the dog arrives it's still moving.
  `planLevel(level, maxTime, noHide)` can ignore bushes, and the sweep
  uses it to prove each Hide level **needs** its bushes: unsolvable, or at
  least 3 s slower, without them. All five are unsolvable without.
- **Round 2: key and pen in the search.**
  - The state mask gains a "holding the key" bit and a "pen open" bit.
  - The padlock edge is passable only with pen-open (`canStep(…, penOpen)`),
    and it blocks sight until then (`seenAt(…, shut)`).
  - The goal mask is every cage plus the pen.
  - Each node also carries the **freeing order**. Caged and pen puppies
    sit at different gaps, so the order decides where each one stands in
    the line. The dedupe key still ignores it, the same accepted
    incompleteness as the trail history.

The e2e sweep (`180-puppy-model`) re-proves every level on every run. It
also checks that catchers' paths don't cross walls and that nobody can see
the start.

**What made a bush necessary (Round 3 authoring).**
- A single sentry sweeping an open hall never forced the bush: there's
  always a cell the cone isn't on.
- A sentry looking down a long corridor didn't either: most of it was
  beyond the cone's 3.5-cell reach.
- The pattern that works is a **walker in a one-cell corridor with the
  bush in a side alcove**. The dog can't pass the walker, so it waits in
  the alcove while the walker goes by, then follows behind it.
- Puppies are never hidden, so each Hide level puts the bush **before**
  the rescues, or keeps the tail out of the corridor (for example, the key
  at the bottom and the pen by the door).

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
| Patrol 4 · Busy Shelter | `patrol:3` | 2 side-corridor walkers + 1 static (layout after screenshot 1; side corridors have alcoves) | 29.2 s | 14.4 s |
| Patrol 5 · Great Escape | `patrol:4` | central-hall walker + side walker + static, 4 puppies | 30.8 s | 13.6 s |
| Sentry 1 · Searchlight | `sentry:0` | 1 sentry sweeping 100° across the middle hall | 12.0 s | 6.4 s |
| Sentry 2 · Two Lights | `sentry:1` | 2 sentries (90°) at opposite hall ends | 15.6 s | 12.0 s |
| Sentry 3 · Sweep & Walk | `sentry:2` | sentry (110°) + walker | 21.6 s | 11.2 s |
| Sentry 4 · Lighthouse | `sentry:3` | central sentry (120°, sneak behind it) + diagonal static, 3 pups | 10.0 s | 8.8 s |
| Sentry 5 · Night Shift | `sentry:4` | 2 sentries + walker, 3 pups | 16.4 s | 8.8 s |
| Key & Pen 1 · Golden Key | `key:0` | 1 static (teaches key → padlock → pen of 6) | 8.0 s | 8.0 s |
| Key & Pen 2 · Long Tail | `key:1` | hall walker vs a tail of 8 pen pups | 14.8 s | 13.6 s |
| Key & Pen 3 · Locked In | `key:2` | sentry (120°, 40°/s) watching the padlock; cage + pen of 6 | 12.4 s | 8.8 s |
| Key & Pen 4 · Key Run | `key:3` | walker + static; key far from the pen; cage + pen of 8 | 18.0 s | 14.4 s |
| Key & Pen 5 · Great Breakout | `key:4` | sentry + walker + static; 2 cages + pen of 6 | 18.8 s | 9.6 s |
| Hide 1 · In the Bushes | `hide:0` | corridor walker; alcove bush to let it pass | 17.2 s | 7.6 s |
| Hide 2 · Blind Spot | `hide:1` | the same, as a cross corridor | 12.4 s | 7.6 s |
| Hide 3 · Two Hedges | `hide:2` | two corridor walkers in a row, two bushes | 19.2 s | 8.4 s |
| Hide 4 · Garden Pen | `hide:3` | corridor walker + bush; key at the bottom, pen by the door | 16.4 s | 9.2 s |
| Hide 5 · Hide and Seek | `hide:4` | two walkers, two bushes, cage + key + pen of 4 | 30.4 s | 13.6 s |

Times are the planner's optimum. A human takes longer.

## Persisted state

- **Widget `data`:** `{ level, sound, unlockAll, stickSide }`. That's only where you
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
    `data-unlocked` (count), `data-run`, `data-sound`, `data-stick`.
  - Live telemetry every 50 ms: `data-status` (ready|play|caught|escaped),
    `data-x`/`data-y` (map cells), `data-t`, `data-pups`, `data-meter`,
    `data-spotted`, `data-seeing` (catcher bitmask), `data-guards`
    (x,y,h per catcher), `data-key` (carrying), `data-pen` (padlock open),
    `data-hidden` (still in a bush).
  - SFX counters: `data-sfx-freed`/`-alert`/`-caught`/`-escape`/`-key`/`-unlock`/`-hide`.
- **Hooks:**
  - Controls and readouts: `puppy-level` (NativeSelect; the `<select>` is
    inside), `puppy-count` (`data-pups`/`data-total`), `puppy-settings`,
    `puppy-stage` (the maze area, not a control), `puppy-stick` (the
    joystick) inside `puppy-stick-strip` (`data-side`), `puppy-3d`, `puppy-timer`,
    `puppy-unseen` (`data-spotted`), `puppy-restart`, `puppy-key` (HUD key
    icon, present while carrying), `puppy-hidden` (HUD hidden badge),
    `puppy-tip` (the banner, while ready).
  - Overlays: `puppy-caught`, `puppy-escaped`
    (`data-stars`), `puppy-next`, `puppy-again`.
  - ⚙ menu items: `puppy-sound`, `puppy-unlock-all`,
    `puppy-stick-left`/`-center`/`-right`, `puppy-reset-records`.

## Verifying

```bash
npm run build && npm run lint
npm run e2e puppy        # 180-puppy-model (pure + the level sweep), 181-puppy (live)
```

## Future work (enhancement backlog)

Each item names the seam it builds on.

**Next rounds (agreed order)**
- ~~**Round 2: rotating sentries.**~~ Shipped; see *Catchers* and the
  Sentry tier.
- ~~**Round 2: gold key → padlocked pen.**~~ Shipped; see *Gold key,
  padlock and pen* and the Key & Pen tier.
- **Snap-turn sentries** (from the Round 2 discussion, not chosen): a
  catcher that holds a direction, then turns 90° quickly. This would be a
  turn leg with a short `dur` between long holds in `buildTrack`.
- **Several keys and pens per level**, or a coloured key per padlock. This
  generalises the single `lock`/`key` to arrays plus one mask bit per key.
- **Pen pack behaviour:** the crowd bunches into a blob instead of single
  file (Round 2 option C). The detection would test a cluster of points.
- ~~**Round 3: hiding spots.**~~ Shipped as bushes; see *Bushes* and the
  Hide tier.
- **Boxes and hay bales:** other hiding-spot looks, or a box you can push
  into position (a movable `bush` cell; the planner would need it in the
  state).
- **Puppies that hide too:** a "huddle" command that tucks the line into
  a bush with the dog. This would change the rule that puppies are always
  tested.
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
