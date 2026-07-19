# Tank Battle — 3D tank combat widget

The dashboard's third WebGL widget (`tankBattle`): drive a tank over seeded
contoured terrain, control the cannon independently of the hull, and fight
enemy armour in two selectable game modes (Waves / Roam). Built on the drone
widgets' architecture but NOT on the drone's control scheme — research into
mobile tank games (World of Tanks Blitz set the conventions everyone
copies) picked the controls below instead.

## Controls

| Input | Touch | Desktop | Gamepad |
| --- | --- | --- | --- |
| Drive (throttle + hull turn) | left stick (`DRIVE`) | `W S` / `A D` | left stick |
| Aim (camera orbit; turret chases it) | right stick (`AIM`) | arrow keys | right stick |
| Fire | fire button | `Space` / left mouse | RT / RB |
| Scope (2.1× zoom, halved sens) | scope button (toggle) | hold `Shift` / right mouse | LT (hold) |
| Gyro fine-aim | Off / Zoom only / Always (settings) | — | — |

Key decisions (the mobile-tank-game conventions):

- **The turret chases the camera.** The right stick is a rate control on
  the camera aim (`CamAim`); the turret slews toward the camera yaw at a
  rate-limited `TURRET_TRAVERSE` — the visible lag between "where you look"
  and "where the gun points" is core tank feel, and the settle is how the
  fire path and the reticle agree. The camera eye sits boom-distance behind
  the pivot along the exact aim direction (no positional damping), so the
  screen-centre reticle IS the aim ray.
- **Gun elevation is automatic.** The reticle ray resolves an aim point
  (locked target with first-order lead, else the terrain the ray strikes —
  `aimPointOnTerrain`), and `solveShellPitch` finds the low ballistic arc
  onto it, clamped to the gun's `[−22°, +20°]` arc. No in-arc solution
  greys the reticle (`data-sol="none"`) — but the trigger still lobs at
  max arc along the heading (refusing the trigger reads as a broken
  button); auto-fire alone insists on a real solution. Tuning lesson: the
  arc started at a realistic −8° depression and every downhill shot was
  unsolvable — on all-hills terrain the depression must be generous.
- **Shells are ballistic and deliberate.** `SHELL`: speed 34, gravity 10,
  2.4 s reload, 3.2 u ground splash (direct hit 2 damage, splash 1).
  Lobbing over a crest is the skill shot. Enemy shells (`ENEMY_SHELL`) are
  slower, splashless and aimed at where you WERE — dodgeable by driving,
  the Drone Strike fairness rule.
- **Aim assist** (off/mild/strong) reuses the strike model: lock cone
  (halved while scoped) + shell bend toward the lead point — magnetism
  bends the shell, never the camera. Auto-fire fires on a settled lock.
  Gyro fine-aim is the strike's `gyroAim` plumbing verbatim (shared
  `AimOffset`, camera + fire path, iOS permission flow).

## Terrain (the new core)

`terrain.ts` is a pure seeded **analytic heightfield**: `heightAt(x, z)` =
3 rolling sin×sin waves + ~16 gaussian hills/basins, all drawn from one
mulberry32 stream, times a spawn-basin envelope that flattens the ground
near the spawn pad on every seed. One function is the single ground truth
for **rendering** (a 96×96 displaced plane, vertex-coloured grass→dirt→rock
by height/slope, `computeVertexNormals` — no textures, no shadow maps),
**physics**, **gunnery** (`terrainClearT` LOS march, shell sweeps,
`aimPointOnTerrain`), **AI**, the **camera** ground clamp and the **e2e
suites** (the bundled module predicts the exact height under the live
tank). Scenery: seeded rocks (drive-blocking circle colliders, placed on
flat ground away from patrol envelopes) and trees (decorative). Stream
order is waves → hills → rocks → trees — append-only for seed stability.

**Roughness** (`gentle`/`rolling`/`rugged`, settings) scales the amplitudes
at build time — a terrain change, so it restarts the battle through the
confirm guard. The seed re-rolls via **New battlefield** (same guard).

### Driving on the contour (`tankModel.ts`)

- Left stick: throttle (reverse at 55%) and track turning (pivot-in-place).
  Speed approaches its target exponentially (`TANK_ACCEL` 2.2 — heavy).
- **Grade limit**: the model probes `heightAt` ahead along the motion
  direction; uphill grades scrub speed linearly and stall at `MAX_GRADE`
  0.7 (~35°). Downhill is free. Ridges are cover AND routing decisions.
- **Four-point grounding**: `pos.y` is the average of `heightAt` under the
  four track corners; pitch/roll come from the corner differences, damped
  (`POSE_RESPONSE` 6) so crossing a ridge never snaps. The same
  `groundPose` runs for every enemy tank.
- Rocks resolve as circle push-outs that stop the tracks (haptic thud);
  world bounds stop the tank dead.

## Game modes (settings → Battle → Waves / Roam)

Both modes share the enemy pool, AI and scoring (light 25 / heavy 40 pts).

- **Waves** (default): the Drone Strike loop. Wave N fields `min(N+1, 6)`
  tanks (heavies with 4 HP and tighter aim from wave 4); wave 1 is passive
  practice, wave 2+ returns fire (`ENEMY_FIRE_WAVE`); enemy aim scatter
  shrinks per wave. 3 HP per wave attempt; a failed wave restarts itself
  and the session score survives. `bestScore`/`bestWave` persist at clear.
- **Roam**: a patrol hunt — `buildRoam` seeds one 8-tank garrison across
  the whole map (all armed), the chip counts `HUNT n LEFT`, and clearing
  it stops the clock: `bestRoamMs` (and `bestScore`) persist. 5 HP per
  run; destruction restarts the hunt. Each run is a timed unit, so a new
  run resets the session score.

Mode switches, roughness changes, battlefield shuffles and restarts all
route through one `ConfirmDialog` guard that only engages when there is
progress to lose (wave > 1 or score > 0). Reset settings restores
combat/driving/UI settings only — mode, roughness, seed and bests are the
battlefield, not settings.

### Enemy AI (`tankAI.ts`)

The classic tank FSM, pure and deterministic (aim scatter is a hash of the
shot index): **patrol** a seeded circle around the anchor (turn-then-move,
same grade rule as the player) → **engage** when the player is inside
`ENGAGE_RANGE` 55 with terrain LOS (halt, creep the hull around, slew the
turret at `ENEMY_TRAVERSE`) → **attack** when aligned + reloaded (the same
`solveShellPitch` ballistics, unled, seeded scatter, staggered cooldowns).
Terrain occlusion works both ways — hull-down behind a crest breaks their
lock exactly like it breaks yours, and from spawn the wave-1 enemies are
deliberately out of LOS until you crest the ridge (suite 111 asserts it).

## Architecture

`src/components/widgets/tankBattle/` mirrors `droneStrike/`: an eager
`TankBattleWidget` shell lazy-loads `TankBattleBody` (three/R3F stay in the
shared chunk), high-frequency state lives in shared mutable refs
(zero-render input, lesson #29), telemetry is throttled 150 ms `data-*`
writes (lesson #31), and the game logic is pure seeded modules (#30):
`terrain`, `tankModel`, `shellModel` (pooled segment-swept shells, #42),
`battleLayout`, `tankAI`.

**Imported as-is** from the drone widgets: `VirtualJoystick`,
`externalInput` (last-active-source arbitration), `haptics`, `palettes`,
`RainField` (storm mode — dusk palette + rain via a structural
`FlightState` adapter), and from the strike: `FireButton`, `ScopeButton`,
`Reticle`, `DamageVignette` (all grew an optional `testId` prop; defaults
unchanged), `HitMarkers`, `gyroAim`, `aimModel`'s `AimOffset`. Hoisting the
shared modules into a common folder was considered and deferred again —
the imports are stable and pinned by three widgets' suites now.

Components: `TankRig` (the useFrame loop: input → camera aim → drive →
traverse → aim point/solution → fire → enemy FSMs → shell sweeps + splash
→ clear detection → pose → telemetry), `TankCameraRig` (aim-rigid orbit,
terrain-clamped boom, ADS fov ease), `TerrainMesh`, `TankModel3D`
(primitive hull/turret/barrel with posable groups; paint in
`tankColors.ts`), `EnemyTanks` (posed models + beacons + hit flash),
`ShellTracers` (one InstancedMesh), `TankMinimap` (contour blobs from the
hill specs + tick-written blips), `TankSettingsPanel` (grouped dialog,
lesson #36).

### The canvas-bridge race (lesson #48)

`restart()` deliberately does NOT empty the enemy pool: the R3F canvas is a
separate React root whose props lag the body's synchronous mutations by a
frame, so killing the pool while the rig still saw `battleActive=true`
fired a phantom wave-clear. The intro's `loadBattle` replaces the pool
anyway, and the rig's clear check additionally requires having seen
targets alive during the current active phase.

## Test contract (data-*)

Root `tank-battle-root`: `data-world-seed/-mode/-roughness/-auto-fire/
-aim-assist/-gyro/-minimap/-zoom/-weather`. HUD `tank-hud` (150 ms tick):
`data-x/-z/-alt/-speed/-hull-yaw/-turret-yaw/-cam-yaw/-cam-pitch/-pitch/
-roll/-score/-shots/-hits/-targets-left/-lock/-sol/-reload/-proj/
-enemy-proj/-hp/-zoom/-input-source` + the nearest-enemy beacon
`data-tgt-x/-y/-z/-kind` (lesson #45); `data-wave`/`data-wave-state`
(intro|active|cleared|failed) are React-owned (lesson #46). Chips:
`tank-score` (`data-score/-wave/-left/-best-score/-best-wave/
-best-roam-ms`), `tank-hp`, `tank-best`, `tank-reticle`
(`data-lock/-sol/-zoom`), `tank-damage` (`data-flash/-low-hp`), plus the
buttons/sticks/settings testids.

E2E: suites `110-tank-core`, `111-tank-combat`, `112-tank-modes` (see
`e2e/README.md`); the pure modules bundle in a third flat pass in
`run.mjs`, and `createTankPilot` in `helpers.mjs` drives closed-loop —
over the contour, driving is part of aiming (no lock until LOS clears).

## Future work (enhancement backlog)

Everything above is shipped. The backlog below is the enhancement menu for
future rounds, with the integration point each idea would build on (the
drone docs keep the same kind of list).

### Gameplay & modes
- **Difficulty setting** (Easy/Normal/Hard) — scale enemy count, aim
  scatter (`aimErr`), reload stagger and `ENGAGE_RANGE`; every constant
  already flows from `buildTankWave`/`tankAI`, so it's one multiplier
  argument plus a settings ToggleButtonGroup (the same shape the strike
  backlog planned).
- **Boss wave every 5th** — one fortress heavy with a slow one-shot gun
  and weak-point spheres (extra `TankHittable`s attached to its pose — the
  sweep loop already takes an arbitrary target list) and a health-bar chip.
- **Capture zones in roam** — 2–3 seeded flat discs (`LandingPads`-style
  pulsing rings); holding one drains a capture meter while enemies inside
  `ENGAGE_RANGE` contest it. An alternative win condition to killing the
  whole garrison.
- **Convoy escort** — a scripted friendly truck follows a seeded
  waypoint path (`operatorWalk`-style pure stepper on `heightAt`); waves
  spawn along the route; it ends when the truck arrives or dies.
- **Checkpoint circuit (time trial on tracks)** — the drone sim's lap
  machine over ground gates: seeded flag pairs, `lapTimer` reuse nearly
  verbatim, best lap persisted. Driving-only mode — the contour is the
  course.
- **Repair / ammo crates** — seeded rooftop-pad-style discs granting +1 HP
  or a reload-speed buff for a wave; touch detection is one distance check
  in the rig.
- **Smoke screen ability** — a button that spawns a `RainField`-pattern
  particle puff and suppresses `tankLOS` through its sphere for ~8 s;
  breaks enemy locks, creates flanking play. Cooldown-gated.
- **Daily seed battle** — "today's battlefield": seed `worldSeed` from the
  date (computed in the body, never in the pure modules) so households
  compare scores on the same map.

### Enemies & AI
- **Enemy variety** — a *scout* (fast, weak, circles to your flank — a
  patrol circle centred on YOU), a *tank destroyer* (long range, heavy
  damage, but no turret: it must halt and pivot its whole hull — telegraphed
  and punishable), an *SPG* (lobs from far beyond `ENGAGE_RANGE` on a long
  cooldown with a ground-marker warning where the shell will land). Each is
  one more branch in `stepEnemyTank` + a spec flag.
- **Flanking pairs** — when two enemies engage the same player position,
  offset their approach headings ±40° (they currently converge head-on);
  pure geometry in the engage branch.
- **Retreat & repair** — under 1 HP, disengage to the anchor and slowly
  heal; punishes half-finished fights, rewards pushes.

### Controls & feel
- **Auto-turn hull** — hull follows the camera heading while driving (the
  WoT Blitz convenience); a settings switch feeding the hull-yaw target.
- **Left-handed mirror** — swap stick roles + move fire/scope left; the
  sticks/buttons are already position-props.
- **Mouse-look** — pointer-lock camera on desktop; today the mouse only
  fires/scopes and arrows aim.
- **Adjustable zoom power** — the 2.1× scope is fixed constants
  (`TANK_ZOOM_FOV`/`ZOOM_SENS`); a 1.5–4× slider scales both together
  (shared idea with the strike backlog).
- **Engine feel** — subtle speed-scaled camera shake + a gear-shift pause
  in `TANK_ACCEL` at half throttle; pure cosmetics in the camera rig.

### Combat & weapons
- **Weapon variety** — `ShellSpec` is pure config: an MG (fast, near-flat,
  no splash, heat meter instead of reload) or artillery (high arc, big
  splash, long reload) are data + a selector; the integrator and sweeps
  need no changes.
- **Armour facing** — the `ShellHit` carries the impact point; dot it with
  the hull heading for front/side/rear damage multipliers, and show
  RICOCHET on a bounced front hit. Makes the enemy hull-turn in engage
  meaningful.
- **Trajectory hint** — sample the shell integrator into a ghost polyline
  while aiming (the drone `GhostLine` pattern); would soften the arc's
  learning curve, especially for max-arc lobs past the greyed reticle.
- **Impact effects** — pooled one-shot dirt-plume particles at `ShellHit`
  coordinates (the RainField single-draw-call Points pattern) + a scorch
  decal circle.

### World & settings
- **Bridges / water** — a below-zero water plane with drowning damage
  would make basins matter; needs a ford-depth rule in `stepTank`.
- **Night battle** — the `NIGHT_PALETTE` exists; add a headlight spotlight
  cone and tighter fog. A settings switch, not theme-driven.
- **Radar realism toggle** — minimap blips only for enemies you currently
  hold LOS to (the `tankLOS` result is already computed per enemy per
  frame); turns the minimap from wallhack into recon.
- **Trees as soft cover** — trees currently ghost; making them shell-
  blocking (segment-vs-cylinder) but tank-passable (drive-through crunch +
  falling tree) is one more sweep target and a scenery animation.

### Meta
- **Sound** — Web Audio, no assets: engine hum pitched by speed, shell
  whistle scaled by arc time, impact thud, reload clunk, enemy-shot warning
  whistle (the AI knows — `fireCooldown` crossing zero).
- **Kill cam / hit direction indicator** — the damage vignette flashes
  uniformly; a directional arc toward the shooter is one transform from
  the enemy-shell hit event.
- **Accuracy stats** — persist per-run accuracy (`hits/shots`) beside
  `bestScore`, shown on the best chip.
