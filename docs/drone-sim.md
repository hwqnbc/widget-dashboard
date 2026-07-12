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

Buildings are fly-through in v1; `worldLayout.ts` keeps each building as a
plain `{x, z, w, d, h}` spec so a future collision pass can treat them as
AABBs. Speeds: `MAX_HORIZ_SPEED 12`, `MAX_VERT_SPEED 5` world-units/s.

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
  `useLayoutEffect`), landing pad, 3 decorative gate rings (future scoring).
  ~10 draw calls total.
- Layout is deterministic: a seeded mulberry32 PRNG runs once at module load
  (the purity rule bans randomness in reducers/`defaultWidgetData`, not
  here), keeping the spawn corridor and pad clear and letting headless tests
  rely on a stable world.
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

- Building AABB collision (`worldLayout` specs are ready).
- Ring/gate scoring, timers, best-lap persistence (`data` keys slot in
  without migration).
- Gamepad support (map axes onto the same `ControlInput` ref).
