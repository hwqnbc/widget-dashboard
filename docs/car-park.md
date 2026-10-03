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
- **Making the target obvious.** The red car must be identifiable at a
  glance, and never by colour alone.
  - **Palette rule** (`palette.ts`): no other vehicle colour may sit within
    50° of the target's hue, so there is no orange, pink, magenta or
    reddish-brown. Low-saturation greys are exempt. The target itself is a
    pure bright red, `#ff1f1f`. The rule is pinned by a pure check in the
    152 suite, which caught a near-amber yellow when it was first added.
  - **Livery in both views:** two white racing stripes and a gold outline
    (2D) or gold belt line (3D). The 2D car also has a white roof chevron
    pointing at the exit. White stays reserved for the selection outline.
  - **3D marker:** a red cone in a white ring bobs above the car
    (`TargetMarker`). It is hidden while the car is dragged or driving off.
  - **Goal lane:** the exit row is faintly tinted red in both views, so
    the lane to clear reads too.
- **Win overlay.** It shows "Out in N moves!" with "Par ★" or "Par is P",
  **above** the `WinnerCelebration`. The text comes first because the
  celebration figure can fill the overlay on a narrow card, and the result
  line must never be clipped.
  - A **Next level** button appears in the footer row, not the overlay,
    and takes Undo's slot, since Undo is meaningless once won. That keeps
    the footer on one line on a narrow card.
  - Next level goes to the next level in the tier, then on to the first
    level of the next tier.
- **Controls.** The footer controls are icon buttons, so the footer stays on
  one line on a narrow card: Hint 💡, Show solution ▶, Undo ↶ and Reset ↻.
  Once the level is won they become Next level, Replay ▶ and Reset.
  - **Undo** pops the last move.
  - **Reset** and a level or tier change are `ConfirmDialog`-guarded while
    an attempt is in progress.
  - The top row never wraps. The two native selects shrink and ellipsize
    their label, while the open list still shows the full text.

## Hints

A lightbulb **Hint** button (`carpark-hint`, in the footer, hidden once
the level is won) shows the **BFS-optimal next move**, meaning which car to
slide and where to. It uses `hint(lot, pos)`, the first move of `solve`
from the *current* position. That is exact, so following hints always
finishes in the fewest remaining moves, and following them from the start
solves in exactly par. It computes on click and is memoized per position;
even Expert takes only milliseconds.

- **What it shows.**
  - In 2D:
    - the hinted car gets a pulsing dashed amber outline (SMIL
      `<animate>` on opacity);
    - a dashed **ghost** in the car's colour marks its destination bays
      (`carpark-hint-ghost`);
    - an amber **arrow** is drawn on top of the cars, from the car's
      leading edge to the ghost.
  - In 3D, there is a translucent amber ghost box at the destination and
    an amber cone bobbing above the car, pointing the way. The red car's
    own marker hides while it is the hinted one.
  - Amber (`#ffc400`) is deliberately distinct from the red target and
    from the white selection outline.
- **Lifetime.** A hint belongs to one position, keyed by level and
  position. It is **explicitly** dropped on every committed move, Undo,
  Reset and level change.
  - Keying alone wasn't enough. Reset returns to the start position, so
    an old hint would reappear *uncounted*; the e2e suite caught this.
  - Pressing Hint again on the same position counts once.
- **First-hint confirmation.** The button sits beside Undo and Reset, so
  it's easy to tap by accident. The **first** hint of an attempt (when
  `hints === 0`) therefore opens a "Use a hint?" `ConfirmDialog`, which
  explains that the attempt won't earn a ★ or a best score.
  - "Show hint" uses the hint. "Keep trying" closes the dialog with
    nothing shown and nothing counted.
  - Later hints in the same attempt skip the prompt, because the ★ is
    already gone.
  - The rule is per attempt. Reset or a level change zeroes `hints`, so a
    fresh attempt, which can earn the ★ again, asks again.
- **Scoring.** `hints` counts the hints used in the attempt and resets
  with the move log.
  - A solve with any hint still counts as **solved**: `solved` goes up,
    and the level shows ✓ in the dropdown through the `assisted` map.
  - It **never** earns ★ and never updates `best`, because hints follow
    the optimal line, so a hinted par would mean nothing.
  - The win overlay reads "With K hints." instead of the par line.
  - A later clean solve records `best` and upgrades the level to ★.

## Solution replay

The optimal line (`solve`) plays back as a **transient overlay** on the
real game. It lives in React state (`SolutionReplay`: base position, line,
step, and whether it is a give-up). The persisted move log is never
touched during playback.

- **After a win**, the ▶ Replay button (`carpark-replay`) plays the line
  from the level's **start**. The win overlay steps aside while it plays.
  Afterwards the level is still won, with the same moves and best.
- **Mid-attempt**, the ▶ Show solution button (`carpark-solution`) is a
  give-up, so it asks first: "Show the solution?", with **Show me** or
  **Keep trying**.
  - It plays the line from **where you are**, then restarts the attempt
    (`moves` and `hints` cleared).
  - A give-up is never counted as solved: no ✓, no ★ and no best.
- **Pacing:** a 600 ms lead-in, then 650 ms per slide, with slides eased
  over 380 ms in 2D (normal play uses 120 ms). The finished board holds
  for 1.2 s before handing back.
- **During playback:**
  - input is off (the drag core refuses, and keys are ignored);
  - the footer shows "Solution k/n" and a **Stop** button
    (`carpark-replay-stop`). Stopping a give-up still restarts the
    attempt;
  - the board, including the 3D view, shows the replay's position. The
    2D vehicles' `data-row` and `data-col` report the *shown* position.
- **Implementation:** a derived `shownPos` / `shownWon` pair feeds both
  boards. Playback is a single `setTimeout` chain on the replay state,
  cleared on unmount, Reset and level change.

## 2 Devices race

Two tablets on the same wifi play the **same level** at the same time, and
the first red car out wins. The 📱 toggle (`carpark-mode-online`) in the top
row — Car Park's inline original, since extracted as the shared
`NetplayModeToggle` every 2-mode widget now uses (see `docs/netplay.md`
*Mode control*) — enters the mode, which is persisted as `mode`, and opens
the usual pairing dialog. The transport and pairing are shared with every net game;
see `docs/netplay.md`.

- **Why `useNetplay` and not `useNetGame`.** Like Maze Runner's ghost race,
  this is real-time: two players move at once on their own copies of the
  lot, so the turn-based seam doesn't apply. It speaks the protocol's
  existing race messages `go`, `pos` and `done`, so **no protocol change**
  was needed.
- **The host's level wins.** On connect, and whenever the host picks
  another level while idle, the host sends `sync` with
  `{ tier, level, avatars }`.
  - The guest adopts the level (its attempt restarts) and wears the host's
    avatars through `SeatAvatarsOverride`.
  - The guest's level selects are locked while linked, and nobody can
    change level mid-race.
  - Only the host gets Next level after a race.
- **Synchronised start.** Either side taps **Start race**. Both count 3-2-1
  (`carpark-countdown`) from their own receipt of `go` and unlock together.
  At GO each device restarts its own attempt from the level start. The
  board is dead until GO; the shared drag core refuses, like it does during
  a replay.
- **Fairness.** Hint and Show solution are hidden in the mode, because a
  head-to-head gets no outside help. Undo and Reset still work, and a race
  solve scores normally (✓, ★, best). 2D/3D and rotate stay per device.
- **The ghost is the whole lot.** Every position change (move, Undo, Reset)
  sends `pos`, and its integer `cell` carries the *entire* position:
  `packRacePos(pos, moves)` packs base-6 offsets with the move count above
  them. The worst case is about 1.3e13, well under 2^53, and the pure
  suite checks every level round-trips as a safe integer.
  - The opponent panel (`carpark-opponent`) shows their avatar head and a
    56 px mini lot drawn from `unpackRacePos`, with their move count as a
    corner badge.
  - It dims while the link is `reconnecting` and disappears when the link
    dies.
  - The message is last-write-wins and needs no sequencing: a stale one is
    corrected by the next.
- **Winner.** The first `done` wins, `setResult(prev => prev ?? …)` on both
  sides. With a synchronised start that is also the lower time, so message
  ordering can't flip it.
  - The winner's overlay reads "You got out first!" with the celebration.
  - The loser gets a banner, `carpark-race-lost` ("{name} got out first"),
    and may still finish their own run; they stay `lost`.
  - **Race again** restarts both sides.
- **Leaving and dying.**
  - Leaving the mode mid-race asks "Leave the race?" first.
  - A link that dies (`failed` or `closed`) while counting or running
    **voids** the race: `carpark-race-void` shows "Connection lost — race
    void." Void is sticky until the next GO, and Start race is gone until
    the devices re-pair.
  - A wifi blip (`reconnecting`) changes nothing, because the reliable
    channel buffers `pos` and `done` through it.

## Progress per tier

The difficulty dropdown shows each tier's progress as
`Beginner 7/10 ★3`: levels solved (clean or hinted) out of the tier's
total, and ★s earned (clean solves at or under par). It comes from the
records slice's `best` and `assisted` maps through the pure `tierProgress`
helper, so it needs no extra state. Each `<option>` carries `data-solved`
and `data-stars`.

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
  There is no free orbit, because it would fight the drag.
- **Rotate view.** A round rotate button (`carpark-rotate`, top-right of
  the 3D board) turns the camera a quarter turn around the lot.
  - The step is persisted as `yaw` (0–3), so a player's preferred side
    sticks.
  - `CameraRig` eases the displayed angle toward `yaw × 90°`, taking about
    400 ms and going the shortest way round (3 → 0 is one quarter turn).
    It re-runs the aspect fit (`fitCamera`) each frame while the angle
    moves, then settles.
  - Dragging needs no change, because plane hits are in world space.
  - **Arrow keys follow the screen.** `screenKeyToWorld(key, yaw)` maps
    Right, Left, Down and Up to the world direction that key points at on
    screen for the current yaw: at yaw 0, right is +x and down (toward the
    viewer) is +z, and both rotate with the camera. The selected car moves
    only if that direction lies along its axis.
- **Exit barrier.** `ExitGate` is a post on the kerb just below the exit
  gap, with a red and white striped arm hinged across the gap.
  - The arm lifts to 80° (eased) whenever the red car's path is clear,
    meaning every exit-row bay ahead of its nose is empty (`pathClear` over
    `occupancy`).
  - It drops again if a car moves back into the row, and it stays up once
    the level is won.
- **Drive-off.** The won red car no longer eases. It **accelerates** from
  rest at 6 bays/s² out through the raised barrier, turns on its
  headlights, and is hidden once it is 3 bays past the lot.
  - A level that is already won when the board mounts (after a reload or a
    revisit) shows the car gone.
  - Reset after a win brings it back.
  - The flag the probe reads (`droveOff`) is owned by the target car's
    node alone, because every vehicle node runs the same frame loop.
- **Shadows and headlights.** Every vehicle has a soft blob shadow: a
  black `meshBasicMaterial` plane at 25% opacity under its footprint, with
  `depthWrite` off. There are no shadow maps.
  - While driving off, the red car's lamp boxes switch to an **unlit**
    `meshBasicMaterial`, which glows regardless of lighting without
    emissive.
  - Two transparent yellow beam trapezoids fade in on the ground ahead of
    the car.
  - All of this keeps within the low-spec convention.
- **Fullscreen defaults to 3D.** Fullscreen keeps its **own** view choice,
  `fsView` (default `'3d'`), read through `usePresentation()`. The
  effective view is `fullscreen ? fsView : view`.
  - The toggle writes whichever field is active, so the card keeps its own
    choice and fullscreen remembers its own.
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
  won target car drives off as described above. The vehicle group is keyed
  by level, so a level change places the cars instead of gliding them.
- **Overlay.** The win overlay and the footer are unchanged and sit over
  whichever board is showing.

## State model

Per-widget `data` (via `useWidgetField`) holds the ATTEMPT; the RECORDS live
in the app-level `records` slice (below), because they are the player's, not
the widget instance's.

| Field    | Meaning |
|----------|---------|
| `tier`   | Current tier (coerced to a known tier). |
| `level`  | Index within the tier (clamped to the pack). |
| `moves`  | `[vehicleIndex, delta][]`, the current attempt's log. The board is **derived** by `replay`, never stored. |
| `view`   | The card's board: `'2d'` or `'3d'` (coerced; default `'2d'`). |
| `fsView` | The fullscreen board: `'2d'` or `'3d'` (default `'3d'`). |
| `yaw`    | 3D camera quarter-turns, 0–3 (default 0). |
| `hints`  | Hints used in the current attempt (reset with `moves`). |
| `mode`   | `'solo'` or `'online'` (the 2 Devices race). Race state itself is transient. |

### Records — `features/records/recordsSlice.ts` (app-level, persisted)

`best` (`{ 'tier:index': fewestMoves }`), `solved` (lifetime tally) and
`assisted` (`{ 'tier:index': true }` — hinted solves, ✓ never ★) moved out
of widget `data` into their own whitelisted redux-persist slice, so they
**survive the widget being deleted and re-added** and are shared live by
every Car Park widget on the board. The solve POLICY is a pure reducer
(`recordCarParkSolve({ key, moves, hinted })`): tally +1; hinted →
`assisted` only if no best; clean → min best. The finishing move and its
record go out as two synchronous dispatches in one handler — redux-persist
snapshots the root after both, so a reload still cannot double-count a
solve. A widget still carrying pre-slice records in its `data` absorbs them
on mount (`absorbCarParkRecords` — min per best, union assisted, tallies
added — then the instance copy is zeroed, so each old instance contributes
exactly once). The **reset-records button** (`carpark-reset-records`, in
the top row next to the 2-Devices toggle, disabled while empty) clears the
lot behind a ConfirmDialog — the attempt and level choice stay untouched.

## Test contract (`data-*`)

- **Root** `carpark-root`: `data-tier`, `data-level`, `data-moves` (moves
  applied), `data-par`, `data-best` (empty when there is none),
  `data-solved`, `data-state` (`live` or `won`), `data-view` (the
  *effective* view, `2d` or `3d`) and `data-yaw`.
- **Board** `carpark-board`: one `<g>` per vehicle with `data-vehicle`
  (letter), `data-index` (model index), `data-row`, `data-col`, `data-len`
  and `data-horiz`. The target car's `<g>` also carries `data-target="1"`.
  The hinted car's `<g>` carries `data-hinted="1"`, and the hint draws
  `carpark-hint-ghost` and `carpark-hint-arrow`.
- **Root hint attributes:** `data-hint` (`"vi:delta"`, or empty when no
  hint is showing) and `data-hints` (the count). The button is
  `carpark-hint`, and the 3D probe mirrors `data-hint`.
- **Controls:**
  - `carpark-tier` and `carpark-level` (the native `<select>` is inside
    each);
  - `carpark-undo` and `carpark-reset` (icon buttons);
  - `carpark-solution`, `carpark-replay` and `carpark-replay-stop`, plus
    root `data-replay` (`"k/n"` while a solution plays, otherwise empty);
  - tier `<option>`s carry `data-solved` and `data-stars`;
  - `carpark-reset-records` — the records-reset icon button (disabled when
    there is nothing to clear), confirm-guarded ("Reset records?");
  - race: `carpark-mode-online`, `carpark-race-bar`, `carpark-link`,
    `carpark-start-race`, `carpark-opponent` (`data-opp-pos` = the packed
    cell), `carpark-countdown`, `carpark-race-lost` and `carpark-race-void`;
    root `data-mode`, `data-net`, `data-seat`, `data-race`
    (`off|idle|counting|running|won|lost|void`), `data-opp-moves`, and
    `data-avatar-toy` / `data-avatar-ninja`;
  - `carpark-won` and `carpark-next`;
  - `carpark-view` with `carpark-view-2d` and `carpark-view-3d`;
  - `carpark-rotate`, which exists only in 3D.

  Once a level is won, `carpark-next` replaces `carpark-undo`.
- **3D wrapper** `carpark-3d`, which exists only in 3D. Its throttled
  attributes are written every 10 frames by one owner, the in-canvas
  `Probe`:
  - `data-frames` counts rendered frames.
  - `data-vehicles` is JSON `[{ i, off, track }]`. `track[k]` is the
    wrapper-pixel projection of the vehicle's drag-plane centre at lane
    offset `k`. Perspective makes a bay's on-screen length vary, so
    `dragVehicle3D` in `helpers.mjs` aims at the exact projected bay
    instead of scaling a single step.
  - `data-gate` is `open` or `closed` (the barrier's target state).
  - `data-lights` is `on` or `off`.
  - `data-drove-off` is `1` once the won car has left the lot.

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

`e2e/154-carpark-3d-polish.test.mjs` covers the 3D polish. It checks:
- **Rotate:** `data-yaw` steps, the projected tracks actually move, a 3D
  drag still works when rotated, and four turns wrap back to 0.
- **Arrow keys:** the key whose on-screen direction matches a car's
  projected track step slides it +1 at yaw 1. The key is derived from the
  probe, not hard-coded.
- **Barrier and drive-off:** the barrier starts `closed` and turns `open`
  when the optimal line clears the path, one move before the win. On the
  win the lights come on, Next level replaces Undo, and `data-drove-off`
  becomes `1`.
- **Fullscreen:** it opens in 3D while the card is in 2D. Choosing 2D in
  fullscreen leaves the card's own choice alone, and reopening fullscreen
  remembers 2D.

## Future work (enhancement backlog)

**Modes**
- **Random mode.** A "Random" entry per tier that runs the generator's
  cluster search in a Web Worker, bounded to that tier's band. `solve` and
  the band table already exist; the only new part is the worker.
- **Daily puzzle.** Seed the random mode with the date. Everyone gets the
  same board, and the best score shows against par.
- **Records slice for the other games.** Maze Runner, Drone Sim/Strike and
  Tank Battle still keep their bests in widget `data`; moving them into
  `features/records/recordsSlice.ts` (one namespace per game, same absorb
  migration) gives every game deletion-proof records for free.
- **Timed challenge.** A clock per level with a per-level best time, using
  Maze Runner's per-size-best pattern.
- ~~**2 Devices race**~~ — **shipped** (see *2 Devices race*): same level,
  synchronised start, a live mini lot of the opponent's packed position,
  first out wins.
- **Best-of-3 match.** Keep a transient race score (first to 2) and step
  both devices through consecutive levels. The host already drives the
  level through `sync`.
- **Handicap.** Let the faster player start with extra moves counted, or
  show the weaker player the opponent's par.
- **Spectate in 3D.** Tap the mini lot to open the opponent's position full
  size in the `CarPark3D` view. The unpacked `pos` is already a board the
  3D view can render read-only.

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
- ~~**Hint button**~~ — **shipped** (see *Hints*): the optimal next
  move, shown in both views, with a ✓-not-★ scoring rule.
- **Hint budget per tier.** For example 3 hints per level on Expert, shown
  as bulbs next to the button. `hints` is already counted per attempt.
- **"Explain" mode.** Step through the solution manually (◀ ▶) with
  the hint ghost and arrow on each move, instead of the timed playback.
  `SolutionReplay.step` is already the cursor.
- **Hint cooldown.** Make Hint available only after about 20 s without
  progress, so it nudges rather than solves.
- ~~**Solution replay**~~ — **shipped** (see *Solution replay*): after a
  win from the start, or as a confirm-guarded give-up from where you are.
- **Replay speed control.** A 1×/2× toggle on the replay footer; it only
  changes the `REPLAY_STEP_MS` pacing.
- **Sound.** An engine purr on drag and a thunk at the end of a slide
  through `droneSim/webAudio`, with no asset files.
- ~~**3D view**~~ — **shipped** as the lazy `CarPark3D` board behind the
  2D/3D toggle (see *3D view* above), with its own toy models rather than
  the Model Viewer trucks.
- ~~**Rotate camera**~~ — **shipped** as the `carpark-rotate` quarter-turn
  button with a persisted `yaw` and screen-relative arrow keys (see
  *Rotate view*).
- ~~**Exit gate + drive-off**~~ — **shipped** (`ExitGate`, accelerating
  drive-off).
- ~~**Shadows and lights on win**~~ — **shipped** as blob shadows, unlit
  lamps and fading beam trapezoids.
- ~~**3D in fullscreen by default**~~ — **shipped** through the separate
  `fsView` field.
- **Night mode.** Darken the lights and turn on every car's headlights, by
  passing `lightsOn` to all of them. The red car's beams become the hint
  of where the exit is.
- **Tilt slider.** Let the player change the camera elevation (35°–80°);
  `fitCamera` already takes any direction. Top-down is closest to the 2D
  view, and low angles look dramatic.
- **Honk on a blocked drag.** When a drag hits `moveRange`'s limit, play a
  short `webAudio` beep and give the blocking car a little bounce. The
  blocker is the occupant of the cell just beyond the range.
- **Barrier "ping."** When the barrier lifts (the path becomes clear),
  play a soft chime as a subtle "you're one move away" cue. The trigger is
  the `pathClear` edge.
- ~~**Per-tier progress**~~ — **shipped** as `Beginner 7/10 ★3` in the
  difficulty dropdown (see *Progress per tier*).
- **Tier completion reward.** When a tier reaches 10/10 ★, show a
  one-time trophy celebration and a gold badge on the tier option.
  `tierProgress` already knows when that happens.
