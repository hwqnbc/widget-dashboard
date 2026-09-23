# Arrow Escape widget — design notes

The tap-the-arrows-out untangle puzzle (the "Arrows Go!" genre): the board
holds snake-shaped arrows; tapping one slides the whole snake out along its
own path — unless another arrow's body stands in the head's way. Clearing
the board means finding an order. Single-player, seeded, always solvable.

## Rules engine — `arrowsModel.ts`, pure

All rules and generation live in `src/components/widgets/arrowsModel.ts`, a
pure DOM-free module the e2e suite bundles and sweeps node-side.

- An **arrow** is a polyline of cells, tail → head, with the arrowhead on
  the last segment (`headDir` reads it off the last two cells).
- Its **exit ray** (`rayCells`) is the straight line of cells from the head
  to the board edge, along the head's direction.
- The move is legal when the ray is clear of every OTHER arrow's body
  (`blockerOf` — it names the *nearest* blocker plus the free run before
  it, which is what the bump animation advances by). **An arrow never
  blocks itself**: the body rides the same rails as the head, so a bent
  snake whose tail loops ahead of its own head still exits freely.
- `trackOf` is the rails an exit rides: body + ray + enough off-board cells
  that the tail fully leaves.

## Solvability by construction

Arrows are seated one at a time by rejection sampling, and a seat is only
accepted when the new arrow's exit ray is **clear of everything already on
the board**. Removing in reverse insertion order is then always legal: when
an arrow's turn comes, everything seated after it — the only bodies its ray
was never checked against — is already gone. Later arrows routinely sit on
*earlier* arrows' rays, which is exactly where the ordering depth comes from
(a medium board opens with ~5 of 13 arrows blocked).

Two hard-won details:

- **The first body step behind the head must be straight.** The body grows
  backward from the head as a self-avoiding walk with random 90° bends — but
  the arrowhead points along the last *actual* segment, and the ray was
  checked along the *picked* direction. A bend on the first step aims the
  head somewhere never verified; before the fix, ~35% of medium boards were
  unsolvable. The suite's 200-seeds-per-size solvability sweep exists to
  keep this true.
- **The greedy `solveOrder` is complete**, so the sweep is a real proof:
  removing an arrow only ever clears cells, so an arrow that is removable
  stays removable — removability is monotone, and a greedy that wedges
  means no order exists at all.

## Difficulty — measured as choice width, not vibes

Two rounds of user feedback said the boards played too easy, and both times
the fix came from measuring, not guessing. The difficulty number is **choice
width**: the average number of free (tappable-out) arrows across a greedy
solve — width 7 is a tap-fest, width ~3 is a puzzle. Free-at-start is its
opening move. The suite asserts both for large, so hardness cannot silently
regress.

Presets (measured over 120+ seeds): small 9/7×7 at ~62% fill, width ~3.1 —
the gentle warm-up, generated plain first-fit. Medium ~15/9×9 at ~77%,
width ~3.3. Large — the adult board — **~29 arrows on 14×14** at ~71% fill,
**63% of them blocked at the start, width ~5.6** (vs 7.6 for unbiased
placement on the same dims). **Expert** — the fourth toggle — takes the
other end of the measured frontier: the same 14×14 board with the chain
bias active **from the first seat** (`phase: 0`), a deeper candidate pool
(`pick: 22`) and longer snakes (maxLen 8): **~22 arrows, width ~4.3, ~39%
free at the start** — fewer pieces than large, but at any moment far fewer
of them go anywhere. What buys the hardness, in the order it was
discovered:

- **No free wall-huggers.** A head adjacent to the edge it points at has a
  zero-length exit ray nothing can ever cover — a permanently free arrow,
  and the old first-clear-direction scan actively preferred them. On hard
  sizes (`pick > 1`) every seat now takes the clear direction with the
  LONGEST ray: long interior rays are exactly what later bodies land on.
- **Chain-forming placement, phased in late.** `pick` is the difficulty
  dial: per seat the generator collects up to `pick` valid candidates (all
  sampled against the same occupancy, so all stay valid) and commits the one
  that newly blocks the most DISTINCT currently-free arrows — blocking an
  already-blocked arrow adds nothing, and scoring raw ray coverage measurably
  rewarded sprawl that crowded later seats out. On large the bias only
  activates after ~25% of seats (`phase`): early arrows are the bottom of
  the pile (freed last), so packing them dense and unbiased keeps the seat
  rate, while the late bodies — the ones on top — are what decide which
  arrows start free. Expert sets `phase: 0` and pays the seat-count cost
  knowingly — that trade IS the preset.
- **The count over-asks.** The biased generator saturates around ~29 arrows
  on large; requesting 52 just lets every board reach saturation. `count`
  is a ceiling, `minSeat` is the suite's floor on the average, and the
  widget publishes the *actual* total.

Also from the density round: **all four head directions are scanned per
attempt** (seeded order) rather than gambled one per attempt, and **the body
walk runs best-of-three keeping the longest** — a single self-avoiding walk
jams short on a crowded board — with `minLen` 2 so late arrows may seat as
the small hooks the original game also has. A board too crowded still ships
with what fitted — solvable, just lighter.

### Master — packed, deep, and unforgiving

The fifth toggle answers two asks at once: boards as **cramped as the
original game's** (the sampling generator plateaued near ~72% fill, because
it can only seat an arrow where a clear exit ray already exists — near-full
boards leave only wall-hugging seats), and a tier where **lookahead is
required, not just rewarded** (under the base rules there are no wrong
moves — removability is monotone — so scanning always suffices).

- **`generatePacked`: pack first, orient second.** Snake bodies are carved
  directly into empty space (`packBodies`, a seeded self-avoiding walk pass
  repeated until only scattered singles remain), THEN each body picks which
  end is the head. Each body admits exactly two orientations, and bodies are
  inserted one at a time under the same invariant as ever — the chosen ray
  must clear everything already inserted — so reverse insertion order is
  still a proof of solvability and `solveOrder` still certifies every board.
- **Ordering is survival, orientation is depth.** Which body inserts next is
  chosen by wedge-risk (a body down to one live orientation with enemies
  standing on that ray dies the moment one of them inserts first) — that
  heuristic took the drop rate from ~45% of packed cells to a few percent.
  Which END becomes the head costs nobody anything (only the cells
  constrain others, and they're the same either way), so it is spent
  entirely on the **dependency-depth metric** (`blockDepth`: the longest
  "free that one first, and before it that one" chain — the lookahead a
  no-bump tap requires). A body wedged both ways is **split in half** — the
  halves get brand-new end segments, so brand-new rays that usually fit —
  and six seeded orientation restarts keep the best board by fill, trading
  ~2.5 cells per depth point.
- **The bump budget** is what turns depth into required planning:
  `MASTER_BUMPS` (3) blocked taps void the puzzle — overlay, locked board —
  and **Retry** replays the *same seed* with clean counters, so a failed
  tangle can be studied and beaten. Guessing is fatal; tracing the chain
  before tapping is the game.

Measured (120 seeds): **~44 arrows at ~84% fill** (vs large's 29 at 71%),
dependency depth ~8.3 (the deepest tier), only ~25% of arrows free at the
start, width ~4.9, 100% solvable, generation ≤ ~55ms. The suite pins fill
≥ 80% and depth ≥ 7 as regression bounds.

## Interaction and animation

- **Tap** anywhere on a snake (a fat invisible twin of the stroke is the
  hit target — little fingers don't need to hit a 0.28-cell line).
- **Clear ray** → the snake slides out at `SPEED` (16 cells/s) along its
  track, bends travelling through the body: the drawn polyline is the
  window `[a, a+len-1]` of the track (fractional endpoints + the integer
  vertices between), and the arrowhead re-aims per frame from the leading
  segment, so it swings through corners mid-flight. The board `<clipPath>`
  swallows it at the edge. Removal is dispatched when the tail is fully
  off-board.
- **Blocked** → the snake advances to the blocker (`free + 0.4` cells) and
  returns at the same speed, while the blocker flashes red — the honest
  "this one is in the way" of the original game. The tap and the bump are
  both counted.
- Animations live in a ref (`Map<id, Anim>`) with a single rAF loop keyed
  on an active-count state; an arrow mid-exit no longer blocks anyone (it
  is leaving). The **clear is tallied in the same dispatch that removes the
  last arrow**, so a reload can never double-count `solved`.
- Board: `viewBox` = the grid exactly (letterboxed by `preserveAspectRatio`),
  the ad's dot lattice per cell, arrows coloured from an 8-colour cycle that
  reads on both themes (the ad's all-black lines would vanish in dark mode).

## State model (persisted `data`, via `useWidgetField`)

`seed` · `size` (`small|medium|large`) · `removed: number[]` (ids in removal
order — a reload resumes mid-puzzle) · `taps` · `bumps` · `solved` (lifetime
clears). Everything else — alive set, blocked flags, win — is derived from
`generatePuzzle(seed, …)` minus `removed` every render. New puzzle and size
changes reseed, and are confirm-guarded once arrows have been freed
(`ConfirmDialog`, house pattern).

## Test contract (`data-*`)

On `[data-testid="arrows-root"]`: `data-size`, `data-seed`, `data-total`,
`data-left`, `data-taps`, `data-bumps`, `data-solved`,
`data-state` (`live|won|failed`), `data-bumps-left` (master only). Each snake is a `g[data-arrow]` with `data-dir`,
`data-len`, `data-blocked` and `data-head` (`"x,y"` — where the suite aims
its coordinate taps). The board svg is `arrows-board`, the win overlay
`arrows-cleared`, master's failure overlay `arrows-failed` and its Retry
button `arrows-retry`, the reshuffle button `arrows-new`, the size toggles
`arrows-size-*`.

**Tapping in tests**: `tapArrowCell` (helpers) maps grid coordinates through
the svg's *letterboxed* bounding box and clicks with `page.mouse` — raw
coordinate clicks do not wait out MUI's invisible menu backdrop the way
locator clicks do, so `addArrowsWidget` waits for `.MuiModal-backdrop` to
unmount before returning (lessons.md #123).

## Verifying

`npm run build` + `npm run lint`, then `npm run e2e 151` — the pure sweep
(600 seeded boards solvable, in-bounds, non-overlapping, ordered), the
crafted blocking/self-ray cases, and the live widget: slide-out, bump,
mid-puzzle reload persistence, a closed-loop full clear driven by the DOM's
own `data-blocked` flags, the celebration, and the confirm-guarded
reshuffle/size changes.

## Future work (enhancement backlog)

**Gameplay modes**
- **Daily puzzle** — one shared seed per calendar day (derive from the date,
  like a mini-Wordle); the solved tally already persists.
- **Move-count star rating** — ★★★ for zero bumps, ★★ under N taps; the
  counters already exist, only the thresholds and the end card are new.
- **Timed mode** — a ticking clock via `useNow`, best times per size like
  the maze's `bestSmall/Medium/Large` fields.
- **2 Devices race** — same seed on two tablets, first to clear wins; the
  maze ghost race already proved the synced-start `go`/`done` pattern, and
  progress is one `pos`-style "arrows left" counter.

**Puzzle depth**
- ~~Long-chain generator bias~~ — **shipped** as the `pick` candidate
  scoring plus the longest-ray direction rule (see *Difficulty*); large now
  starts 63% blocked with choice width ~5.6.
- ~~An explicit Hard/Expert toggle~~ — **shipped** as the fourth size
  preset (see *Difficulty*): `phase: 0`, `pick: 22`, width ~4.3, with its
  own suite hardness bounds.
- ~~Deeper-than-greedy hardness~~ — **shipped** as the Master tier: the
  `blockDepth` dependency metric, the packed-board generator and the bump
  budget (see *Master* above).
- **Master leaderboard / streaks** — consecutive no-fail clears, best
  retry count per seed; the counters and Retry-same-seed loop already
  exist, this is a persisted stats row.
- **Rotating arrows** — a special arrow that turns 90° when bumped; needs a
  `dir` override in state and a re-check of the generation invariant.
- **Walls** — static cells no ray may cross; generation treats them as
  permanent occupancy.

**Feel**
- **Sound** — a whoosh per exit and a thunk per bump through
  `droneSim/webAudio` (`tone`/`noise`, no assets).
- **Squash on bump** — compress the snake's leading segment against the
  blocker before the return, pure transform on the drawn window.
- **Hint sparkle** — after ~10s idle, pulse one currently-free arrow
  (`blockerOf` already knows); off by default.
- **Confetti on a no-bump clear** — the ★ line already detects it.
