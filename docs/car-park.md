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
  optimal line, or `null` if there is none. The hardest 6×6 boards have a
  few thousand reachable states, so this is milliseconds even in the
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
  "Par ★" or "Par is P", and a **Next level** button. Next level goes to
  the next level in the tier, then on to the first level of the next tier.
- **Controls.** **Undo** pops the last move. **Reset** and a level or tier
  change are `ConfirmDialog`-guarded while an attempt is in progress.

## State model (persisted `data`, via `useWidgetField`)

| Field    | Meaning |
|----------|---------|
| `tier`   | Current tier (coerced to a known tier). |
| `level`  | Index within the tier (clamped to the pack). |
| `moves`  | `[vehicleIndex, delta][]`, the current attempt's log. The board is **derived** by `replay`, never stored. |
| `best`   | `{ 'tier:index': fewestMoves }`. |
| `solved` | Lifetime solve count. |

The winning move writes `moves`, `solved` and `best` in **one** dispatch,
so a reload can never double-count a solve.

## Test contract (`data-*`)

- **Root** `carpark-root`: `data-tier`, `data-level`, `data-moves` (moves
  applied), `data-par`, `data-best` (empty when there is none),
  `data-solved`, and `data-state` (`live` or `won`).
- **Board** `carpark-board`: one `<g>` per vehicle with `data-vehicle`
  (letter), `data-index` (model index), `data-row`, `data-col`, `data-len`
  and `data-horiz`.
- **Controls:**
  - `carpark-tier` and `carpark-level` (the native `<select>` is inside
    each);
  - `carpark-undo` and `carpark-reset`;
  - `carpark-won` and `carpark-next`.

## Verifying

`npm run e2e carpark` runs `e2e/152-carpark.test.mjs`:

- **Pure checks:** crafted boards, then the whole-pack sweep.
- **Live checks:** real pointer drags through `dragVehicle` in
  `helpers.mjs`, including playing the solver's optimal line to a ★ win.

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
- **3D view.** Render the lot with the Model Viewer's truck and car models,
  as Drone Strike's `ModelTargets` do. They would use the `lowSpec`
  convention, since up to 13 vehicles are on screen.
- **Per-tier progress.** Show "7/10 ★" beside each tier in the dropdown.
