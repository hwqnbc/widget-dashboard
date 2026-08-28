# Widget ideas — the backlog for widgets that don't exist yet

Every shipped widget keeps its own **Future work** section in its design note
(`docs/maze-runner.md`, `docs/drone-strike.md`, …). This file is the other
half: ideas for widgets that haven't been built at all, so a round can be
picked without re-deriving the list each time.

Each entry names the pieces it would build on, because that — not the idea —
is what decides whether it is an afternoon or a fortnight.

**Shipped from this list so far:** ~~Maze Runner~~ (`docs/maze-runner.md`),
~~two-device play~~ (`docs/netplay.md`, now under Connect 4 and Tic-Tac-Toe).

---

## Dots and Boxes — the next one I'd build

A grid of dots. Players take turns drawing **one line** between two adjacent
dots. Completing the fourth side of a small square claims that box **and gives
you another turn** — so one line can cascade into five boxes. When every line
is drawn, most boxes wins.

Worth the top slot for three reasons:

- **It suits a young player.** The rules take ten seconds, and crucially
  *every move is legal* — you just pick a line nobody has drawn — so there is
  no "you can't do that" frustration. The go-again rule supplies the
  excitement.
- **It stays interesting for an adult.** The real game is the endgame:
  deliberately sacrificing a couple of boxes so the opponent is forced to open
  a long chain for you. A six-year-old filling in squares and an adult counting
  chains can enjoy the same board.
- **It is nearly free on the rails already built.** Two-player and turn-based,
  so it drops into the `PlayerBadge` / `TurnBanner` / `WinnerCelebration` /
  `ConfirmDialog` kit; boxes fill in the seat's avatar colour via
  `useSeatVisual`. A move is an **edge index — a single integer** — which is
  exactly what the netplay `move` field already carries, so online play would
  be the third consumer of `features/netplay/useNetGame` supplying only
  `applyMove` and a board coercer, with no protocol change at all.

**The one real wrinkle, and it is worth knowing before starting.** Because a
player can move several times in a row, **the turn does not alternate with
move count**. Connect 4 and Tic-Tac-Toe both derive whose turn it is from the
parity of filled cells (`turnOf(board, first)`); Dots and Boxes cannot, so
`turn` has to be persisted explicitly. `useNetGame` already takes `turn` and
`ply` as *inputs* rather than computing them, so the seam holds — this is the
case that proves that was the right interface — but the ply-matching
validation needs care, since two consecutive moves by the same seat are legal
here and would look like a desync anywhere else.

Shape: a pure `dotsModel.ts` (edge indexing, box completion, legal moves, the
scoring walk) bundled for its e2e suite like every other game's model. Board
is SVG — dots, drawn edges, filled boxes — sized with the usual container-query
pattern. Start at a 5×5 dot grid: 16 boxes, 40 edges.

AI ladder, which falls out naturally:
- **Easy** — a random legal edge, but never the third side of a box if
  another edge is free (the "sane player" rule from lesson #14).
- **Medium** — the above, plus take every box currently available.
- **Hard** — chain counting: when only chains remain, decide whether to take
  the whole chain or leave a double-cross.

---

## Cheap — they reuse the two-player board kit almost entirely

- **Reversi / Othello** — the Connect 4 alpha-beta engine with a different move
  generator; the disc flip reuses Memory's card-flip animation. Note it shares
  Dots and Boxes' wrinkle in miniature: a player with no legal move is skipped,
  so turn is not pure parity.
- **Battleship** — hidden grids, tap to fire, hit/miss through the
  `droneSim/webAudio` engine. Adds a placement phase none of the current games
  have, and is a natural netplay consumer (a move is a cell index) — though the
  hidden state means the host cannot simply `sync` the whole position.
- **Hangman / spelling** — the avatar `Figure` assembles limb by limb on wrong
  guesses, or climbs a ladder if that reads better for a child. Word lists in
  persisted `data`.
- **Quick Maths** — timed arithmetic drill, difficulty by age band, streak
  scoring via the combo-multiplier pattern already proven in Drone Strike.

## Medium — a new mechanic, existing primitives

- **Simon / memory tones** — four avatar-coloured pads, a growing sequence,
  pure `webAudio` `tone()`. Tiny, and the only thing here aimed squarely at the
  youngest end.
- **Whack-a-Mole** — avatar heads popping from holes; `TapStage` plus a seeded
  spawn stream.
- **Snake / Breakout / Balloon Pop** — single-canvas arcade classics, the
  paddle or snake head skinned as the chosen avatar. Good candidates for a
  small card.
- **Pixel painter / colouring book** — grid paint persisted to `data`, avatar
  line-art templates. The quiet-time widget; no AI, no physics.

## Larger — they earn their keep from the WebGL investment

The three-js chunk, `FigureStage3D`, `ModelTargets`, the shared `legGait` rig
and the tank terrain are the expensive parts, and they already exist.

- **Snowball Fight** — the Drone Strike rig with the violence dialled out:
  throw snowballs at avatar targets, splat decals instead of sparks, targets
  duck and throw back. Reuses the ballistic-lob integrator, `SoldierTargets`,
  the aim seam and the wave scheduler. The highest reuse-to-newness ratio on
  this list, and the most age-appropriate use of that rig.
- **Penalty shootout / hoops** — Archery's drag-to-aim projectile physics
  rendered in 3D, with an avatar keeper posed through the `aimRef` seam.
- **Avatar Run** — endless runner over the Drone Sim rooftops driven by the
  shared `walk` gait, which has never carried a player-controlled character.
- **Drone Delivery** — a non-combat mode on the Drone Sim flight model: collect
  parcels, drop them on marked rooftops against a clock. Reuses the gates and
  time-trial machinery the sim already has.

---

## Adding to this file

Keep entries honest about cost: name the modules a widget would reuse and the
one thing that is genuinely new. An idea with no integration point is a wish,
not a backlog item. When something here ships, strike it through, point at its
design note, and move the detail there — this file should stay a menu, not an
archive.
