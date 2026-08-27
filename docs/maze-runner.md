# Maze Runner widget — design notes

Reference for the `mazeRunner` widget: a seeded maze you run with swipes or
arrow keys, against the clock. The dashboard's first game that works alone —
every board game needs an opponent and the three WebGL games are elaborate —
with a hot-seat two-player race for when someone else wants a turn.

Source: `src/components/widgets/mazeRunner/` (`mazeModel.ts` pure core +
`MazeRunnerWidget.tsx`), registered via the standard `types.ts` /
`widgetCatalog.ts` / `registry/widgetRegistry.ts` pattern.

## Concept
A perfect maze fills the board: start top-left, a gold star bottom-right, the
active player's avatar head as the runner. Reach the star. The clock starts on
your first move and a best time is kept per size.

Only the **seed** and the board's dimensions are persisted — the walls are
rebuilt from them, the same contract `droneSim/worldLayout` and
`tankBattle/terrain` have with their widgets. A `Uint8Array` must never reach
redux: RTK's `serializableCheck` would log an error on every move (and the
app-bar Console badge would light up), and redux-persist would silently
round-trip it as `{"0":5,"1":3,…}`.

## Generation
Randomised depth-first carve (the "recursive backtracker"), iterative so a
large board cannot blow the stack, driven by a private `mulberry32(seed)` —
copied into the file exactly as the other four generators each keep their own.

Chosen over Prim's or Kruskal's for producing long winding corridors and few
dead ends: it reads as *runnable* rather than fiddly. The result is a **perfect**
maze — a spanning tree — so there is exactly one route between any two cells and
exactly `cols * rows - 1` passages. Both are asserted, and the passage count is
the single strongest check available: it fails loudly if the carve ever leaves a
cell unvisited or opens a cycle.

## Board shape follows the card, not the window
Sizes are a **long** and a **short** side (`MAZE_DIMS`: 9×11 / 13×17 / 17×23),
assigned by which way round the board is:

- The orientation is read from the **board wrapper's own bounding box**, not
  `useViewport()`. A tall card inside a landscape window still wants a tall
  maze; the window's aspect ratio is the wrong question.
- Dimensions are chosen **once, when the maze is made**, then persisted. So
  rotating the device re-fits the container-query board and never destroys a
  run in progress.
- `cols`/`rows` therefore start at `0` in `defaultWidgetData` and are filled in
  by a mount effect. The reducer cannot measure a card, and keeping
  `Math.random`/layout out of it is lesson #11.

No `preferredOrientation` in the catalog: unlike archery and the 3D games, this
one is genuinely at home in both.

## Movement — `stepMove`, and why it follows corners
One pure function, returning **every cell entered** (never the origin), so `[]`
unambiguously means blocked, the last element is the new position, and the
breadcrumb trail can mark a whole corridor.

- **Step** (`'cell'`, **default**) — exactly one cell. Precise, and the pace a
  player should meet first.
- **Run** (`'junction'`) — follow the corridor, *turning corners*, until the
  cell entered offers something other than exactly one way onward: a real
  junction, a dead end, or the goal.

Run shipped as the default and was demoted: it solved a 17×13 maze in about
eight presses, which is too fast for the thing you are handed on opening the
widget. It stays as the opt-in pace for a bigger board, where stepping cell by
cell across 21×23 is a chore.

Following corners is the whole point, and the first version got it wrong. That
version stopped at any bend — which sounds equivalent and is not. A
recursive-backtracker maze is windy, so measured over every cell and direction
of a 17×13 board it advanced an average of **1.39 cells**: all but
indistinguishable from Step, and the setting would have been a lie.
Corridor-following measures **8.85**, with runs up to 40 cells, and makes one
swipe mean "go to the next real decision" — which is what makes Run worth
having as a distinct setting at all. (Lesson #92.)

## Aids (one exclusive toggle)
- **Trail** (default) — a dim fill, in the runner's avatar colour, on every
  visited cell. The cheapest difficulty dial there is: a young player can see
  where they have been.
- **Plain** — just the maze.
- **Fog** — only cells within `FOG_DEPTH[size]` passages (3/4/5) of the runner
  are shown. A **BFS** radius, not a square one: you must not see through a
  wall one cell away.

Fog is drawn as **one even-odd overlay** — an outer rect with a hole punched
per visible cell — rather than by filtering which walls to draw. Filtering
would put `pos` in the wall path's memo key and rebuild a few hundred segments
on every move. The outer border and the goal star are always drawn on top of
the fog: without them the board has no visible extent and nothing to aim at.

## Rendering — three paths, no per-cell DOM
One SVG, `viewBox` padded by half a stroke so the border isn't clipped.

- **Walls**: one memoized `<path>`. `wallSegments` emits each wall exactly once
  by considering only each cell's north and west sides, plus the last column's
  east and last row's south edge — walking all four sides of every cell emits
  every interior wall twice. A 13×17 board is 252 segments (walls + passages
  always sum to the grid's edge count, which the suite checks).
- **Trail** and **fog**: one `<path>` each, so neither re-renders the walls.
- Wall thickness is in **cell units** and deliberately *not*
  `vectorEffect="non-scaling-stroke"` — that reinterprets the width as screen
  pixels, which turned a 0.13-cell value into an invisible hairline the first
  time round.
- The runner is the seat's `Head` in a `<foreignObject>` sized **40×40 and
  scaled down**, not a 0.8-unit box: the head's layout box is measured in CSS
  pixels *before* the viewBox transform, and a sub-pixel box rounds badly.

Board sizing is the standard container-query pattern (lesson #3) with
`preserveAspectRatio`, so the maze fits both dimensions of any card.

## Input
- **Swipe** — pointer events with capture and `touchAction: 'none'`. The origin
  **re-arms on every committed move**, so one continuous drag keeps the runner
  going; one move per gesture would mean ~60 separate swipes across a large
  board. A dropped pointer capture is self-healing here (the next `pointerdown`
  simply takes over), so unlike the flight sticks this needs no capture
  watchdog.
- **Keys** — arrows and WASD on `window`, `preventDefault` so the dashboard
  doesn't scroll, and `isTypingTarget` so typing in Notes is never stolen.
  **Auto-repeat only is throttled** (`REPEAT_MS`): throttling real keypresses
  would silently drop a fast player's moves — and desync a test walking a
  solution with `keyboard.press()`.
- Root carries `widget-no-drag` + `stopPropagation` (lesson #6) plus
  `WebkitTouchCallout: 'none'` and an `onContextMenu` guard, because a long
  press on a board is very likely.

**Input is inert whenever a dialog or the hand-off banner is up.** The banner
blocks *taps* by covering the board, but a window key listener sails straight
past it — so `blocked` is checked in the move handler, not left to the overlay.

## Timer
Moves are discrete, so `elapsedMs` accumulates as each move lands. The first
move *starts* the clock rather than accumulating, which is also what keeps the
hand-off banner's second out of player 2's time.

- `lastMoveAt` is a **ref, never persisted**: `performance.now()` is relative to
  the document's time origin, so a stored value would be garbage after a
  reload. The consequence is that **a reload pauses the clock** — a small,
  deliberate generosity rather than voiding the run.
- The live display is a `<MazeTimer>` child using `useNow(100)` purely as a
  **re-render pulse** — its `Date` is ignored, because the accumulator is in
  `performance.now()` and the two clocks cannot be mixed. It is mounted only
  while the run is active, so a finished or untouched maze has no interval.
- `data-ms` is the **committed** value and deliberately lags the live display;
  one owner per attribute.
- Best times are three flat fields (`bestSmall`/`bestMedium`/`bestLarge`) rather
  than one object — the trivial `typeof` coercer covers them and there is no
  nested shape to validate.

## 2 Players (hot seat)
Player 1 runs; on finishing, their time is recorded, a `TurnBanner` announces
player 2 (via `useHandoff`, announced only on a genuine pass — lesson #18), and
the board resets. Faster time wins, shown with `PlayerBadge` +
`WinnerCelebration`; equal times give "Dead heat!".

**Player 2 runs the mirror image by default** (`mirrorMaze`: reflected
left-to-right, start and goal moving to the opposite corners). Hot-seat on the
identical maze hands player 2 a large memorisation advantage — they just
watched it solved — which Memory and Archery never have to worry about because
those games are symmetric. A mirror has an identical passage count and an
identical solution length, so difficulty is unchanged, and mirroring twice is
the identity.

The **Mirror / Same** toggle turns it off, giving player 2 the identical maze:
easier to explain to a child who notices the star has moved corners, at the
cost of the fairness the mirror buys. It appears **only in 2-player mode** —
it means nothing in solo — but `data-mirror` is published either way so the
attribute is never absent. With it off, `p2Maze` is simply `p1Maze`, and the
hand-off's existing `p2Maze.start` sends player 2 to the same corner with no
extra branch.

Because the hand-off happens in the *same tick* player 1 finishes, `data-pos`
never once reads as player 1's goal — anything watching for the finish has to
watch `data-turn` instead. The suite learned this the hard way.

Changing **Run/Step, the aid, or the mirror mid-duel restarts it** (behind the
usual `ConfirmDialog`): peeling the fog off, changing how far a swipe carries,
or swapping the maze itself between the two runs would make the times
incomparable. In solo the rule and the aid switch live, since looking at your
own board differently destroys nothing.

## State model (persisted `data`, via `useWidgetField`)
`seed`, `cols`, `rows` · `size`, `moveRule`, `aid`, `mode`, `mirror` · `pos`, `trail`
(deduped visited cells) · `elapsedMs` · `bestSmall`/`bestMedium`/`bestLarge` ·
`turn`, `times`.

`state` is **derived**, not stored: `won` when `pos === goal`, else `running`
when anything has happened. One fewer field to fall out of sync. Fallbacks are
module constants and coercers return the stored value **as-is** — building a new
array or object would hand the selector a fresh reference every render and loop
the effects (lesson #10).

## Test contract (`data-*`)
On `[data-testid="maze-root"]`: `data-mode`, `data-size`, `data-rule`,
`data-aid`, `data-mirror` (`on`/`off`), `data-seed`, `data-cols`, `data-rows`,
`data-pos`, `data-goal`,
`data-state` (`ready`/`running`/`won`), `data-turn`, `data-trail` (count).
On `[data-testid="maze-timer"]`: `data-ms`, `data-best-ms`. Plus
`[data-testid="maze-board"]` (the SVG), `maze-goal`, `maze-celebration`, and
`turn-banner` (`data-player`).

There are deliberately **no per-cell elements** — that is what the single-path
rendering buys, and the contract is designed so nothing needs them.

Seeds are stored unsigned (`(Math.random() * 0xffffffff) >>> 0`) so the value
round-trips through the DOM and reproduces the same maze node-side.

## Verifying
`npm run build` + `npm run lint`, then `npm run e2e maze` (`e2e/145-maze`). The
suite asserts the pure invariants first, then drives the real widget — and
because it has the same generator, it reads the widget's own seed and
dimensions, computes the **actual** solution and walks it.

The walk is **closed-loop**: one press under the Run rule consumes several
cells of the route, so replaying a precomputed direction list open-loop
desyncs immediately. After every press the suite reads where the runner
actually ended up and re-solves from there.

## Future work (enhancement backlog)

**Controls & feel**
- **Tilt to roll** — the labyrinth-table version: a ball under gravity from
  device tilt, with circle-vs-wall collision. The two nasty non-physics parts
  are already solved in `droneStrike/gyroAim.ts` (iOS 13+ needs
  `DeviceOrientationEvent.requestPermission()` from a user gesture, and a
  neutral-pose capture so it works at whatever angle the tablet is held) —
  extract those into a shared `hooks/useDeviceTilt` rather than copying.
- **Sound** — a step tick, a wall bump and a finish fanfare through
  `droneSim/webAudio` (synthesized, no assets).
- **Animated runner** — tween the marker along the traversed cells instead of
  snapping; `stepMove` already returns the whole path.
- **Scoped keys** — every keyboard widget listens on `window`, so a dashboard
  holding a Maze *and* a Drone Sim drives both from one arrow key. A focusable
  board (`tabIndex`) would fix it for all four.

**Gameplay modes**
- **Collectible stars** — three to gather before the exit, forcing a route
  rather than a beeline. `solve` already gives the shortest tour legs.
- **Chase** — something that walks the maze after you (a BFS-toward-player
  pursuer on a slower tick). Turns the timer into a threat.
- **One-way doors / teleports** — the generator is a spanning tree; adding a
  handful of extra passages makes it braided, with real route choices. Note
  `stepMove`'s loop cap already exists for exactly this.
- **Daily maze** — seed from the date so everyone gets the same board, with a
  local best-time table.

**Difficulty**
- **Hard mode** — Step rule forced, fog on, no trail, as one preset rather than
  three toggles.
- **Bigger boards with a viewport** — sizes beyond 17×23 want a scrolling or
  zoomed view rather than ever-smaller cells.

**Two players**
- **Netplay ghost race** — same seed on two devices, each showing a ghost of
  the other's position. The transport and pairing from `docs/netplay.md` are
  reusable as-is, but this would be its **first non-turn-based** use: positions
  stream continuously rather than one message per turn, so it needs a rate limit
  and a little protocol the current design was never asked for.
- **Forfeit / skip turn** — a player who gives up mid-duel currently has no way
  out but New maze.
- **Best-of-three** — persist a series score across mazes.
