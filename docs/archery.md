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

## Wind mode
A **No wind / Wind** `ToggleButtonGroup` (in the centre of the score row) turns
on a horizontal wind: each turn a random wind (`windMode:'on'` → `randomWind()`,
±[70,170] units/s²) adds a horizontal acceleration to the arrow
(`x = x0 + vx·t + ½·wind·t²`), re-rolled on every turn pass and shown by a
top-centre **WIND →** gauge (direction + length ∝ strength). Like the other
games' mode/difficulty toggles, switching wind **starts a new game** (re-deals
heights, resets scores) and is `ConfirmDialog`-guarded mid-game. `wind`/`windMode`
persist; the scene `<svg>` exposes `data-wind` for tests.

## State (persisted `data`, via `useWidgetField`)
`p1y`, `p2y` (feet Y; `0` = "not dealt" → the component deals random heights in
an effect, keeping the reducer pure), `scores {toy,ninja}` (0–5), `turn`,
`first`. Aiming, arrow flight, and the hit flash are **transient** component
state — a mid-flight reload just returns to the shooter's turn. Derived:
`winner` (first to 5), `gameOver`.

## Reused UX
- `PlayerBadge` scores ("n / 5") tinted `PLAYER_COLOR`, active player highlighted.
- After each shot the `TurnBanner` (`useHandoff`) announces the next player and
  locks input; a winning 5th hit shows `WinnerCelebration` instead. Input is
  locked during flight, during the banner, and after game over.

## Verifying
`npm run build` + `npm run lint`, then headless Chromium. The scene svg exposes
`data-p1y`/`data-p2y`; the in-flight arrow is `data-testid="arrow"`. To drive a
deterministic shot, mirror the constants (`G/VMAX/K`, origins, hitbox), solve a
launch velocity that lands in the opponent hitbox, convert to a drag delta
(`Δ = −v/K`, world→screen via the svg rect) and dispatch mouse down/move/up.
