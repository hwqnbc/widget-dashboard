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
| Move (pitch/strafe) | right stick | arrow keys |
| Fire | **fire button** above the right stick (hold = continuous) | `Space`, mouse button on the scene, or gamepad RT/RB |
| Aim | fly: yaw + altitude put the reticle on target | same |
| Fine aim (optional) | **gyro**: tilt the device a few degrees | — |

Key decisions:

- **Fly-to-aim, no third stick.** The FPV camera carries a fixed centre
  reticle; both thumbs stay on the flight sticks. The FPV camera follows
  only a gentle fraction of the drone's forward tilt (`FPV_PITCH_GAIN`
  0.35 vs the sim's 0.6) so the reticle stays steady while closing in —
  vertical aim is mostly altitude.
- **Fire button + auto-fire.** The dedicated button (own pointer capture +
  the joystick's full release hardening — a silently stuck trigger would
  drain the gun invisibly) suits skill play; the settings' **auto-fire**
  fires whenever the reticle holds a lock ≥120 ms, so casual players never
  lift a thumb. Both share one cooldown — auto-fire is a convenience, not a
  rate buff.
- **Aim assist** (off/mild/strong) sets the lock cone (`AIM_CONE_RAD`,
  widened by each target's angular size, occlusion-checked) and how far a
  fired bolt bends toward the locked target (`bendAim`) after first-order
  target leading (`leadPoint`). Magnetism bends the **bolt**, never the
  camera — the player never feels steering theft. The reticle turns amber
  and expands on lock.
- **Gyro fine-aim** (settings, mobile only): device tilt writes a clamped
  (`GYRO_MAX_OFFSET` 0.15 rad) yaw/pitch offset into the shared `AimOffset`
  read by both the camera and the fire path, on top of stick flight. It is
  never injected into `ControlInput` — that would fight the altitude-hold
  physics and the input-source arbitration. iOS 13+ needs
  `DeviceOrientationEvent.requestPermission()` from a user gesture: the
  settings switch tap is that gesture; denial disables with helper text;
  the row hides entirely where the API is missing. The neutral pose creeps
  toward the current grip, so drift self-recentres. **Not e2e-testable** —
  verify on a real device (toggle in settings, tilt, watch the reticle).

## Gameplay

Wave-based, seeded (`buildWave(seed, waveIndex, layout)` — its own
mulberry32 stream per wave, independent of the world stream):

| Wave | Content |
| --- | --- |
| 1 | 6 static balloons |
| 2 | 7 targets, half drifting (`ringDrone`, sinusoidal, velocity published for leading) |
| 3–4 | + enemy drones (1 then 2), orbit patrol + evade |
| 5+ | enemies return fire; player has 3 HP per wave attempt |
| scaling | more/smaller/faster targets, up to 4 enemies, `MAX_TARGETS` 14 |

Scoring: balloon 10, drifter 15, enemy 25 (2 HP). Session score and wave
are runtime-only; `bestScore`/`bestWave` persist (written at wave-clear).
Losing all HP fails the wave — banner, then the same wave restarts with
fresh targets and HP; the session score survives (arcade-friendly). Restart
and city-shuffle are confirm-guarded once there is progress.

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
`haptics`, `palettes`, `WorldScene`, `RichWorld`, `RainField`,
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
InstancedMesh for the whole gallery), `EnemyDrones` (≤4 `DroneModel`s with
red beacons, slot-assigned per frame), `Tracers` (one InstancedMesh for all
bolts, oriented along velocity), `Reticle`/`FireButton`/`HitMarkers`/
`StrikeMinimap`/`StrikeSettingsPanel`.

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
-gyro/-minimap/-weather/-rich`. HUD `strike-hud` (150 ms tick):
`data-x/-z/-alt/-yaw/-speed/-wave/-wave-state(intro|active|cleared|failed)/
-score/-shots/-hits/-targets-left/-lock/-proj/-enemy-proj/-hp/
-input-source` plus the **nearest-alive-target beacon**
`data-tgt-x/-y/-z/-kind` that lets suites aim closed-loop without window
globals. Chips: `strike-score` (`data-score/-wave/-best-score/-best-wave`),
`strike-hp`, `strike-reticle` (`data-lock`), `strike-fire`
(`data-pressed`), joysticks/buttons/settings testids mirror the sim's.

E2E: suites `100-strike-core`, `101-strike-waves`, `102-strike-input`
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
- **ADS / zoom mode** — hold a second button (or double-tap fire) to
  narrow the FOV for long shots, with its own lower sensitivity and a
  tighter assist cone; `StrikeCameraRig` already damps `camera.fov` and the
  cone is just a different `AIM_CONE_RAD` row. Gyro "aim-only" mode (active
  only while zoomed) becomes meaningful with this.
- **Gyro recenter button** — `recenterGyro` is exported and unused so far;
  surface it next to the gyro switch for players whose grip drifted.

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
- **Muzzle flash + impact sparks** — a pooled one-shot particle burst at
  `HitEvent` coordinates (RainField's single-draw-call Points pattern).

### Enemies & waves
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
- **Difficulty setting** — Easy/Normal/Hard scaling enemy count, orbit
  speed and `ENEMY_BOLT` cooldown; all constants already flow from
  `buildWave`/`enemyAI`, so it's a multiplier argument.

### Camera & visuals
- **Kill-cam slow-mo** — on the wave-clearing kill, damp the frameloop dt
  scale briefly and swing the chase camera at the exploding target.
- **Damage vignette** — a red edge flash on player hit (DOM overlay
  written from `onPlayerHit`, like the sim's horizon overlay).
- **Kill explosion** — instanced sprite/particle burst where a target
  dies (same pooled one-shot system as muzzle flash).
- **FPV polish reuse** — the sim's opt-in camera bank + speed shake
  (`fpvPolish`) ports straight into `StrikeCameraRig`.

### Meta
- **Sound** — Web Audio, no assets: bolt zap pitched by cooldown, balloon
  pop, enemy-lock warning tone when an enemy is about to fire at you (the
  AI knows — `fireCooldown` crossing zero), wave-clear sting.
- **Accuracy stats** — persist per-run accuracy (`hits/shots`) alongside
  `bestScore`; show on the best chip.
- **Daily seed run** — a "today's city" mode seeding `worldSeed` from the
  date (computed in the body, never inside the pure modules) so households
  can compare scores on the same campaign.
