# Wing Flyer — fixed-wing RC plane widget

> **Status: Round 1a ("Fly it") is built** — Free Flight with both planes,
> all three assists, hand launch / runway take-off / landing, chase + FPV
> cameras, auto-pause, help, sound. §0 below is the as-built summary and
> every deviation from the plan; §1–§15 are the design the rounds work
> from (sections marked **(decided)** were agreed with the user). Round 1b
> ("Score it": landing scorecard, mode menu, missions, stars) is next.

The dashboard's fourth WebGL widget (`wingFlyer`): fly a radio-controlled
**fixed-wing** plane — a high-wing trainer or an FPV flying wing — over a
seeded hilly island with an airstrip and a small town, through a menu of
game modes (Free Flight, Landing, Rings, Soaring, Combat).

It is deliberately **not** "the Drone Sim with a plane model". A quadcopter
stops when you let go; a plane cannot. Almost every design decision below
follows from that one fact.

---

## 0. As built — Round 1a

Files: `src/components/widgets/wingFlyer/`. Pure modules (bundled for the
node suites): `planeModel` (physics), `airframes`, `assists`, `ground`,
`islandLayout`, `wingSim` (the one per-step function the rig AND the tests
run), `wingInput`, `views`, `wingSound`, `planeParts`. React/three:
`WingFlyerWidget` (eager shell → `lazyWithReload` body), `WingFlyerBody`
(DOM controls, settings, pause, refs), `PlaneRig` (the `useFrame` loop:
input → fixed 120 Hz `stepSim` → mesh → camera → HUD), `IslandScene`,
`AirfieldProps` (pilot + hoops), `PlaneMesh`, `WingSettingsPanel`,
`WingHelpDialog`.

**What shipped, and how it differs from the plan below:**

- **Physics (§5)** as designed, plus **turn coordination** in the model
  (`r = g·sinφ·cosθ/V` — without it the nose followed a turn only through a
  standing sideslip whose side force widened every turn by ~50 %). Measured
  on both planes by `170-wing-physics`: stall 6.9 / 8.9 m/s, top 20 / 30,
  hands-off cruise 13 / 18, glide ratio 8.0 / 12.1, 30°/45° turn radius
  within 1 % of `v²/(g·tanφ)`.
- **Assists (§4)**: Trainer bank is **45°** (was 35° — too wide to line up
  with the runway, found in the step-4 play-test). The attitude loop uses
  **airspeed scaling** and pitch targets are **θ = γ + α** (lessons
  #138/#139) — the fix that made Trainer landings soft. Extra modes:
  `runway` (Trainer flies the take-off roll: centreline, rotate at
  1.25 v_s, launch climb-out) and `rollout` (Trainer brakes + holds
  heading; throttle stick up = touch-and-go). Launch: 15° climb to 15 m or
  6 s, 0.3 s motor beat, a 0.5 s stale-thumb grace before stick input can
  take over, and an early Trainer take-over keeps climbing (lesson #141).
- **Landing (§7)**: `ground.ts` classifies every touch (landed < 2 m/s,
  bounce < 3.5, else crash; bank ≤ 15°; pitch window; landable surface)
  and rolls/skids the plane out (lift-off when clear — lesson #140).
  Landing help decided after the step-4 play-test (§13): land on grass,
  approach hoops, home arrow, Trainer auto-flare (sink capped 2 → 0.5 m/s
  over the last 6 m, approach speed 1.45 v_s when low and descending), a
  200×30 m runway. A live keyboard landing in the browser touches down at
  ~0.7 m/s (`176-wing-flight`).
- **World (§6)**: Tank Battle's `terrain.ts` is imported **unmodified** —
  sampled at x/5.5 with heights ×3.2 — instead of gaining a scale param;
  ~880 m island, shoreline, ridge, lake, flat town (30 blocks), 180 trees.
  Soft edge: a push home past 440 m, Trainer/Normal bank home with the
  roll stick released, HUD "TURN BACK".
- **Pilot (decision R5, §13)**: Player 1's avatar via the Drone Sim's `OperatorFigure`,
  standing at the runway's west end; preflight uses a three-quarter camera
  so the pilot's head doesn't block the plane.
- **Cameras (§8)**: chase (25 % roll follow, velocity-led boom — lesson
  #143, terrain clamp, speed FOV) and FPV (nose, 10° up-tilt, 72° FOV,
  level-horizon option on by default + a centre bank symbol). Pilot
  line-of-sight view: backlog.
- **HUD (§9)**: the minimal HUD (speed / height / throttle, amber/red
  stall colour only in the air) + home arrow and distance. Full OSD:
  backlog.
- **Auto-pause (§11)**: blur, hidden tab, scrolled away
  (IntersectionObserver < 30 %), settings/help open, fullscreen toggle →
  frozen; tap → 3-2-1. Rendering drops to `frameloop="demand"` while
  paused or off-screen.
- **Help**: remembered **per widget** (`helpSeen`, the Tank Battle
  pattern), not per device as first discussed — a second Wing Flyer widget
  shows it once more.
- **Sound**: synthesized (`wingSound`), **off by default**; motor silent in
  a glide, wind by speed, pulsing stall horn, one-shots with `data-sfx-*`
  counters; vibration on touchdown / bounce / crash.
- **Performance**: 27 draw calls / ~46 k triangles in flight (hoops and
  runway paint instanced), 51 calls on the ground with the avatar; the HUD
  publishes `data-draw-calls` / `data-triangles`.
- **Objective (the step-8 play-test: "I could not tell the objective
  was to land")**: Free Flight carries a standing goal — a chip under the
  home arrow, **Take off ▸ Fly out 150 m ▸ Land**, each step ✓ as it
  happens, the fly-out step showing the live distance. Pure `objective.ts`
  (stepped inside `wingSim.stepSim`): take-off = airborne; fly-out = 150 m
  from the runway centre; the landing completes the goal only after the
  fly-out AND coming back inside 100 m; grass completes it, the runway adds
  a "Runway!" mark; the landed banner reads "Nice landing! 0.6 m/s · ✓ on
  the runway" ("Butter!" under 0.6 m/s); a ×N count of completed runs. Round
  1b's Landing mission 1 is this checklist with stars.
- **Trainer over terrain** (found by the first live fly-out test): the
  approach-speed slowdown now needs nose-down stick or the settle state
  (not merely low-and-sinking); the released-stick altitude hold keeps at
  least **15 m above the ground under the plane** (`TRAINER_MIN_AGL`) so a
  hands-off flight climbs with a hill; and the hold's climb demand is capped
  by spare airspeed and bank (airspeed first), with a gentle climb always
  allowed under 6 m. Lesson #145.
- **Shared code**: imported in place (decision R2, §13). The only change to another
  widget's file is `VirtualJoystick`'s optional, default-off `latchY` +
  `latchRef`; the drone/strike/tank suites re-ran green.

## 1. Design pillars

1. **You can't stop — so you must never be lost or doomed.** Letting go of
   the sticks must leave the plane in a safe state (self-level in the easy
   assists), home is always one glance away (home arrow + distance), and a
   one-tap **Panic** button levels the wings and climbs.
2. **One world, many short missions.** 30–120 s scored attempts on one
   seeded island (Pilotwings Resort's lesson: a small dense map with many
   missions beats a big empty one). Bronze/silver/gold stars on every mode.
3. **Crash → flying again in under a second.** Crashes are cartoon tumbles
   with a funny thud, never a menu. Missions respawn at a mid-air
   checkpoint; free flight respawns in a hand-launch.
4. **Honest physics, generous assists.** The model really stalls, really
   trades height for speed and really drifts in wind — the assists make it
   friendly, they don't fake it. So the skill ceiling is real (an adult in
   Acro) while the floor is low (a six-year-old in Trainer — this
   dashboard's audience spans both; see `docs/widget-ideas.md`).
5. **Same house rules as the other 3D widgets:** pure seeded React-free
   modules, ref-based zero-render input, `data-*` telemetry as the test
   contract, lazy three.js chunk via `lazyWithReload` (lessons #29–31).

---

## 2. How a fixed-wing flies — the parts the game depends on

Research summary (sources at the end; §15 lists what web verification
corrected). Units are metres / seconds.

| Concept | What it means | Gameplay consequence |
| --- | --- | --- |
| **Lift ∝ v²** — `L = ½ρv²·S·C_L` | Half the speed → a quarter of the lift | There is a **minimum speed** (stall speed `v_s`) |
| **Angle of attack (α)** | Wing angle to the oncoming air; `C_L` rises ~linearly with α | Pulling up = more α = more lift, more drag |
| **Stall** at the *critical* α — ~15–18° on a trainer-type wing, set by the airfoil (we use 16°) | Airflow separates, lift collapses, nose (and maybe a wing) drops. It can happen at **any** speed or attitude — only α matters | Low-and-slow is dangerous; the classic beginner crash. A hard pull at speed can stall too ("accelerated stall") |
| **Drag U-curve** | Parasitic drag grows with v², induced drag grows as v falls | There is a best-glide speed; flying slowly costs energy too |
| **Energy trade** `E = mgh + ½mv²` | Dive → speed, zoom → height | Height is a battery; gliding is energy management |
| **Banked turn** | Tilting the lift vector turns the plane; `r = v²/(g·tanφ)` | Turns are wide arcs, not pivots; steep bank needs back-pressure and raises stall speed by `√(load factor)` = `√(1/cosφ)`: **+7 % at 30°, +41 % at 60°** |
| **Adverse yaw / coordination** | Aileron alone yaws the nose the wrong way | Rudder (or auto-coordination) keeps turns clean |
| **Dihedral / pitch stability** | Wings self-level gently; plane returns to trimmed speed | Trainer is forgiving by *airframe*, not just assist |
| **Glide ratio** | Our *estimate* ~8:1 for a foam trainer (no published RC figure found; full-size training gliders ~30:1, sailplanes 50:1+) | Engine-out from 50 m reaches ~400 m — always a way home |
| **Wind** | Moves the whole air mass | Ground track ≠ heading (crab), groundspeed ≠ airspeed; landing into wind is easier |
| **Rising air** | Thermals (rising columns) and ridge lift (wind forced up a slope; the lift band extends out *in front of* the slope; RC slope flyers want ~4–9 m/s wind straight into the hill) | Free energy — the whole Soaring mode. You stay up only while the air rises faster than you sink |

Turn radius at the planned numbers: trainer 13 m/s at 30° bank ≈ **30 m**,
45° ≈ 17 m; wing 18 m/s at 45° ≈ **33 m**, 60° ≈ 19 m. These set the world
scale (§6).

---

## 3. Aircraft (decided: both, selectable)

Same `planeModel`, different `AirframeSpec` (pure data, the `WeaponSpec`
pattern). Selectable in the mode menu and settings; any plane flies any mode.

| | **Trainer** (high-wing, wheels) | **FPV Wing** (foam delta, pusher prop) |
| --- | --- | --- |
| Feel | slow, floaty, self-levelling, forgiving | fast, crisp, glides far, less forgiving |
| Real-world reference | E-flite **Apprentice STS 1.5 m**: 1.39 kg, 0.332 m² wing (≈42 g/dm²), flat-bottom airfoil, SAFE; stall ≈ 8 m/s (computed, `C_Lmax` ≈ 1.1 — not published) | ZOHD **Dart XL Enhanced**: 1.0 m span, 0.198 m², ≤1.2 kg (≈60 g/dm² — ~1.4× the trainer's loading); maker lists 25 km/h (7 m/s) min, 100–120 km/h max |
| Game stall / cruise / top | 7 / 13 / 20 m/s (stall ~1 m/s below the real trainer on purpose — forgiveness) | 9 / 18 / 30 m/s (higher wing loading → ~1.2× the trainer's stall; the maker's 25 km/h "min speed" is a marketing figure, not a stall speed) |
| Roll rate (max) | 150°/s | 300°/s |
| Rudder | yes (auto-coordinated unless Acro + manual rudder) | none — yaw is always automatic |
| Glide ratio | ~8 | ~12 |
| Stall behaviour | mushes, nose drops, no wing-drop (except Acro) | wing-drop toward a spin in Acro |
| Default camera | chase | FPV with full OSD |
| Landing | wheels on the strip (roll-out + braking) | belly-landing on grass or strip is fine |
| Launch | **hand-launch or runway take-off** (player's choice) | hand-launch only — it has no wheels |

Visuals: both are simple low-poly procedural meshes in the house "toy" style
(no `transmission`, matte materials — the low-spec target convention), with
a spinning prop disc and moving control surfaces (cheap and makes the
controls legible). The avatar colour (`avatarMetaById[seat1].color`) paints
the plane — "your" plane.

---

## 4. Controls (decided: Mode 2 twin-stick)

| Input | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Throttle | **left stick Y — latching** (see below) | `W` / `S` (ramps) | left stick Y (latching) |
| Rudder / yaw | left stick X (self-centring) | `A` / `D` | left stick X |
| Pitch (elevator) | right stick Y (pull = nose up) | `↓` / `↑` | right stick Y |
| Roll (aileron) | right stick X | `←` / `→` | right stick X |
| Panic (level + climb) | button | `Space` | `A` / cross |
| Launch | button (pre-flight) | `Enter` | `A` / cross |
| Camera cycle / reset / settings | top-right buttons (drone pattern) | `C` / `R` | — |
| Fire (Combat only) | fire button | `F` / mouse | RT |

Inverted-pitch option ("pull back = nose down"): off by default, a settings
switch — the RC convention (pull = up) matches every RC sim and most games.

### The latching throttle (blindspot)

`VirtualJoystick` springs back to centre on release. A real throttle stick
**stays where you leave it**; a self-centring throttle means letting go =
50 % (or 0 %) power, which feels broken. Plan: add an optional
`latchY` mode to `VirtualJoystick` (knob Y stays where released, X still
centres; a light detent/haptic tick at 0 / 50 / 100 %). The same hardening
(pointer capture, blur/visibility release — lessons #39/#40/#43) applies
unchanged since only the release behaviour of one axis differs. The OSD
always shows throttle %.

In **Trainer** assist the throttle is automatic (airspeed hold), so the left
stick Y instead nudges the *target airspeed* — beginners can ignore it.

### Assist ladder (decided) — the difficulty setting

Modelled on real flight controllers (ArduPlane FBWA/ACRO, Horizon SAFE,
INAV ANGLE/ACRO). Each is an outer loop on top of the same rate-command
inner loop (§5), so switching mid-flight is seamless.

What the real systems do (verified): in **ArduPlane FBWA** full stick banks
to exactly `ROLL_LIMIT_DEG` (older firmware: `LIM_ROLL_CD`, centidegrees)
and the plane cannot roll past it; pitch is capped by
`PTCH_LIM_MAX_DEG`/`PTCH_LIM_MIN_DEG`. ArduPlane's **`STALL_PREVENTION`**
shrinks the allowed bank when airspeed margin above stall is too small for
that bank's load factor — but always allows at least 25°, so the pilot can
still turn. **Horizon SAFE Beginner** limits pitch and bank, self-levels when
the sticks are released, and also **self-levels automatically below ~30 ft
(~9 m) AGL** when the sticks are released; Intermediate widens the envelope
and stops self-levelling. Horizon does not publish the airplane bank limits
(their Blade heli uses 15° Beginner / 35° Intermediate), so ours are game
tuning, not copied numbers.

| Assist | Right stick means | On release | Limits / protection | Throttle | Rudder |
| --- | --- | --- | --- | --- | --- |
| **Trainer** (SAFE Beginner) | bank & pitch **angle** | levels wings, holds altitude | bank ≤ 35°, pitch ±20°, **stall-proof** (pitch-up refused near `v_s`), **low-altitude self-level** below 9 m AGL when sticks are released (SAFE's rule — *not* a forced pull-up, see blindspots), auto-flare on landing | **auto airspeed hold** | auto |
| **Normal** (FBWA + stall prevention) | bank & pitch **angle** | levels wings | bank ≤ 60°, **shrinking toward 25° as airspeed nears the turn's stall speed**, pitch ±35°; stall still *possible* by pulling hard (warning) | manual (latching) | auto |
| **Acro** | roll & pitch **rate** | holds attitude | none — loops, rolls, inverted, real stalls and spins | manual | manual (wing: auto) |

**Decided:** exactly these three levels, RC names (Trainer / Normal /
Acro), **Trainer is the default** for a new player, switchable any time
including mid-flight. Stars are **not** gated by assist — see *Stars and
assist badges* in §10.

Panic works in every assist. SAFE's real panic is "switch to Beginner and
let go — it levels"; ours adds a climb: wings level, pitch +10°, throttle
100 % for ~2 s, then hands back.

### Alternative input schemes — backlog, not v1

Researched and rejected as the default, kept as options: **point-to-fly**
(War Thunder mouse-aim: point where you want to go and its "instructor"
layer — reportedly a PID controller — moves the surfaces to get there;
great for very young players and one-handed play, but players resent its
near-ground interference), **tilt-to-steer**
(gyro; reuses Drone Strike's `gyroAim` permission plumbing), and
**one-stick** (right stick only, Trainer assist, auto-throttle).

---

## 5. Flight model — `planeModel.ts` (built — see §0 for additions)

Pure, mutate-in-place, allocation-free, seeded (lesson #30). Unlike the
drone's yaw + tilt state, a plane needs full 3D attitude.

**State** `PlaneState { pos, vel (world), quat (attitude), rates (p,q,r body),
throttle, airspeed, aoa, slip, stalled, onGround, energy }`.

**Fixed step.** 120 Hz accumulator with at most 8 sub-steps per frame;
excess time is dropped (a stutter becomes momentary slow-motion, never a
tunnelling jump). At the wing's top speed 30 m/s that is 0.25 m per step —
comfortably below the smallest collider (lesson #34: the drone's variable
`MAX_DT = 0.05` would allow 1.5 m jumps at this speed).

**Per step:**
1. Air-relative velocity `v_air = vel − wind(pos, t)` (wind + thermals +
   ridge lift from one `sampleAir()` — lesson #33: every force sees the same
   air), rotated into body axes → airspeed, α, sideslip β, dynamic pressure q̄.
2. **Lift** `q̄·S·C_L(α)` ⟂ `v_air`: `C_L` linear to α_crit = 16°, then a
   smooth drop to ~60 % (stall), symmetric for negative α.
3. **Drag** `q̄·S·(C_D0 + k·C_L²)` along −`v_air` (U-curve emerges for free).
4. **Side force** −`C_Yβ·β` — together with step 6 this stops the plane
   "ice-skating" sideways.
5. **Thrust** `throttle·T_max·(1 − u/v_pitch)` along the nose (falls off
   with speed → natural top speed).
6. **Moments as rate-command** (the game-friendly choice, not true
   aerodynamic moments): stick/assist → target body rates; rates chase the
   target with a ~0.1 s lag; **authority scales with q̄** so controls go
   mushy near stall (the honest-physics cue). Weathervane: nose gently
   aligns to the velocity vector, scaled by q̄. Auto-coordination yaw
   `r = g·sinφ·cosθ / V`.
7. **Stall:** past α_crit, a nose-down moment; in Acro a seeded-sign
   wing-drop (spin entry) on the wing.
8. Integrate (semi-implicit Euler), renormalize the quaternion, clamp rates.
9. **Contact:** analytic terrain `heightAt(x,z)` (shared with rendering,
   camera and AI — lesson #49) and building AABBs swept with the existing
   `boomClipT` segment test. Contact is classified (§7): landing, bounce,
   or crash.

Validation lives in an e2e node suite against the bundled pure module:
measured stall speed, steady-turn radius at 30°/45°, glide ratio, and
"hands-off in Trainer converges to level flight from any attitude" —
property checks, not snapshots.

---

## 6. World — the island (decided: new terrain + airstrip)

**Why not the Drone Sim city:** it is 120 m across; the trainer would
cross it in 9 s and spend its life in a 30 m-radius turn.

- **Size:** playable ~**800 × 800 m** (trainer crosses in ~60 s, wing in
  ~45 s), terrain rendered to ~1100 m and fading into **distance fog**
  (also the main performance lever).
- **Ground:** Tank Battle's analytic seeded heightfield (`terrain.ts`
  `heightAt` — sums of sines + gaussian hills) scaled up, with: a
  **flattened airstrip basin** (Tank Battle already flattens its spawn
  basin), one **ridge** facing the prevailing wind (slope lift), a **lake**
  (later: water-scoop firefighting), a **valley/canyon** cut (fast low
  flying), and a **town** of ~30 instanced blocks plus a few landmarks
  (water tower, barn, bridge — stunt gates fly *under/through* these).
  Hoist `terrain.ts` to a shared module with a scale parameter rather than
  copying it.
- **Soft boundary:** beyond the edge the wind turns hostile and, in
  Trainer/Normal, the assist banks you home; Acro gets a "turn back" HUD
  warning then the same nudge. Never an invisible wall.
- **Render budget (low-end phones):** one ~128² terrain mesh with vertex
  colours, instanced trees/buildings, no real shadows (a blob shadow under
  the plane — also a vital depth/height cue when landing), far plane
  ~1200 m, `frameloop` paused when the widget is hidden.
- **Seed:** persisted `worldSeed`, generator append-only (lesson #54) so
  courses and records stay stable when features are added.

---

## 7. Launch, landing, crash

**Hand-launch (v1, both planes)** — modelled on INAV's auto-launch, whose
defaults are: motor idle until a throw is detected (accelerometer),
**motor start 500 ms after the throw** (keeps the prop clear of the hand),
a short spin-up ramp, an **18° climb angle** in angle mode, and hand-over at
a set altitude or on stick input. Ours: pre-flight the plane sits in the
pilot's hand at the strip end. Press **Launch** (or push throttle up and
hold 0.5 s): the plane is thrown level at ~1.1 `v_s`, the motor spools up
after a shortened ~0.3 s beat, the assist holds wings level and a ~15°
climb until 15 m AGL (or 3 s), then hands over — moving the right stick
hands over early (INAV's abort-on-stick rule). No touches that began
before launch count (stale-touch guard — accidental input at start is a
known mobile pitfall).

**Runway take-off (decided: trainer only, alongside hand-launch).** The
trainer sits on its wheels at the strip threshold. Throttle up → it rolls
and accelerates; left-stick X (rudder / nose-wheel) keeps it straight; at
~1.2 `v_s` a gentle pull on the right stick lifts the nose ("rotate") and
it climbs away. Typical failures: veering off the strip, rotating early
(mush back down / stall), rotating late (long roll). It costs little extra
because **landing already needs the same ground model** — wheel contact,
rolling friction, braking and ground steering for the roll-out — and it
unlocks the touch-and-go mission. In **Trainer** assist the game holds the
centreline and rotates automatically at the right speed: the player only
pushes the throttle. In Normal and Acro the player steers and rotates.
The FPV wing has no wheels, so it is always hand-launched.

**How each mode starts (decided):**
- **Free Flight:** two start buttons, "Hand launch" and "Runway" (the wing
  shows only "Hand launch").
- **Missions:** each mission spec names its start — mostly hand-launch or
  already airborne (action within seconds); a few are explicit take-off
  missions (e.g. "take off and fly through the first ring").
- **After a crash:** respawn airborne (mission checkpoint) or by
  hand-launch — never back at the runway threshold.

**Contact classification** (every ground/water/building touch):

| Result | Rule (trainer numbers; wing similar) |
| --- | --- |
| **Landed** | sink < 2 m/s, bank < 15°, pitch −5°…+15°, on strip (trainer) or strip/grass (wing), then rolls/slides to a stop |
| **Bounce** | sink 2–3.5 m/s — hops, can still settle (score penalty) |
| **Crash** | anything harder, a building, water, or a wingtip strike |

**Landing score** — borrowed from MSFS's Landing Challenges, which score
`(precision + ground roll) × smoothness`: precision = touchdown distance
from the target (up to 5000), ground roll = centreline drift from touchdown
to stop (up to 5000), smoothness = descent rate at touchdown (multiplier up
to 200). The multiplication is the lesson: a hard landing wrecks the score
however accurate it was. Ours: `(spot + centreline) × smoothness`, with bank
at touchdown folded into smoothness, feeding the Landing mode's stars and a
**"butter"** badge for sink < 0.5 m/s. Trainer assist **auto-flares** below 3 m AGL so
young players can land by simply pointing at the strip.

**Crash:** a short cartoon tumble + thud (reuse the drone's `stepCrash`
shape and `crashThud`), then respawn — free flight: back to the hand-launch;
missions: a mid-air checkpoint at cruise speed, wings level. Total < 1 s of
non-control.

---

## 8. Cameras & comfort

| View | Description | Notes |
| --- | --- | --- |
| **Chase** (default trainer) | behind and above, **horizon-stabilised**: heading/pitch followed with damping (yaw damped hardest — players report yaw jerk is the worst offender), roll only partly followed (comfort slider, default ~25 %, not a rigid 0 % lock — a fully locked horizon makes the world feel like it swings under you at steep banks) | clamped above `heightAt` + building tops along the boom (lesson #38); FOV widens slightly with speed for sense of speed |
| **FPV** (default wing) | nose camera, uptilt ~10° | **"Horizon level" comfort option** (default on for Trainer): camera ignores roll, the OSD horizon shows it — frequent rotations are what make FPV footage uncomfortable |
| **Pilot (LOS)** | you stand at the strip as your avatar's `Model3D` operator (the Drone Sim operator, reused) | the authentic RC view; **left/right reverse when the plane flies toward you** — offered as an option, never the default, with an off-screen arrow when the plane leaves view |

Comfort defaults (developer guidance — there is no controlled study for
flight games): FOV ≤ 75° with a **FOV slider**, no camera shake / bob,
optional vignette in hard turns, and **steady frame times** — uneven frame
pacing is reported to sicken more than a lower steady rate, another reason
for the 120 Hz fixed step and the render budget. Sense of speed at altitude (nothing nearby to judge by) comes from
cloud puffs/birds drifting past, the blob shadow, wind audio pitched by
airspeed and the speed-FOV.

---

## 9. HUD / OSD

Top-centre (thumbs live at the bottom corners):

- **Minimal (Chase):** airspeed bar with **stall band** (amber → red +
  stall horn), altitude AGL, throttle %, **home arrow + distance**, mission
  chip (time / rings / score).
- **Full OSD (FPV, optional in Chase):** artificial horizon + pitch ladder,
  flight-path marker, heading tape, variometer (climb-rate), battery (Soaring),
  assist-mode tag, wind arrow.
- **Off-screen indicators:** edge arrows for the next ring, targets, the
  plane itself in Pilot view.
- Shape + colour, never colour alone (stall band also flashes; rings carry a
  chevron to the next).

All written by direct DOM writes on a 150 ms tick (drone pattern, zero
renders), and mirrored as `data-*` telemetry (§12).

---

## 10. Game structure & modes (decided: mode picker, all five modes)

### Structure — choosing a game style (decided: missions + endless)

Three shapes were weighed:

| Shape | Example | Fit |
| --- | --- | --- |
| **A. Mode menu** — pick a mode, play it endlessly | Drone Sim settings | simple, but modes feel like toggles with no goal |
| **B. Missions with stars, grouped by mode** | Pilotwings, Car Park levels | short goals, replayable, kid-friendly, fits `recordsSlice` stars |
| **C. Open hub** — fly into challenge markers in the world | Ultrawings, Crazy Taxi | lovely, but needs the world and every mode first |

**Decided: B + an endless challenge per mode, C later.** The mode picker
lists the five modes; each mode (except Free Flight) is a **short list of
seeded missions** with 1–3 stars (e.g. Landing 1–6, Rings 1–6). Finishing a
mode's missions unlocks its **endless challenge** — the same machinery with
no mission end: Landing → touch-and-go streak, Rings → endless seeded
course, Soaring → longest flight, Combat → endless mixed waves — each with
an app-level best. Missions are the core (they teach the controls step by
step); the endless variants keep it replayable after the stars are won. Free Flight is the open world and
becomes the hub (C) in a later round: mission markers and hidden
collectibles placed in it. A **licence** view is the meta layer on top —
backlog, not v1. Pilotwings Resort's verified shape: classes Training →
Bronze → Silver → Gold → Platinum (+ Diamond for all three-starred), each
mission graded 0–3 stars from **points** (time, pickups, landing accuracy
and impact), and the **next class unlocks at an average of 2 stars** per
mission; ~36–40 missions over the whole game. Ours scales that down: 5–6
missions per class.

### Stars and assist badges (decided: "d0+")

Stars depend **only on the mission score**, never on the assist — a child
in Trainer can earn every ★★★. Each earned star carries an **"earned in"
badge** (T / N / A) for recognition only: nothing is capped or unlocked
differently by it.

- **Badge = the lowest assist used during the run** — switching to Trainer
  mid-mission makes it a Trainer run (keeps the badge honest; the stars
  are unaffected).
- **The hardest badge is kept** per star level: ★★★ in Trainer, then ★★★ in
  Acro → shows ★★★ (Acro); a later Trainer run never lowers it.
- The result screen names the badge ("★★ · Trainer") and the mission list
  shows it on each star.

### The modes

**Free Flight.** No goal, no timer; the sandbox. Later: hidden **stunt
gates** (under the bridge, through the barn — Crimson Skies), photo
landmarks, trick detection.

**Landing.** Mission 1 is the first-flight lesson: **runway take-off, one
lap, land** — the whole cycle, in Trainer. Then missions escalate: long final, straight in → circuit from
downwind → short strip → **crosswind** → engine-out glide to the strip →
**spot landing** (aim circle) → touch-and-go chain. Scored by the
scorecard (§7). Doubles as the tutorial (it teaches throttle, turning and
the approach in order).

**Rings.** Seeded ring courses over hills, through the valley and the town;
the Drone Sim's `crossedGate` segment-vs-ring test reused. Variants per
mission: **classic course** (time), **balloon pop** (touch N balloons —
same test with a sphere), **limbo** (fly under a tape that lowers each
pass), **pylon race** (laps around pylons, penalty for cutting inside).
Ghost of the best run (drone backlog shared).

**Soaring.** Motor has a short battery (or none: hand-launched glider);
**thermals** — rising columns, gaussian core 2–4 m/s, sink ring, drifting
downwind, marked by **circling birds** (game tuning: Allen's NASA updraft
model derives size, strength and spacing from measured convective scales,
but its formulas weren't retrieved — v1 uses simple tuned columns; NASA's
autonomous sailplane gained ~173 m per thermal on average, a good sanity
target) — and **ridge lift** in front of the windward slope. A **variometer** beep (pitch rises with climb rate) is the core
feedback. Missions: stay up N minutes; reach checkpoints cross-country;
**precision duration** in the style of F3J (fly as close to an exact
time as possible, then land on a spot); F3K (hand-launched, discus-thrown
gliders, ≤1.5 m span) contributes short capped-time tasks with quick
relaunches — "max 2:00 per flight, best 3 of 5 throws".
PicaSim (the mobile slope-soaring sim) confirms the event menu players
expect: slope and cross-country races, limbo for slope and powered flight,
thermal duration. This is the mode only a plane can do.

**Combat (decided: gentle first, made easy).** Reuses Drone Strike's pure
combat modules (pooled projectiles with segment sweeps, `sparkModel`,
combo scoring, aim assist with lead). **Fixed forward guns only** + a
lead-reticle — aiming by pointing the whole plane is the skill; Drone
Strike's weapon picker is backlog. **Aim assist is ON by default and
tuned generous** (bends shots toward the target, never the camera;
switchable off in settings). **Cartoon effects only** — sparks, smoke
puffs, enemies spin away trailing smoke; no realistic explosions.
**3 hearts** per mission; losing all ends it with an instant retry;
hitting the ground costs a heart and respawns airborne. Mission ladder:
1. **Balloon pop** — drifting balloons over the hills; nothing shoots back.
2. **Ground targets** — trucks/AA reused via `ModelTargets` (`lowSpec`);
   turrets fire slow, dodgeable tracers.
3. **Streamer cutting** — the real RC-club combat: every plane tows a
   streamer, each cut is a "kill" for points, and a plane that loses its
   streamer **keeps flying** until the heat ends (so no elimination, no
   explosions — kid-friendly by construction).
4. **Enemy planes (dogfight)** — AI on the same `planeModel` with a
   pursuit autopilot (the Trainer outer loop aimed at a lead point).
5. **Boss** — a slow bomber with weak points (Drone Strike `bossModel`
   pattern).

Endless challenge: waves mixing all of the above; best wave/score records.

---

## 11. Blindspots & how the design answers them

| Blindspot | Why it bites a plane game | Answer in this design |
| --- | --- | --- |
| **Letting go of the sticks** | A drone hovers; a plane flies into a hill | Trainer/Normal self-level on release; low-altitude self-level in Trainer; Panic button; soft boundary steers home |
| **Assists fighting the player near the ground** | War Thunder players' top complaint about its "instructor" is the near-ground auto-restriction ("it thinks you're trying to land") | Protection only acts on *released* sticks (SAFE's rule), never against held input; Landing, limbo and low-pass missions are designed for it; a visible tag shows when an assist is acting |
| **The widget loses focus** (scrolling the dashboard, tab switch, fullscreen exit, phone call) | The plane keeps flying blind and crashes | **Auto-pause** on `visibilitychange`, window blur, widget leaving viewport, fullscreen toggle; resume behind a "tap to continue" with a 3-2-1 |
| **Self-centring throttle** | Release = power change | Latching throttle axis (§4), Trainer auto-throttle |
| **Disorientation / lost plane** | Upside down, can't find home | Horizon-stabilised chase cam, home arrow, off-screen arrows, Panic, Trainer limits prevent inversion |
| **Stalls frustrate beginners** | Low-and-slow → nose drop → crash → quit | Trainer is stall-proof; Normal warns (amber band + horn) before it bites; only Acro spins |
| **Motion sickness** | FPV roll, high FOV, shake | Horizon-level FPV option, FOV ≤ 75°, no shake by default, chase cam default |
| **Landing is hard** | Real RC pilots take weeks | Auto-flare in Trainer, glide-slope ribbon on Landing 1–2, graded (not pass/fail) scorecard, belly-land allowed on the wing |
| **Small card on the dashboard** | 6×6 grid cell on a phone is tiny for a flight game | `preferredOrientation: 'landscape'`, a "Go fullscreen" prompt on first launch, sticks sized from the container (lesson #53), minimal HUD in-card |
| **Tunnelling at speed** | 30 m/s × variable dt jumps through walls | 120 Hz fixed sub-steps + swept segment tests (§5) |
| **Camera through terrain** | Chase boom dips into hills at speed | Boom clamped to analytic `heightAt` + building tops |
| **No sense of speed** | Nothing near at altitude | Clouds/birds drift, blob shadow, speed-FOV, wind audio |
| **Line-of-sight reversal** | Controls feel reversed flying toward you | Pilot view optional, never default |
| **Too much at once** | 4 axes + throttle is a learning cliff | Trainer automates throttle + rudder; Landing 1 teaches one thing at a time |
| **Low-end phones / several 3D widgets on one dashboard** | WebGL context limits, battery, heat | Fog + short far plane, instancing, no shadows, render paused when hidden; one lazy chunk |
| **Crash-restart friction** | Menus between attempts kill "one more go" | < 1 s respawn, mid-air checkpoints |
| **Accidental input at start** | A thumb already on the stick yanks the plane | Stale-touch guard; Launch is an explicit action |
| **Audio fatigue** | A constant motor drone grates | Low-mix motor pitched by throttle, silence in glide (gliding *sounds* different — a nice cue), sound toggle |
| **Colour-only cues** | Colour-blind players | Shape + colour on rings, stall band flashes |
| **e2e can't "hover and assert"** | The closed-loop drone pilot relies on hovering | Tests fly via the Trainer outer loop (heading/altitude targets) and a no-progress watchdog (lesson #97); physics validated in node (§5) |
| **Violence level** | Kids play this dashboard | Combat starts with balloons and streamer cutting; explosions are cartoon puffs |

---

## 12. Architecture (decided: import in place)

Wing Flyer imports the reused pieces **in place** from `droneSim/`
(`VirtualJoystick` + an optional default-off `latchY`, `externalInput`,
`webAudio`, `haptics`, `boomClipT`/`crossedGate`, `OperatorFigure`) and
`tankBattle/terrain.ts` (+ an optional scale parameter defaulting to Tank
Battle's size) — the Drone Strike precedent. Existing widgets behave
exactly as before. The `shared/` hoist is a later refactoring session
(backlog → *Code health*).

```
src/components/widgets/
  wingFlyer/
    WingFlyerWidget.tsx   eager shell: lazyWithReload(() => import('./WingFlyerBody'))
    WingFlyerBody.tsx     settings via useWidgetField, mode menu, HUD DOM
    planeModel.ts         pure flight model (§5)
    assists.ts            Trainer / Normal / Acro outer loops + Panic + launch
    airframes.ts          AirframeSpec data (trainer, wing)
    airModel.ts           wind + thermals + ridge lift: sampleAir(pos, t)
    islandLayout.ts       seeded world: terrain spec, strip, town, ridge, lake
    landing.ts            contact classification + scorecard
    missions.ts           seeded mission specs per mode, star thresholds
    PlaneRig.tsx          useFrame loop: input → assists → planeModel → HUD
    CameraRig.tsx, PlaneMesh.tsx, IslandScene.tsx, Osd.tsx, sound.ts
```

- **Catalog:** `wingFlyer`, "Wing Flyer — fly an RC plane over a 3D
  island", `defaultSize { w: 6, h: 6, minW: 5, minH: 5 }`,
  `preferredOrientation: 'landscape'`.
- **Widget data (persisted):** `airframe`, `assist`, `view`, `mode`,
  `worldSeed`, `sound`, `invertPitch`, `fpvHorizonLevel`, `osdFull`,
  `stickExpo`, `aimAssist` (default on), `launchStart` (`hand`|`runway`,
  Free Flight). In-flight state is transient (a plane can't be "parked"
  mid-air across reloads).
- **Records (`recordsSlice`, `wingFlyer` namespace with `ensure()` —
  lessons #136/#137):** per-mission best score + stars, with the hardest
  assist badge per star level; per-mode endless bests (touch-and-go
  streak, endless rings, longest soar, best combat wave/score). Included in the records-reset row
  and `161-records-all`.
- **The additive changes to `VirtualJoystick` and `terrain.ts` ship with
  the existing drone/strike/tank suites re-run** to prove nothing changed.

### Test contract (data-*) — as built

Root `wingflyer-root`: `data-airframe`, `data-assist`, `data-view`,
`data-fpv-level`, `data-invert-pitch`, `data-sound`, `data-help-seen`,
`data-paused`, `data-phase` (`preflight|flying|landed|crashed`),
`data-world-seed`. HUD `wingflyer-hud` (written every 150 ms by the rig):
`data-airspeed`, `data-alt`, `data-agl`, `data-throttle`, `data-bank`,
`data-pitch`, `data-heading`, `data-aoa`, `data-stall` (`ok|warn|stalled`),
`data-vs`, `data-x/-z`, `data-phase`, `data-start`, `data-ground`
(`air|ground`), `data-assist-mode` (`fly|panic|launch|runway|rollout`),
`data-touchdown` (`landed|bounce|crash|none`) + `data-touch-sink`,
`data-landings`, `data-crashes`, `data-crashed`, `data-home-dist`,
`data-home-bearing`, `data-outside`, `data-input-source`, `data-view`,
`data-paused`, `data-sound`, `data-sfx-{launch,touchdown,bounce,crash,
panic}`, `data-draw-calls`, `data-triangles`, `data-objective`
(`takeoff|flyout|land|done`), `data-objective-back`, `data-objective-runway`,
`data-objective-done` (count), `data-max-dist`. Chip `wingflyer-objective`:
`data-step`, per-step `wingflyer-obj-{takeoff,flyout,land}` `data-done`,
`wingflyer-obj-count`; banner `wingflyer-landed-banner`
`data-objective-complete`. Round 1b adds the mission
chip (`data-score`, `data-stars`, …).

### e2e suites (shipped, `e2e/README.md` has the detail)

Node (bundled pure modules): `170-wing-physics` (stall, top speed, trim,
glide ratio, turn radius — both planes), `171-wing-assists` (each level,
Panic, launch), `172-wing-ground` (touchdown classes, approach geometry,
runway take-off, a full Trainer approach + landing + roll-out, touch-and-
go, belly landing on grass, crash, soft edge). Browser: `173-wing-core`,
`174-wing-input`, `175-wing-pause`, `176-wing-flight` (a live keyboard
circuit that lands, then a crash). Planned for later rounds: rings,
soaring, combat, records.

---

## 13. Delivery rounds (decided)

| Round | Scope |
| --- | --- |
| **0. This note** | Design review with the user. |
| **1a. Fly it** | `planeModel` + assists + physics suites; island + strip; both airframes; latching throttle; chase + FPV cameras; hand-launch (avatar holding the plane) + trainer runway take-off + landing roll-out; crash/respawn; minimal HUD; help overlay; auto-pause; settings; sound. **Free Flight only** — no mode menu yet. |
| **1b. Score it** | Landing classification + scorecard; mode menu (all five modes, Rings/Soaring/Combat greyed "Coming soon"); Landing missions 1–5; stars + assist badges; records. |
| **2. Rings** | Ring / balloon / limbo / pylon missions, stars, ghost; endless course. |
| **3. Soaring** | `airModel` thermals + ridge, birds, variometer, battery, duration missions. |
| **4. Combat** | Balloons → ground targets → streamers → enemy planes → boss; endless waves. |
| **5. Polish** | Full OSD, Pilot view, licences, hub markers. |

---

### Round 1 build decisions

| # | Question | Decision |
| --- | --- | --- |
| R1 | Round size | **Split** into 1a "Fly it" and 1b "Score it" — try the flying feel before missions are built on it |
| R2 | Shared code | **Import in place** from `droneSim/` and `tankBattle/` (as Drone Strike does); needed changes are additive and default-off (joystick `latchY`, terrain scale param) so existing widgets are unchanged. The `shared/` hoist is a future refactoring session (backlog) |
| R3 | First-run help | **Help overlay** on the first flight (Tank Battle's pattern): sticks, Panic, Launch, keyboard keys; says throttle is automatic in Trainer; once per device, **?** reopens it |
| R4 | Unfinished modes (1b) | Shown greyed **"Coming soon"** in the mode menu |
| R5 | Pilot figure | Player 1's avatar `Model3D` (the Drone Sim operator) **stands** at the strip end, plane held at hand height; Launch flies it out of their hands — no new animation. Beside the strip for a runway start. Throw animation → backlog |

### Landing help (decided after the step-4 play-test)

The step-4 build had no landing at all (any ground contact crashed), and the
play-test showed a second, real problem: lining a plane up with the runway
is hard. Decided for step 5: **land on grass** (any dry, gentle slope, not
just the runway), **approach hoops** (6 per runway end on a 7° glide slope,
drawn from the pure `approachPath` data), **home arrow + distance** (moved
up from step 6), **Trainer auto-flare** (descent rate limited near the
ground), a **bigger runway** (130×14 → 200×30 m) and **45° Trainer bank**
(was 35° — too wide a turn to line up). **Auto-land** ("Land" button: an
assist mode that flies the same `approachPath`) goes to the backlog — the
path being data is what keeps it cheap to add later.

### Round 1a step plan

Each step ends with a check; the user can stop or redirect between steps.
Checkpoints for the user to try the feel: after **step 4** and **step 7**.

| Step | Builds | Check |
| --- | --- | --- |
| 1 | `planeModel.ts` — pure fixed-step flight model + airframe specs | node suite: stall speed, turn radius, glide ratio |
| 2 | `assists.ts` — Trainer/Normal/Acro, Panic, launch + runway autopilots | node suite: release levels, Panic recovers inverted, stall protection |
| 3 | Widget shell (catalog, registry, lazy chunk) + island (scaled terrain, strip, town, fog) | island renders |
| 4 | Plane meshes + controls (latching throttle, keyboard, gamepad) + chase cam | **first flight — user checkpoint** |
| 5 | Avatar at the strip, hand launch, runway take-off, roll-out, crash/respawn | launch → fly → land → crash → respawn |
| 6 | FPV cam, minimal HUD, auto-pause, help overlay, settings panel | full 1a experience |
| 7 | Sound, haptics, phone performance | **user checkpoint** |
| 8 | e2e suites (170+), docs, lessons; drone/strike/tank suites re-run | build + lint + e2e green |

All eight steps shipped (§0). The step-4 checkpoint was merged so the user
could fly it; its play-test produced the landing-help decisions above.

## 14. Decisions (all answered with the user)

| # | Question | Decision |
| --- | --- | --- |
| — | Controls / world / aircraft (first round) | Mode 2 twin-stick; new ~800 m island + airstrip; both airframes selectable |
| 1 | Game structure | **C** — missions with 1–3 stars per mode **plus an endless challenge per mode** unlocked after its missions; open-world hub later |
| 2 | Assists | Three levels, RC names **Trainer / Normal / Acro**, **Trainer default**; stars same in any assist with an **"earned in" badge** (lowest assist used counts; hardest badge kept) |
| 3 | Combat tone | **Gentle first, made easy:** balloons → ground targets → streamer cutting → dogfight → boss; cartoon effects; 3 hearts; fixed guns only; **aim assist on by default, generous** |
| 4 | Name | **Wing Flyer** (`wingFlyer`) |
| 5 | Launch | **B** — hand-launch for both planes **and** runway take-off for the trainer; Trainer assist auto-straightens and auto-rotates; Free Flight offers both buttons; missions set their own start; crash respawn is never at the runway; Landing 1 = take off, one lap, land |
| 6 | Free Flight objective (after the 1a play-test) | **C**: a goal chip now, Round 1b's missions on top. "A lap" = **fly out 150 m and come back inside 100 m** (option 2); shown as a **progress chip under the HUD** (option 1); **grass completes it, the runway earns a "Runway!" mark** (option 3) |

---

## 15. What web verification corrected

The first draft was written from background knowledge; a verification
pass against web sources changed:

| Was | Now | Why |
| --- | --- | --- |
| Stall at α ≈ 15° | ~15–18° (airfoil-dependent), model uses 16° | FAA-derived sources |
| ArduPlane bank limit `LIM_ROLL_CD` | `ROLL_LIMIT_DEG` (degrees); old name was centidegrees | ArduPlane docs/forum |
| Normal assist: fixed 60° bank | Bank limit shrinks near stall speed, floor 25° | ArduPlane `STALL_PREVENTION` |
| Trainer: "terrain floor" forced pull-up < 6 m | Self-level **on released sticks** < 9 m AGL | Horizon SAFE's actual rule; War Thunder players' complaints about forced near-ground control |
| SAFE beginner bank "25–30°" | Not published for airplanes; ours is tuning | Horizon pages give no airplane figure |
| Launch: level, +8° for 1.5 s | Motor-delay beat, ~15° climb to 15 m, stick aborts | INAV launch defaults (500 ms, 18°) |
| Landing score: list of rows | `(spot + centreline) × smoothness` | MSFS Landing Challenge formula |
| Chase cam: rigid horizon lock | Damped, partial roll follow + comfort slider; steady frame times | Motion-sickness guidance |
| "F3K precision duration" | F3J-style exact-time + spot landing; F3K = capped short flights | FAI / event descriptions |
| Licences: generic tiers | Pilotwings classes; next class at avg 2 stars | Pilotwings Resort reviews |
| Thermal profile "from Allen" | Game-tuned columns; Allen formulas not retrieved | NTRS abstract only |
| Trainer stall 7 m/s (unanchored) | Anchored to Apprentice STS (≈8 m/s real); 7 kept on purpose | Product specs |
| Glide ratio 8:1 stated as fact | Marked as an estimate | No RC source found |
| Streamer combat: "cut them" | Cut = kill points; plane keeps flying after losing it | RC combat articles |

---

## Future work (enhancement backlog)

Nothing is shipped yet; every item names the integration point it builds on.

### Gameplay & modes
- **Open-world hub** — mission markers and hidden stunt gates placed in
  Free Flight (`missions.ts` specs rendered as world markers).
- **Licence tests** — Beginner → Gold tiers gated by total stars; unlock
  the wing / dusk / weather (records stars).
- **Water-drop firefighting** — scoop on a low pass over the lake, drop on
  seeded fires (lake in `islandLayout`, drop = the strike ballistic lob).
- **Parcel delivery / airmail** — release over rooftop targets; leading the
  drop is the skill (ballistic lob + `TrajectoryArc` hint).
- **Photo hunt** — frame landmarks in a viewfinder (camera frustum test).
- **Follow the leader / formation** — an AI plane on a seeded path; stay
  within a range ring (pursuit autopilot from Combat).
- **Trick detection** — loop / roll / inverted pass / knife-edge combos for
  score (attitude-history pattern matcher in Acro).
- **Daily seeded challenge** — date → seed (computed in the body, never in
  pure modules), the tank/strike backlog idea.
- **Banner tow** — relaxed low-skill mode: lap the beach without stalling.

### Combat extras
- **Weapon picker** — Drone Strike's laser / missiles / shotgun carried
  over (deferred: v1 is fixed guns only).
- **Aim-assist badge** — like the assist badge, mark stars earned with aim
  assist off.

### Enemies & AI (Combat)
- Pursuit-autopilot enemy planes; AA tracer fire from the ground; a slow
  bomber "boss" with weak points (Drone Strike `bossModel` pattern).

### Controls & feel
- Point-to-fly, tilt-to-steer (gyroAim plumbing), one-stick and
  left-handed layouts; rates/expo tuning panel (drone `Tuning` reuse);
  prop-torque swing on the runway take-off roll (Acro only); flaps button.
- **Auto-land ("Land" button)** — a Trainer assist mode that flies the
  `approachPath` hoops and lands while the player watches (ArduPilot
  RTL + LAND style); the approach path is already pure data and the assist
  already has per-mode outer loops, so it is one more mode.
- **Throw animation** — a real hand-launch throw for the avatar; best as a
  shared `throw` action for every avatar (like the shared `walk` gait), so
  other games can use it.

### Help & comfort
- **Per-device help** — `helpSeen` is per widget (Tank Battle pattern);
  move it to the `ui` slice if a second Wing Flyer widget re-showing the
  help ever matters.
- **Scrolled-away pause e2e** — `175-wing-pause` drives blur / hidden tab /
  dialog; the IntersectionObserver path shares `pause()` but needs a
  taller board to scroll in a suite.

### Code health
- **`shared/` hoist (refactoring session)** — move the pieces Wing Flyer
  imports in place (`VirtualJoystick`, `externalInput`, `webAudio`,
  `haptics`, `boomClipT`/`crossedGate`, `sparkModel`, the combat pool,
  `tankBattle/terrain`) into `components/widgets/shared/`, re-pointing
  Drone Sim / Drone Strike / Tank Battle; re-run all their suites.

### Simulation depth
- True aerodynamic moments mode ("Manual" below Acro); gusty turbulence;
  wind gradient near the ground; spins for the trainer in Acro.

### World & visuals
- Dusk / night palettes (drone `palettes.ts`), rain, a second island seed
  picker, landing-light glide slope (PAPI lights).

### Meta & multiplayer
- **2-Device race** on Rings (the maze / car-park race wire: `sync` / `go`
  / `pos` / `done`); best-run ghost; per-airframe bests; paint schemes from
  avatar colours.

---

## Sources

Verified by web search in the design round (search snippets; `ardupilot.org`
pages could not be fetched directly — blocked by this environment's
network proxy — so ArduPilot facts rest on search results and forum
threads, and should be re-checked against the docs for the target firmware).

- ArduPlane FBWA mode: https://ardupilot.org/plane/docs/fbwa-mode.html
- ArduPlane stall prevention: https://ardupilot.org/plane/docs/stall-prevention.html
- FBWA roll-limit units pitfall (forum): https://discuss.ardupilot.org/t/fbwa-not-obeying-roll-pitch-lims/4214
- INAV Auto Launch (NAV LAUNCH): https://github.com/iNavFlight/inav/wiki/Auto-Launch-(NAV_LAUNCH)
- Horizon SAFE (Apprentice S 2 product page): https://horizonhobby.com/product/apprentice-s-2-1.2m-rtf-basic-with-safe/HBZ310001.html
- Blade 200 SR X review (SAFE bank limits on a heli): https://library.modelaviation.com/article/horizon-hobby-blade-200-sr-x-bnfrtf-helicopter-201412
- Apprentice STS specs: https://www.skyraccoon.com/aircraft/E-flite_Apprentice-STS_EFL3700
- ZOHD Dart XL Enhanced specs: https://www.buddyrc.com/products/zohd-dart-xl-extreme-enhanced-fpv-wing-pnp
- Critical AoA and stall speed vs load factor: https://www.cfinotebook.net/notebook/aerodynamics-and-performance/stall-performance
- Allen updraft model (NASA, 2006): https://ntrs.nasa.gov/citations/20060004052
- NASA autonomous soaring flights: https://appel.nasa.gov/2006/01/01/learning-to-soar/
- Slope soaring basics (AMA): https://www.amaflightschool.org/getstarted/soar
- Introduction to Slope Soaring (Model Aviation): https://www.modelaviation.com/node/2074
- PicaSim review (challenges): https://www.modelaviation.com/picasim-slope-simulator
- F3K overview (FAI): https://fai.org/node/22083 · Discus Launch Glider: https://en.wikipedia.org/wiki/Discus_Launch_Glider
- RC combat streamer scoring: https://library.modelaviation.com/article/radio-control-combat-200803
- MSFS Landing Challenges scoring: https://flight.wiki.gg/wiki/Microsoft_Flight_Simulator_(2020)/Landing_Challenges
- Pilotwings Resort structure: https://www.giantbomb.com/-/3030-31748/ · https://www.gamesasylum.com/?p=6368
- War Thunder instructor: https://wiki.warthunder.com/Instructor/How_the_instructor_works
- Flight-sim motion sickness guidance: https://flyawaysimulation.com/ask/answers/reduce-motion-sickness-flight-simulators/

Not verified (background knowledge only): the lift/drag equations and
turn-radius formula (textbook physics), Luftrausers' instant restart, and
the other game-design examples in §10.
