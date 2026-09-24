# Car Park widget — design notes

The classic sliding-car ("Rush Hour" / traffic jam) puzzle. A 6×6 lot is
packed with cars (2 bays) and trucks (3 bays). Each vehicle slides only
along its own axis, forwards or backwards. The goal is to drive the **red
car** out of the exit in the right kerb of row 3.

It is the dashboard's **first puzzle on a fixed, numbered level pack**. The
other puzzles (Arrow Escape, Maze Runner, Memory) deal a fresh seeded board
every time.

## Why fixed levels, not random

Random placement is a poor fit for this puzzle, because how hard a board is
depends almost entirely on the length of its optimal solution.

- Most randomly placed lots solve in 1–5 moves.
- Many others can't be solved at all.
- Only a tiny, unpredictable fraction are interesting.

Arrow Escape can be random because every board it generates is a fair
puzzle by construction. Here, an interesting board has to be *searched
for*.

So the pack is **curated offline and pre-solved**. Every level ships with a
**par**, the BFS-optimal move count, and that buys three things:

- The tiers are honest. A tier is a par band (see below), not a guess.
- Scoring is meaningful: "Out in 14 moves, par is 12", a ★ at par, and a
  best score per level.
- Growth is safe. You append a level, and the e2e sweep re-proves it
  solvable, re-derives its par and checks its band.

The player picks a level with two dropdowns: **Tier** (Beginner /
Intermediate / Advanced / Expert), then **Level 1…N** within that tier. The
dropdowns are native `<select>`s, so phones get the OS picker. A random
mode is on the backlog. It would reuse the same solver.

## Rules engine — `carPark/carParkModel.ts`, pure

- **Board encoding.** A board is a 36-character row-major string, the
  standard compact Rush Hour format:
  - `o` is an empty bay and `x` is a wall.
  - `A` is the target car. It must be a horizontal 2-bay car on the exit
    row (`EXIT_ROW = 2`).
  - `B…Z` are the other vehicles.

  `parseBoard` reads each vehicle's orientation off its cells and puts the
  target at index 0. It **throws** on anything malformed, which is safe
  because levels are authored data.
- **Position.** A position is just one offset per vehicle: its column if
  horizontal, its row if vertical. A vehicle's lane never changes.
- **Moves.** One move is `[vehicle index, signed delta]`, a slide of *any*
  length. That is the standard Rush Hour move count. The model also exports
  `moveRange` (the free run each way, stopped by vehicles and walls),
  `isLegal`, `applyMove` and `legalMoves`.
- **Solved.** A level is solved when the target's nose reaches the right
  edge. The drive-out off the lot is animation, not a move.
- **Solver.** `solve(lot, from)` is a BFS over positions that returns the
  optimal line, or `null` if there is none. Even the hardest 6×6 boards reach
  at most tens of thousands of states, so this is fast even in the
  browser. `hint` is its first move and has no UI yet (see the backlog).
- **Replay.** `replay(lot, moves)` rebuilds a position from a move log and
  stops at the first illegal move. This lets the widget persist only the
  log.

## The level pack — `carPark/carParkLevels.ts`

- **Append-only.** A level's identity is `tier:index`, and saved bests key
  on it. Never reorder or delete levels; add new ones to the **end** of a
  tier's list.
- **Par bands** (`TIER_BANDS`, inclusive):

  | Tier         | Par band |
  |--------------|----------|
  | Beginner     | 3–8      |
  | Intermediate | 10–17    |
  | Advanced     | 19–27    |
  | Expert       | 30–60    |

  The gaps between bands keep neighbouring tiers clearly different.
- **First release:** 40 levels, 10 per tier. Within each tier they are
  ordered by rising par. The hardest Expert level is the famous 51-move
  maximum for a 6×6 lot.

### Generating levels — `scripts/gen-carpark-levels.mjs`

```bash
node scripts/gen-carpark-levels.mjs [perTier=10] [seed]   # prints candidates
CARPARK_TRACE=1 node scripts/gen-carpark-levels.mjs      # with progress
```

The script bundles the model with esbuild and runs a seeded, reproducible
search. It skips any board already in the pack.

- **Hardest state in the cluster.** Slides are reversible, so a set of
  vehicles defines a connected cluster of states. The script:
  1. BFSes the *whole* cluster;
  2. runs a multi-source BFS back out from every solved state, which gives
     every state its **exact** optimal distance;
  3. picks, for each tier, the farthest state inside that tier's band that
     has at least one blocker ahead of the red car.
- **Easy tiers** come from plain random lots of 7–13 vehicles.
- **Hard tiers** come from a hill-climb:
  1. Start from a random lot.
  2. Mutate it: drop one vehicle and/or add one at a random free spot.
  3. Keep the mutation if the cluster's hardest state is at least as far
     out as before.
  4. Repeat for 400 steps.

  This is what reaches 30–51-move boards, which plain random sampling
  almost never finds.

To add levels:
1. Run the script.
2. Paste the printed lines onto the end of the tier lists.
3. Run `npm run e2e carpark`. The sweep re-proves every level.

## Interaction and animation

- **Board.** The board is one SVG with a `viewBox` of the lot plus a
  0.25-bay kerb, `meet`-letterboxed inside a `containerType: 'size'` box
  (lessons #3). The exit is a gap in the right kerb, marked with a red
  chevron.
- **Dragging.** Vehicles are dragged with pointer events. The pointer is
  captured on the svg, and the svg has `touchAction: 'none'`.
  - The slide follows the finger fractionally, clamped to `moveRange`
    measured at pointer-down.
  - On release the vehicle snaps to the nearest bay. A non-zero snap
    commits **one** move.
  - Lost capture releases the drag the same way (lessons #39).
  - The live delta lives in the drag ref, not state, so a fast release
    never reads a stale render.
- **Tap and keyboard.** A tap (under 0.2 bay of travel) selects the vehicle
  and outlines it white. With the widget focused, arrow keys along its axis
  slide it one bay per press (one move each). The handler sits on the
  widget root, not `window`, so it never steals keys from the dashboard, and
  it is `isTypingTarget`-guarded.
- **Motion.** Each vehicle `<g>` is placed with a CSS
  `transform: translate(xpx, ypx)`. In SVG, px means user units. A 120 ms
  transition animates the snap, and the drag itself has no transition.
  - The vehicles group is keyed by level, so a level change re-mounts the
    cars instead of sliding them in from the old layout.
  - When a level is won, the red car's target moves off the lot with a
    700 ms ease-in, which is the drive-out.
  - The win overlay fades in 500 ms later. On a reload of a won level, the
    car is simply already gone.
- **Win overlay.** It shows `WinnerCelebration`, "Out in N moves!" with
  "Par ★" or "Par is P". A **Next level** button appears in the footer
  row. It lives there rather than in the overlay because the celebration
  figure fills the overlay on a small card. Next level goes to the next
  level in the tier, then on to the first level of the next tier.
- **Controls.** **Undo** pops the last move. **Reset** and a level or tier
  change are `ConfirmDialog`-guarded while an attempt is in progress.

## 3D view — `carPark/CarPark3D.tsx` (lazy chunk)

A **2D | 3D** toggle (`carpark-view`, next to the dropdowns) swaps the SVG
board for a fully playable three.js board. The choice is persisted as
`view`, and the default is 2D.

- **Game logic stays in the widget.** The widget still owns the move log,
  clamping, snapping, the win, the keyboard and the controls. `CarPark3D`
  is a pure **view**: it takes `lot`, `pos`, the live `drag`, `won` and
  `selected`, and reports drags back through `onBegin(vi)`, `onDrag(bays)`
  and `onEnd()`.
- **Shared drag core.** The drag handling is view-agnostic and works in
  **bays** (`beginDrag`, `dragTo`, `finishDrag`). The 2D board converts
  client pixels to bays. The 3D board converts world units to bays, and
  since 1 unit = 1 bay that is the identity. Tap-to-select, the 0.2-bay
  tap threshold and ONE move per snapped slide therefore behave the same
  in both views.
  - The core is memoized and reads the latest position through a ref, so
    the 3D view's handlers never close over stale state.
- **Loading.** The chunk loads through
  `lazyWithReload(() => import('./CarPark3D'), 'carpark3d')` inside
  `<Suspense>`, so three.js never reaches the main bundle. Players who stay
  in 2D never download it: the chunk itself is about 7 kB, and it shares
  the three/R3F vendor chunk with the other 3D widgets.
- **Scene.** The lot is centred on the origin, rows run toward the camera
  (+z) and the exit is on the right (+x). The camera is **fixed** at 55°
  elevation. `CameraRig` walks it along that view direction until the lot
  plus kerb plus exit chevron fill about 94% of the canvas, and it refits
  on every resize, so portrait and landscape both frame the whole lot.
  There is no orbit, because orbiting would fight the drag.
- **Vehicles.** `Vehicle3D` draws a simple toy car or truck: a chassis in
  the vehicle's colour, a dark glasshouse, a roof, headlights and wheels.
  Trucks have a front cab and a coloured cargo box. They use the 2D palette
  (`palette.ts`), so a vehicle keeps its colour across the toggle.
  - They follow the low-spec convention (up to 13 on screen): matte
    `meshStandardMaterial`, no transmission or emissive. The Model Viewer
    trucks weren't reused because they have no colour prop and are far too
    detailed for 13 instances.
- **Dragging in 3D.** R3F's own mesh events drive the drag, which is new to
  the repo (other 3D widgets use DOM pointer events on a wrapper).
  - `onPointerDown` on a vehicle captures the pointer
    (`e.target.setPointerCapture`) and records where `e.ray` hits a
    horizontal plane at mid-body height (`y = 0.3`).
  - Captured `onPointerMove` events re-intersect that plane, and the
    world delta along the vehicle's axis *is* the bay delta.
  - `onPointerUp`, `onPointerCancel` and `onLostPointerCapture` end the
    drag.
  - Using a plane at body height rather than the ground keeps the grabbed
    point under the finger.
- **Motion.** Vehicles ease toward their snapped bay in `useFrame`
  (`1 − e^(−16·dt)`) and follow the finger instantly while dragged. The
  won target car eases out past the exit more slowly (`EASE_OUT`). The
  vehicle group is keyed by level, so a level change places the cars
  instead of gliding them.
- **Overlay.** The win overlay and the footer are unchanged and sit over
  whichever board is showing.

## State model (persisted `data`, via `useWidgetField`)

| Field    | Meaning |
|----------|---------|
| `tier`   | Current tier (coerced to a known tier). |
| `level`  | Index within the tier (clamped to the pack). |
| `moves`  | `[vehicleIndex, delta][]`, the current attempt's log. The board is **derived** by `replay`, never stored. |
| `best`   | `{ 'tier:index': fewestMoves }`. |
| `solved` | Lifetime solve count. |
| `view`   | `'2d'` or `'3d'` board (coerced; default `'2d'`). |

The winning move writes `moves`, `solved` and `best` in **one** dispatch,
so a reload can never double-count a solve.

## Test contract (`data-*`)

- **Root** `carpark-root`: `data-tier`, `data-level`, `data-moves` (moves
  applied), `data-par`, `data-best` (empty when there is none),
  `data-solved`, `data-state` (`live` or `won`) and `data-view` (`2d` or
  `3d`).
- **Board** `carpark-board`: one `<g>` per vehicle with `data-vehicle`
  (letter), `data-index` (model index), `data-row`, `data-col`, `data-len`
  and `data-horiz`.
- **Controls:**
  - `carpark-tier` and `carpark-level` (the native `<select>` is inside
    each);
  - `carpark-undo` and `carpark-reset`;
  - `carpark-won` and `carpark-next`;
  - `carpark-view` with `carpark-view-2d` and `carpark-view-3d`.
- **3D wrapper** `carpark-3d`, which exists only in 3D. Its throttled
  attributes are written every 10 frames by one owner, the in-canvas
  `Probe`:
  - `data-frames` counts rendered frames.
  - `data-vehicles` is JSON `[{ i, off, track }]`. `track[k]` is the
    wrapper-pixel projection of the vehicle's drag-plane centre at lane
    offset `k`. Perspective makes a bay's on-screen length vary, so
    `dragVehicle3D` in `helpers.mjs` aims at the exact projected bay
    instead of scaling a single step.

## Verifying

`npm run e2e carpark` runs `e2e/152-carpark.test.mjs`:

- **Pure checks:** crafted boards, then the whole-pack sweep.
- **Live checks:** real pointer drags through `dragVehicle` in
  `helpers.mjs`, including playing the solver's optimal line to a ★ win.

`e2e/153-carpark-3d.test.mjs` covers the 3D view. It checks:
- the default 2D view, and that the toggle mounts one rendering canvas;
- that `data-vehicles` matches the model;
- a 3D over-drag that clamps and counts one move, then Undo;
- a tap followed by an arrow key;
- that the view survives a reload;
- an optimal-line win played through 3D drags;
- that switching back to 2D keeps the game.

## Future work (enhancement backlog)

**Modes**
- **Random mode.** A "Random" entry per tier that runs the generator's
  cluster search in a Web Worker, bounded to that tier's band. `solve` and
  the band table already exist; the only new part is the worker.
- **Daily puzzle.** Seed the random mode with the date. Everyone gets the
  same board, and the best score shows against par.
- **Timed challenge.** A clock per level with a per-level best time, using
  Maze Runner's per-size-best pattern.
- **2 Devices race.** Two tablets play the same level, and the first out
  wins. It would build on the maze ghost race's synced `go`/`done`, with
  progress sent as the move count.

**Puzzle content**
- **More levels.** Append from the generator (see above). The dropdown and
  bests scale with no code change.
- **Walls / parked obstacles.** `x` cells are already parsed, drawn and
  solved around. The generator only needs to drop a wall or two before its
  climb.
- **Bigger lots (7×7, 8×8).** Make `LOT` a per-level field. The encoding
  would become `size + board`.
- **Level editor with share codes.** The board string *is* the share code.
  `solve` validates a board and computes its par before it is accepted.

**Help and feel**
- **Hint button.** Highlight `hint(lot, pos)` (already exported) and pulse
  its vehicle. Using it could forfeit the ★ for that attempt.
- **Solution replay.** Animate `solve()`'s line after a win or a give-up.
- **Sound.** An engine purr on drag and a thunk at the end of a slide
  through `droneSim/webAudio`, with no asset files.
- ~~**3D view**~~ — **shipped** as the lazy `CarPark3D` board behind the
  2D/3D toggle (see *3D view* above), with its own toy models rather than
  the Model Viewer trucks.
- **Orbit / tilt camera button.** A "rotate view" chip that steps the fixed
  camera 90° around the lot. Rotating in fixed steps avoids fighting the
  drag, and `CameraRig`'s fit already handles any view direction.
- **Exit gate + drive-off in 3D.** A boom barrier at the exit that lifts
  when the red car's path clears, then the car accelerates away. This is
  pure `useFrame` on the existing drive-out.
- **Shadows and lights on win.** Cheap blob shadows under the cars, and
  headlights that light up during the drive-out. The glow could be an
  opacity pulse on the lamp boxes instead of emissive, to stay within the
  low-spec rule.
- **3D in fullscreen by default.** Open the 3D view when the card is
  maximised (`usePresentation`), since the 3D board benefits most from the
  space.
- **Per-tier progress.** Show "7/10 ★" beside each tier in the dropdown.
