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
- **2-Player** (`pvp`), **vs Computer** (`ai`) and **2 Devices** (`online`);
  human plays Toy.
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

## 2 Devices (online mode)
The first net-played widget. Two people on the same wifi play one game from two
devices, with **no server anywhere** — the browsers talk directly over a WebRTC
data channel, and pairing happens by holding a QR code up to the other device's
camera. The whole link layer lives in `src/features/netplay/` and is
game-agnostic; see **`docs/netplay.md`** for how the token gets small enough to
scan, why there are no ICE servers, and the transport seam the tests use.

What Connect 4 itself adds:

- **Seats by role.** Host is Player 1 (`toy`), guest Player 2 (`ninja`) — no
  negotiation needed. `link.seat` is the local seat; the chip in the header
  reads *"Linked — you are Player 1"*.
- **`netBlocked`** — `online && (!connected || turn !== link.seat)` — folds into
  the existing `locked`, so an unpaired or waiting device gets exactly the same
  dead board the AI's turn already produced. No new lock concept.
- **Moves, not state.** A drop sends `{ t:'move', seat, ply, move: col }` where
  `ply` is the position *before* the drop. The receiver applies it only if it is
  that seat's turn and the ply matches; anything else is dropped, because a
  missed move resyncs and a misapplied one corrupts. `dropInto` then runs the
  same reducer on both devices.
- **Position sync.** On connect the host sends `{ t:'sync', state:{ board, first } }`,
  so a device joining a game already in progress (or re-pairing after a sleep)
  lands on the same board. `coerceBoard` validates every cell — a peer is
  outside this component's control, same as persisted data.
- **New game is a broadcast.** Either side may restart; `{ t:'new', first }`
  puts both back to the same opening.
- **No hand-off banner.** `TurnBanner` exists to stop one person mis-clicking
  into the other's move on a shared screen. With two screens each device only
  ever shows its own turn, so online mode skips it.
- **The mode is persisted; the link is not.** A saved "connected" flag would be
  a lie the moment a tablet sleeps and reloads. Leaving online mode disconnects
  rather than leaving a data channel alive behind a board nobody is playing.

Root test contract: `data-mode`, `data-net`, `data-seat`, `data-turn`,
`data-ply`, `data-winner` on `[data-testid="connect4-root"]`.

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
`npm run build` + `npm run lint`, then `npm run e2e netplay` for the two-device
mode (`143-netplay` over the loopback transport, `144-netplay-webrtc` through a
real `RTCPeerConnection`). The board is a 7×6 CSS grid of cells, each
`data-testid="c4-slot-<index>"` (0–41) with a `data-col`; clicking any cell
drops into that column. Each cell centres a true circular disc (sized off the
cell's smaller dimension) so the head SVGs always sit centred.

## Future work (enhancement backlog)

**Gameplay modes**
- **Best-of-N match** — persist a series score across games; the winner's badge
  becomes a rally counter. Builds on the existing `first` alternation.
- **Timed moves** — a per-turn clock (reuse `hooks/useNow`), forfeiting or
  auto-playing on expiry. Would want the clock in `sync` for online play.
- **Bigger boards** — 8×7 or 9×7 as a settings toggle. `WINDOWS`, `calcWin` and
  `evaluate` are already generated from `ROWS`/`COLS`, so mostly a UI change.
- **Gravity variants** — "Pop Out" (remove your own bottom disc) or a
  five-in-a-row board, both reachable from `dropInto` + a second move type.

**AI**
- **Expert difficulty** — iterative deepening with a transposition table; depth
  6 is the current ceiling inside the think-delay budget.
- **Opening book** — the perfect-play centre opening, so Hard stops losing
  tempo on move 1.
- **Personality** — an AI that prefers traps over blocks, as a named opponent
  rather than a depth number.

**Online (see `docs/netplay.md` for the shared backlog)**
- **Rematch without re-pairing** — `new` already broadcasts; a "play again"
  prompt on both devices after a win would close the loop.
- **Desync detector** — a board hash on each `move`, triggering a host `sync`
  on mismatch.
- **Emoji reactions** — a tiny extra message type, the cheapest possible way to
  make a remote game feel social.

**Feel**
- **Sound** — drop thunk and win fanfare via `droneSim/webAudio` (no assets).
- **Threat highlight** — an optional beginner aid ringing any column that would
  let the opponent win next move; `winningCol` already computes it.
