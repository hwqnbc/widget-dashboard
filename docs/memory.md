# Memory widget — design notes

Reference for the `memory` widget. A 2-player concentration game built on the
established widget pattern. Source: `src/components/widgets/MemoryWidget.tsx`.

## Concept
A grid of face-down cards, **2-player pass-and-play** (no computer). A turn flips
two cards: a **match** removes the pair (faded slot) and scores the current
player a point; a **mismatch** flips both back. The **winner** is whoever has the
most pairs when the board is cleared (equal = "Draw!"). Players are **Toy vs
Ninja** (reusing the heads, `PlayerBadge`, and `WinnerCelebration`).

## Options
- **Grid size** (`ToggleButtonGroup`): 4×4 (8 pairs) or 6×6 (18 pairs). Changing
  it reshuffles; mid-game it's guarded by `ConfirmDialog` (accidental-tap
  protection). New game is not guarded.
- **Match rule** (`ToggleButtonGroup`): "Match: go again" (default — a match
  keeps the turn, standard memory) or "Always pass" (turn passes after every
  two-flip). Changes live, no reset.

## Card faces — extensible registry
Card faces are **motif × background colour**; a pair = same `"motif:colour"`.
- `MOTIF_BY_ID` / `FACE_MOTIFS` — the SVG motifs (currently `ToyHead`,
  `NinjaHead`). **Add new SVGs here** to grow the pool.
- `FACE_COLORS` — 9 distinct colours. `ALL_FACES` = colour × motif = 18 faces,
  enough for 6×6. `buildDeck(size)` takes the first `size*size/2` faces,
  duplicates, and Fisher–Yates shuffles (`Math.random`).
- `MemoryCard` flips (rotateY + `backfaceVisibility`, à la ImageToggle) between a
  neutral "?" back and the face (coloured tile + a white disc holding the motif
  head). Matched cards render as a faded empty slot.

## State model (persisted `data`, via `useWidgetField`)
`size` (4|6), `cards: string[]` (faceId per position, fixed after shuffle),
`matched: boolean[]`, `flipped: number[]` (0–2 indices up this turn),
`turn` ('toy'|'ninja'), `scores: {toy,ninja}`, `rule` ('again'|'pass').
`defaultWidgetData` returns an empty deck; the component deals via `reset(size)`
in an effect when `cards.length !== size*size` (first mount / size change / New
game) — keeps the reducer pure. Derived: `gameOver` (all matched), `winner`.

## Resolve timing
A `useEffect` on `flipped` resolves a two-card flip after a reveal delay
(match ~600ms, mismatch ~1100ms) — mark matched + score (+ keep/pass turn per
`rule`), or flip back + pass. The timer is cleared on cleanup (reload-safe).
Input is locked while two cards are up.

## Verifying
`npm run build` + `npm run lint`, then drive it headless (Chromium at
`/opt/pw-browsers/chromium`). Cells expose `data-testid="mem-card-<i>"`,
`data-face="<motif:colour>"`, and `data-state` ("down" | "up" | "matched") —
pair up equal `data-face` values to auto-solve.
