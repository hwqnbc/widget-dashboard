# Drone Sim + Drone Strike end-to-end suites

Headless-Chromium tests that drive the real app and assert on the widgets'
public test contract — `data-testid` hooks and the `data-*` telemetry the HUD
publishes every 150 ms. Flying is **closed-loop**: a small P-controller in
`helpers.mjs` reads telemetry and steers the on-screen sticks through CDP
touch events (open-loop timed input is far too jittery to thread gates or hit
walls reliably).

```bash
npm run e2e            # all suites (starts its own dev server on :5199)
npm run e2e crash      # only suites whose filename matches "crash"
npm run e2e strike     # the Drone Strike suites (100-102)
```

Environment:

- `CHROMIUM_PATH` — Chromium executable (default `/opt/pw-browsers/chromium`).
  Launched with `--enable-unsafe-swiftshader --use-angle=swiftshader` so WebGL
  works without a GPU.
- `E2E_PORT` — dev-server port (default 5199).

The runner bundles the widgets' pure modules (`flightModel`, `worldLayout`,
`lapTimer`, and Drone Strike's `combatModel`/`waveLayout` in a second flat
pass) with esbuild into `e2e/.bundle/` so suites can compute waypoints and
expected wave compositions from the real (seeded, deterministic) layouts.
Screenshots land in `e2e/.artifacts/`. Both directories are gitignored.

Mode toggles live in the **settings panel** (gear button → dialog), not the
button row: suites flip them with `setSwitch(page, testId, desired)` from
`helpers.mjs` (opens the panel, syncs the switch, closes it) and read current
mode state from the widget root's `data-*` attributes via
`rootState(page, attr)`.

| Suite | Covers |
|---|---|
| `10-core` | element presence, climb + altitude hold, inertia braking, joystick recovery on window blur mid-drag and on silent pointer-capture loss (hasPointerCapture watchdog), simultaneous multi-touch, reset, camera cycle (tp/fp/los/walk) + persistence, grid-drag isolation |
| `15-chasecam` | chase-boom wall avoidance: full extension in open sky, clamps against a wall behind the drone (`data-boom`), re-extends in the clear |
| `17-walker` | walking pilot: follow on foot (speed hard-capped, drone outruns it, follow-band idle), configurable follow distance, pilot chip (standing/walking/holding/auto-rescue/manual-walk), hold toggle + resume, manual FPS walk while the drone is down (turn + walk-along-facing via sticks), full battery rescue (drain to dead → retrieve → carry → place on pad → recharge revives) via `data-op-*` |
| `18-input` | keyboard (W/S/A/D + arrows) and gamepad (stubbed `navigator.getGamepads`, scripted axes) drive the shared ControlInput; `data-input-source` arbitration, deadzone, zero-once release, typing-in-Notes guard, touch still works beside an idle pad |
| `19-fpv` | FPV polish (default off): horizon overlay only in fp + toggle on, banks with strafe (`data-roll`), levels on release, persistence |
| `20-collision` | closed-loop rooftop landing: rests on the roof, stays in the footprint, no tunneling under sustained descent |
| `30-timetrial` | full lap (pad → gates 1-3 → pad): timer start/finish, TO PAD phase, banner, laps/best bookkeeping, mid-lap reset, persistence, ghost render |
| `40-shuffle` | new-course button: instant shuffle vs ConfirmDialog guard, stat clearing, seed persistence |
| `45-gates` | gate-count slider: 3→6 on the same world, HUD/minimap follow, persistence, gate 1/6 sequences, mid-lap confirm guard + stat clearing (incl. the settings-reset path) |
| `46-editor` | course editor: fly & drop gates (pad/stacked-drop validation, undo), save → custom course races a full lap, persistence, seeded↔custom switching with confirm guard |
| `50-weather` | storm toggle: hands-off wind drift vs clear station-hold, HUD wind readout, persistence |
| `60-crash` | crash mode: full-speed wall hit → tumble + banner + lap void + pad respawn; safe mode → wall pin; toggle persistence |
| `70-haptics` | vibration recorder stub: contact buzz + cooldown, gate/crash patterns, no-API degradation |
| `80-acro` | flight-mode toggle: hold brakes vs acro coasts, gravity fall beats the descent cap, persistence |
| `85-tuning` | rates/expo panel: speed/yaw sliders scale HUD-observable flight, turbo stacks, persistence, reset-to-defaults restores tuning + toggles |
| `90-minimap` | inset map: layout contents, marker tracks position/heading, toggle + persistence |
| `95-richworld` | scenery toggle contract + persistence (generation is unit-covered) |
| `97-landing` | landing challenge: pad markers, scored touchdown + banner/best, plain-roof no-score, persistence |
| `98-battery` | battery mode: bar, drain under effort, pad recharge, transient level, persistence |
| `100-strike-core` | Drone Strike: element presence + root defaults, damage-vignette at-rest contract (`data-flash`/`data-low-hp`), wave intro→active, seeded wave-1 composition vs the pure module, nearest-target beacon, fire-button tap + cooldown-limited hold, closed-loop engagement (aim onto the beacon, fire, target down, score/hits) |
| `101-strike-waves` | wave progression: full wave-1 clear → cleared → wave 2 with the seeded target count; the difficulty curve (drifters w2, enemies w3 with orbit envelopes, return fire w5) from the pure module; best score/wave persistence across reload |
| `102-strike-input` | multi-touch (stick climbs while a second finger holds fire), keyboard W + Space with `data-input-source` arbitration, aim-assist/gyro-mode/auto-fire settings round-trips, hands-off auto-fire kill, progress-guarded restart |
| `103-strike-zoom` | ADS/zoom: scope-button toggle (`data-zoom` on root/HUD/reticle), scoped yaw rate ≈ half measured closed-loop, firing while scoped, hold-Shift zoom, scoped assist cones tighter per level (pure module), gyro "Zoom only" mode, scope hidden + dropped outside FPV |

Drone Strike suites steer with the same closed-loop rig (`createStrikePilot`)
aimed at the HUD's nearest-target beacon (`data-tgt-*`); `engage()` fires via
keyboard Space so the trigger never disturbs the sticks' touch ownership.

Routes must respect the game rules: laps only start under the drone's own
power, and fast legs cruise **above** the skyline (24 — waypoint tolerance
can start a leg ~2 low) because crash mode (on by default) punishes
full-speed flight at building height.

**Flake policy**: the pilot's precision maneuvers (threading a 2-unit ring,
touching down on a 1.6-unit pad, timed wall hits) carry a small miss rate
under software-GL load, which compounds across a full run. The runner
re-runs a failed suite once with a fresh browser and logs the retry — a
suite that fails twice is a real failure.
