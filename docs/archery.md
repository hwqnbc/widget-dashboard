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

## Verifying
`npm run build` + `npm run lint`, then headless Chromium. The scene svg exposes
`data-p1y`/`data-p2y`/`data-platforms`; each archer `<g>` exposes
`data-testid="archer-<p>"` + a live `data-py` (poll it to confirm Still keeps
both constant, Both moves both, Target moves only the opponent); the in-flight
arrow is `data-testid="arrow"`. To drive a
deterministic shot, mirror the constants (`G/VMAX/K`, origins, hitbox), solve a
launch velocity that lands in the opponent hitbox, convert to a drag delta
(`Δ = −v/K`, world→screen via the svg rect) and dispatch mouse down/move/up.
