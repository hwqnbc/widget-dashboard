# Othello widget — design notes

The classic 8×8 flipping-disc game (Reversi), fourth of the turn-based board
games and the netplay layer's fourth `useNetGame` consumer. Discs are the seat
heads, as everywhere: Toy opens, Ninja replies, and what a seat looks like is
resolved through the avatar registry (`docs/avatars.md`).

## Rules engine — `othelloModel.ts`, pure

All rules and the AI live in `src/components/widgets/othelloModel.ts`, a pure
DOM-free module the e2e suites bundle and replay node-side (`149`'s rules
half). The widget consumes exactly five verbs: `initialPosition`,
`legalMoves`, `applyMove`, `counts`, `winnerOf`/`isOver`.

**Turn lives inside the position — the one structural difference from
Connect 4 / Tic-Tac-Toe.** Those games derive the mover from disc parity
(`turnOf(board, first)`). Othello cannot: a player with no legal move is
**skipped**, and after the first forced pass the mover can never again be
derived from the count. So a position is `{ cells, turn }`, and `applyMove`
returns the pass-aware next mover: the opponent if they have a reply, the
same player again if not, and if *neither* side can move the game is over
(`isOver` — most discs wins, which also covers the early wipe-out end on a
non-full board).

`applyMove` also returns the flipped indices, which is what the widget's
squash animation and the suites' capture assertions both key on. Directions
walk row/col coordinates, never raw index steps — index ±1 would wrap around
the board edge.

## The forced pass, end to end

- **Model**: `applyMove` computes the skip on both sides of a link — a pass
  never crosses the wire (see below).
- **Widget**: `data-pass` names the seat that was just skipped, and a caption
  ("Ninja has no move — skipped!") appears under the board; in hot-seat the
  hand-off banner simply announces the same player again.
- **AI**: a pass hands the turn straight back to the computer, whose effect
  re-fires on the new board — consecutive AI moves need no special case.

## Vs computer

The same shape as Connect 4: the computer plays Ninja after a 0.4–1.2s
"thinking" pause, with a pulsing badge.

- **Easy** is the "sane player" (lessons.md): it never misses an offered
  corner, avoids a move that hands the opponent a corner when it has any
  other choice, and otherwise plays at random. Beatable, not insulting.
  Deterministic under an injected `rand`, which is how the suite's ladder
  games avoid flaking.
- **Medium / Hard** are alpha-beta (depth 3 / 5) over the classic positional
  weight table — corners 120, the X/C squares beside them poison, edges good —
  plus a mobility term, with raw disc difference taking over when ≤10 empties
  remain (material is what decides the endgame). Moves are weight-ordered for
  pruning. Hard is depth 5 where Connect 4 runs 6: Othello branches roughly
  twice as wide and its evaluate walks legal-move scans, so 6 peaked at
  ~2.5s a move in node — an eternity on a tablet. The ladder is strict
  (hard > medium > easy, asserted in `149`).
- The **pass-opening button** ("Pass — let Ninja start") appears on a fresh
  vs-computer board, exactly as in Connect 4 / Tic-Tac-Toe; it rebuilds the
  opening with Ninja as `first` (the four-disc start is symmetric under a
  colour swap, so "first owns e4+d5" is the whole convention).

## 2 Devices

The netplay layer's fourth turn-based consumer, and deliberately its most
boring — that is the point of the seam. The widget supplies `applyMove` and
inherits seats, the turn lock, the ply-checked relay, host sync and the
broadcast restart from `features/netplay/useNetGame` (see `docs/netplay.md`).

Two Othello-specific notes:

- **`TBoard` is the whole position `{ cells, turn }`**, not a cell array.
  The hook only ever writes `{ board }` back after a relayed move, so a game
  whose turn is not derivable must carry the turn *inside* the board it
  hands the hook. `useNetGame` is generic over `TBoard`; nothing in it
  changed.
- **A pass never crosses the wire.** The move message carries the placed
  cell; both devices run the same pure `applyMove`, which computes the flips
  and the skip identically. Ply stays "discs beyond the initial four" —
  every move adds exactly one disc and a pass adds none, so the relay's ply
  check works untouched.

## Board and rendering

A square CSS grid (8×8) on green felt, sized `min(100cqw, 100cqh)` off the
container query so the board is the largest square the card allows
(lessons.md: container-query board sizing). No SVG — 64 grid cells with a
disc circle each is cheap DOM.

- **Hints**: translucent dots on the current mover's legal cells (kids need
  to see where flipping is possible); suppressed while the board is locked
  (AI thinking, not this device's turn, game over).
- **Animations**: a placed disc pops in (`scale` 0→1); flipped discs squash
  through their edge (`scaleX` 1→0.08→1) already wearing their new owner —
  reads as a turn-over without a 3D rig.
- Score strip: both seats' live disc counts as `PlayerBadge`s, plus the
  usual turn/winner/draw badge and confirm-guarded restarts (`ConfirmDialog`
  on mode/difficulty changes mid-game).

## State model (persisted `data`, via `useWidgetField`)

`board` (`{ cells, turn }` — coerced as a unit, returned as-is per
lessons.md #10) · `mode` (`pvp | ai | online`) · `difficulty` · `first`.
Winner, draw, scores, legal moves and ply are all **derived** from the
position every render; the transient flip/pop/pass dressing lives in
component state and never persists.

## Test contract (`data-*`)

On `[data-testid="othello-root"]`: `data-mode`, `data-net`, `data-seat`,
`data-turn`, `data-ply`, `data-legal` (count), `data-pass` (seat just
skipped, or empty), `data-winner` (`toy|ninja|draw|`empty), `data-score-toy`,
`data-score-ninja`, `data-avatar-toy`, `data-avatar-ninja`. Each cell is
`oth-cell-N` with `data-disc` and `data-hint`. The pass caption is
`othello-pass-note`; the online toggle `othello-mode-online`, the chip
`othello-link`.

## Verifying

`npm run build` + `npm run lint`, then `npm run e2e othello`
(`149-othello` — pure rules + AI ladder + the solo/vs-computer widget;
`150-othello-online` — the loopback two-device game, closed-loop through the
bundled model).

## Future work (enhancement backlog)

**Gameplay modes**
- **Timed moves** — a per-move clock like the maze race's, forfeiting the
  move (not the game) on expiry; reuses `useNow`.
- **Handicap starts** — corners pre-seeded for the weaker player; only a
  different `initialPosition`, everything downstream already copes.
- **Best-of-N match** — a running match score above the board, the pattern
  Memory's `scores` field already persists.

**AI**
- **Hard+ endgame solver** — perfect play once ≤12 empties remain (the
  search is already there; it needs only an unbounded depth in that phase).
- **Opening variety** — small random jitter among near-equal root moves so
  hard doesn't replay the identical game every time (seeded, so the e2e
  ladder stays deterministic).
- **Hint mode** — surface `aiMove(medium)` as a suggested-move sparkle for a
  learning kid, off by default.

**Board & feel**
- **Capture preview on press-hold** — highlight the discs a tap would flip
  before committing, straight off `flipsFor`.
- **Flip cascade stagger** — delay each flipped disc's squash by distance
  from the placed cell, selling the ray sweep; pure CSS `animation-delay`.
- **Sound** — place/flip/skip cues through `droneSim/webAudio`, the
  no-asset synth every game reuses.

**Meta**
- **2 Devices score duel stats** — per-link win tally like the Drone Strike
  backlog's, riding the existing `sync` payload.
- **Board sizes** — 6×6 quick games for younger kids; SIZE is already a
  constant, but the weight table and the suites assume 8, so it is a real
  (small) round.
