# Connect 4 widget — design notes

Reference for the `connect4` widget. Built on the same blueprint as
Tic-Tac-Toe (`docs/tic-tac-toe.md`); this note only covers what differs.
Source: `src/components/widgets/Connect4Widget.tsx` (registered via the standard
`types.ts` / `widgetCatalog.ts` / `registry/widgetRegistry.ts` pattern).

## Concept
Standard **7 columns × 6 rows**. Click a column to drop a disc; it falls to the
lowest empty slot. First to **four in a row** (horizontal, vertical, or either
diagonal) wins. The two discs reuse the SVG heads — **Toy** (`ToyHead`) vs
**Ninja** (`NinjaHead`). Classic look: a blue frame with circular holes; filled
holes become white discs carrying a character head.

## Modes & difficulty
- **2-Player** (`pvp`) and **vs Computer** (`ai`); human plays Toy.
- Three difficulties (Computer mode), a `ToggleButtonGroup`: **Easy / Medium /
  Hard**. Switching mode or difficulty reinitializes the game — but if a game is
  in progress it first pops a shared `ConfirmDialog` ("Restart game?"), so an
  accidental tap can't wipe the board (New game is not guarded).

## AI — depth-based (`aiMove`)
- **Easy** — the "sane player": take an immediate win → block the opponent's
  immediate win → else a random legal column.
- **Medium** — alpha-beta search to **depth 3** (`DEPTH.medium`).
- **Hard** — alpha-beta search to **depth 6** (`DEPTH.hard`).
- Search internals: `evaluate` scores every 4-window (weighting 3-in-a-window
  heavily, opponent 3s slightly higher to prefer blocking) plus a centre-column
  bonus; `search` is minimax + alpha-beta with **centre-first move ordering**
  (`orderedCols`) for pruning; ninja maximises. Depth 6 on the 42-cell board runs
  well within the think-delay budget. Medium/Hard block and take wins implicitly
  via search; Easy does so explicitly. (Verified: Hard beat a random player 20/20
  in simulation.)

## State model (persisted `data`, via `useWidgetField`)
- `board`: `('toy'|'ninja'|null)[42]`, **row-major**, index `r*7+c`, row 0 = top.
- `mode`, `difficulty`, `first` — as in TTT. Default difficulty is **medium**.
- Derived: `turn = turnOf(board, first)`, `calcWin` (winner + the 4 indices),
  draw = board full. Helpers: `landingRow`, `legalCols`, `dropInto`, precomputed
  `WINDOWS` (all 69 four-in-a-row index sets, shared by `calcWin` + `evaluate`).

## Turn indicator & win celebration
Same as Tic-Tac-Toe: a `PlayerBadge` (head icon + "to move" / "thinking…" /
"wins!" / "Draw!") in the footer, and on a win a looping `WinnerCelebration`
(Toy "6 7" / Ninja sword loop) overlays the dimmed board.

## Reused conveniences (same as TTT)
- **Thinking latency** — the ninja drops after a random `THINK_MIN`–`THINK_MAX`
  (~0.4–1.2s) inside a `setTimeout`, cleared on cleanup.
- **Pass opening move** — lower-left button in Computer mode on an empty board
  sets `first: 'ninja'`.
- **Winning-line glow** — the four winning slots + discs pulse, tinted to the
  winner (`winGlow` / `cellGlow`).

## Turn hand-off (2-Player)
Same as Tic-Tac-Toe: in `pvp` a non-winning drop shows a brief `TurnBanner`
overlay (tinted `TurnBanner`/`useHandoff`, ~1s, tap-to-skip) that locks the
board so you can't mis-click into the next player's move; vs-Computer has none.

## Connect-4-specific bits
- **Animated drop:** a component `useState lastDrop` holds the just-filled index
  (set in the human handler and the AI effect); that disc gets the `dropAnim`
  keyframe (`translateY(-750%) → 0` with a small bounce, ~0.45s). `lastDrop` is
  not persisted, so a reload shows resting discs with no animation.
- **Responsiveness:** board wrapper is `containerType:'size'`; the board is
  `aspectRatio:'7 / 6'`, `width:'min(100cqw, calc(100cqh * 7 / 6))'` so it fits
  both dimensions. Slots use `minWidth:0; minHeight:0; overflow:hidden` (the same
  grid-track fix as TTT) so discs never resize the board.

## Verifying
`npm run build` + `npm run lint`, then drive it headless (Chromium at
`/opt/pw-browsers/chromium`). The board is a 7×6 CSS grid of cells, each
`data-testid="c4-slot-<index>"` (0–41) with a `data-col`; clicking any cell
drops into that column. Each cell centres a true circular disc (sized off the
cell's smaller dimension) so the head SVGs always sit centred.
