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
npm run e2e strike     # the Drone Strike suites (100-109 + 117-audio + 119-soldiers)
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
| `16-op-avatar` | operator = Player 1's avatar: default seat map renders the toy's `Model3D` (`data-op-avatar`/`data-op-figure` on the root), swapping Player 1 → DarkArin/frak/Imperium/Gold Gunner/Scar/Bazooka Joe/Ninja on the real Settings page renders each avatar's model (all nine carry one — `data-op-figure` is always `avatar`; the basic primitive survives only as the Suspense fallback), swapping back restores toy; telemetry alive throughout |
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
| `75-sound` | AudioContext recorder stub: off by default (no context constructed), enable builds the graph + starts the twin sawtooth rotor oscs, stick effort pitches the hum above the 85 Hz idle, gate chime, crash thud + rotor muted while tumbling, suspend on disable, toggle persistence |
| `80-acro` | flight-mode toggle: hold brakes vs acro coasts, gravity fall beats the descent cap, persistence |
| `85-tuning` | rates/expo panel: speed/yaw sliders scale HUD-observable flight, turbo stacks, persistence, reset-to-defaults restores tuning + toggles |
| `90-minimap` | inset map: layout contents, marker tracks position/heading, toggle + persistence |
| `95-richworld` | scenery toggle contract + persistence (generation is unit-covered) |
| `97-landing` | landing challenge: pad markers, scored touchdown + banner/best, plain-roof no-score, persistence |
| `98-battery` | battery mode: bar, drain under effort, pad recharge, transient level, persistence |
| `100-strike-core` | Drone Strike: element presence + root defaults, damage-vignette + pad-chip at-rest contracts (`data-flash`/`data-low-hp`/`data-pad-state`), wave intro→active, seeded wave-1 composition vs the pure module (every kind can appear from wave 1 — static balloons, drifting ring-drones, moving SWAT car + military truck, a throttled non-firing enemy drone, a non-firing AA turret), nearest-target beacon (any kind), fire-button tap + cooldown-limited hold, closed-loop engagement (aim onto the beacon, fire, target down, score/hits) |
| `101-strike-waves` | wave progression: full wave-1 clear → cleared → wave 2 with the seeded target count; the wave model from the pure module — every kind from wave 1 (drifters, enemy drones with orbit envelopes), the easing is difficulty + the wave-scaled enemy throttle (`enemyAggressionScale` ramps 0.3→1, wave-1 enemies orbit slower than wave-5) + the return-fire gate (enemies/turrets hold fire on wave 1, armed by wave 5); best score/wave persistence across reload |
| `102-strike-input` | multi-touch (stick climbs while a second finger holds fire), keyboard W + Space with `data-input-source` arbitration, aim-assist/gyro-mode/auto-fire settings round-trips, hands-off auto-fire kill, progress-guarded restart |
| `103-strike-zoom` | ADS/zoom: scope-button toggle (`data-zoom` on root/HUD/reticle), scoped sensitivity + FOV scale by 1/power (`zoomSensFor`/`zoomFovFor` pure module — closed-loop yaw timing is FOV/framerate-confounded under software GL), firing while scoped, hold-Shift zoom, scoped assist cones tighter per level (pure module), gyro "Zoom only" mode, scope hidden + dropped outside FPV; adjustable zoom power (`data-zoom-power` default 2×, round-trip + persistence) |
| `104-strike-simports` | the sim-ported settings: hold brakes vs acro coasts (closed-loop), turbo ≈ 1.4× top speed, battery bar + effort drain + spawn-pad recharge + near-full transient restart, persistence of all three across reload |
| `105-strike-crash` | crash mode (default on): closed-loop full-speed wall ram → tumble + CRASHED! banner + one heart lost + pad respawn; pad rest restores the heart; safe-zone contract on the pad (`data-safe`, chip states, weapons offline) and clears on lift-off; safe-mode ram only pins; toggle persistence. Suites 100–102/104 disable crash mode after setup — their routes bump walls by design |
| `106-strike-mobile` | responsive touch layout on an iPhone-landscape viewport (844×390) in fullscreen: every stick/fire/scope control fully on screen, fire/scope column inward of the right stick and clear of the toolbar, sizes scaled to the height, fire still works; `launch({viewport})` emulates the screen |
| `107-strike-gimbal` | four aim modes (Classic default = fly-to-aim, gimbal frozen; drag ignored, reticle centred), then in Reticle mode: drag-to-aim slews `data-gimbal-yaw/-pitch` (reticle moves in Reticle mode, centred in Gunner), deep ground look-down + arc clamp, double-tap recenter, gimbal+assist kill with flight sticks idle, hover mode re-routes the right stick (drone holds position), `trackToward` soft-track dynamics (pure module), mode persistence |
| `108-strike-difficulty` | enemy difficulty: Easy default + settings round-trip (Easy/Normal/Hard) + persistence; pure-module presets (orbit easy<normal<hard, gentler/shorter evade, one-hit enemies, delayed return fire) and buildWave threading difficulty into count/hp/fire-wave while keeping the difficulty-independent targets (balloons/drifters/ground) seeded identically |
| `109-strike-ground` | ground-target waves: pure-module military supply trucks (`ground`) and SWAT cars (`car`) are both **moving road vehicles from wave 1** — bound to a seeded road lane (fixed cross-coord ≈ a road `at` ±0.8), `driftSpeed ≠ 0`, wave-scaled travel velocity, `stepDrift` drives each along its axis at constant velocity holding the lane; on the deck (low y), one-hit, difficulty-independent count (both drawn before the enemy block, spread across lanes by a shared allocator). AA turrets (`turret`) also from wave 1 (static; they hold fire on wave 1 across every difficulty; hp + shared return-fire gate follow the difficulty preset). Trucks render as the `MilitaryTruck` model and cars as the `LegoSwatTruck`, both via the shared `ModelTargets` pool (`faceVelocity` + `animate`). DOM clears wave 1 closed-loop and confirms wave 2 fields the seeded target count (hit model is a normal sphere — covered by 100) |
| `110-tank-core` | Tank Battle: element presence + root defaults, seeded wave-1 composition vs the pure module, terrain grounding (live `data-alt` matches the bundled `heightAt`), throttle/turn driving, camera-independent hull, turret traverse lag + settle, fire-button shot + reload gating, ADS zoom toggle |
| `111-tank-combat` | closed-loop combat: no lock from spawn (terrain cover — the pilot must crest the ridge), two engage-and-kill runs clearing wave 1, wave 2 arrives with the seeded count + armed enemies, sky/ground ballistic-solution reticle contract, best score/wave persistence across reload, progress-guarded mode switch + cancel |
| `112-tank-modes` | Waves ↔ Roam toggle (direct without progress), roam garrison size + 5-HP pool, terrain roughness reshaping (pure-module amplitude check), settings round-trips on the root, minimap toggle, reset-to-defaults keeps mode/roughness/seed, mode + roughness persistence across reload |
| `113-tank-autoturn` | auto-turn hull (default on): stationary aiming never swings the hull, hull converges onto the camera heading under throttle alone, stick-X override, toggle off → hull ignores the camera, off persists across reload, settings reset restores it |
| `114-tank-help` | first-run "How to play" overlay: auto-opens on a fresh widget (`data-help-seen` off), Got-it dismiss persists the flag, no auto-open after reload, ? button reopens + Escape closes, battle state machine unblocked throughout. Other tank suites dismiss it via `addTankWidget` |
| `115-tank-safezone` | spawn safe zone (the strike pad, groundside): `data-safe` + pad-chip contract at spawn, weapons offline inside vs online outside, then the full closed-loop repair run — clear wave 1, bait a real wave-2 hit standing in the open, retreat to the pad (chip REPAIRING, enemies hold fire) and rest until the heart restores |
| `116-tank-mobile` | responsive touch layout on an iPhone-landscape viewport (844×390) in fullscreen: every stick/fire/scope control fully on screen, fire/scope column inward of the right stick and clear of the toolbar, sizes scaled to the height, fire works after driving clear of the safe zone |
| `117-strike-audio` | Drone Strike sound effects: AudioContext stubbed with a recorder; default `data-audio` on + per-effect `data-sfx-*` counters; firing bumps sfx-fire and reaches the gesture-unlocked engine (resume + oscillators), kills bump sfx-pop, wave-clear plays the sting; muting from settings freezes the counters + engine while the gun still fires; mute persists across reload; the widget still runs with no Web Audio API at all |
| `118-fullscreen-continuity` | full-screen preserves the live game: with a wave active, firing puts ref-held state on the clock (`data-shots`), then entering full screen keeps a single instance (`drone-strike-root`/`strike-canvas` count stays 1) and reparents the canvas into the MUI Dialog (not a fresh mount) with `data-shots` never dropping to 0, firing continues the same session, and exiting reparents back out of the dialog with shots + active wave intact — proving the reparented-portal fix (a remount would zero the shots counter) |
| `119-strike-soldiers` | patrolling soldier targets: pure-module `soldier` targets appear from wave 1 and **patrol** — the first ⌈count/2⌉ pace a building ROOFTOP (each `(x,z)` a building centre, `y = b.h+0.9`, half-beat kept ≤ the roof so they never walk off), the rest walk a free-roam beat on the open GROUND (`y≈0.9`, off any building, whole beat clear of the city — not road-bound); a wave fields both. Both move via the seeded sinusoidal `stepDrift` (driftAmp>0, writing true velocity) — asserted by stepping a wave-6 patroller along its axis (non-zero pos delta + travel velocity, cross axis held). hp follows difficulty (easy 1 / normal 2); count clamped ≤3 (SoldierTargets pool); they ride the shared return-fire gate (hold fire on wave 1 across every difficulty, armed by wave 5 on normal — via `stepTurret`). Weapon-matched **variants**: variant 0 (rocket / Bazooka Joe) or 1 (SMG / Scar), assigned by order; the variant's weapon tags its projectile's `visual` (`SOLDIER_ROCKET`→rocket / `SOLDIER_SMG`→bolt, proven through `spawnProjectile`), so one enemy pool renders as both. DOM confirms the app fields the seeded wave-1 count. Rendered from the Scar / Bazooka Joe avatar `Model3D`s via SoldierTargets (feet on surface + walk bob, body faces travel while walking / player while firing, aim + fire pose); the live wave-1 soldier is cleared by 100/101/109 |
| `120-avatars` | Avatar Actions widget: default selection, every catalogued avatar selectable in order + renders a figure svg, the Idle/Celebrate toggle plays/stops the celebration (`data-playing`, `data-action`), switching avatar mid-play resets to the static figure, per-widget selection persists across reload while play state resets |
| `121-avatars-3d` | Avatar Actions 2D/3D toggle + 3D action library: 2D default, switching to 3D lazy-loads three.js and renders a WebGL canvas for the avatars with a `Figure3D` (`data-view`, `data-figure3d`, `figure3d-stage`), the action toggle lists each model's `actions3d` moves (toy: Dance + 6 7 Show; ninja: Pump + Draw; fireninja: Fire Blade; darkarin: Twin Cross; frak: Blade Flurry; imperium: Claw Slash; goldgunner: Guns Blazing; scar: Breach & Clear; bazookajoe: Rocket Launch) and drives `data-action`/`data-playing` (all nine avatars carry a 3D figure — the `figure3d-unavailable` placeholder path is scaffolding for future avatars, probed only by the toy block's negative check), tapping the figure toggles the turntable (`data-spin`, uniform across avatars, persisted), views restore on switch-back, chosen view + spin preference persist across reload |
| `122-settings-mobile` | Settings page on a phone-portrait viewport (390×844): both per-seat avatar picker groups wrap instead of overflowing (every button box inside the viewport width), the app-bar collapses its brand text + nav labels to icons, no horizontal page overflow, the widest button (Imperium Claw General) selects on tap and persists across reload |
| `130-map` | Map page: no arcgis code on the dashboard, the lazy chunk loads via the nav link, view readiness via `data-map-status` (from `view.when()`, never networkidle), basemap + injected ArcGIS CSS follow the theme toggle (render-computed `data-basemap`, asserts offline), 2D/3D toggle + reload persistence, 3D buildings + trees toggles (3D-only, independent, persisted `data-buildings`/`data-trees`), tool strip contract, pure `routeGeometry` + `dragModel` unit checks (bundled: insert index, nearest-distance, scale-derived tap threshold, drag commit-race orderings incl. pointer-up outracing drag end), Singapore default viewport (`data-center-*` render-computed from the persisted viewpoint), in-place fullscreen (fixed root covers the viewport, Escape exits — no remount of the live view), coordinate readout (pointer-tracked `data-lat`/`data-lon` + clipboard copy — offline-safe, `toMap` needs no tiles), view bookmarks (save dialog, jump-back via goTo asserted through `data-center-lon`, reload persistence, delete), deep link. OSRM routing is always mocked with an **echo mock** (line through the requested coords); an in-page CDN probe gates the online-only checks (view ready, attribution/zoom UI, click-driven pins with persistence + clear-all, waypoint editing: A→B distance, insert by clicking the line, per-leg breakdown popover on the result chip (`data-route-legs`, mocked legs split the totals), remove by clicking a marker, drag a marker to move it (re-routes with the moved coordinate), undo of remove/insert/clear, saved routes (save/load/delete + reload persistence), measure widget mount/unmount, pan → stationary viewpoint capture → reload persistence) — on a CDN-blocked network the suite runs its offline branch |
| `140-model-viewer` | Model Viewer widget: adding it lazy-loads the shared three.js chunk and renders a WebGL canvas, default model is the LEGO SWAT truck (`data-model`), the render loop advances the tick-owned `data-frames` counter (frame production proven without pixels), Animate and Auto-rotate toggles drive `data-animate`/`data-autorotate`, the picker switches between all catalog models (SWAT truck / AA turret / military truck — `data-model`, canvas and `data-frames` survive the swap), and both toggle settings + the model choice persist across reload |

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
