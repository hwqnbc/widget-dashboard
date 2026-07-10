# Tic-Tac-Toe widget — design notes

Reference for the `ticTacToe` widget so future work has the context and
constraints in one place. Source: `src/components/widgets/TicTacToeWidget.tsx`
(registered per the standard widget pattern in `types.ts`, `widgetCatalog.ts`,
`registry/widgetRegistry.ts`).

## Concept
A tic-tac-toe game whose marks are two of the app's SVG characters instead of
`X` / `O`:
- **Toy** (the capped minifigure head) — `characters/ToyHead.tsx`.
- **Ninja** (the hooded ice-ninja head) — `characters/NinjaHead.tsx`.

Toy always corresponds to the "X-like" first-intended player; Ninja is the
computer in vs-Computer mode.

## Modes (mode toggle)
A `ToggleButtonGroup` switches between:
- **2-Player** (`mode: 'pvp'`) — pass-and-play; taps alternate Toy / Ninja.
- **vs Computer** (`mode: 'ai'`) — human plays Toy, the computer plays Ninja.

Switching mode **reinitializes** the game (clears the board, resets `first` to
`toy`).

## Difficulty (vs Computer only)
A single button labelled `Difficulty: Easy` / `Difficulty: Hard` (shown only in
Computer mode) toggles the level and **reinitializes** the game.

- **Hard** — full **minimax** (`bestMove`), i.e. **unbeatable**; the best a
  human can do is draw.
- **Easy** — a **sane casual player**, NOT an AI that throws:
  1. if it can win this move, take the win;
  2. else if the human has an immediate winning threat, block it;
  3. else play a random empty cell.
  No lookahead / no fork detection, so a thinking human can beat it by setting
  up a double threat — but it never ignores an obvious win or block. Against a
  careless (random) human it still wins the majority of games.

Default difficulty is **Easy** so a fresh Computer game is winnable out of the
box. This was a deliberate change: the original AI was minimax-only and felt
impossible; an earlier ε-greedy "random 60% of the time" version was rejected
because skipping obvious blocks/wins looked like the AI was intentionally
losing. The win→block→random rule is the intended behavior — keep it.

## Pass the opening move
In Computer mode, before any move, the lower-left shows a **"Pass — let Ninja
start"** button (replacing the turn-status text). It sets `first: 'ninja'` so
the computer opens; play then alternates normally. Hidden once the board has a
mark; New game / mode / difficulty changes reset `first` to `toy`.

## State model (persisted in the widget's redux `data`)
Read via `useWidgetField` (`features/widgets/useWidgetField.ts`); written via
`updateWidgetData`. Initial values come from `defaultWidgetData('ticTacToe')`.

| field | type | notes |
|---|---|---|
| `board` | `('toy'\|'ninja'\|null)[9]` | the grid |
| `mode` | `'pvp' \| 'ai'` | |
| `difficulty` | `'easy' \| 'hard'` | only meaningful in `ai` |
| `first` | `'toy' \| 'ninja'` | who opened this game |

**Derived, not stored:** the current turn (`turnOf(board, first)` — parity of
filled cells from `first`), the winner + winning line (`calcWin`), and draw
(`board` full with no winner). The AI plays via a `useEffect` that fires when
it's Ninja's turn in `ai` mode.

## Thinking latency
The computer does not reply instantly — the AI `useEffect` waits a random
`THINK_MIN`–`THINK_MAX` (≈0.4–1.2s) via `setTimeout` before committing its
move, so it reads as "thinking" (the "Ninja thinking…" status shows meanwhile).
The timer is cleared on cleanup so a queued move never lands on a board that was
reset / had its mode or difficulty changed mid-think.

## Responsiveness (important — regression-prone)
The board must **not resize the card while marks are placed**, and must scale
with the widget in both dimensions:
- The board is a square sized `min(100cqmin, 340px)` inside a wrapper with
  `containerType: 'size'`, so it always fits the smaller of the available
  width/height (never overflows the scrollable card body).
- Each cell sets `minWidth: 0; minHeight: 0; overflow: hidden`. This is the
  actual fix for the "board grows as you play" bug: CSS grid tracks default to
  `min-height: auto`, so without `min-*: 0` a placed SVG could push its `1fr`
  track and expand the board. Do not remove these.

## Turn indicator & win celebration
- The footer shows a **`PlayerBadge`** (head icon + short label) for the current
  turn — "to move", or "thinking…" (with a pulse) on the computer's turn — plus
  "wins!" beside the winner's head, or "Draw!".
- On a win the three winning cells/marks still glow (`winGlow` / `cellGlow`,
  tinted to the winner), and a looping **`WinnerCelebration`** overlays the
  dimmed board: the Toy does the "6 7" (`SixSevenFigure`), the Ninja draws &
  sheathes his sword on a loop (`SwordNinjaFigure`, `drawn` toggled on an
  interval). The overlay is `pointerEvents:'none'`; New game clears it.

## Mobile / touch
The root and the interactive cells use `className="widget-no-drag"` plus
`onMouseDown`/`onTouchStart` `stopPropagation` so taps aren't swallowed by
react-grid-layout's drag handler (paired with `draggableCancel=".widget-no-drag"`
in `WidgetBoard`).

## Pure functions (testable, no React)
`LINES`, `calcWin`, `turnOf`, `minimax`, `bestMove`, `randomMove`,
`winningMove`, `easyMove` all live at module scope in the widget file.

## Verifying changes
No test runner is configured. Verify with `npm run build` + `npm run lint`, then
drive it in a headless browser (Chromium at `/opt/pw-browsers/chromium`):
add the widget, play both modes, toggle difficulty, use Pass, resize the widget,
and reload to confirm persistence. Cells expose `data-testid="ttt-cell-<0-8>"`.
