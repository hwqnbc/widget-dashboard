# Memory widget — design notes

Reference for the `memory` widget. A 2-player concentration game built on the
established widget pattern. Source: `src/components/widgets/MemoryWidget.tsx`;
the pure rules (deck, flips, pair resolution) live in
`src/components/widgets/memoryModel.ts`.

## Concept
A grid of face-down cards, **2-player** — pass-and-play on one device, or
**2 Devices** over the netplay layer. A turn flips
two cards: a **match** removes the pair (faded slot) and scores the current
player a point; a **mismatch** flips both back. The **winner** is whoever has the
most pairs when the board is cleared (equal = "Draw!"). Players are **Toy vs
Ninja** (reusing the heads, `PlayerBadge`, and `WinnerCelebration`).

## Options
- **Play mode** (`ToggleButtonGroup`): "Pass & play" (default) or "2 Devices"
  (below). Changing it starts a new game, confirm-guarded mid-game.
- **Grid size** (`ToggleButtonGroup`): 4×4 (8 pairs) or 6×6 (18 pairs). Changing
  it reshuffles; mid-game it's guarded by `ConfirmDialog` (accidental-tap
  protection). New game is not guarded.
- **Match rule** (`ToggleButtonGroup`): "Match: go again" (default — a match
  keeps the turn, standard memory) or "Always pass" (turn passes after every
  two-flip). Like the grid size, changing the rule **starts a new game**
  (reshuffles) and is confirm-guarded mid-game — both route through
  `requestReset`.

## Card faces — every avatar head
Card faces are **motif × background colour**; a pair = same `"motif:colour"`.
- Motifs are **every registered avatar's head**, pulled straight from the avatar
  registry: `MOTIF_BY_ID` is built from `AVATAR_IDS` → `avatarVisualById[id].Head`,
  so adding an avatar grows the Memory pool automatically (no edit here needed).
- `FACE_COLORS` — 9 distinct colours. `ALL_FACES` = avatar × colour (e.g. 5×9 = 45
  faces), far more than the 18 pairs a 6×6 board needs. `buildDeck(size)` **randomly
  samples** `size*size/2` distinct faces from the pool (shuffle-then-slice), lays each
  out as a pair, and Fisher–Yates shuffles the positions — via a shared `shuffle`
  helper (`Math.random`). So every deal varies and any avatar can appear. (All of
  this lives in `memoryModel.ts`; the widget maps face IDs to head components.)
- `MemoryCard` flips (rotateY + `backfaceVisibility`, à la ImageToggle) between a
  neutral "?" back and the face (coloured tile + a white disc holding the motif
  head). Matched cards render as a faded empty slot.

## State model (persisted `data`, via `useWidgetField`)
`size` (4|6), `cards: string[]` (faceId per position, fixed after shuffle),
`matched: boolean[]`, `flipped: number[]` (0–2 indices up this turn),
`turn` ('toy'|'ninja'), `scores: {toy,ninja}`, `rule` ('again'|'pass'),
`mode` ('local'|'online'), and `ply` — a counter of accepted FLIPS (never
reset by pair resolution), added for the wire's replay guard.
`defaultWidgetData` returns an empty deck; the component deals via `reset()`
in an effect when `cards.length !== size*size` (first mount / size change / New
game) — keeps the reducer pure. Derived: `gameOver` (all matched), `winner`.
The whole position also exists as one `MemState` object (`memoryModel.ts`),
which is what the rules run on and what 2 Devices mode syncs.

## Turn hand-off & player colours
On a turn pass (mismatch, or a non-final match under "always pass") a
`TurnBanner` overlay announces the next player ("Ninja's turn", tinted to
`PLAYER_COLOR`), locks the board, auto-dismisses after ~1s (`useHandoff`), and
can be tapped to skip — so you can't mis-click into the next player's move. The
two score badges are tinted to each player's colour (`PLAYER_COLOR`: toy teal,
ninja ice-blue), the active one bordered/filled, so whose turn it is reads at a
glance. Online, the banner never shows — the other player is on their own
device.

## Resolve timing
A `useEffect` on `flipped` resolves a two-card flip after a reveal delay
(match `MATCH_MS` 600ms, mismatch `MISS_MS` 1100ms) by applying the pure
`resolvePair` — mark matched + score (+ keep/pass turn per `rule`), or flip
back + pass. The timer is cleared on cleanup (reload-safe). Input is locked
while two cards are up. The callback re-reads the LIVE board through a ref and
re-checks it still holds the pair it was armed for — see the 2 Devices
convergence note below for why.

## 2 Devices mode
The 4th turn-based consumer of the netplay layer (`docs/netplay.md`), via
`useNetGame<MemState>` — host seat toy, guest ninja, guest wears the host's
avatar picks (`SeatAvatarsOverride`). Memory's wrinkles on the shared seam:

- **The shuffle crosses as data, not a seed.** `TBoard` is the whole
  `MemState`, so the pairing `sync` (and every restart) carries the host's
  `cards` array itself — immune to the two builds disagreeing about the
  avatar pool. A restart is fresh randomness, which `new` cannot carry, so
  "New game" resets locally and `sendSync`s exactly what it dealt, from
  either side (the Archery precedent). `newBoard` falls back to an undealt
  empty board. A connected guest never deals its own board (the auto-deal
  effect is gated on `link.role`), and its size/rule toggles are disabled —
  the host's settings win, riding the synced board.
- **A match keeps the turn**, so seats don't alternate — fine, because `turn`
  lives inside `MemState` (the Othello lesson) and `useNetGame` gates on
  whatever turn the widget reports.
- **`ply` counts flips, not turns.** The wire's replay guard needs a counter
  that moves on every `move` sent, and one turn sends two.
- **Resolution never crosses the wire.** Both devices run the same reveal
  timer and apply the same pure `resolvePair`. The subtlety is a device whose
  timer lags (a throttled background tab): the peer may resolve, flip its
  next card, and that `move` arrives while the local pair still sits
  revealed. Two guards make the orders converge: the widget reports
  `resolvePair(board).turn` as the current turn while two cards are up (so
  the seam doesn't drop the peer's post-resolution flip as out-of-turn), and
  `applyMove` resolves the pending pair synchronously before applying the
  flip. The reveal timer, in turn, re-checks the live board before firing so
  a stale closure can't clobber a flip that arrived first.

Contract: root `data-testid="memory-root"` with `data-mode`, `data-net`
(`off` | link status), `data-seat`, `data-turn`, `data-ply`, `data-size`,
`data-rule`, `data-dealt`, `data-winner`, `data-score-toy/-ninja`,
`data-avatar-toy/-ninja`; mode toggle `memory-mode-online`; chip
`memory-link`; cards as below. Covered by `e2e/159-memory-online.test.mjs`.

## Verifying
`npm run build` + `npm run lint`, then `npm run e2e 159` (pairs two widgets
over the loopback transport; also checks the pure model node-side). Cells
expose `data-testid="mem-card-<i>"`, `data-face="<motif:colour>"`, and
`data-state` ("down" | "up" | "matched") — pair up equal `data-face` values
to auto-solve.

## Future work (enhancement backlog)

- **Memory vs computer** — an AI opponent with a tunable memory span (perfect
  recall = Hard, remembers the last N reveals = Easy). Integration point: the
  turn flow already resolves through the pure model; the AI is an effect on
  `turn === 'ninja'` picking from remembered `data-face` reveals.
- **Peek count / skill stats** — track how many flips each player needed per
  pair (efficiency), shown at game over. Builds on `ply` (already counted)
  split per seat.
- **Sounds** — flip, match chime, mismatch thud via the shared Web Audio
  synth (`droneSim/webAudio`), like the backlog pattern other games use.
- **Themed decks** — alternative motif pools (shapes, flags) beside avatar
  heads; `memoryModel.ALL_FACES` is the single seam.
- **Timed mode** — a shared countdown per turn; on expiry the turn passes.
  Needs no wire change (both devices run the same clock from the last move).
- **4-player pass-and-play** — seats beyond toy/ninja are a larger change
  (scores, badges, celebration are 2-seat); note kept for scale reference.
