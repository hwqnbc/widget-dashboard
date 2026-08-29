# Archery widget — design notes

Reference for the `archery` widget: a 2-player, drag-to-aim projectile game.
Source: `src/components/widgets/ArcheryWidget.tsx`.

## Concept
Two stick-figure archers — **Toy** (left) and **Ninja** (right) — stand on
pillars at **random heights** each new game and take turns firing an arrow under
**gravity** (no wind). **Drag to aim** (slingshot): press and pull back, a short
aim indicator shows launch direction + power at the archer, release to fire.
A hit on the opponent scores; **first to 5 hits wins.** Pass-and-play, no
computer. The heads reuse `ToyHead`/`NinjaHead` (placed via `<foreignObject>` so
they scale with the SVG).

## Scene & physics
- SVG `viewBox="0 0 400 260"` (world = viewBox units); the container is sized to
  that aspect ratio (`min(100cqw, calc(100cqh*400/260))`) so pointer↔world is a
  straight scale off `getBoundingClientRect`.
- Archers at `X={toy:50, ninja:350}`, feet at `p1y`/`p2y` (random `[84,206]`,
  min gap 32). Launch origin ≈ the bow hand; opponent hitbox = a rect around the
  figure (`X±16`, `[py-58, py]`).
- Projectile: `x=x0+vx·t`, `y=y0+vy·t+½·g·t²` (`g=520`). Slingshot mapping:
  `v = clamp(|dragΔ|·K, 0, VMAX)` (`K=6.8`, `VMAX=620`) in the **opposite**
  direction of the drag. Flight runs in `requestAnimationFrame` (cancelled on
  unmount/reset); each frame checks hit / ground / out-of-bounds.

## Modes, range & platforms (difficulty)
Three independent, captioned `ToggleButtonGroup`s in a wrapping controls row
above the scores:
- **Mode: Calm / Wind / Obstacle** (`mode`).
  - *Wind* — each turn a random wind (`randomWind()`, ±[70,170] units/s²) adds a
    horizontal acceleration (`x = x0 + vx·t + ½·wind·t²`), re-rolled on every
    pass and shown by a top-centre **WIND →** gauge. `wind` is 0 in other modes.
  - *Obstacle* — a purple block bobs up/down at the field centre:
    `blockCy(ts) = OBS_MID + OBS_AMP·sin(2π·ts/OBS_PERIOD)`. A `requestAnimationFrame`
    loop animates it while idle (the flight loop drives it in-flight, same
    formula, so render + collision stay in sync). A shot whose tip enters the
    block AABB (`x∈[W/2±13]`, `y∈[blockCy±26]`) is **blocked** = a miss. The
    obstacle rect exposes `data-testid="obstacle"` / `data-blocky`.
- **Range: Short / Long** (`distance`) — the world width `W = long ? 560 : 400`
  (archers at `x=50` and `x=W−50`); everything (positions, obstacle centre,
  container sizing, `viewBox`) derives from `W`. `data-w` on the `<svg>`.
- **Platforms: Still / Both / Target** (`platforms`) — the archers ride up/down
  so you must lead a moving target.
  - `platY(p, ts) = center_p + AMP_P·sin(2π·ts/PERIOD_P + phase_p)`
    (`AMP_P=34`, `PERIOD_P=2400`, phases `toy:0` / `ninja:π` so they're out of
    sync), where `center_p = clamp(feet(p), MIN_Y+AMP_P, MAX_Y−AMP_P)` keeps the
    platform in bounds. Pure function of the shared rAF clock `animTs`.
  - `moves(p)` = *Both* → everyone bobs; *Target* → only the shooter's
    **opponent** bobs (`p === other(turn)`), so the moving archer swaps each
    turn and the shooter stays put for cleaner aiming; *Still* → nobody moves.
  - The idle rAF loop runs whenever `mode==='obstacle' || platforms!=='still'`,
    advancing `animTs` (the obstacle derives `blockCyAt(animTs)`); the flight
    loop drives `animTs` in-flight. The **launch origin** is captured at the
    shooter's release height, and the **target hitbox is recomputed each flight
    frame** from the opponent's *current* `platY`, so a moving target must be
    led. Each archer `<g>` exposes `data-testid="archer-<p>"` / `data-py`.

All three are game settings: changing any **starts a new game** (re-deals, resets
scores) and is `ConfirmDialog`-guarded mid-game (`requestReset`). `mode`, `wind`,
`distance`, `platforms` persist; the scene `<svg>` also exposes
`data-mode`/`data-wind`/`data-platforms`.

## State (persisted `data`, via `useWidgetField`)
`p1y`, `p2y` (feet Y; `0` = "not dealt" → the component deals random heights in
an effect, keeping the reducer pure), `scores {toy,ninja}` (0–5), `turn`,
`first`, plus the settings `mode`, `wind`, `distance`, `platforms`. Aiming, arrow
flight, the hit flash, and the shared animation clock `animTs` are **transient**
component state — a mid-flight reload just returns to the shooter's turn.
Derived: `winner` (first to 5), `gameOver`, and the displayed feet Y
`dispY(p) = moves(p) ? platY(p, animTs) : feet(p)`.

## Reused UX
- `PlayerBadge` scores ("n / 5") tinted `PLAYER_COLOR`, active player highlighted.
- After each shot the `TurnBanner` (`useHandoff`) announces the next player and
  locks input; a winning 5th hit shows `WinnerCelebration` instead. Input is
  locked during flight, during the banner, and after game over.

## Layout (stacked vs immersive)
Two layouts, chosen by `overlay = usePresentation().fullscreen && useViewport()
.orientation === 'landscape'`:
- **Stacked (default — the grid tile and portrait full-screen):** controls row,
  score row, scene, footer row, top-to-bottom. Unchanged.
- **Immersive (full-screen *landscape* only):** the scene `Box` is the sole flow
  child so it fills the whole area (the aspect scene grows to the largest fit),
  and the chrome becomes `position:absolute` overlays so nothing sits over the
  shooters or the arrow arc: **the two small score badges stay in the top
  corners**, and **the controls + footer move to the otherwise-empty bottom band**
  — hint (left) · the three toggle groups in a translucent theme-aware panel
  (`alpha(background.paper, .82)`, `flexWrap:'wrap'` so they wrap on a small phone)
  · `New game` (right), via `space-between`. (Controls used to float top-centre but
  crowded high shooters and felt squeezed in short range.) Overlay wrappers are
  `pointerEvents:'none'` except the toggles / `New game`, and `toWorld` reads the
  svg's own rect, so drag-to-aim is unaffected. This keeps the stacked chrome from
  capping the scene height, so rotating to landscape actually enlarges the
  playfield (the point of the rotate hint). Portrait keeps the stacked layout
  because it gains little there.

## Verifying
`npm run build` + `npm run lint`, then headless Chromium. The scene svg exposes
`data-p1y`/`data-p2y`/`data-platforms`; each archer `<g>` exposes
`data-testid="archer-<p>"` + a live `data-py` (poll it to confirm Still keeps
both constant, Both moves both, Target moves only the opponent); the in-flight
arrow is `data-testid="arrow"`. To drive a
deterministic shot, mirror the constants (`G/VMAX/K`, origins, hitbox), solve a
launch velocity that lands in the opponent hitbox, convert to a drag delta
(`Δ = −v/K`, world→screen via the svg rect) and dispatch mouse down/move/up.

## 2 Devices (online mode)

The netplay layer's fourth consumer and its first **real-valued move**: a shot
is a launch vector plus the animation phases its outcome depends on, where
every earlier game's move was an index. See `docs/netplay.md` for the
transport and pairing; what Archery adds is the determinism story.

**The problem.** The widget used to decide hits by sampling the closed-form
flight at rAF frame times, with the obstacle and platform phases read off a
device-local animation clock. Two devices replaying the same shot would not
reliably agree — frame rate and clock origin both differ.

**The design.**
- Physics moved to the pure `archeryModel.ts` (e2e-bundled like every game
  model): `resolveShot` samples the same closed-form flight at a **fixed
  1/120s step** with every input explicit. One resolver serves the shooter,
  the other device, the tests — and local pass-and-play, which now resolves
  up front too (the rAF loop just draws the path until the resolver's `tEnd`).
- **Quantize at release**: `packShot` rounds vx/vy to 1 unit, the launch
  height to 1 unit, and the captured phases to ~9ms, packing the lot into one
  46-bit integer that rides the protocol's existing `move: number` — no
  protocol change, no version bump. The shooter fires the *quantized* vector,
  so what flew on its screen is exactly what the other device resolves.
- **Wind derives from a synced seed** (`windAt(gameSeed, shot)`), so both
  devices know every turn's wind without messaging it. Locally the persisted
  roll remains.
- **A restart is a `sync`, not a `new`**: fresh heights and a fresh seed
  cannot ride `new`'s lone `first` field, so an online New game (from either
  side) resets locally and pushes the whole dealt position via the hook's
  `sendSync`.
- **Online commits at release**, not when the arrow lands: the wire must not
  wait for a 1.5s animation, or the opponent's next move would arrive against
  an unwritten position. The remote device replays the flight from the packed
  vector. Local play keeps its suspense — state lands with the arrow.
- Avatar costume, chip, dialog and the `blocked` turn lock as in the other
  games; `play: 'local' | 'online'` is a new axis (weather and transport are
  orthogonal, so `Mode` didn't grow a fourth value).

Root contract: `data-play`, `data-net`, `data-seat`, `data-turn`,
`data-shots`, `data-arrow` (`flying`/`none` — a drag during a replay is
refused, so the suite waits on it), `data-score-toy/-ninja`, `data-game-seed`,
`data-avatar-toy/-ninja` on `[data-testid="archery-root"]`; the scene svg
keeps its `data-p1y/p2y/w/mode/wind/platforms`.

Suite `e2e/148-archery-online` aims **closed-loop**: it reads the live world
off the DOM, scans for a shot with the bundled resolver (requiring a ±3-unit
margin so drag pixel-rounding cannot flip a marginal outcome), inverts it into
the slingshot drag (drag = −v/K), and fires it for real.

## Future work (enhancement backlog)

- **Land the remote suspense** — online commits state at release, so the score
  chip updates a beat before the replayed arrow lands on the other device.
  Holding the *displayed* score until `tEnd` (state already correct
  underneath) would restore the drama.
- **Replay phase fidelity** — a remote replay draws its own obstacle/platform
  animation clock, so the arrow may visually thread a block that "isn't
  there"; the outcome is authoritative from the packed phases. Offsetting the
  local clock to the packed phase during a replay would fix the visual.
- **Best-of-N match** — persist a series score across games, as Connect 4's
  backlog proposes.
- **Charged power meter** — an accessibility alternative to drag distance:
  hold to charge, release to fire at a fixed angle picker.
- **Sound** — bowstring, whoosh and thunk via `droneSim/webAudio` (no assets).
- **Obstacle/platform online polish** — supported today (phases ride the
  packed shot), but the replay-fidelity item above matters most in these
  modes.
