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
| ADS / zoom | **scope button** at the top of the fire column (tap = toggle) | hold `Shift` or right mouse; gamepad LT (hold) |
| Switch weapon | **weapon chip** between fire and scope: **swipe up/down to scroll** the 5 guns (wrapping), tap = next | `1–5` direct-select, or **mouse-wheel** over the chip |
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
| 2–4 | same kinds, ramping — more/faster enemies (throttle climbs), more road vehicles, up to 2 turrets, up to 2 soldiers (rooftop pacers + a ground patrol from wave 3); **a flying jet-trooper gunner from wave 2**; **from wave 3 the last enemy of every wave is a kamikaze chaser** |
| 5+ | enemies + turrets + soldiers return fire (Normal/Hard; Easy at 7); enemy throttle at full; **from wave 5 the first enemy of every wave is a shielded drone (only hurt from behind)**; player has 3 HP per wave attempt |
| every 5th (5, 10, 15…) | **BOSS WAVE** — the normal mix PLUS the boss gunship (weak-point pods, health bar; see below) |
| scaling | more/smaller balloons (gallery cap 6 — trimmed to fund the jets), up to 4 enemies, **up to 2 jet troopers (the last a skyline strafer from wave 4)**, 4 trucks + 3 cars + 2 turrets + 3 patrolling soldiers (rooftop + ground), `MAX_TARGETS` 28 |

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
(intensity + duration), enemy HP, enemy count cap, the return-fire
wave and the kamikaze chase speed:

| | orbit | evade burst | evade time | HP | cap | return fire | chase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Easy (default) | 0.4× | 1.4× | 0.7 s | 1 | 2 | wave 7 | 0.75× |
| Normal | 1× | 2.6× | 1.2 s | 2 | 4 | wave 5 | 1× |
| Hard | 1.3× | 3× | 1.4 s | 2 | 4 | wave 4 | 1.2× |

The evade burst is the big lever: pointing your reticle at an enemy within
~45 u makes it reverse + speed up, which on Normal (2.6×) is what made
them "impossible" — Easy nearly halves it and shortens it, and one hit
kills. `buildWave(seed, wave, layout, difficulty)` threads count/HP/
fire-wave while keeping placement seeded identically; the live orbit/evade
scaling is applied in `stepEnemy` (so a mid-game difficulty change takes
effect immediately on movement, and next wave for HP/count).

**Kamikaze chaser** (from wave 3): the **last-seeded enemy of every wave**
is a chaser (`variant: 1` — index-derived, so the seeded rand stream is
untouched), marked by an **orange beacon** (orbiters stay red) and a
speed-proportional nose-down pursuit tilt. It **lurks** on a normal orbit
until the player flies inside `CHASER_RANGE` (60 u), then **commits**
(`ai.locked` — it never resumes its patrol): straight-line pursuit at
`CHASER_SPEED` (7 u/s × the difficulty's `chaseMult` 0.75/1/1.2 × the wave
aggression scale), climbing straight up when a building blocks the path
(each step is clipped with `boomClipT`, so it can never clip through), and
**detonating on contact** (< `CHASER_CONTACT_R` 1.2 u): one heart, an
impact spark burst, crash SFX/vibration and a recoil kick — no score (the
kill is denied, not banked). Shooting it down early pays **35 points** (vs
25). Chasers never return fire — the ram *is* the weapon. The pad stays a
sanctuary: while the player is pad-safe a locked chaser **hovers in place**
(it must not fall back to the absolute orbit write, which would teleport it
back onto its ring — see lessons.md).

**Boss wave** (every `BOSS_EVERY` 5th wave — 5, 10, 15…): a single oversized
**boss gunship** joins that wave. It *joins*: the boss is appended as the
very LAST consumer of the wave's seeded stream (after even the crate), so
adding bosses moved no other placement on any wave — waves 1–4 and every
other target of wave 5 are byte-identical to the pre-boss campaign (the
append-only rule, lesson #54; suite 135 asserts it rather than assuming it).

Movement is free: `stepEnemy`'s guard accepts `'boss'`, so the boss rides the
plain **orbiter patrol** seeded through the usual drift fields — a slow, wide
(radius 10–14), high (`maxRoofH + 4..6`, ~22–24 u) circuit above the skyline,
evading the reticle like any drone and answering with a heavier
**`BOSS_BOLT`** (18 u/s on a 1.2 s cadence, still unled and LOS-gated) once
the difficulty's return-fire wave has passed.

What makes it a boss is the **damage model**: its hull is **armour**. Every
shot that lands on bare hull deflects (spark + shell flash + the metallic
clank + `data-deflects`, no damage/score/combo — the shielded drone's path),
and damage only lands inside one of **three weak-point pods** riding a
horizontal ring around the hull (`bossModel`: `BOSS_POD_COUNT` 3,
`BOSS_POD_RING` 1.9 with `BOSS_POD_RADIUS` 0.85, so the pods bulge visibly
past the 2.2 hull and each covers a ±22° cap of it). The ring **spins**
(`BOSS_SPIN` 0.6 rad/s), so a firing position is only good while a pod sweeps
through your bearing — and because the pods sit at hull height you have to
climb roughly **level** with the boss (the ceiling is `MAX_ALT` 40, so that's
always possible) instead of plinking it from below. Each pod has
`bossPodHp(wave, difficulty)` hit points (Easy wave-5 3, Normal/Hard 4,
climbing one per boss fought); a spent pod goes **dark, shrinks and turns
inert** — hits there deflect too, so you must keep repositioning to a live
one. The boss's own `hp` is seeded as the aggregate (pods × podHp), which
means the ordinary shared damage path (`t.hp--` → kill → score × combo) kills
it exactly when the last pod is spent, with no bespoke death code.

Two details make it honest:
- **The pods you see are the pods you can hit.** `podPhase` is written once
  per frame by the rig (single writer); `BossDrone` positions its pod meshes
  with the same pure `podCenter` the rig's `podHitAt` resolves impacts
  against, in the boss group's *unrotated* local frame (only the hull child
  takes the travel yaw), so no rotation convention can drift the drawn pods
  away from the hittable ones.
- **Aim assist is retargeted.** `leadPoint`/`bendAim` (and the gimbal soft
  track) normally aim at a target's *centre* — which on an armoured boss is
  the one place shots do nothing, so at the default assist the boss would be
  unkillable. Both now aim at `nearestLivePod(...)` for boss targets (see
  `docs/lessons.md`).

Feedback: a **health bar** across the top (`strike-boss`, mounted on boss
waves, rig-written from hp/hpMax — purple → amber → red, hidden the moment
the boss dies) plus `data-boss-active/-hp/-pods`, a fat purple minimap blip,
a `WAVE n — BOSS` intro banner, and the crash rumble under the pop when it
finally goes down for **`BOSS_POINTS` 150** (×combo).

**Shielded drone** (from `SHIELD_FROM_WAVE` 5): the **first-seeded enemy of
every wave** is SHIELDED (`variant: 2` — index-derived like the chaser, so
the seeded rand stream gains no draws and waves 1–4 stay byte-identical; the
chaser stays LAST, so both coexist from wave 5). It flies the **normal
orbiter AI** — the puzzle is positional, not behavioural: its front dome
**deflects the player's fire**, and only shots arriving **from behind**
(travelling WITH its heading) damage it. The gate is the pure
`shieldBlocks(dx, dy, dz, vel)` (combatModel): every `HitEvent` now carries
the **normalized shot direction** (written by `stepProjectiles` from the
live bolt velocity at impact — so a curving homing missile is judged by the
direction it actually arrived on — and by `fireHitscan` from the beam
direction), and a hit is blocked when its direction · heading <
`SHIELD_REAR_COS` (0.15 — the small positive margin keeps pure side-on hits
deflecting too). A **stalled drone has no facing, so the shield falls open**
(no infinite-shield edge case). The rig's single shared damage path
(`applyPlayerHitEvent`) checks the gate before `hp--`: a deflect gives full
feedback — the impact spark burst, a shell flash (`hitFlash` without
damage), a metallic **deflect clank** (deliberately unlike the damage tick)
and the monotonic HUD `data-deflects` — but pays **no damage, no combo, no
score and no accuracy credit**, which is the tell that teaches *get behind
it*. Identification stack (it must read at a glance): a **bigger airframe**
(`SHIELD_RADIUS` 0.8 hit sphere vs 0.6, honestly matched by a 1.33× render
scale), the **blue beacon** (vs red orbiter / orange chaser), a translucent
**blue front half-dome** showing exactly the covered arc — the uncovered
tail is the weak side — and a **blue minimap blip** (enemy blips are
variant-aware). Flanking it pays **`SHIELD_POINTS` 45**, the top drone
bounty.

**Jet troopers** (from `JET_WAVE` 2): the **Jet Trooper avatar airborne** as
a second flying enemy beside the AI drones — a **flying gunner**. Up to two
per wave (`min(1 + ⌊(wave−2)/3⌋, 2, enemyCap)`, difficulty-gated) hover-
strafe on a seeded horizontal sinusoid (the generic `stepDrift` branch —
placement validates the whole strafe envelope against the buildings, so a
jet can never clip), jets burning and legs trailed via the model's `aimRef`
flying-gunner stance. To the fire AI a jet is a **turret that drifts**: the
same `stepTurret` step (LOS + range gated, staggered cooldowns, hold-fire
until the difficulty's return-fire wave, pad sanctuary respected) firing the
**`JET_BEAM`** — a hot red bolt, faster than the drone/turret bolt (24 vs
14 u/s, harder to dodge at range) on a slow deliberate cadence — from a
raised muzzle at the beam gun's dish. The body yaws into travel while
strafing and snaps to the player while firing (the soldier arbitration);
30 points, hp by difficulty. The gallery was trimmed (`min(2+wave, 6)`,
was `3+wave/8`) to fund the airspace.

From `STRAFER_FROM_WAVE` (4) the **last jet of each wave is a strafing-run
variant** (`variant: 1`, **40 points** — harder to hit, pays more): instead
of hovering it flies **long fast passes above the skyline**. No new
movement code — a *stretched* sinusoid IS a strafing run (amp 16–22 u:
peak `amp·driftSpeed` ≈ 9–15 u/s through the middle, decelerating into a
natural turnaround at each end). `place()`'s square envelope could never
clear a 20 u amp between buildings, so strafers get a bespoke seeded lane
at `maxRoofH + 2..4` (~19–22 u — above every roof, no building test
needed, still comfortably flyable), bounds- and spawn-distance-checked.
The renderer leans the figure forward with speed (`min(0.4, speed·0.03)` —
the chaser-tilt recipe), so a streaking strafer reads as a diving pass
while a hoverer stays near-level; wave 4 fields a lone strafer, waves 5+
one hoverer + one strafer.

Scoring: balloon 10, drifter 15, ground truck 20, enemy 25 (2 HP),
jet trooper 30 (strafer 40), kamikaze chaser 35, shielded drone 45,
AA turret 30, **boss gunship 150**. **Combo
scoring**: each kill bumps a chain and refreshes a `COMBO_WINDOW` (5 s)
timer — the multiplier paid on a kill is `min(chain, COMBO_MAX)` (first
kill ×1, a second inside the window ×2, capped ×4); the chain dies when
the window expires or the player takes ANY damage (enemy bolt, kamikaze
contact, crash — `resetCombo` at all three rig sites). Kill-chain-plus-
timer (not miss-breaks-chain) keeps it weapon-neutral: shotgun pellets
and laser ticks can't break a chain, only time and damage do. The pure
model lives on `CombatState` (`comboKill`/`stepCombo`/`resetCombo` —
restart resets via `resetCombatState` for free); the score chip shows
`· ×N` while a chain is ≥ ×2 and the HUD publishes `data-combo`. **Every
`MILESTONE_SCORE` (500) session points pays a bonus heart** (uncapped, the
crate-heart stacking rule) — the mechanical use of scoring: kills and
score-cache crates alike are deferred healing. The rig's 150 ms tick runs
the pure `milestoneHearts` tracker on the session score (it sees every
score source and self-resyncs after a restart, since the score drops below
the paid line), pays through the body (banner + the pickup chime) and
publishes `data-milestones`. Session
score and wave
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
  the reticle settles on them inside 45 m), line-of-sight-checked,
  unled (dodgeable) return fire with staggered cooldowns, and the
  **kamikaze chase mode** (`variant === 1`): lurk-on-orbit →
  `ai.locked` pursuit integrated toward the player with per-step
  `boomClipT` clipping (blocked → climb straight up) → hover while the
  player is pad-safe (`canChase=false`). Note the seam: the orbit is an
  **absolute parametric write** (base + cos/sin) while pursuit **integrates
  pos** — a locked chaser must never fall back to the orbit branch or it
  teleports back onto its ring. Contact detonation lives in the rig.
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
so three.js stays out of the main chunk), `JetTargets`
(≤2 flying jet troopers rendered from the **Jet Trooper avatar `Model3D`**
via `ModelTargets` — the SoldierTargets recipe airborne: y overridden onto
the air hit-sphere, travel-vs-player yaw arbitration, a per-slot `AimPose`
whose mere presence puts the model in its flying-gunner stance — jets
burning, legs trailed, beam elevated by `pitch`, flash by `fire`; ~130
meshes, so the pool cap matches the wave's own jet cap),
`EnemyDrones`
(≤4 `DroneModel`s slot-assigned per frame, beacon tinted by variant — red
orbiter / orange kamikaze chaser / blue shielded, with a pursuit nose-tilt;
a shielded drone renders at 1.33× — matching its 0.8 hit sphere — under a
translucent blue front half-dome that flashes on each deflect via
`hitFlash`), `BossDrone` (the boss gunship: a 3.2× hull yawing into travel
plus the three weak-point pods positioned every frame by the shared
`podCenter`/`podPhase` — live pods glow and flash, spent ones go dark and
shrink), `Tracers`
(one InstancedMesh for all bolts, oriented along velocity — skips
rocket-`visual` shots in both pools), `EnemyRockets`
(**pool-generic despite the name** — mounted once for the enemy pool
(soldier RPGs) and once for the player pool (homing missiles): a warhead +
exhaust per active `visual: 'rocket'` projectile oriented along velocity,
plus a **persistent world-space smoke contrail** — one `<points>` cloud per
mount, single draw call, puffs dropped at the positions the rocket flew
through and left hanging in the air, fading + growing by age via a tiny
inline `alpha`-attribute shader; keyed by the stable pool index so a reused
slot resets its own trail),
`SparkField`
(muzzle flashes + impact showers: the pure `sparkModel.ts` pool — a fixed ring
of `SPARK_BURSTS` bursts × `SPARK_PER` particles in flat arrays, spawned by
the rig at the fire site and at every player-fire hit point (targets AND
world) plus enemy world impacts, with **deterministic per-index jitter**
(golden-angle azimuth, no `Math.random` — e2e can assert exact state); drawn
as one `<points>` call with the EnemyRockets `alpha`-attribute shader recipe
plus a custom `tint` colour attribute; enemy hits on the *player* deliberately
spark nothing — the damage vignette is that feedback),
`LaserBeams` (hitscan beams, instanced boxes fading by thickness),
`TrajectoryArc` (the lob's live aim hint — see "Player weapons"),
`WeaponCrates` (the rooftop pickup disc + beacon, driven from the shared
`CrateState` in useFrame — zero renders),
`Reticle`/`FireButton`/`HitMarkers`/`StrikeMinimap`/`StrikeSettingsPanel`.
The rig's player-fire consequences (sparks for every impact, damage/score/sfx
for targets) are one `applyPlayerHitEvent` closure — the seam any future
hitscan weapon feeds its hits through.

### Player weapons

`WeaponSpec` is pure config `{kind, speed, cooldown, gravity, maxRange,
tracerLen}`; the **settings weapon picker** (Combat list, `strike-weapon`,
persisted `weapon` field, root `data-weapon`) selects among `WEAPON_SPECS`,
and the same pick is switchable **mid-game** via the **weapon chip**
(`WeaponChip`, `strike-weapon-chip`) sitting between the fire and scope
buttons: swipe up/down on it to scroll the `WEAPON_IDS` order one notch per
`STEP_PX` (28 px, wrapping — a long swipe scrolls several), tap to cycle,
mouse-wheel over it to step, or press `1–5`. Every path writes the SAME
persisted `weapon` field. The chip inherits the joystick/fire-button
pointer-capture hardening; note the tap-to-cycle decision lives in the
window **capture-phase** pointerup fallback (which fires before the
element's own handler and clears the pointer id — lesson #95):

- **`bolt`** (default) — the classic fast tracer (`BOLT`): leading matters,
  drawn by `Tracers` (whose `tracerLen` now follows the equipped spec, falling
  back to BOLT's for the shared enemy pool when the spec has none).
- **`laser` (hitscan)** — `fireHitscan` resolves the ENTIRE
  `origin → origin + dir·maxRange` segment on the spawn frame through the
  same `boomClipT`/ground/`segmentSphereT` tests the projectile sweep uses
  (earliest hit wins; at most one hit per shot, so the outcome is a scratch
  `HitscanResult`, not the events ring — the rig feeds it through the shared
  `applyPlayerHitEvent` path). Balanced by **heat, not fire rate**: heat lives
  on `CombatState` (`addHeat` +7/shot, `stepHeat` −26/s, latch at 100 that
  only clears at `HEAT_RESET` 30 — battery-style hysteresis + events, the
  body banners OVERHEATED / LASER READY). The cooldown (0.09 s) is a real
  fire *tick*, never 0 — per-frame fire would make DPS and heat gain
  frame-rate-dependent. A cyan **heat bar** (`strike-heat`, same recipe as
  the battery bar, stacked below it) fills 0→100 and turns red while
  overheated; beams are drawn by `LaserBeams` (instanced boxes stretched
  muzzle→hit, fading by THICKNESS — instancing can't fade opacity per
  instance), and each shot plays a dedicated `playZap` voice (`data-sfx-zap`).

- **`lob` (ballistic)** — `LOB` sets `gravity > 0` and the existing integrator
  does the rest (`stepProjectiles` already applies `vy −= gravity·dt`): a
  slow (28 u/s), heavy-cadenced (0.5 s) shell that **arcs** — aim above the
  target. Because pure gravity drop frustrates on touch, it ships with the
  **`TrajectoryArc` hint**: a translucent polyline sampled by the pure
  `sampleTrajectory` (the SAME integration a live shell flies, so the drawn
  arc IS the flight path), fed by an **`aimRay`** the rig publishes every
  frame (muzzle + fire direction — reusing the real gimbal/aim-mode solution
  instead of duplicating it). Unlike `GhostLine` (memo-rebuilt), the arc's
  buffer is fixed-length and mutated + `setDrawRange`d per frame. Two known
  limitations, accepted: the arc shows the *unassisted* ray (assist bend/lead
  only apply at fire time on a locked target), and `leadPoint`'s
  straight-line flight-time assumption undershoots moving targets with the
  lob.

- **`shotgun`** — one trigger pull fans **7 pellets** through the ordinary
  projectile integrator/sweep: pellet 0 flies true, the rest ring the aim
  axis via the pure, deterministic `pelletDir` (golden-angle azimuths +
  index-jittered radii, no `Math.random`), capped at the spec's `spread`
  half-angle (0.09 rad). Each pellet does bolt damage — a point-blank fan can
  multi-hit one target — balanced by short range (45) and a slow 0.9 s pump
  (with extra recoil kick). Stats count PULLS, not pellets, so accuracy stays
  meaningful. The fan is generic spec config (`pellets`/`spread` on
  `WeaponSpec`) — any future weapon can fan.

- **`homing`** — slow (20 u/s) missiles wearing the full rocket visual
  (warhead + smoke contrail) that **steer toward the target locked at fire
  time**: `spawnProjectile` stores the lock as `Projectile.targetIdx` and
  `stepProjectiles` turns the velocity toward it each frame, capped at the
  spec's `homing` rate (1.8 rad/s, constant speed, an nlerp of the direction)
  — so a hard-strafing enemy can still shake one. Fired without a lock (or
  once the target dies, which releases the lock) it flies straight. Heavy
  1.3 s cadence balances the tracking; the steering seam is generic spec
  config (`homing` on `WeaponSpec`) and the targets array was already
  threaded through the integrator.

**Rooftop supply crates**: from wave 2, a pulsing disc + crate + beacon
column (`WeaponCrates`, the LandingPads recipe) sits on a qualifying rooftop
no soldier pacer owns, seeded as the **last** consumers of the wave's RNG
stream (appending draws keeps every existing placement identical — the
seed-stability lesson). Crates originally granted the special weapons, but
the in-game weapon chip made "equip a special" a free swipe — so they now
carry **non-weapon loot only**, alternating `CRATE_ROTATION`
(`waveIndex % 2`): a **bonus heart** on even waves and a **score cache**
(+`CRATE_SCORE` 50) on odd. A heart is always **+1, uncapped** — picked up
at full hearts it *stacks on* (4+ hearts), the overheal being the reward
for the rooftop detour (only the pad recharge is capped at 3; a wave
restart resets to 3). What a pickup grants is the pure
`resolveCrateGrant(loot)`; disc/beacon and minimap-marker colours are
per-loot (heart red `#ff5252` / cache magenta `#e040fb`); the cache also
feeds the score-milestone hearts (see Scoring), so it is deferred healing,
not just leaderboard sugar. A crate is **not
a target** — it lives beside the target list as `WaveSpec.crate` (not a
`TargetKind`, so it's unshootable and never counts toward the wave clear).
Fly onto the disc (`crateReached`, one distance check per frame — the
landing-pad pattern; the rig consumes it single-use) and the grant applies
instantly, bannered ♥ BONUS HEART / SUPPLY CACHE +50 with the pickup chime
(`data-sfx-pickup`). The HUD publishes a crate beacon
(`data-crate-active/-x/-z/-loot`) and the minimap draws a small
loot-coloured square so the crate can be found. (The weapon-override seam —
`effectiveWeapon = crate ?? settings` — was removed with the weapon drops;
the backlog's crate-exclusive super weapon will reintroduce it with an
ammo-based lifetime.)

**Switching weapons despawns in-flight player bolts** and starts the new gun
cold — `stepProjectiles` sweeps the pool with the *current* spec, so a live
bolt must not retro-inherit another weapon's gravity/maxAge.

## Test contract (data-*)

Root `drone-strike-root`: `data-world-seed/-view/-auto-fire/-aim-assist/
-gyro/-minimap/-weather/-rich/-aim-mode/-difficulty/-audio/-zoom-power/
-weapon`. HUD
`strike-hud` (150 ms tick):
`data-x/-z/-alt/-yaw/-speed/-wave/-wave-state(intro|active|cleared|failed)/
-score/-milestones/-combo/-deflects/-shots/-hits/-targets-left/-lock/-proj/
-enemy-proj/-hp/-input-source`, the **boss telemetry**
`data-boss-active/-hp/-pods` (the root also carries `data-boss-wave`), the
**sound-effect counters**
`data-sfx-fire/-pop/-hit/-alert/-clear/-crash/-zap/-pickup`, the monotonic
spark-burst count `data-sparks`, the **supply-crate beacon**
`data-crate-active/-x/-z/-loot`, plus the
**nearest-alive-target beacon** `data-tgt-x/-y/-z/-kind` that lets suites
aim closed-loop without window globals. Chips: `strike-score` (`data-score/-wave/-best-score/-best-wave`),
`strike-hp`, `strike-reticle` (`data-lock`), `strike-fire`
(`data-pressed`), the weapon chip `strike-weapon-chip` (`data-weapon`,
mirrors the root's), the laser heat bar `strike-heat`/`strike-heat-fill`
(`data-level` 0–100 + `data-overheated`, mounted only while the laser is
equipped), the boss health bar `strike-boss`/`strike-boss-fill`
(`data-level` 0–100 + `data-pods`, mounted only on boss waves),
joysticks/buttons/settings testids mirror the sim's.

E2E: suites `100-strike-core` … `109-strike-ground` plus `117-strike-audio`,
`119-strike-soldiers`, `123-strike-sparks`, `124-strike-laser`,
`125-strike-lob`, `126-strike-crates`, `127-strike-shotgun`,
`128-strike-homing`, `129-strike-weapon-chip`, `131-strike-chaser`,
`132-strike-jets`, `133-strike-combo`, `134-strike-shield` and
`135-strike-boss`
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
- ~~Hitscan laser~~ — **shipped** (`fireHitscan` spawn-frame segment
  resolution + heat meter with an overheat latch + `LaserBeams` + the
  settings **weapon picker** (persisted `weapon`, root `data-weapon`) — see
  "Player weapons").
- ~~Ballistic lob~~ — **shipped** (the `LOB` spec + the `TrajectoryArc`
  hint sampled from the same integration via `sampleTrajectory` and the
  rig-published live `aimRay` — see "Player weapons").
- ~~Weapon switching / pickups~~ — **shipped, then evolved**: the settings
  weapon picker and the in-game chip cover switching; the crates' weapon
  drops were **retired** once the chip made them redundant, and the crates
  became loot-only — ~~crate variants (non-weapon pickups)~~ — **shipped**
  (the alternating heart/score `CRATE_ROTATION`, `resolveCrateGrant`,
  uncapped heart overheal — see the supply-crate section). ~~More specs
  (shotgun spread, homing)~~ — **both shipped** (see "Player weapons"); a
  timed power-up flavour (shield/overdrive) remains open.
- **Crate-exclusive super weapon** — a sixth gun that never appears on the
  weapon chip (e.g. a railgun or cluster lob), only found in crates and
  limited-ammo (gone when spent, back to the previous gun). Builds on the
  same seams: one more `WeaponSpec`, the `effectiveWeapon` override with an
  ammo counter instead of the run-end lifetime, and a chip that skips
  unowned exclusives. A **capture delivery** (below) is a natural second
  source for its charges.
- **Capture net + pad-reload economy** — a one-charge, non-damaging weapon
  that **reloads only on the spawn pad**, turning the pad from a pure
  sanctuary into a supply base. Firing the net attaches to an enemy, which
  becomes **cargo**: it stops shooting and stops threatening, but stays
  `alive` (so `aliveCount` keeps the wave open until it's resolved), and the
  drone tows it home — heavier, slower, wider turns. Landing on the pad
  **delivers** the catch and reloads the net in one motion: the reload trip
  and the payout trip are the same trip.

  *Why capture rather than kill.* Shooting already pays points and a combo
  tick, so a capture is only worth the detour if it produces something a
  kill cannot. Three categories, in rough order of how well they fit this
  game:
  1. **A state change on a target you can't beat right now** (the strongest
     fit, because two enemies are already geometry-gated): netting a
     **shielded drone** tumbles it, handing you the rear-only kill window;
     netting the **boss** stalls its pod ring for a few seconds so you can
     drain one pod instead of waiting out the sweep; netting a **kamikaze
     chaser** mid-dive is the panic button for the one enemy that punishes
     hesitation; netting a **jet trooper** lets gravity finish it.
  2. **A resource you carry home** — the delivery pays what shooting can't:
     a bonus heart, salvage into the score/milestone economy, or a charge of
     the crate-exclusive super weapon above.
  3. **A living asset** — deliver it and it's reprogrammed, redeploying as a
     wingman that orbits and engages for the rest of the wave.

  *The design problem to solve first.* A pad trip is currently **free** —
  no wave timer, enemies don't advance or destroy anything while you're
  away, and the pad recharges hearts and battery on top — so an unpressured
  reload run is 15 s of downtime, which is worse than a bad mechanic
  because it's a boring one. The cheapest fix that doesn't impose a global
  clock on a game that has never had one is **containment decay**: the net
  holds ~30 s, and a catch that isn't delivered breaks free (fleeing, or
  waking up faster and angrier). That puts urgency on the tow leg alone.
  The bigger alternative is making the wave *advance* while you're away
  (enemies pressing the pad, the uncollected supply crate destroyed).

  *Integration points — nearly all of it exists.* `onPad(flight)` +
  `padStateRef`/`padChipRef` for the delivery trigger and its chip text;
  `crateReached`'s proximity-check shape for the net attaching (and
  `CHASER_CONTACT_R` for the contact radius); `resolveCrateGrant`'s pure
  payout shape for what a delivery grants; the `WeaponChip` for the "1 net"
  charge readout, greyed when spent; the target pool for towing (a captured
  slot is just one whose `pos` the rig writes from the drone each frame,
  with `vel` zeroed so leading and the AI see a captive); `stepEnemy` /
  `stepTurret` skipped for captured slots; the battery/heat-bar recipe for a
  containment-decay meter; and a pure `captureModel.ts` (attach test,
  decay/break-free rules, delivery payout) so the whole thing is
  e2e-pinnable the way `shieldBlocks` and `podHitAt` are.

  *Risks.* If delivery pays only points, nobody nets anything — shooting is
  faster, so the payout must be something shooting can't give. Don't let it
  trivialise the boss (too heavy to net; at most a brief pod-ring stall).
  Keep it at **one** charge — a second charge turns every use from a
  decision into a rotation. And a tow must leave you committed, not safe:
  the wave keeps shooting while you're slow.
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
- ~~**Enemy variety**~~ — fully **shipped** across four rounds: ~~a
  *chaser* that pursues the player / a *kamikaze* that dives once locked~~
  as one enemy — the wave-3+ kamikaze chaser (lurk → locked pursuit →
  contact detonation; see Gameplay); ~~a second flying enemy~~ — the
  wave-2+ jet-trooper flying gunner (the Jet Trooper avatar airborne);
  ~~a jet-trooper *strafing run* variant~~ — the wave-4+ `variant: 1`
  skyline strafer; and ~~a *shielded* drone only hurt from behind~~ — the
  wave-5+ `variant: 2` shielded drone (a facing gate on the HitEvent's new
  shot direction rather than a `stepEnemy` mode — see Gameplay). Next
  escalations would be new archetypes (see the boss wave below).
- ~~**Boss wave every 5th**~~ — **shipped**: the every-5th-wave boss gunship
  with three spinning weak-point pods and a health bar (see Gameplay above).
  The weak points landed as a pure hit-location gate (`bossModel.podHitAt`
  off the HitEvent impact point) rather than extra pool `Hittable`s — same
  feel, and it keeps the wave-clear count and the target pool untouched.
  Remaining boss ideas: **multiple phases** (a pod-count threshold that
  swaps the flight pattern or arms a new weapon), and an escort wing that
  spawns with it.
- ~~Combo scoring~~ — **shipped**, as a kill chain rather than the
  original hits-without-a-miss sketch (which the shotgun's 7-pellet fan
  and the laser's tick stream would have broken by design): kills inside
  a 5 s window multiply ×1→×4, damage or silence breaks the chain — see
  the Scoring section. The multiplied points feed the milestone hearts,
  so chains also heal faster.
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
