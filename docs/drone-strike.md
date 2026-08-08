# Drone Strike — FPV drone shooting game

The dashboard's second WebGL widget: an FPV wave shooter built on the Drone
Sim's flight model and seeded city. You fly the same quadcopter, but the
goal is combat — put the fixed centre reticle on a target ("fly to aim"),
hold fire, clear the wave, survive the later waves' return fire.

## Controls

Designed mobile/iPad-first (twin-stick + FPV reticle is the standard mobile
shooter layout — PUBG/CoD Mobile style), with full desktop support.

| Input | Touch | Desktop |
| --- | --- | --- |
| Throttle / yaw | left stick | `W S` / `A D` |
| Move (pitch/strafe) | right stick (hover mode: aims the gimbal) | arrow keys |
| Aim the gun | **drag the scene** to slew the weapon gimbal; double-tap recenters | left-mouse **drag** (a click still fires); double-click recenters |
| Fire | **fire button** above the right stick (hold = continuous) | `Space`, left-mouse **click**, or gamepad RT/RB |
| ADS / zoom | **scope button** above the fire button (tap = toggle) | hold `Shift` or right mouse; gamepad LT (hold) |
| Fine aim (optional) | **gyro**: tilt the device a few degrees — Off / Zoom only / Always | — |

Key decisions:

- **Gimballed weapon aiming (three modes).** Real armed drones separate
  flying from aiming — the MQ-9's pilot flies while a sensor operator slews
  a gimballed targeting turret that can look steeply down ([MQ-9 crew &
  MTS-B targeting pod](https://en.wikipedia.org/wiki/General_Atomics_MQ-9_Reaper)),
  and gunship games + the [PUBG-standard "drag the free screen to aim"](https://play.google.com/store/apps/editorial?id=mc_editorial_evergreen_post_install_pubg_mobile_improve_your_controls_now_fcp)
  follow the same split. The gun rides a virtual gimbal (`gimbalModel.ts`):
  yaw ±60°, pitch **+20°…−70°** (the deep look-down that makes ground
  targets and fast movers reachable — impossible with the old tiny FPV
  pitch follow). Dragging the free scene area slews it (`DRAG_SENS`, halved
  while scoped); double-tap/double-click recenters. Settings' **Aim
  control** switches four modes to compare (persisted `aimMode`, default
  Classic):
  - **Classic** (default): the original fly-to-aim — the gimbal is frozen
    at boresight, drag does nothing, and neither soft-track nor
    idle-recenter run. The gun points straight out the nose, reticle fixed
    dead-centre. Aim assist still does its original work (wider lock cone +
    bolt-bend on a locked shot); it just never moves the reticle. The
    calmest, most predictable feel — nothing grabs your aim.
  - **Reticle**: the camera stays flight-locked and the reticle
    moves across the view to where the gun points — you keep full sight of
    where you're flying.
  - **Gunner**: the camera itself slews with the gimbal (the sensor-operator
    screen), reticle centred.
  - **Hover**: gunner camera + the right stick becomes the gimbal aim while
    the drone holds position (altitude-hold) — the two-crew feel, one
    control at a time.
- **Soft track on lock** (gimbal modes only — not Classic). Once the
  reticle acquires a lock (and aim assist ≠ off), the gimbal gently follows
  the velocity-led target within its arc
  (`trackToward`, `TRACK_RATE`×`{mild .5, strong 1}`) — the sensor
  operator's track mode, which is what actually makes fast-evading enemy
  drones hittable. You still acquire the lock and fire; manual drag layers
  on top; it disengages with the lock. Gyro fine-aim now nudges the gimbal.
- **Return to boresight.** With assist on, when nothing is locked and you
  haven't aimed for `RECENTER_DELAY_MS`, the gimbal eases back to centre
  (`recenterGimbal`) — a gimbal camera resting to boresight, so the reticle
  never stays stranded in a corner after a tracked kill. Assist `off`
  leaves the aim entirely yours; a held drag or hover stick counts as aiming.
- One `aimAngles` composition (flight yaw + tilt follow + gimbal + gyro,
  arc-clamped) feeds the fire path, the lock cone, the reticle projection
  and the gunner camera alike, so bolts land exactly on the reticle in
  every mode.
- **Fire button + auto-fire.** The dedicated button (own pointer capture +
  the joystick's full release hardening — a silently stuck trigger would
  drain the gun invisibly) suits skill play; the settings' **auto-fire**
  fires whenever the reticle holds a lock ≥120 ms, so casual players never
  lift a thumb. Both share one cooldown — auto-fire is a convenience, not a
  rate buff.
- **Responsive control layout.** The stick/fire/scope sizes derive from the
  widget's measured height (ResizeObserver on the root; `stick =
  clamp(72, 0.28·h, 88|140)`, fire/scope proportional), and fire + scope
  sit in a column **inward of the right stick** — the layout consumes
  width (which landscape always has), never height. The original fixed
  fullscreen sizes stacked the fire button onto the top toolbar on an
  iPhone's ~330 px landscape viewport and pushed the scope button
  off-screen; suite `106-strike-mobile` pins the fix on a phone-sized
  viewport. Toggling full screen **preserves the live game** — the board
  reparents this one widget instance between its card and the overlay rather
  than remounting it, so the flight, wave and score keep running across the
  toggle (see `docs/fullscreen.md`; `118-fullscreen-continuity`).
- **Aim assist** (off/mild/strong) sets the lock cone (`AIM_CONE_RAD`,
  widened by each target's angular size, occlusion-checked) and how far a
  fired bolt bends toward the locked target (`bendAim`) after first-order
  target leading (`leadPoint`). Magnetism bends the **bolt**, never the
  camera — the player never feels steering theft. The reticle turns amber
  and expands on lock.
- **ADS / zoom** (FPV only; the scoped state itself is transient — never
  persisted). Tap-to-toggle on touch (the PUBG/CoD convention — no third
  held finger); hold Shift / right-mouse / gamepad LT on desktop. Scoped:
  the camera eases `BASE_FOV` 60° → the scoped FOV, the yaw rate and the FPV
  pitch follow scale down together, and the assist cone swaps to the
  ~half-size `AIM_CONE_RAD_ZOOM` row. The camera and the fire path both go
  through `fpvPitchGain(zoom, mode, zoomSens)` so the bolt always goes
  exactly where the reticle points. The reticle grows a heavier scoped ring;
  leaving FPV drops the scope.
  - **Adjustable zoom power** (settings `zoomPower`, persisted, **default
    2×**; 1.5× / 2× / 3×). The magnification drives both the FOV
    (`zoomFovFor(p) = BASE_FOV / p` → 40° / 30° / 20°) and the aim
    sensitivity (`zoomSensFor(p) = 1 / p`), so a stronger zoom sees further
    and aims proportionally finer while the *feel* (screen-space aim speed)
    stays constant across powers. `data-zoom-power` on the root is the
    setting; 2× reproduces the original fixed scope bit-for-bit. The scoped
    assist cone is independent of power (a lock-leniency concern, not a
    magnification one).
- **Gyro fine-aim** (settings, mobile only) — three modes: **Off / Zoom
  only / Always**. "Zoom only" attaches the sensor just while scoped (the
  classic beginner scope-gyro). Device tilt writes a clamped
  (`GYRO_MAX_OFFSET` 0.15 rad) yaw/pitch offset into the shared `AimOffset`
  read by both the camera and the fire path, on top of stick flight. It is
  never injected into `ControlInput` — that would fight the altitude-hold
  physics and the input-source arbitration. iOS 13+ needs
  `DeviceOrientationEvent.requestPermission()` from a user gesture: the
  settings mode-button tap is that gesture; denial keeps it off with helper
  text; the row hides entirely where the API is missing. The persisted
  field is still the `gyroAim` key — the old boolean coerces (`true` →
  `'always'`) so existing widgets migrate with no data change. The neutral
  pose creeps toward the current grip, so drift self-recentres. **Not
  e2e-testable** — verify on a real device (set a mode, tilt, watch the
  reticle; in "Zoom only" the tilt must act only while scoped).

## Gameplay

Wave-based, seeded (`buildWave(seed, waveIndex, layout)` — its own
mulberry32 stream per wave, independent of the world stream):

**No appearance ramp — every target kind can appear from wave 1.** There is
no per-kind wave gate; the easing comes from (a) the **difficulty** preset
(enemy count/orbit/evade + the return-fire wave), (b) a **wave-scaled enemy
throttle** (`enemyAggressionScale` — wave 1 ≈ 30 %, full by ~wave 5, so early
drones crawl and barely juke), and (c) the **return-fire gate** (enemies +
turrets **hold fire on wave 1** on every difficulty — Easy arms at wave 7,
Normal 5, Hard 4). So wave 1 is a gentle full-variety wave, not a bare gallery.

| Wave | Content |
| --- | --- |
| 1 | the full mix, gentle: static balloons + drifting ring-drones + a moving military truck + a moving SWAT car + **1 throttled, non-firing enemy drone** + **1 non-firing AA turret** + **1 non-firing rooftop-patrol soldier** |
| 2–4 | same kinds, ramping — more/faster enemies (throttle climbs), more road vehicles, up to 2 turrets, up to 2 soldiers (rooftop pacers + a ground patrol from wave 3) |
| 5+ | enemies + turrets + soldiers return fire (Normal/Hard; Easy at 7); enemy throttle at full; player has 3 HP per wave attempt |
| scaling | more/smaller balloons (cap 8), up to 4 enemies, 4 trucks + 3 cars + 2 turrets + 3 patrolling soldiers (rooftop + ground), `MAX_TARGETS` 28 |

**Ground targets** (unlocked by the gimbal's −70° look-down): deck-level
kinds mixed into the gallery. **Military supply trucks** (`ground`, 20 pts,
one hit) are **moving road vehicles from wave 1** — like the SWAT cars they
drive the city's lanes (see the road-vehicle model below), rendered as the
**`MilitaryTruck`** model (the primitive-built army cargo truck reused from
the Model Viewer widget) via `GroundTargets` (the shared `ModelTargets`
pool, `faceVelocity` + `animate` so the wheels spin as it drives). As a
representative target it uses the model's **`lowSpec`** render — cheap
opaque glass (no physical transmission, which runs a costly full-scene pass
**per** transmissive object and would tank software-GL / mobile framerates
with several trucks on screen), a matte finish (no specular glints) and no
decorative head/roof lights — while the Model Viewer keeps the full-quality
look. Their count is difficulty-independent (drawn before the enemy block). **AA turrets** (`turret`,
30 pts) appear from wave 1 — a *static ground enemy*: `stepTurret` is the
return-fire half of `stepEnemy` with no movement, lobbing slow unled bolts
up the player's line of sight (dodgeable), gated by the same difficulty
preset as the drones (HP + the shared return-fire wave — so they **hold fire
on wave 1** and only open up from the difficulty's fireWave). Turrets render as
the **`AaTurret`** model (the primitive-built emplacement reused from the
Model Viewer widget) via `TurretTargets` — a small pool of model instances
seated on the deck (the `EnemyDrones` pattern). The head + barrel **track
the player**: `TurretTargets` feeds each model an optional `aimRef` (the
bearing + elevation from the emplacement to the drone), which `AaTurret`
slews its head yaw and barrel elevation toward (clamped to the gun's arc),
so the gun visibly points where `stepTurret` shoots. (Omitting `aimRef` —
as the Model Viewer does — keeps the canned scan sweep.) The turret renders
in the model's `lowSpec` mode too (matte, no specular) — it has no
transmission/emissive so it was already cheap, but the knob keeps every
game-target model uniform (see the low-spec convention in `CLAUDE.md`). **SWAT cars** (`car`, 25 pts, one hit) are the other **wave-1 road
vehicle**, rendered as the **`LegoSwatTruck`** model via `CarTargets` (the
same `ModelTargets` pool) — also in the model's `lowSpec` render (opaque
windshield, matte finish, static non-emissive lightbar), so both in-game
vehicles stay light while the Model Viewer keeps the full-quality look. **Road-vehicle model (shared by trucks + cars):**
a `placeRoadVehicle` helper puts each vehicle on one of the world's seeded
`roads` with a random direction, start offset and **wave-scaled** speed
(gentle ~2.5–5 u/s in wave 1 — a fair intro to leading — ramping to ~4–8 by
wave 5), and a shared `laneSlot` allocator spreads trucks and cars across
the lanes instead of stacking. `stepDrift`'s road branch drives every road
vehicle with `RichWorld`'s decorative-traffic formula
(`along = ((offset + dir·speed·t) mod span) − WORLD_HALF` at the road's
fixed cross-coord), so they ride the visible roads and wrap at the far
edge; the published velocity is the constant travel speed (not a per-frame
delta), so shot leading stays correct across the wrap. Both kinds are
difficulty-independent (placed before the difficulty-gated enemy block);
count and hp of the turrets follow the preset. All use the normal pos+radius hit sphere, so the
fire sweep / lock / scoring paths are unchanged. Ground targets are easiest
in Reticle/Gunner (the gimbal looks down); in Classic you nose-down or
descend — and the car needs leading on top.

**Patrolling soldiers** (`soldier`, 40 pts) are the highest-value threat and a
distinctive one — they reuse the game's **weaponized avatar 3D models as
in-game enemies** and **patrol on the move**. Two things vary per soldier, both
seeded into the wave spec: its **weapon `variant`** (0 = Bazooka Joe, which
**launches a rocket**; 1 = Scar, which fires **SMG bursts** — model and weapon
always agree, assigned by order so wave 1's lone soldier is the rocketeer) and
where it patrols — a building **rooftop** or the open **ground**.

*Placement* — the first ⌈count/2⌉ soldiers are **rooftop pacers**, the rest
**ground patrols**; a wave with ≥2 fields both. Rooftop placement is bespoke
(unlike every other kind they sit *on* a building, so `buildWave` bypasses
`clearOfBuildings`): pick a fair sentry perch (height ~5–16, a footprint the
figure fits on, away from spawn), seat the torso at `b.h + 0.9`, and pace along
the roof's longer axis with the half-beat clamped so the boots never leave the
roof (a roof too small to pace becomes a standing sentry). Ground patrols walk a
**free-roam route anywhere on open ground** — a sampled centre + a diagonal
line or a loop (see *Movement*) whose *whole* span (a line's two endpoints, or a
loop's ring) is validated clear of buildings (so the route never enters a wall —
it is deliberately **not** bound to the road lanes the vehicles use), seated at
torso height `0.9`. hp follows the difficulty preset; count clamped small (≤3).

*Movement* is a seeded route in `stepDrift`'s soldier branch (no bespoke step
function; runs for every target before the fire dispatch, so a moving soldier
fires from its current position with no extra wiring). Two route shapes,
`routeKind` + `routeAngle` on the target:
- **line** — paces back & forth around `base` along a heading `dir = (cos,
  sin)(routeAngle)`; `pos = base + dir·sin(phase)·amp`. Rooftop pacers are an
  axis-aligned line (heading along the roof's longer axis, half-beat clamped to
  the roof); ground patrols are a **diagonal** line (any heading).
- **loop** — circles the anchor: `pos = base + (cos, sin)(phase)·amp`; ground
  patrols pick this or a diagonal line at random.
Both write the true velocity derivative (leading stays correct). The angular
rate is `SOLDIER_WALK_SPEED / amp`, so the *linear* pace is a constant
believable walk (~1.3 u/s) regardless of beat or loop size. A too-small roof
falls back to `driftAmp = 0` — a standing sentry.

A **rocket soldier halts to fire** (see *Kneel to fire*): while its
`plantTimer > 0` (set by `stepTurret` around each rocket shot), `StrikeRig`
skips `stepDrift`, zeroes the velocity, and accumulates the paused seconds into
`driftHold` — which `stepDrift` subtracts from its clock, so the patrol
*resumes from where it froze* instead of jumping ahead. The halt is thus a pure
offset on the deterministic route, not a separate motion path.

*Legs actually walk* — the shared **leg-gait rig** (`characters/shared/legGait`)
gives the patrol a real stride, not just a body-bob. Each leg is a hip-pivot
group (`[±0.14, 0.5, 0]`, meshes offset −0.5 in y); the model advances a
`walkPhase` by the live ground speed (`AimPose.speed`, written by
`SoldierTargets`) and swings the two hips in opposite phase, amplitude scaled by
speed so the stride eases to neutral at the turnarounds. It composes with
Bazooka Joe's kneel: the gait fades out as the soldier slows to a firing plant
while the kneel fades in (they simply sum on the hips through the brief
overlap). Any avatar can adopt the rig via the documented hip-pivot convention
(see `docs/avatars.md`).

*Aim & fire* — you see the soldier **aim its weapon and shoot**, not a beam from
the torso. `StrikeRig` dispatches `soldier` through the shared `stepTurret`
(gated by the return-fire wave, so they **hold fire on wave 1** and arm from the
difficulty's fireWave), passing the variant's weapon: `SOLDIER_ROCKET` (slow
~16 u/s — visibly incoming and dodgeable) or `SOLDIER_SMG` (fast bursts). The
shot spawns from a **muzzle offset** (forward + up of the torso), and the model
plays a firing pose: `SoldierTargets` writes a per-slot **aim ref**
(`{ pitch, fire }`) each frame — `pitch` elevates the weapon toward the drone,
`fire` (the target's `fireTimer` normalised) drives the model's recoil / muzzle
flash (Scar) or launch + backblast (Bazooka Joe) in its own `useFrame` (a
zero-render path, the `AaTurret` `aimRef` precedent). The rocket itself is a
real projectile: `SOLDIER_ROCKET` tags its `Projectile.visual = 'rocket'`, so
`Tracers` skips it and **`EnemyRockets`** draws a warhead + glowing exhaust
flying at you, trailing a **persistent world-space smoke contrail** (puffs left
hanging along the flight path, fading a beat after the rocket passes — the
incoming-missile read); SMG bolts stay the tracer box.

*Kneel to fire* (Bazooka Joe) — a rocketeer **halts and drops onto the launcher
knee** to loose its rocket. `stepTurret` plants it (`soldierPlantHold`, rocket
variant only) a beat before the shot — a windup so the kneel *precedes* the
launch — and holds it through; `StrikeRig` freezes the patrol while planted (see
*Movement*), so the soldier reliably stops, kneels, fires, then stands and walks
on. The kneel pose reuses the same leg-fold / body-drop / brace-hand stance as
the widget's "Take Aim" action but **not** its weapon-shouldering choreography
(the live tube keeps tracking the drone, so `shoulderK = aimRef ? 0 : kneelK`
gates that part off in-game). The stance is a tiny pure driver,
`characters/shared/kneelStance` `stepKneel(state, fire, speed, dt)`: it holds the
kneel `KNEEL_HOLD` (1 s) past each shot so it reads as a firing pose rather than
a per-shot twitch, and scales it out with ground speed (`KNEEL_WALK_SPEED`
0.8 u/s) — so a soldier caught firing on the move (an SMG Scar, which never
plants) stays upright. Extracting both drivers (like `legGait` / `stepDrift`) is
what lets the soldier suite assert the plant + kneel off-canvas.

*Rendering* is via **`SoldierTargets`** — the shared `ModelTargets` pool with
its `onFrame` hook overriding the deck Y so the boots plant on the surface
(roof `b.h` or ground `0` — the same `t.pos.y - 0.9` seats both) plus a subtle
**walk bob** while moving (position-derived, no leg gait — the operator-figure
trick), arbitrating the single body yaw between **travel direction while
walking** and **the player while firing** (slewed shortest-arc), writing the aim
ref, and toggling which of the two per-slot models (Bazooka / Scar) is visible
by the assigned target's `variant` (so the model always matches the weapon, even
if a sibling soldier dies and the pool compacts). The avatar `Model3D`s are
low-spec by construction (only
`meshStandardMaterial`, no transmission), so the only cost is draw calls — hence
the small pool and the direct `lazy(() => import(...))` of each model (three.js
stays out of the main chunk, the same discipline `avatarRegistry` uses; the
pool does **not** import through the registry).

**Enemy difficulty** (settings, persisted `difficulty`, **default Easy**)
scales only the AI drones — the gallery targets are untouched. The presets
(`DIFFICULTY` in `waveLayout.ts`) tune orbit speed, the evade burst
(intensity + duration), enemy HP, enemy count cap and the return-fire
wave:

| | orbit | evade burst | evade time | HP | cap | return fire |
| --- | --- | --- | --- | --- | --- | --- |
| Easy (default) | 0.4× | 1.4× | 0.7 s | 1 | 2 | wave 7 |
| Normal | 1× | 2.6× | 1.2 s | 2 | 4 | wave 5 |
| Hard | 1.3× | 3× | 1.4 s | 2 | 4 | wave 4 |

The evade burst is the big lever: pointing your reticle at an enemy within
~45 u makes it reverse + speed up, which on Normal (2.6×) is what made
them "impossible" — Easy nearly halves it and shortens it, and one hit
kills. `buildWave(seed, wave, layout, difficulty)` threads count/HP/
fire-wave while keeping placement seeded identically; the live orbit/evade
scaling is applied in `stepEnemy` (so a mid-game difficulty change takes
effect immediately on movement, and next wave for HP/count).

Scoring: balloon 10, drifter 15, ground truck 20, enemy 25 (2 HP), AA
turret 30. Session score and wave
are runtime-only; `bestScore`/`bestWave` persist (written at wave-clear).
Losing all HP fails the wave — banner, then the same wave restarts with
fresh targets and HP; the session score survives (arcade-friendly). Restart
and city-shuffle are confirm-guarded once there is progress.

**Crash mode** (on by default, toggleable): a hard wall impact
(`CRASH_SPEED`, the sim's threshold) tumbles the drone (`stepCrash`,
controls and gun dead, no enemy-bolt hits while tumbling), **costs one
heart**, and respawns it on the pad. The counterweight is the pad itself:
**resting on the spawn pad mid-wave restores one heart per 3 s** — the
survival valve for the harder waves, since fast-evading enemies make
clean sweeps difficult. Healing works on **every wave** (not just the
armed ones); it needs a missing heart, a live wave, and actually resting
on the pad (altitude < 1.2 inside the pad circle). The hearts row shows
whenever hearts can change (crash mode on, or enemies shooting from
wave 5).

**The pad is a marked safe zone.** A pulsing ring + light column
(`SafePadRing`, driven by a shared state ref — cyan breathing when idle,
green and faster while occupied) makes the pad read as live, and a status
chip appears while resting: `SAFE ZONE · WEAPONS OFF · ♥ CHARGING/FULL`.
While resting there, **enemies hold their fire and bolts already in
flight pass through you — but your own gun is offline too** (the pad is
for resting, not sniping). All of it keys off one `onPad` predicate in
the rig (`data-safe` on the HUD, `data-pad-state` on the chip). The
enemy-fire immunity was verified against a live armed build (ENEMY
constants temporarily 1): immune + weapons off on the pad, hit within
seconds off it, healed while immune on return; the committed suites
assert the safe-zone contract itself.

Taking a hit flashes a red **damage vignette** around the screen edge
(imperative style writes from the hit path — the horizon-overlay pattern,
zero React renders), and the last heart keeps a faint constant red edge.
`data-flash` on `strike-damage` counts the flashes and `data-low-hp`
mirrors the edge — the live behaviour was verified against real enemy fire
on a dev build with `ENEMY_FIRE_WAVE` temporarily set to 1 (enemies already
spawn from wave 1; flash count tracked the hp loss exactly, the edge
appeared at one heart and reset on the wave restart); the committed suites assert the
at-rest contract, since reaching wave-5 fire closed-loop is impractical.

**Sound effects** (settings toggle `audio`, **default on**): synthesized
with the Web Audio API — **no asset files**. A reusable engine lives in
`../droneSim/webAudio.ts` (`tone`/`noise`/`unlockAudio`, a shared
lazy `AudioContext` through a master gain, degrading to a silent no-op when
the API is missing — the `haptics.ts` pattern), and the strike's palette is
`strikeSounds.ts`: a **fire** chirp (pitched by the weapon cooldown), a
**pop** on a kill (airy for balloons, a metallic clank for drones/trucks/
turrets), a soft **hit** tick on a non-lethal shot, a two-tone **alert** the
frame an enemy or turret shoots at you, an ascending **clear** sting on
wave-clear, and a low **crash** thud on a wall hit or a bolt connecting.
Browsers block audio that starts without a user gesture, so `DroneStrikeBody`
resumes the context on the first interaction (a capture-phase window
`pointerdown`/`keydown`/`touchstart` listener, so a child's
`stopPropagation` on the sticks never hides it). The rig fires each voice
imperatively at its game event and bumps a monotonic per-effect counter,
published on the telemetry tick as `data-sfx-fire/-pop/-hit/-alert/-clear/
-crash`; `data-audio` (on the root) is the mute state. That counter contract
is what the e2e suite asserts — the dispatch path, not the inaudible output.

## Architecture

`src/components/widgets/droneStrike/` mirrors the Drone Sim architecture:
an eager `DroneStrikeWidget` shell lazy-loads `DroneStrikeBody` (three/R3F
stay chunk-split), all high-frequency state lives in shared mutable refs
(zero-render input path, lesson #29), telemetry is throttled 150 ms `data-*`
writes (the e2e contract, lesson #31), and the game logic is pure,
allocation-free, seeded modules (lesson #30).

**Imported as-is from `../droneSim/`** (pure/stable modules already pinned
by the sim's own e2e suites): `flightModel` (`stepFlight`, `boomClipT` —
the segment-vs-city slab test doubles as the bullet occlusion ray),
`worldLayout` (`buildWorldLayout`), `externalInput`, `VirtualJoystick`,
`haptics`, `webAudio` (the synthesized-SFX engine, first used here),
`palettes`, `WorldScene`, `RichWorld`, `RainField`,
`DroneModel`. **Copied/adapted, not imported**: camera rig, sim loop,
minimap, settings panel — they encode gameplay. If a third drone widget
ever appears, hoist the shared pure modules to a `shared/` folder then;
two consumers didn't justify destabilising the sim's imports.

New pure modules:

- `combatModel.ts` — pooled projectiles (`MAX_PLAYER_PROJECTILES` 24 /
  `MAX_ENEMY_PROJECTILES` 16), `stepProjectiles` sweeps each bolt's
  **segment prev→pos** per frame: `boomClipT` vs buildings, a ground-plane
  crossing, `segmentSphereT` vs targets (and vs the player for enemy
  bolts); earliest `t` wins, hits land in a reused `HitEvents` ring. A
  point test would tunnel — bolt speed 55 × `MAX_DT` 0.05 = 2.75 m/step.
  Aim assist (`findLockTarget`/`bendAim`/`leadPoint`) lives here too.
- `waveLayout.ts` — seeded wave specs + the pre-allocated `TargetState`
  pool (`loadWave`, `stepDrift`). Placement rejection-samples clearance
  against the buildings including each target's whole drift/orbit envelope.
- `enemyAI.ts` — orbit patrol (the wave seeds radius/rate/phase into the
  drift fields, so placement already validated the envelope — orbits can
  never clip a building), evade (reverse + speed burst + vertical jink when
  the reticle settles on them inside 45 m), and line-of-sight-checked,
  unled (dodgeable) return fire with staggered cooldowns.
- `gyroAim.ts` — sensor plumbing described above.
- `aimModel.ts` — the shared `AimOffset` (gyro + recoil) and view types.

Components: `StrikeRig` (the `useFrame` loop: input → flight → targets/AI →
fire intent → sweeps → events → wave-clear → pose → telemetry),
`StrikeCameraRig` (FPV + chase with the boom clip), `Targets` (one
InstancedMesh of spheres for the balloon/ring-drone gallery), `ModelTargets`
(the shared generic model-target pool: a fixed pool of groups, per-frame
slot assignment for one `kind`, deck seating, optional face-velocity and an
`onFrame` aim seam — see below), `GroundTargets`
(≤4 `MilitaryTruck` models — reused from the Model Viewer widget — parked
supply trucks on the deck, via `ModelTargets`), `CarTargets`
(≤3 `LegoSwatTruck` models via `ModelTargets`, wheels-on-deck, yawed into
travel), `TurretTargets`
(≤2 `AaTurret` models, seated on the deck, self-scanning + player-tracking
`aimRef`), `SoldierTargets`
(≤3 patrolling soldiers rendered from the **Scar / Bazooka Joe avatar
`Model3D`s** via `ModelTargets`, its `onFrame` hook seating the feet on the
surface (roof or ground) + walk bob, arbitrating body yaw between travel and
the player, aiming the weapon + firing pose via a per-slot aim ref, and toggling
the visible model by the target's weapon `variant`; movement is the seeded
`stepDrift` sinusoid, no bespoke step; the models are `lazy`-imported directly
so three.js stays out of the main chunk),
`EnemyDrones`
(≤4 `DroneModel`s with red beacons, slot-assigned per frame), `Tracers`
(one InstancedMesh for all bolts, oriented along velocity — skips
rocket-`visual` enemy shots), `EnemyRockets`
(soldier rockets: a warhead + exhaust per active `visual: 'rocket'` enemy
projectile oriented along velocity, plus a **persistent world-space smoke
contrail** — one `<points>` cloud, single draw call, puffs dropped at the
positions the rocket flew through and left hanging in the air, fading + growing
by age via a tiny inline `alpha`-attribute shader; keyed by the stable
enemy-pool index so a reused slot resets its own trail),
`SparkField`
(muzzle flashes + impact showers: the pure `sparkModel.ts` pool — a fixed ring
of `SPARK_BURSTS` bursts × `SPARK_PER` particles in flat arrays, spawned by
the rig at the fire site and at every player-fire hit point (targets AND
world) plus enemy world impacts, with **deterministic per-index jitter**
(golden-angle azimuth, no `Math.random` — e2e can assert exact state); drawn
as one `<points>` call with the EnemyRockets `alpha`-attribute shader recipe
plus a custom `tint` colour attribute; enemy hits on the *player* deliberately
spark nothing — the damage vignette is that feedback),
`Reticle`/`FireButton`/`HitMarkers`/`StrikeMinimap`/`StrikeSettingsPanel`.
The rig's player-fire consequences (sparks for every impact, damage/score/sfx
for targets) are one `applyPlayerHitEvent` closure — the seam any future
hitscan weapon feeds its hits through.

### Weapon variants (recorded, not built)

`WeaponSpec` is pure config `{kind, speed, cooldown, gravity, maxRange,
tracerLen}` — the shipped `BOLT` is one instance. Two variants are already
representable with **no rewrite**:

- **`laser` (hitscan)**: resolve the entire `origin → origin + dir·maxRange`
  segment on the spawn frame through the same `boomClipT`/`segmentSphereT`
  path — instant hit, render as a brief beam instead of a moving tracer.
- **`ballistic`**: set `gravity > 0`; the integrator already applies it
  (`vel.y -= gravity·dt`). Pair with a trajectory hint if it ever ships —
  pure gravity drop frustrates on touch.

## Test contract (data-*)

Root `drone-strike-root`: `data-world-seed/-view/-auto-fire/-aim-assist/
-gyro/-minimap/-weather/-rich/-aim-mode/-difficulty/-audio/-zoom-power`. HUD
`strike-hud` (150 ms tick):
`data-x/-z/-alt/-yaw/-speed/-wave/-wave-state(intro|active|cleared|failed)/
-score/-shots/-hits/-targets-left/-lock/-proj/-enemy-proj/-hp/
-input-source`, the **sound-effect counters**
`data-sfx-fire/-pop/-hit/-alert/-clear/-crash`, the monotonic spark-burst
count `data-sparks`, plus the
**nearest-alive-target beacon** `data-tgt-x/-y/-z/-kind` that lets suites
aim closed-loop without window globals. Chips: `strike-score` (`data-score/-wave/-best-score/-best-wave`),
`strike-hp`, `strike-reticle` (`data-lock`), `strike-fire`
(`data-pressed`), joysticks/buttons/settings testids mirror the sim's.

E2E: suites `100-strike-core` … `109-strike-ground` plus `117-strike-audio`,
`119-strike-soldiers` and `123-strike-sparks`
(see `e2e/README.md`); pure modules are esbuild-bundled for the suites in a
second flat pass in `run.mjs`.

## Future work (enhancement backlog)

Everything above is shipped. The backlog below tracks remaining ideas, with
the integration point each would build on (the drone-sim doc keeps the same
kind of list).

### Controls & feel
- **Left-handed / mirrored layout** — a settings toggle that swaps the
  stick roles and moves the fire button to the left thumb; mobile-shooter
  research says always offer mirroring. Pure layout work in
  `DroneStrikeBody` (the sticks/`FireButton` are already position-props).
- ~~ADS / zoom mode~~ — **shipped** (scope button / Shift / right mouse /
  LT, 2× FOV, halved sensitivity, tighter cone, gyro "Zoom only" mode; see
  Controls above).
- **Gyro recenter button** — `recenterGyro` is exported and unused so far;
  surface it next to the gyro mode buttons for players whose grip drifted.
- ~~Adjustable zoom power~~ — **shipped** (settings `zoomPower` 1.5× / 2× /
  3×, default 2×; `zoomFovFor`/`zoomSensFor` scale FOV and sensitivity
  together — see Controls above). Room to extend: push the top end to 4× for
  the long-range ground targets, or swap the stepped toggle for a slider if
  finer control is wanted.

### Weapons
- **Hitscan laser** — already representable as a `WeaponSpec` (resolve the
  full `origin→maxRange` segment on the spawn frame); render as a brief
  beam (`Tracers` instance stretched to the hit point) and balance with a
  heat meter instead of a cooldown.
- **Ballistic lob** — `gravity > 0` in the existing integrator; ship it
  with a trajectory-hint arc (a `GhostLine`-style polyline sampled from the
  same integration) or it will frustrate on touch.
- **Weapon switching / pickups** — per-wave weapon crates on rooftops
  (LandingPads-style discs); the rig already takes `weapon` as a prop, so
  switching is a state change in the body.
- ~~Muzzle flash + impact sparks~~ — **shipped** (the pure `sparkModel.ts`
  burst pool + `SparkField` single-draw-call Points renderer: a muzzle flash
  on every shot, impact showers at `HitEvent` coordinates — targets, world,
  and enemy world impacts; deterministic per-index jitter so the suite
  asserts exact state; see the architecture section).

### Enemies & waves
- ~~Ground-target waves~~ — **shipped** (deck-level supply trucks (rendered
  as the `MilitaryTruck` model via `GroundTargets`), AA turrets (`stepTurret`,
  rendered as the `AaTurret` model via `TurretTargets`), and road-bound
  **moving cars** (`stepDrift` road-traffic branch, rendered as the
  `LegoSwatTruck` model via `CarTargets`) — all from wave 1 now; the payoff
  the gimbal look-down unlocked — see the Gameplay section). All three model
  kinds share the generic `ModelTargets` pool.
  Room to extend: **tents/depots** as further static kinds; a
  **convoy** (several cars nose-to-tail on one lane, phase-offset); letting
  cars **turn at intersections** (hop lanes where two roads cross); and
  distinct **model variants** per ground kind now that the Model Viewer
  catalog is a home for primitive vehicles.
- ~~Avatar-soldier ground enemies~~ — **shipped** (rooftop-stationed
  soldiers rendered from the Scar / Bazooka Joe avatar `Model3D`s via
  `SoldierTargets`, from wave 1, firing via the shared `stepTurret` gated by
  the return-fire wave — see the Gameplay "Rooftop soldiers" section). The
  pattern this proved: an avatar `Model3D` reused as a *multi-instance* enemy
  — resolve the lazy component **outside** the registry (direct
  `lazy(() => import(...))` so three.js stays out of the main chunk), one
  `<Suspense>` per pool slot, cap the pool small (the cost is draw calls, the
  materials are already low-spec), and drive rooftop-Y + player-facing from
  `ModelTargets`' `onFrame` hook.
- ~~Soldiers visibly aim & fire, weapon-matched~~ — **shipped** (each soldier
  is a `variant`: Bazooka Joe launches a rocket — a real `visual: 'rocket'`
  projectile drawn by `EnemyRockets` with a warhead + smoke streak — or Scar
  fires SMG bursts; both **elevate the weapon** toward the drone and play a
  **firing pose** via the model's new `aimRef` (`{ pitch, fire }`), and the
  shot spawns from a **muzzle offset**, not the torso — see "Patrolling
  soldiers"). Room to extend:
  - ~~walking-patrol soldiers~~ — **shipped** (soldiers now patrol: rooftop
    pacers walk their roof, ground patrols walk a free-roam beat anywhere on
    open ground; movement is the seeded sinusoidal `stepDrift` — no bespoke
    step — with body yaw facing travel while walking / the player while firing
    and a position-derived walk bob; see "Patrolling soldiers"). This also
    covered the old **deck-level squads** idea (ground soldiers beside the
    trucks/turrets). Room to extend further:
  - ~~persistent smoke trail~~ — **shipped** (`EnemyRockets` drops a
    world-space puff contrail — a per-rocket ring buffer of past positions in
    one `Points` cloud, faded by age with an inline shader — so the smoke line
    hangs along the flight path and lingers after the rocket passes; see the
    `EnemyRockets` architecture note);
  - **more avatars / a mix** — widen the pool beyond Scar/Bazooka Joe (any
    registered `Model3D` works, e.g. Gold Gunner) and let a wave seed which
    avatar patrols where, with a matching projectile per weapon;
  - ~~real leg gait~~ — **shipped** (`characters/shared/legGait` — a hip-pivot
    leg-swing rig; now adopted by **all nine** avatar `Model3D`s (a shared
    `walk` action), driven by ground speed via `AimPose.speed` for the soldiers
    and a canned `WALK_ACTION_SPEED` for the widget/operator; see *Movement*);
  - ~~diagonal / looping routes~~ — **shipped** (`routeKind`/`routeAngle`:
    ground patrols walk a diagonal line or a circular loop, rooftop pacers an
    axis-aligned line; all in `stepDrift`'s soldier branch);
  - ~~operator gait~~ — **shipped** (the Drone Sim RC operator strides its legs
    via the shared rig — `OperatorFigure` passes `action="walk"` while Player
    1's avatar is moving; see `docs/drone-sim.md`);
  - ~~kneel to fire~~ — **shipped** (a Bazooka Joe soldier **halts** to fire —
    `stepTurret` plants it a beat before each rocket (`soldierPlantHold`) and
    `StrikeRig` freezes the patrol via `plantTimer`/`driftHold` — then drops onto
    the launcher knee, holds it briefly, and stands + walks on; the pure
    `characters/shared/kneelStance` `stepKneel` + `soldierPlantHold` drivers,
    asserted by the soldier suite; see *Kneel to fire* / *Movement*). The same
    treatment could extend to a Scar crouch;
  - **turning gait / waypoint loops** — legs swing but feet still slide on the
    turns; foot-planting (IK) and multi-segment waypoint routes are the next
    fidelity step.
- **Enemy variety** — a *chaser* that pursues the player (waypoint =
  player position, capped speed, `resolveCollisions` for safety), a
  *kamikaze* that dives once locked, a *shielded* drone only hurt from
  behind (dot product of hit direction vs heading — the `HitEvent` already
  carries the impact point). Each is one more `stepEnemy` mode.
- **Boss wave every 5th** — one large multi-HP drone with weak-point
  spheres (extra `Hittable`s attached to its pose) and a health bar chip.
- **Combo scoring** — consecutive hits without a miss multiply points;
  `combat.shots/hits` already tracks the stream, add a decaying multiplier
  in the rig and show it on the score chip.
- ~~Difficulty setting~~ — **shipped** (Easy default / Normal / Hard
  scaling enemy orbit speed, evade burst, HP, count and return-fire wave;
  `DIFFICULTY` presets in `waveLayout.ts` — see the gameplay section).

### Camera & visuals
- **Kill-cam slow-mo** — on the wave-clearing kill, damp the frameloop dt
  scale briefly and swing the chase camera at the exploding target.
- ~~Damage vignette~~ — **shipped** (red edge flash per hit + constant
  faint edge on the last heart; see Gameplay above).
- **Kill explosion** — instanced sprite/particle burst where a target
  dies (same pooled one-shot system as muzzle flash).
- **FPV polish reuse** — the sim's opt-in camera bank + speed shake
  (`fpvPolish`) ports straight into `StrikeCameraRig`.

### Sim-setting ports
The Drone Sim's settings were audited for reuse (its storm weather, rich
scenery, minimap and the three flight-tuning sliders already shipped here).
**Shipped from this audit**: ~~acro flight mode~~ (`flightMode` toggle —
`stepFlight`'s acro branch; in acro `fpvPitchGain` returns 1.0, so the FPV
camera follows the real nose and pitching the drone IS the vertical aim),
~~turbo~~ (`TURBO_BOOST` stacked under the `MAX_SPEED_MULT` clamp), and
~~battery mode~~ (`stepBattery` + spawn-pad recharge + the sim's bar UI;
charge carries across waves — recharging on the pad between waves is the
gameplay — and a dead battery auto-descends via `DEAD_INPUT` **and can't
power the gun** while enemies keep shooting).

~~Crash mode~~ — **shipped** (tumble + pad respawn at the sim's
`CRASH_SPEED`, costs a heart, fire and enemy hits suspended during the
tumble; paired with the pad's heart recharge — see Gameplay above). That
completes the audit's portable list.

Audited and **not** applicable: gate count / course editor / course source
(racing), the landing challenge, and follow distance + the standing/walking
pilot views (operator-specific). FPV polish is tracked above under Camera &
visuals.

### Meta
- ~~Sound~~ — **shipped** (Web Audio, no assets: fire chirp pitched by
  cooldown, target pop, incoming-fire alert, wave-clear sting, crash thud;
  `webAudio.ts` engine + `strikeSounds.ts` palette — see the Gameplay
  section). Room to extend: a throttle-pitched rotor hum (the drone-sim
  backlog's idea, now that the engine exists), and the pre-warning variant
  of the alert (fire it as `fireCooldown` crosses a threshold, not at the
  shot, for genuine reaction time).
- **Accuracy stats** — persist per-run accuracy (`hits/shots`) alongside
  `bestScore`; show on the best chip.
- **Daily seed run** — a "today's city" mode seeding `worldSeed` from the
  date (computed in the body, never inside the pure modules) so households
  can compare scores on the same campaign.
