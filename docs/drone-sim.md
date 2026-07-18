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

**Keyboard** (desktop) mirrors the sticks digitally: `W`/`S` climb/descend,
`A`/`D` yaw, arrow keys forward/back + strafe (`KeyboardEvent.code`, so
layouts don't matter). Keys aimed at an editable element (another widget's
text field) are ignored, and arrows don't scroll the page while flying.
**Gamepad** (standard layout) maps left stick → throttle/yaw and right
stick → strafe/forward, deadzone 0.12 rescaled from the edge like the
on-screen sticks, polled every frame in the sim loop.

All three sources write the same shared `ControlInput` ref
(`externalInput.ts`), so the flight model, acro mode, tuning and the manual
operator walk take every source for free. Arbitration is **last active
source wins**: an external source only writes while past its deadzone /
keys held, and on going idle writes zeros exactly once and hands back to
touch — a polled-but-idle pad can never stomp the joysticks. The HUD
reports the live source as `data-input-source` (`touch`/`keyboard`/
`gamepad`).

Top-right buttons — only three, deliberately: camera cycle (`tp` chase →
`fp` FPV → `los` standing pilot → `walk` walking pilot → back; persisted),
reset (back to the landing pad, transient), and a settings gear that opens
the **settings panel** (below). Every mode toggle lives in the panel, not in
the button row.

## Settings panel (`SettingsPanel.tsx`)

A portaled MUI `Dialog` (the ConfirmDialog pattern — works at any widget
size, scrolls when short). Each mode is a labelled switch row with a
one-line description, grouped by concern:

- **Gameplay**: Acro flight mode, Crash & respawn, Landing challenge,
  Battery mode.
- **Environment**: Storm weather, Rich scenery, Minimap.
- **Tuning**: the speed/yaw/expo sliders and the Turbo switch (formerly a
  separate popover).
- **Pilot**: the follow-distance slider (5–18, default 7) — how far the
  walking pilot stands back from the drone — and the FPV-feel switch
  (camera bank + shake + horizon in first person, default off). No confirm
  guard; nothing is destroyed.
- **Course**: the gates-per-lap slider (3–6, seeded courses only — disabled
  while a custom course is active), the **Course editor** button (below),
  the seeded↔custom source switcher (shown once a custom course exists),
  and the New course action button. Everything that rebuilds the course
  destroys the recorded best (and any lap in progress), so it all routes
  through the same confirm guard.
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
- Release doesn't rely solely on a local `pointerup`/`pointercancel`/
  `lostpointercapture` reaching the element: a window-level capture-phase
  `pointerup`/`pointercancel` fallback, plus `blur`/`visibilitychange`
  handlers, force-release the stick if the tab loses focus mid-drag or the
  browser drops the event — otherwise a missed release event sticks the
  knob forever and locks that stick out of further input (see
  `docs/lessons.md` #39). None of those cover a foregrounded mobile tab
  where OS gesture arbitration (a long-press callout, or scroll/rubber-band
  arbitration at the `touch-action` boundary) silently drops capture with
  *no* event at all — a 400ms interval polls the ground-truth
  `Element.hasPointerCapture(pointerId)` and force-releases if it ever goes
  false while still tracked, with no false-positive risk for a long,
  stationary hold. The hit area also sets `WebkitTouchCallout: 'none'` and
  suppresses `contextmenu` to stop the long-press callout from triggering
  in the first place (see `docs/lessons.md` #40).
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

## Course editor (hand-placed custom courses)

**Fly & drop**: the editor has no placement UI of its own — you build the
course by flying it. The Course-group **Edit** button closes the panel and
opens a top-centre toolbar (`dronesim-editor`, `data-count`): fly anywhere
with any input source and press **Drop gate** — a ring appears at the
drone's exact position, altitude and heading (`flight.pos`/`yaw` from the
live ref). Undo removes the last gate; Save needs 2–8 gates; Cancel
discards the draft.

- **Validation on drop** (`validateGateDrop`, pure): ≥ 6 from the spawn
  pad, ≥ 5 from every other draft gate, height 2–30 — rejects show a
  banner and add nothing. Buildings are NOT checked: you flew there, so
  the gate is reachable by construction.
- **While editing**: the draft renders through the ordinary `GateRings`
  (all rings "upcoming", `activeGate = -1`) and the minimap; `DroneRig`
  receives an empty gates array, so nothing scores and the 0-gate "lap"
  falls into the silent re-arm rule.
- **Data model**: persisted `courseMode: 'seed' | 'custom'` +
  `customRings` (flat x,y,z,yaw quadruples rounded 0.1 — the
  `bestLapPath` style, junk-safe via `parseRings`). A custom course
  overrides only `rings` + derived `gates` (`ringsToGates`, shared with
  the seeded path); buildings, colliders, scenery and landing pads stay
  seed-driven. Course data is not a "setting": Reset settings leaves it
  alone.
- **Interplay**: saving, switching source, and the seed shuffle (which
  always returns to the seeded course) all clear laps/best/ghost through
  the shared confirm guard; the gate-count slider applies to seeded
  courses only and is disabled under custom. The stored custom course
  survives switching away, so seeded↔custom flips freely. Everything
  downstream (chip `GATE n/N`, minimap, sequencing, return-to-pad,
  best-lap ghost) keys on `gates.length` and needed no changes.

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

One default camera (base `fov 60`), moved per frame with preallocated temps.
The view button cycles `tp → fp → los → tp` (persisted `view`):

- **`tp` chase** (default): desired = drone pos + yaw-rotated `(0, 2.4, 6)`
  (+Z body = behind), damped per axis (λ = 4), then `lookAt` slightly above
  the drone. The lag is deliberate — it makes yaw and speed readable.
  **Wall avoidance**: every frame the drone→camera segment is swept against
  the building colliders (`boomClipT`, a pure slab-method segment/AABB test
  in `flightModel.ts`) and the boom shortens to just ahead of the first hit
  (margin 0.4 so the near plane never clips the wall, floor 0.8 so it never
  sits inside the drone). The *damped* position is what gets clamped, so no
  wall can come between drone and camera, and when the obstruction clears
  the damper re-extends the boom on its own. The live boom length is
  mirrored as `data-boom` on the HUD (throttled) — the test contract for
  the `15-chasecam` suite.
- **`fp` FPV**: rigid at the nose `(0, 0.06, −0.35)`; orientation
  `Euler(tiltPitch·0.6, yaw, 0, 'YXZ')` — partial pitch for feel, **no
  roll** (nausea). Switching modes needs no snap handling: `tp` re-converges
  through its own damping.
  **FPV feel** (persisted `fpvPolish`, default OFF — the roll-free default
  stays the nausea-safe one): with the Pilot-group switch on, the fp camera
  banks with the drone (`roll = −tiltRoll·0.8`), gains a subtle speed-scaled
  shake (sum-of-sines pseudo-noise, no `Math.random`), and a DOM
  **artificial-horizon** overlay (`dronesim-horizon`, mounted only in
  fp+on) counter-rolls/pitches against the camera — its transform and
  `data-roll` are written by `CameraRig` every frame, never via React.
- **`los` pilot view (line of sight)**: you *are* the operator — the eye is
  planted at a figure standing beside the pad (`OPERATOR` (3.2, 0, 23),
  eye 1.55; the spot sits inside the spawn-corridor / tree / road exclusion
  zones so it's clear on every seed) and tracks the drone with a damped
  look (λ = 10 — quick but human, not servo-rigid). The fov narrows with
  distance (65 → 22 over ~78 u, damped λ = 3) so the drone stays legible
  across the map — the squint-into-the-distance feel of real line-of-sight
  flying. Leaving `los` eases the fov back to 60. The operator figure
  (`OperatorFigure.tsx`, simple primitives holding an RC transmitter)
  renders in `tp`/`fp` and hides in `los`/`walk` — the camera stands at its
  eyes.
- **`walk` walking pilot**: the same operator, on the move. A pure
  mutate-in-place module (`operatorWalk.ts`, the `lapTimer` pattern) steps
  the op each frame: beyond the follow distance + `FOLLOW_BAND` (3) it
  walks toward the drone's ground position, stopping inside the follow
  distance — hysteresis, no jitter. The stop radius is the persisted
  `followDist` (5–18, default 7, the Pilot slider in settings): a high
  hover close-up is a neck-craning look-up, so stand further back if you
  prefer the wider angle. **`WALK_SPEED` is hard-capped at 2.2 u/s** (~18 % of the drone's
  top speed): losing sight of a fast drone is the intended trade-off, not a
  bug. The op slides along building walls (the collision push-out on x/z,
  point + `OP_RADIUS`) — no pathfinding. The camera is the `los` eye at the
  op's position plus a small step-bob; both views share ONE operator state,
  so switching views never teleports anyone, and reset returns the op to
  its spot. HUD publishes `data-op-x/-op-z/-op-mode`; the minimap shows an
  operator dot.
  A **pilot chip** (top centre, `data-pilot`) differentiates the operator
  views at a glance: `PILOT · STANDING` (los), `WALKING (FOLLOWS DRONE)`,
  `HOLDING POSITION`, `AUTO RESCUE` or `MANUAL WALK`. Its text/colour is
  written by `DroneRig` on the telemetry tick (the timer-chip pattern),
  because the rescue state lives in refs and never re-renders React.
  The **autopilot button** (walk view only, 4th inline button, person icon)
  means two things depending on the drone:
  - *Drone flying*: **hold position** — the follow autopilot freezes and the
    op stands wherever it currently is (the sticks keep flying the drone, so
    you can re-plant the standing pilot at a new vantage and fly from
    there). Transient (root mirrors `data-op-hold`), cleared by reset.
  - *Drone down (retrieve/carry)*: **manual walk** — the drone's sticks are
    `DEAD_INPUT`, so they drive the operator instead, first-person: left
    stick turns (X, the drone's yaw convention, `OP_TURN_RATE` 2.2) and
    pitches the look (Y, clamped ±`MAX_PITCH`); right stick walks along the
    facing (Y) and strafes (X) — body-relative, capped at `WALK_SPEED`. The
    camera obeys `heading`/`pitch` directly (free FPS look, fov pinned) —
    tour the world on foot, and pickup/place still fire by proximity, so
    you can grab the drone and deliver it to the pad yourself. HUD adds
    `data-op-heading`.
  **Drone rescue**: with battery mode on, when the drone dies *at ground
  level* (roofs are unreachable on foot — reset remains that rescue), the
  walking op switches to `retrieve`, walks over, picks the drone up within
  `PICKUP_DIST` (banner), **carries** it at hand height back to the spawn
  pad and places it — the ordinary on-pad recharge then revives it. That
  autopilot runs whenever the toggle is off; engage it any time to take
  over on foot, disengage to hand the job back. Once retrieving/carrying,
  the op finishes the job even if you switch views.
  While auto-carrying, the camera looks down the walking path (staring at a
  drone half a metre from the eyes fills the screen with fuselage), and
  physics is paused for the drone (impact 0, velocity zeroed — no crash,
  landing, or lap side-effects; recharge is disabled in-hand so revival
  happens on the pad, not mid-carry).

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
pad (revives at `20 %` with a `RECHARGED!` banner), carried back to the pad
by the walking operator (see the `walk` view — the in-fiction rescue), or
rescued by reset (which always refills). The state machine (`stepBattery`) is pure and
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
*(empty — gamepad + keyboard shipped)*

### Camera & visuals
- **Rain streaks** — upgrade `RainField` points to short line segments.

### Gameplay
- **Animated ghost drone** — replay the best run as a translucent drone
  racing you; `bestLapPath` already carries the positions, add per-sample
  timestamps (or rely on the fixed 150 ms cadence) and lerp along it in
  `useFrame`.

### Simulation depth
*(empty — acro mode and ground effect shipped)*

### Meta
- **Sound** — Web Audio rotor hum pitched by throttle, gate chime, crash
  thud; no asset files needed.
- **Per-weather best laps** — storm laps are inherently slower; split
  `bestLapMs` by weather if fairness starts to matter.
