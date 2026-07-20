# End-to-end suites

Headless-Chromium tests that drive the real app and assert on the widgets'
public test contract — `data-testid` hooks and the `data-*` state widgets
publish. Most suites here cover the Drone Sim, Drone Strike and Tank Battle
widgets (whose HUD publishes telemetry every 150 ms), but the harness is
app-generic: any widget can get suites the same way (e.g. `120-avatars` drives
the Avatar Actions widget's `data-avatar`/`data-playing` contract, no WebGL
involved). For the WebGL games, flying/driving is **closed-loop**: a small
P-controller in `helpers.mjs` reads telemetry and steers the on-screen sticks
through CDP touch events (open-loop timed input is far too jittery to thread
gates or hit walls reliably).

```bash
npm run e2e            # all suites (starts its own dev server on :5199)
npm run e2e crash      # only suites whose filename matches "crash"
npm run e2e strike     # the Drone Strike suites (100-103)
npm run e2e tank       # the Tank Battle suites (110-116)
```

Environment:

- `CHROMIUM_PATH` — Chromium executable (default `/opt/pw-browsers/chromium`).
  Launched with `--enable-unsafe-swiftshader --use-angle=swiftshader` so WebGL
  works without a GPU.
- `E2E_PORT` — dev-server port (default 5199).

The runner bundles the widgets' pure modules (`flightModel`, `worldLayout`,
`lapTimer`, Drone Strike's `combatModel`/`waveLayout`, and Tank Battle's
`terrain`/`tankModel`/`shellModel`/`battleLayout`/`tankAI` in later flat
passes) with esbuild into `e2e/.bundle/` so suites can compute waypoints and
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
| `100-strike-core` | Drone Strike: element presence + root defaults, damage-vignette + pad-chip at-rest contracts (`data-flash`/`data-low-hp`/`data-pad-state`), wave intro→active, seeded wave-1 composition vs the pure module, nearest-target beacon, fire-button tap + cooldown-limited hold, closed-loop engagement (aim onto the beacon, fire, target down, score/hits) |
| `101-strike-waves` | wave progression: full wave-1 clear → cleared → wave 2 with the seeded target count; the difficulty curve (drifters w2, enemies w3 with orbit envelopes, return fire w5) from the pure module; best score/wave persistence across reload |
| `102-strike-input` | multi-touch (stick climbs while a second finger holds fire), keyboard W + Space with `data-input-source` arbitration, aim-assist/gyro-mode/auto-fire settings round-trips, hands-off auto-fire kill, progress-guarded restart |
| `103-strike-zoom` | ADS/zoom: scope-button toggle (`data-zoom` on root/HUD/reticle), scoped yaw rate ≈ half measured closed-loop, firing while scoped, hold-Shift zoom, scoped assist cones tighter per level (pure module), gyro "Zoom only" mode, scope hidden + dropped outside FPV |
| `104-strike-simports` | the sim-ported settings: hold brakes vs acro coasts (closed-loop), turbo ≈ 1.4× top speed, battery bar + effort drain + spawn-pad recharge + near-full transient restart, persistence of all three across reload |
| `105-strike-crash` | crash mode (default on): closed-loop full-speed wall ram → tumble + CRASHED! banner + one heart lost + pad respawn; pad rest restores the heart; safe-zone contract on the pad (`data-safe`, chip states, weapons offline) and clears on lift-off; safe-mode ram only pins; toggle persistence. Suites 100–102/104 disable crash mode after setup — their routes bump walls by design |
| `106-strike-mobile` | responsive touch layout on an iPhone-landscape viewport (844×390) in fullscreen: every stick/fire/scope control fully on screen, fire/scope column inward of the right stick and clear of the toolbar, sizes scaled to the height, fire still works; `launch({viewport})` emulates the screen |
| `107-strike-gimbal` | four aim modes (Classic default = fly-to-aim, gimbal frozen; drag ignored, reticle centred), then in Reticle mode: drag-to-aim slews `data-gimbal-yaw/-pitch` (reticle moves in Reticle mode, centred in Gunner), deep ground look-down + arc clamp, double-tap recenter, gimbal+assist kill with flight sticks idle, hover mode re-routes the right stick (drone holds position), `trackToward` soft-track dynamics (pure module), mode persistence |
| `110-tank-core` | Tank Battle: element presence + root defaults, seeded wave-1 composition vs the pure module, terrain grounding (live `data-alt` matches the bundled `heightAt`), throttle/turn driving, camera-independent hull, turret traverse lag + settle, fire-button shot + reload gating, ADS zoom toggle |
| `111-tank-combat` | closed-loop combat: no lock from spawn (terrain cover — the pilot must crest the ridge), two engage-and-kill runs clearing wave 1, wave 2 arrives with the seeded count + armed enemies, sky/ground ballistic-solution reticle contract, best score/wave persistence across reload, progress-guarded mode switch + cancel |
| `112-tank-modes` | Waves ↔ Roam toggle (direct without progress), roam garrison size + 5-HP pool, terrain roughness reshaping (pure-module amplitude check), settings round-trips on the root, minimap toggle, reset-to-defaults keeps mode/roughness/seed, mode + roughness persistence across reload |
| `113-tank-autoturn` | auto-turn hull (default on): stationary aiming never swings the hull, hull converges onto the camera heading under throttle alone, stick-X override, toggle off → hull ignores the camera, off persists across reload, settings reset restores it |
| `114-tank-help` | first-run "How to play" overlay: auto-opens on a fresh widget (`data-help-seen` off), Got-it dismiss persists the flag, no auto-open after reload, ? button reopens + Escape closes, battle state machine unblocked throughout. Other tank suites dismiss it via `addTankWidget` |
| `115-tank-safezone` | spawn safe zone (the strike pad, groundside): `data-safe` + pad-chip contract at spawn, weapons offline inside vs online outside, then the full closed-loop repair run — clear wave 1, bait a real wave-2 hit standing in the open, retreat to the pad (chip REPAIRING, enemies hold fire) and rest until the heart restores |
| `116-tank-mobile` | responsive touch layout on an iPhone-landscape viewport (844×390) in fullscreen: every stick/fire/scope control fully on screen, fire/scope column inward of the right stick and clear of the toolbar, sizes scaled to the height, fire works after driving clear of the safe zone |
| `120-avatars` | Avatar Actions widget: default selection, every catalogued avatar selectable in order + renders a figure svg, tap plays/stops the celebration (`data-playing`), switching avatar mid-play resets to the static figure, per-widget selection persists across reload while play state resets |

Drone Strike suites steer with the same closed-loop rig (`createStrikePilot`)
aimed at the HUD's nearest-target beacon (`data-tgt-*`); `engage()` fires via
keyboard Space so the trigger never disturbs the sticks' touch ownership.
Tank Battle suites use `createTankPilot` (left stick drives the hull, right
stick steers the camera aim); its `engage()` drives INTO terrain line of
sight first — over the contour there is usually no lock until the pilot
crests the ridge — then fires on lock + ballistic solution.

Routes must respect the game rules: laps only start under the drone's own
power, and fast legs cruise **above** the skyline (24 — waypoint tolerance
can start a leg ~2 low) because crash mode (on by default) punishes
full-speed flight at building height.

**Flake policy**: the pilot's precision maneuvers (threading a 2-unit ring,
touching down on a 1.6-unit pad, timed wall hits) carry a small miss rate
under software-GL load, which compounds across a full run. The runner
re-runs a failed suite once with a fresh browser and logs the retry — a
suite that fails twice is a real failure.
