# Tank Battle — 3D tank combat widget (PROPOSAL)

**Status: proposal for iteration — nothing below is built yet.** This is the
design round for the dashboard's third WebGL widget: drive a tank over
contoured terrain, control the cannon independently of the hull, and fight
enemy tanks. It deliberately does *not* copy the drone's control scheme —
the research below says tank games have their own, better conventions.

## Research summary

### How real tank games control (mobile-first)

The reference is **World of Tanks Blitz**, the most-played mobile tank game,
whose scheme every mobile tank shooter has converged on:

- **Left thumb — hull**: a virtual joystick drives the tracks. Stick Y =
  throttle (forward/reverse), stick X = hull turn rate. Tracked vehicles can
  pivot in place (neutral steer) at zero throttle.
- **Right thumb — camera *and* turret as one**: dragging the right side of
  the screen orbits the camera, and the turret *slews toward the camera's
  aim point* with a rate-limited traverse (the turret visibly lags a fast
  camera swing — that lag is core tank feel, not jank).
- **Gun elevation is automatic**: the player never controls barrel pitch
  directly. The game raycasts the camera reticle into the world and the gun
  elevates (within limits) to converge on that point. On contoured terrain
  this matters enormously — manual elevation on touch is misery.
- **Fire is a dedicated button** near the right thumb; **auto-aim** (lock a
  target, gun tracks it) is a standard assist; a **sniper/scope mode**
  zooms for long shots.
- Standard options: left-handed mirroring, "auto-turn" (hull follows camera
  heading when driving), aim sensitivity.

This maps almost perfectly onto hardware we already built: twin
`VirtualJoystick`s, the `FireButton` + auto-fire, the ADS scope button, aim
assist, and gyro fine-aim from Drone Strike all carry over — but the right
stick's *meaning* changes from "strafe/forward" to "orbit the aim". The
"turret chases the camera with traverse lag" model is the industry-standard
answer to "how do you control hull AND cannon with two thumbs", and it's
better for this game than the drone's fly-to-aim (which only works because a
drone can point its whole body at the target — a tank can't).

Classic "tank controls" (rotate-and-advance only, Wikipedia's sense) were
considered and rejected — they survive today mostly as a deliberate
awkwardness mechanic (survival-horror). Twin-stick with camera-slaved turret
is the modern standard.

### Terrain with contour (the new hard part)

The drones fly over a flat plane; the tank *is glued to the surface*, so the
terrain is the flight model. Findings:

- **Analytic heightfield beats an image heightmap** for us: a pure seeded
  function `heightAt(x, z)` (sum of a few octaves of seeded value noise +
  large-scale hills/ridges, mulberry32-driven like `buildWorldLayout`) gives
  physics, rendering, AI and tests the *same* ground truth with no texture
  loading, no raycasting, no allocation — exactly the lesson-#30 pure-module
  style. A `PlaneGeometry` displaced once at build time renders it; vertex
  colours by height/slope (grass → dirt → rock) shade it with zero textures.
- **Grounding the tank**: no physics engine needed (three.js forum threads
  all reach the same conclusion for arcade tanks). Sample `heightAt` under
  the four track corners each frame: position.y = average, pitch from the
  front/rear pair difference, roll from the left/right pair — then *damp*
  the visual pitch/roll so crossing a ridge doesn't snap. This is the
  standard four-point-sample technique and it's ~20 lines, allocation-free.
- **Slope as gameplay**: a max climbable grade (speed scales down with
  uphill steepness, blocked past ~35°) makes the contour *matter* — ridges
  become cover and routes become decisions. "Hull-down" (hiding the hull
  behind a crest with only the turret exposed) falls out for free and is
  the tactical heart of every tank game.

### Enemy AI

Every tank-AI writeup (Unity/Godot tutorials, GameDev.net) lands on the same
tiny finite state machine, which is also exactly our `enemyAI.ts` shape:
**patrol → engage → attack**, gated by range + line-of-sight, with
retreat/reposition sprinkled in. Line-of-sight over a heightfield is a cheap
march along the ray comparing against `heightAt` — terrain occlusion makes
hull-down real for both sides. This is a modest extension of the Drone
Strike enemy FSM (patrol/evade/fire), not a new discipline.

## Proposed game

**`tankBattle`** — a seeded, wave-based arcade tank shooter (the Drone
Strike structure, which fits the widget format: short sessions, persisted
bests, confirm-guarded restarts).

- A ~200×200 seeded terrain: rolling hills, a couple of ridgelines, scattered
  rocks/trees (instanced, collidable as cylinders), and a flat-ish spawn
  basin. "New battlefield" re-rolls the seed, confirm-guarded like the
  drone's course shuffle.
- Waves: 1–2 start with static targets (practice), then enemy tanks appear —
  first dumb, then returning fire, then flanking in pairs; count/accuracy/HP
  scale with wave. Score + best score/wave persist; player has HP per wave
  attempt with the Drone Strike fail-and-retry loop (session score survives).
- Shells are **ballistic** (gravity arc, ~1–2 s flight at range) with a
  visible tracer and a small splash radius — the arc plus terrain makes
  lobbing over a crest a skill shot. The `combatModel` segment-sweep pattern
  (lesson #42) handles hits: segment vs terrain (`heightAt` march), vs
  rocks, vs tank hulls (a box or two spheres each). Reload ~2.5 s with a
  radial cooldown on the fire button — one deliberate shot at a time is the
  tank rhythm (vs the drone's bolt stream).

### Controls (v1)

| Input | Touch | Desktop | Gamepad |
| --- | --- | --- | --- |
| Drive (throttle + hull turn) | left stick | `W S` / `A D` | left stick |
| Aim (camera orbit; turret chases it) | right stick | mouse move | right stick |
| Fire | fire button (reload ring) | click / `Space` | RT/RB |
| Scope / zoom | scope button (toggle) | hold right mouse / `Shift` | LT |
| Fine aim (optional) | gyro (Off / Zoom only / Always) | — | — |

- Right stick is a **rate control** on camera yaw/pitch (expo + sensitivity
  slider); turret yaw damps toward camera yaw at a `TURRET_TRAVERSE` rate
  (~1.2 rad/s — the readable lag). A turret-position ring on the HUD shows
  where the gun actually points vs where you're looking.
- **Gun elevation is automatic**: the reticle ray (camera centre) is
  intersected with terrain/targets; the barrel pitches within
  `[-8°, +18°]` to converge. When the solution is out of the arc (target
  too close below a crest), the reticle greys — the "can't depress the gun,
  back up the hill" moment tank players know.
- **Aim assist** (off/mild/strong) reuses the Drone Strike lock-cone +
  shell-bend approach, with first-order lead for moving tanks; assist bends
  the shell, never the camera (no steering theft). **Auto-fire** option:
  fires when locked + reloaded + in the ballistic solution.
- Keyboard/gamepad go through the existing `externalInput` arbitration
  (last-active-source-wins) unchanged.

### Camera

- **Chase** (default): behind the *turret* aim direction (not the hull) —
  you always look where you'll shoot, hull heading is read from the tank
  model and minimap. Boom clipped against terrain (`heightAt` march) the
  way the drone boom clips buildings.
- **Scope**: eases FOV 60° → ~25°, halves sensitivity, tighter assist cone,
  gyro "Zoom only" — the Drone Strike ADS system verbatim.
- Optional later: a hull-following "driver cam" if chase-behind-turret
  disorients (settings switch).

### Settings panel (the drone panel pattern, grouped switches + sliders)

- **Gameplay**: Difficulty (Easy/Normal/Hard — enemy count, accuracy,
  reload), Auto-fire, Aim assist (off/mild/strong), Player HP mode.
- **Environment**: Terrain roughness (gentle/rolling/rugged — a noise-octave
  scale, changes the battlefield → confirm-guarded), Storm weather (rain +
  wind nudging long shells — reuse), Rich scenery (trees/rocks density),
  Minimap (top-down heightfield shading + blips).
- **Tuning**: Tank speed ×, turret traverse ×, aim sensitivity + expo,
  left-handed mirror.
- **Controls**: Gyro mode (Off / Zoom / Always), auto-turn hull (hull
  follows camera when driving — the WoT Blitz convenience).
- **Defaults**: reset via `defaultWidgetData('tankBattle')`, bests/seed
  survive.

### Architecture & reuse (mirrors `droneStrike/`)

`src/components/widgets/tankBattle/`: eager `TankBattleWidget` shell →
lazy `TankBattleBody` (own three.js chunk). Pure seeded modules, refs-only
input path, 150 ms `data-*` telemetry — lessons #28–#31 as law.

New pure modules:

- `terrain.ts` — seeded `heightAt/normalAt/slopeAt`, geometry builder,
  LOS march, scenery placement (rejection-sampled on slope).
- `tankModel.ts` — `stepTank`: throttle/turn kinematics with accel damping,
  slope speed scaling + grade limit, four-point grounding, damped
  pitch/roll, rock collision (circle push-out), turret traverse + auto
  elevation solve, reload timer.
- `shellModel.ts` — pooled ballistic shells, per-frame segment sweeps vs
  terrain/rocks/tanks, splash check, `HitEvents` ring (combatModel's shape).
- `tankAI.ts` — patrol/engage/attack FSM per enemy, LOS-gated, imperfect
  aim by difficulty, staggered reloads.
- `battleLayout.ts` — seeded waves: spawn rings outside player LOS,
  whole-envelope clearance (lesson #44).

Imported as-is from the drone widgets: `VirtualJoystick`, `externalInput`,
`haptics`, `palettes`, `gyroAim`, `FireButton`/`ScopeButton`/`Reticle`/
`DamageVignette` patterns. **This is the third consumer** — per the
drone-strike doc's own note, this round hoists the shared pure modules into
`components/widgets/shared3d/` (or similar) instead of a third copy.

New components: `TankModel` (primitive hull/turret/barrel/track boxes,
churning track texture optional), `Terrain`, `EnemyTanks`, `ShellTracers` +
impact puffs, `TankMinimap`, `TankSettingsPanel`, `TankRig` (the useFrame
loop), `TankCameraRig`.

### Test contract (day one)

Root `tank-battle-root`: settings mirrored as `data-*`. HUD `tank-hud`
(150 ms tick): `data-x/-z/-y/-hull-yaw/-turret-yaw/-speed/-pitch/-roll/
-wave/-wave-state/-score/-hp/-reload/-lock/-shells`, plus the nearest-enemy
beacon `data-tgt-x/-y/-z` (lesson #45) so suites can aim closed-loop.
Terrain is seeded + pure, so tests can predict `heightAt` exactly. Suites
land as numbered `e2e/NN-tank-*.test.mjs` per feature round.

## Iteration plan (each round ships + e2e + docs)

1. **R1 — Drive**: terrain + grounding + hull driving, chase cam, minimap,
   HUD telemetry. *Fun check: is driving the contour alone pleasant?*
2. **R2 — Gunnery**: turret/camera aim, auto-elevation, ballistic shells,
   static targets, scope, reload. *Fun check: does a ridge lob feel good?*
3. **R3 — Enemies**: tank AI, waves, damage/HP, score + bests, vignette.
4. **R4 — Depth**: difficulty, weather, assist/gyro polish, auto-turn,
   left-handed, sounds if wanted.

## Open questions (pick before R1)

1. **Wave shooter vs free-roam objectives** (destroy N outposts scattered
   over the map)? Proposal assumes waves for structure-reuse and short
   sessions; free-roam is a later mode toggle if wanted.
2. **Shell drop strength**: pronounced arc (lob-friendly, skill-y) vs
   near-flat (point-and-shoot)? Proposal: pronounced, with the auto-elevation
   making it approachable.
3. **Player tank flavour**: one balanced tank, or light/medium/heavy
   selectable (speed vs armour vs reload)? Proposal: one tank in R1–R3,
   selection as an R4/backlog item.
4. **Enemy fire fairness**: dodgeable slow shells with a visible tracer
   (Drone Strike's rule) — assumed yes.

## Sources

- WoT Blitz control conventions: wargaming.net support (joystick types,
  turret sensitivity, free-aim, auto-turn, left-handed), guidesblitz.com
  settings guide.
- Control-scheme background: Wikipedia "Tank controls", Giant Bomb
  "Twin Stick Control", tankionline/tankiwiki control docs.
- Terrain: three.js discourse (heightmap terrain, raycast-vs-heightmap —
  consensus: sample the height function, don't raycast), IceCreamYou/
  THREE.Terrain (procedural generation + slope-based shading reference).
- Enemy AI: Newcastle University state-machine AI notes, Unity/Godot
  tank-FSM tutorials (patrol/chase/attack + LOS ray).
