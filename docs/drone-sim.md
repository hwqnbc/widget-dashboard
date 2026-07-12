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

Top-right buttons: camera toggle (`tp` chase ↔ `fp` FPV, persisted) and
reset (back to the landing pad, transient).

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

### Weather (storm mode)

The cloud/sun button toggles persisted `weather: 'clear' | 'storm'`. Storm
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
shield/fire toggle button) an impact ≥ `CRASH_SPEED` (8 u/s) triggers a
crash: full-tilt horizontal flight is 12 while max vertical is 5, so
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
  course across reloads. The **new-course button** (shuffle icon) re-rolls
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

A lap runs **pad → gate 1 → 2 → 3 → back to the pad**, timed from the moment
the drone leaves the landing-pad radius (`lapTimer.ts`, a pure mutate-in-place
state machine like `stepFlight`, clocked by `performance.now()`).

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
Overlays: HUD chip top-left, camera/reset buttons top-right, sticks in the
bottom corners (88 px; 140 px + safe-area insets in fullscreen via
`usePresentation()`). Catalog sets `preferredOrientation: 'landscape'` for
the fullscreen rotate hint; fullscreen re-mounts the single live instance in
the overlay, so there's never a duplicate `useFrame` loop.

## HUD telemetry (also the test hook)

`DroneRig` writes `ALT x.x m · SPD x.x` into the HUD element every 150 ms via
direct DOM writes, and mirrors the numbers into `data-alt`/`data-speed`
attributes on `[data-testid="dronesim-hud"]`. Headless verification drives
the sticks with synthesized pointer/touch events and asserts on those
attributes (climb, altitude hold, inertia braking, simultaneous multi-touch
via CDP `Input.dispatchTouchEvent`, reset, view persistence). Launch headless
Chromium with `--enable-unsafe-swiftshader --use-angle=swiftshader` for a
software WebGL context.

## Future work

- Gamepad support (map axes onto the same `ControlInput` ref).
- Chase-camera building avoidance (the camera can clip through geometry).
- Animated ghost drone replaying the best run (the persisted path already
  carries the data; timing would need per-sample timestamps).
