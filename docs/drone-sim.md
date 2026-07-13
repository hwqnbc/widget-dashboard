# Drone Sim widget

A single-player 3D drone simulator (`droneSim`) — the dashboard's first
WebGL widget. Fly a primitive-built quadcopter over a procedurally-placed
city with twin on-screen thumbsticks, in third-person chase or first-person
(FPV) camera.

## Stack

- `three` + `@react-three/fiber` v9 (the React 19 compatibility line). No
  drei, no physics engine — the flight model is hand-rolled kinematics.
- The registry entry (`DroneSimWidget`) is a tiny eager shell that
  `React.lazy`-loads `DroneSimBody`, so three.js lives in its own Vite chunk
  and the dashboard's initial bundle is unaffected.

## Controls (Mode 2)

| Stick | X axis | Y axis |
|---|---|---|
| Left (`THR · YAW`) | yaw rate (right = nose right) | vertical velocity (up = climb) |
| Right (`MOVE`) | strafe | forward / backward |

Top-right buttons — only three, deliberately: camera toggle (`tp` chase ↔
`fp` FPV, persisted), reset (back to the landing pad, transient), and a
settings gear that opens the **settings panel** (below). Every mode toggle
lives in the panel, not in the button row.

## Settings panel (`SettingsPanel.tsx`)

A portaled MUI `Dialog` (the ConfirmDialog pattern — works at any widget
size, scrolls when short). Each mode is a labelled switch row with a
one-line description, grouped by concern:

- **Gameplay**: Acro flight mode, Crash & respawn, Landing challenge,
  Battery mode.
- **Environment**: Storm weather, Rich scenery, Minimap.
- **Tuning**: the speed/yaw/expo sliders and the Turbo switch (formerly a
  separate popover).
- **Course**: the gates-per-lap slider (3–6) and the New course action
  button. Both destroy the recorded best (and any lap in progress), so both
  route through the same confirm guard.
- **Defaults**: a Reset settings button restoring every panel setting to
  its catalog default (`defaultWidgetData('droneSim')` is the single source
  of truth). Records (laps/best/ghost/landing best), the camera view and
  the world seed are deliberately *not* settings and survive the reset —
  except when the gate count has to revert, which is a course change and
  goes through the same confirm guard, clearing lap stats.

The panel reads current values as props from `DroneSimBody` and dispatches
`updateWidgetData` itself. The original per-toggle `data-testid`s moved onto
the switch rows unchanged, and the widget root mirrors every mode as
`data-mode/-crashes/-landing/-battery/-weather/-rich/-minimap/-turbo`
attributes — the E2E contract reads state from the root and flips switches
through the panel. History note: each feature originally added its own
icon-toggle to the button row; at 11 buttons that stopped scaling (and a
static icon gives no on/off feedback — the landing toggle "didn't work"
purely because nothing visible changed), hence the regroup (lessons #36).

## Flight model (`flightModel.ts`)

Altitude-hold style: sticks command **target velocities**, never
accelerations, and gravity is implicit — releasing everything brakes the
drone to a stationary hover. Per frame (`stepFlight`, mutate-in-place,
allocation-free):

1. `dt` clamped to `MAX_DT` (0.05 s) so tab-switch spikes can't teleport.
2. Yaw integrates left-stick X at `YAW_RATE` (2.8 rad/s).
3. Right stick maps to a body-frame velocity target (forward = −Z at yaw 0),
   rotated into world frame; left-stick Y is the vertical target.
4. Velocity approaches the target exponentially:
   `damp(cur, target, λ, dt) = cur + (target − cur)(1 − e^(−λ·dt))`
   with `RESPONSE_H = 5` / `RESPONSE_V = 8` — this one function provides
   inertia, braking, and framerate independence.
5. Position integrates; x/z clamp to `±WORLD_HALF` (outward velocity
   zeroed), y clamps to `[DRONE_RADIUS, MAX_ALT]`.
6. Visual tilt (`tiltPitch`/`tiltRoll`) damps toward stick deflection ×
   `MAX_TILT` — pure cosmetics, it never feeds back into motion.

Speeds: `MAX_HORIZ_SPEED 12`, `MAX_VERT_SPEED 5` world-units/s.

### Acro mode (manual flight)

The settings panel's flight-mode switch flips persisted `flightMode: 'hold' | 'acro'`
(default `hold` — the beginner model above). In acro the drone becomes a
thrust vector under **real gravity** (`GRAVITY 14`):

- The right stick commands **attitude** — `tiltPitch`/`tiltRoll` damp toward
  stick × `MAX_ATTITUDE` (0.5 rad) and are now the real flight attitude, not
  cosmetics (the same fields keep the rendering and FPV camera unchanged).
- The left stick's Y is **collective thrust** around the hover point:
  `thrust = GRAVITY · (1 + y · THRUST_RANGE)` along the body-up axis
  (yaw/pitch/roll rotation of +Y) — stick centred hovers, full down cuts to
  ~0.15 g and the drone falls faster than hold mode's 5 u/s descent cap.
- Momentum **coasts** against light drag (`DRAG_H 0.35` vs hold's braking
  λ = 5) up to `ACRO_MAX_SPEED 22` — releasing the sticks keeps you moving,
  which is the entire skill curve. Bounds, collisions, wind, crash impacts
  and lap logic are identical across modes.

### Weather (storm mode)

The storm-weather switch toggles persisted `weather: 'clear' | 'storm'`. Storm
mode swaps in `DUSK_PALETTE` (dim sun via the palette's `sunIntensity`),
mounts `RainField` — one 800-point `Points` cloud kept centred on the drone,
drops falling and drifting with the wind, wrapping within a fixed volume,
single draw call — and feeds `stepFlight` a wind vector. `sampleWind(t)` is
a pure sum-of-sines: a slowly veering heading with layered gusts, capped at
`WIND_MAX` (4.5 u/s), deterministic and allocation-free. Wind applies as a
**position drift** the pilot must counter (never touches the velocity
targets, so releasing the sticks still brakes cleanly — the drone then
drifts with the gusts instead of holding station). The HUD appends
`WIND x.x` (`data-wind`) in storm. The same `windRef` is shared by the sim
loop and the rain so drops and drift always agree. Lap times in storm are
naturally slower — the best lap makes no weather distinction, by design.

### Building collision

`worldLayout.ts` derives a `Collider` per building — its AABB **pre-inflated**
by `DRONE_RADIUS` in x/z (drone treated as a point) with `top = h +
DRONE_RADIUS`. After integration + bounds clamping, `resolveCollisions` pushes
the drone out of any box along the **axis of least penetration** and zeroes
only the velocity component that carried it in, so the drone slides along
walls and can **land on roofs** (pushed up ⇒ rests at `top`; altitude hold
keeps it parked, and flying off the edge just leaves it hovering). No
tunneling is possible: max travel per step is 0.6 u (12 u/s × MAX_DT), well
under the smallest inflated footprint (~2.5 u). Gate rings stay fly-through
on purpose.

### Crash & respawn

`resolveCollisions` returns the velocity magnitude it absorbed — the impact
speed. With crash mode on (persisted `crashes: boolean`, default true,
settings-panel switch) an impact ≥ `CRASH_SPEED` (8 u/s) triggers a
crash — full-tilt horizontal flight is 12 while max vertical is 5, so
rooftop/ground landings and gentle bumps can never crash — only committed
wall hits. The tumble (`stepCrash`, `CRASH_DURATION` 1.6 s) kills the
controls, skids the horizontal velocity down, applies fake gravity with one
ground bounce, keeps resolving buildings, and spins the tilt group for the
visual; the `CRASHED!` banner shows, any lap in progress is voided, and the
drone auto-respawns on the pad (the teleport-jump guard keeps the respawn
from scoring gates or starting laps). World-bounds clamps never crash —
hitting an invisible wall would feel unfair. HUD exposes
`data-crash-state` (`none`/`tumbling`) on the usual 150 ms tick.

## Input path (why nothing re-renders in flight)

`VirtualJoystick` is a custom pointer-event component (no nipplejs — it's
imperative DOM manipulation and doesn't fit React):

- Each stick captures **its own pointer id** with `setPointerCapture` and
  filters every event on it, so two thumbs drive both sticks simultaneously;
  mouse input flows through the same unified pointer path.
- `touchAction: 'none'` on the stick hit areas only — swiping the 3D scenery
  still scrolls the page.
- Deadzone (0.08) is rescaled so output is continuous from the deadzone edge.
- The knob moves via direct `style.transform` writes, and `onChange` writes
  into a shared mutable `ControlInput` ref owned by `DroneSimBody`.

`DroneRig`'s `useFrame` reads that ref every frame: joystick moves (60–120 Hz)
cause **zero React renders**. This is the repo's usual split taken further:
persisted state in redux (`{ view: 'tp' | 'fp' }` only), high-frequency state
in refs (`FlightState`, `ControlInput`).

## Rendering

- `WorldScene`: sky/fog colours + hemisphere/directional/ambient lights,
  140×140 ground plane + `gridHelper` (motion parallax), a 36-building city
  in **one `instancedMesh`** (matrices + per-instance colour written once in
  `useLayoutEffect`), landing pad. ~10 draw calls total.
- **Seeded layouts**: `buildWorldLayout(seed)` deterministically produces
  buildings, rings, colliders and gates from one mulberry32 stream; the
  widget's persisted `worldSeed` (default `DEFAULT_SEED`) recreates its
  course across reloads. The **New course** button (settings panel) re-rolls
  the seed — `Math.random` in the click handler, which the purity rule
  allows — and clears laps/best/ghost (a ghost through relocated rings is
  meaningless), confirm-guarded via `ConfirmDialog` when a best lap exists
  or a lap is running. For the default seed the rings stay the hand-placed
  classic course; re-rolled seeds place rings by rejection sampling (min 12
  from the pad, 18 apart, never intersecting a building, inside bounds,
  classic-ring fallback if sampling exhausts). The spawn corridor and pad
  stay clear under every seed, so reset is always safe.
- No shadow maps. `DroneRig` moves a **blob shadow** (flat circle) under the
  drone whose opacity fades and radius grows with altitude — the depth cue
  that makes height legible.
- Theme-aware: `palettes.ts` has `DAY_PALETTE`/`NIGHT_PALETTE`; `DroneSimBody`
  picks by `useTheme().palette.mode` and passes it **as props** into the
  canvas — the R3F `<Canvas>` is a separate React root, so MUI context does
  not cross it (same reason `usePresentation` is read outside).
- `DroneModel`: box body, orange nose block marking −Z as forward, four arms,
  four semi-transparent rotor discs with a solid blade; diagonal pairs
  counter-rotate and spin up with throttle. Pose is split: outer group takes
  position + yaw, inner group takes tilt, so the camera math only cares
  about the outer transform.

## Time trial (gates + lap timer + ghost)

A lap runs **pad → gate 1 → … → gate N → back to the pad**, timed from the
moment the drone leaves the landing-pad radius (`lapTimer.ts`, a pure
mutate-in-place state machine like `stepFlight`, clocked by
`performance.now()`).

**Lap length is configurable** — persisted `gateCount` (3–6, default 3, the
Course slider in the settings panel). `buildWorldLayout(seed, gateCount)`
draws extra rings from the PRNG stream **after** every other world table
(the same stream-append rule the rich-world data followed), so a seed's
city, classic course, scenery and landing pads are bit-identical at any
count — the lap just grows rings 4–6, rejection-sampled under the usual
constraints (clear of spawn, ≥ 18 apart, never intersecting a building,
hand-placed fallbacks if sampling exhausts). Everything downstream keys on
`gates.length`, so the chip (`GATE n/N`), minimap, sequencing and
return-to-pad phase follow automatically. Changing the count rebuilds the
course, so it clears laps/best/ghost through the same confirm guard as the
new-course shuffle.

- **Gates**: `worldLayout.ts` derives a `Gate { center, normal, passRadius }`
  per ring; `crossedGate` detects a plane crossing of the frame's movement
  segment with the interpolated crossing point inside the ring
  (direction-agnostic). `DroneRig` tests only the **active** gate, only while
  a lap is **running**, and skips teleport-length segments so reset can't
  score. Passing the last gate enters the return-to-pad phase
  (`activeGate === GATES.length`) — the pad ring pulses as the finish line.
- **Visuals**: `GateRings` drives all gate colours in `useFrame` (green =
  done, pulsing accent = active, dim = upcoming, white flash on pass) plus
  the pad finish ring. Colour work never re-renders React.
- **Lap completion** (pad re-entry after all gates): increments the persisted
  `score` (= laps), shows a transient `LAP 41.3s · NEW BEST!` banner, and on
  improvement persists `bestLapMs` and `bestLapPath`.
- **Re-arm rule**: returning to the pad with *no* gates passed silently
  resets the clock to ready, so an aborted start isn't penalised.
- **Start guard**: the clock only starts when the drone's own velocity
  carries it off the pad (`selfPropelled`) — storm wind drifting an idle
  drone off the pad moves position without velocity and must not start a
  lap.
- **Ghost line**: while racing, `DroneRig` samples the position on the 150 ms
  HUD tick (flat x,y,z triples rounded to 0.1 — a 60 s lap ≈ 10 KB); a new
  best persists the path, which `GhostLine` renders as a translucent line
  (imperative `THREE.Line` via `<primitive>`, since lowercase `<line>` JSX
  collides with the SVG intrinsic).
- **HUD**: `dronesim-gates` chip shows `GATE n/3 · LAPS s` / `TO PAD · LAPS s`
  (React, a few renders per lap); `dronesim-timer` chip is DOM-written on the
  HUD tick (`LAP 12.4s` live / `BEST 45.3s` idle) and exposes
  `data-lap-status`/`data-lap-ms`/`data-best-ms` for tests.

Lap progress is transient (reload/reset restarts at the pad); `score`,
`bestLapMs` and `bestLapPath` persist.

## Cameras (`CameraRig.tsx`)

One default camera (`fov 60`), moved per frame with preallocated temps:

- **`tp` chase** (default): desired = drone pos + yaw-rotated `(0, 2.4, 6)`
  (+Z body = behind), damped per axis (λ = 4), then `lookAt` slightly above
  the drone. The lag is deliberate — it makes yaw and speed readable.
- **`fp` FPV**: rigid at the nose `(0, 0.06, −0.35)`; orientation
  `Euler(tiltPitch·0.6, yaw, 0, 'YXZ')` — partial pitch for feel, **no
  roll** (nausea). Switching modes needs no snap handling: `tp` re-converges
  through its own damping.

## Layout / fullscreen

Root Box: `widget-no-drag` + both `onMouseDown`/`onTouchStart`
stopPropagation (lessons #6), `overflow: hidden` (lessons #4), canvas in an
absolute-inset box (R3F's own resize observer follows react-grid-layout).
Overlays: HUD chip top-left, camera/reset/settings buttons top-right, sticks in the
bottom corners (88 px; 140 px + safe-area insets in fullscreen via
`usePresentation()`). Catalog sets `preferredOrientation: 'landscape'` for
the fullscreen rotate hint; fullscreen re-mounts the single live instance in
the overlay, so there's never a duplicate `useFrame` loop.

## Ground effect / propwash

Always on — a feel layer, not a mode. Descending through the last
`GROUND_EFFECT_HEIGHT` (1.2 u) above whatever surface is directly below —
the ground or a rooftop (found by scanning the colliders under the drone) —
rides an air cushion: the descent rate damps exponentially with proximity,
scaled by `GROUND_EFFECT_STRENGTH` (14, deliberately stronger than the
altitude-hold's `RESPONSE_V` 8 which keeps re-feeding the commanded descent
every frame). A full-down-stick landing touches down at ~1.8 u/s instead of
5. Touchdowns above `BOUNCE_MIN_SPEED` (2 u/s) bounce back at
`BOUNCE_FACTOR` (22 %) instead of stopping dead; softer ones settle. Hard
acro free-falls still thunk, hop once and rest — and can still crash on
roofs. The cushion also makes landing-challenge softness scores a little
friendlier, which is intended.

## Battery / range mode

The battery switch toggles persisted `battery: boolean` (default off). While
on, a HUD bar (top-left, tick-written width/colour + `data-level`) drains at
`0.8 %/s` base plus up to `2.2 %/s` with stick effort — a full charge is
roughly 35–75 s of flying, forcing route planning. **Recharge** (25 %/s)
happens while resting on the spawn pad (landed, inside the pad radius) or on
an active landing-challenge pad — the two modes combine into a
station-hopping game. At `15 %` a one-shot `LOW BATTERY!` warns; at `0 %`
the sticks die (`DEAD_INPUT`: gentle powered descent, no lateral control),
the drone auto-lands wherever it is, and it stays dead until recharged on a
pad (revives at `20 %` with a `RECHARGED!` banner) or rescued by reset
(which always refills). The state machine (`stepBattery`) is pure and
transient — a reload starts full, like the rest of the live sim state.

## Landing challenge

The landing-challenge switch toggles persisted `landing: boolean` (default off).
Three **rooftop pads** are seeded per course (`buildLandingPads`, drawn after
all other world data so existing seeds keep their exact worlds): buildings
6–16 tall with roomy roofs, skipping any that carry antenna/tank details,
pads ≥ 20 apart and ≥ 15 from the spawn pad. Active pads render as pulsing
cyan discs (`LandingPads`) topped by a tall translucent **light beacon**
(open-ended cylinder, no depth write) so they read from anywhere on the map
— the pads sit ≥ 15 units from spawn, and without the beacons switching the
mode on showed nothing in view. They also appear on the minimap. **Touchdown detection**
reuses the collision impact: when an airborne drone settles onto a pad's
roof-rest height inside the disc, `scoreLanding(dist, r, touchdownSpeed)` =
`clamp(100 − 40·dist/r − 6·speed, 10, 100)` — precision and softness both
pay. A `LANDED! 87 pts` banner (+ `NEW BEST!`, persisting `landingBest`,
exposed as `data-landing-best`) and a haptic pulse follow; leaving the pad
re-arms the next attempt. Crash-worthy slams still crash — the detector
lives in the non-crash branch.

## Rich world (scenery layer)

The rich-scenery switch toggles persisted `richWorld: boolean` (default on): roads
with moving traffic dots, ~40 instanced trees, rooftop antennas/tanks on tall
buildings, and slowly drifting clouds. All of it is **seeded** —
`buildWorldLayout` draws the extras from the PRNG stream *after* buildings
and rings, so every pre-existing seed keeps its exact course, and a given
course always grows the same forest. Placement is constraint-checked (trees
never intersect buildings/roads/pad; road lanes pick maximum building
clearance and avoid the pad). Rendering stays cheap: trees are two instanced
meshes (trunks + canopies), roof details one, traffic one (matrices slide
along their road each frame), clouds one (three puffs each, drifting and
wrapping) — about ten extra draw calls total. Traffic and scenery are
non-colliding by design.

## Tuning panel (rates & expo)

The settings panel's Tuning group holds per-widget persisted controls:
`rateSpeed` (×0.5–2, hold-mode target speeds; acro attitude authority — capped
at 0.65 rad — and speed cap), `rateYaw` (×0.5–2), `stickExpo` (0–80%, RC-style
`v' = v(1−e) + v³e`, softening the stick centre while preserving the ends),
and `turbo` (an extra ×1.4 on speed and yaw). The combined speed multiplier is
hard-capped at `MAX_SPEED_MULT` 2.5 — 30 u/s is at most 1.5 u per physics
step, still under the smallest inflated building footprint, so the
no-tunneling guarantee survives any tuning. Everything is applied inside
`stepFlight` via a `Tuning` object (`NEUTRAL_TUNING` default keeps all
positional callers and old tests valid). Faster settings raise crash risk —
`CRASH_SPEED` doesn't scale, deliberately.

## Minimap

A toggleable (persisted `minimap: boolean`, default on, settings-panel switch) top-down
SVG inset at the bottom centre. `viewBox` spans the world bounds with
svgX = worldX / svgY = worldZ, so the spawn heading (−Z) points up. Buildings
render as one group of rects, gates as circles coloured by course state
(gold active / green done / gray upcoming, `data-gate-state` per circle),
the pad as a ring, and the best-lap ghost as a thin polyline reusing
`bestLapPath` (x,z of each triple). The **drone marker** is the only live
element: `DroneRig` writes its SVG `transform`
(`translate(x z) rotate(−yaw°)`) on the 150 ms telemetry tick — flying never
re-renders the map, matching the widget's zero-render input rule. The inset
is `pointerEvents: 'none'` so it can't steal joystick touches.

## Haptics

On browsers with `navigator.vibrate` (Android Chrome; iOS Safari lacks the
API), `haptics.ts` fires capability-gated pulses — a silent no-op elsewhere,
so there is no toggle and no support checks at call sites:

- **Wall/roof contact**: a short buzz scaled with impact speed
  (`min(60ms, impact × 8)`), only above `CONTACT_MIN_IMPACT` (1.5 u/s) and
  rate-limited to one per 250 ms — scraping along a wall re-registers impact
  every frame and would buzz continuously otherwise. Suppressed when the
  impact escalates into a crash.
- **Gate pass**: `GATE_PULSE` [25, 40, 25].
- **Crash**: `CRASH_PULSE` [100, 60, 160].
- **Lap complete**: `LAP_PULSE` [30, 50, 30, 50, 90].

The E2E suite stubs `navigator.vibrate` with a recorder via `addInitScript`
and asserts the exact patterns.

## HUD telemetry (also the test contract)

`DroneRig` writes `ALT x.x m · SPD x.x` (+ `WIND x.x` in storm) into the HUD
element every 150 ms via direct DOM writes, and mirrors the state into
`data-alt/-speed/-x/-z/-yaw/-wind/-crash-state` attributes on
`[data-testid="dronesim-hud"]`; the gate and timer chips expose
`data-gate/-score` and `data-lap-status/-lap-ms/-best-ms`. These attributes
plus the `data-testid` hooks are the widget's **public test contract**.

## E2E test suites (`e2e/`)

`npm run e2e` (optionally `npm run e2e <filter>`) bundles the pure sim
modules with esbuild, starts a dev server, and runs the headless-Chromium
suites — one per feature area (see `e2e/README.md` for the full map).
Flight is driven **closed-loop**
(a P-controller over the telemetry attributes steering CDP touch events);
see `e2e/README.md` for the suite map and environment knobs
(`CHROMIUM_PATH`, `E2E_PORT`). Chromium is launched with
`--enable-unsafe-swiftshader --use-angle=swiftshader` for software WebGL.

## Future work (enhancement backlog)

Everything above is shipped. The backlog below tracks the remaining ideas
from the enhancement menu, with the integration point each would build on.

### Controls & feel
- **Gamepad support** — poll the Gamepad API in the sim loop and map axes
  onto the same `ControlInput` ref; zero changes to the flight model.
- **Keyboard controls** — WASD + arrows writing the same ref (desktop).

### Camera & visuals
- **Chase-camera building avoidance** — the third-person boom can clip
  through walls; sweep the camera offset against `COLLIDERS` (same AABB
  math) and shorten the boom on obstruction.
- **FPV polish** — subtle throttle shake, optional roll in FPV (acro feel),
  horizon indicator.
- **Rain streaks** — upgrade `RainField` points to short line segments.

### Gameplay
- **Animated ghost drone** — replay the best run as a translucent drone
  racing you; `bestLapPath` already carries the positions, add per-sample
  timestamps (or rely on the fixed 150 ms cadence) and lerp along it in
  `useFrame`.
- **Course editor** — hand-placed custom courses; the gate-count setting
  shipped, and `RINGS`/`GATES` stay plain data, so an editor only needs a
  way to author ring specs.

### Simulation depth
*(empty — acro mode and ground effect shipped)*

### Meta
- **Sound** — Web Audio rotor hum pitched by throttle, gate chime, crash
  thud; no asset files needed.
- **Per-weather best laps** — storm laps are inherently slower; split
  `bestLapMs` by weather if fairness starts to matter.
