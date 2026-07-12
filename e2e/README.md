# Drone Sim end-to-end suites

Headless-Chromium tests that drive the real app and assert on the widget's
public test contract — `data-testid` hooks and the `data-*` telemetry the HUD
publishes every 150 ms. Flying is **closed-loop**: a small P-controller in
`helpers.mjs` reads telemetry and steers the on-screen sticks through CDP
touch events (open-loop timed input is far too jittery to thread gates or hit
walls reliably).

```bash
npm run e2e            # all suites (starts its own dev server on :5199)
npm run e2e crash      # only suites whose filename matches "crash"
```

Environment:

- `CHROMIUM_PATH` — Chromium executable (default `/opt/pw-browsers/chromium`).
  Launched with `--enable-unsafe-swiftshader --use-angle=swiftshader` so WebGL
  works without a GPU.
- `E2E_PORT` — dev-server port (default 5199).

The runner bundles the widget's pure modules (`flightModel`, `worldLayout`,
`lapTimer`) with esbuild into `e2e/.bundle/` so suites can compute waypoints
from the real (seeded, deterministic) world layout. Screenshots land in
`e2e/.artifacts/`. Both directories are gitignored.

| Suite | Covers |
|---|---|
| `10-core` | element presence, climb + altitude hold, inertia braking, simultaneous multi-touch, reset, camera toggle + persistence, grid-drag isolation |
| `20-collision` | closed-loop rooftop landing: rests on the roof, stays in the footprint, no tunneling under sustained descent |
| `30-timetrial` | full lap (pad → gates 1-3 → pad): timer start/finish, TO PAD phase, banner, laps/best bookkeeping, mid-lap reset, persistence, ghost render |
| `40-shuffle` | new-course button: instant shuffle vs ConfirmDialog guard, stat clearing, seed persistence |
| `50-weather` | storm toggle: hands-off wind drift vs clear station-hold, HUD wind readout, persistence |
| `60-crash` | crash mode: full-speed wall hit → tumble + banner + lap void + pad respawn; safe mode → wall pin; toggle persistence |

Routes must respect the game rules: laps only start under the drone's own
power, and fast legs cruise **above** the skyline because crash mode (on by
default) punishes full-speed flight at building height.
