/**
 * Seeded wave generation for Drone Strike. `buildWave(seed, waveIndex,
 * layout)` deterministically places that wave's targets in the (equally
 * seeded) city — the same widget seed always produces the same campaign, so
 * e2e suites can fly to known targets. Target runtime state lives in a
 * pre-allocated fixed-size pool mutated in place (lesson #30: pure module,
 * no Date.now/Math.random inside step functions).
 *
 * Wave curve: **every target kind can appear from wave 1** — static balloons,
 * drifting ring-drones, road vehicles (military trucks + SWAT cars),
 * patrolling enemy drones, AA turrets and rooftop-stationed avatar soldiers.
 * There is no per-kind appearance
 * gate; instead the *difficulty* preset (count/speed/evade), a **wave-scaled
 * enemy throttle** (`enemyAggressionScale` — early drones crawl) and the
 * return-fire gate (`ENEMY_FIRE_WAVE`, so enemies + turrets hold fire on
 * wave 1) do the easing. (`*_WAVE_START` / `TURRET_WAVE` are all 1 now; kept
 * as named anchors for the count ramps.)
 */
import type { Vec3 } from '../droneSim/flightModel'
import { SPAWN, WORLD_HALF } from '../droneSim/flightModel'
import type { WorldLayout } from '../droneSim/worldLayout'

export type TargetKind =
  | 'balloon'
  | 'ringDrone'
  | 'enemy'
  | 'ground'
  | 'turret'
  | 'car'
  | 'soldier'
  | 'jet'

export interface TargetSpec {
  kind: TargetKind
  x: number
  y: number
  z: number
  radius: number
  /** Sinusoidal drift around the anchor; 0 = static. */
  driftAmp: number
  driftSpeed: number
  driftPhase: number
  driftAxis: 0 | 1 | 2
  hp: number
  points: number
  /** Per-kind sub-type. Soldier: 0 = rocket (Bazooka Joe), 1 = SMG (Scar) —
   * drives both the weapon fired (StrikeRig) and the rendered model
   * (SoldierTargets), so the two always agree. Enemy: 0 = orbiter, 1 =
   * kamikaze CHASER (pursues + rams; see enemyAI). Undefined / 0 elsewhere. */
  variant?: 0 | 1
  /** Soldier patrol shape: 0 = line (paces back & forth along `routeAngle`),
   * 1 = loop (circles the anchor at radius `driftAmp`). Undefined / 0 for
   * every other kind. */
  routeKind?: 0 | 1
  /** Soldier line route heading, radians (dir = (cos, sin)); 0 = +x, π/2 = +z.
   * Ignored for loops. */
  routeAngle?: number
}

/** What a crate can hold — non-weapon loot only: a bonus heart or a score
 * cache. Weapon drops died with the in-game weapon chip (any gun is a free
 * swipe away, so "equip a special" stopped being a reward); the planned
 * crate-exclusive super weapon (see the backlog) will bring a gun back. */
export type CrateLoot = 'heart' | 'score'

/** A rooftop supply crate — NOT a target: it isn't shootable, doesn't count
 * toward the wave clear, and lives beside the target list on the WaveSpec.
 * Flying onto it grants its loot: a heart adds one (stacking PAST the
 * nominal max — 4+ hearts is the reward for the detour), a cache pays
 * CRATE_SCORE. */
export interface CrateSpec {
  x: number
  z: number
  /** Roof height the crate sits on (the disc's y). */
  top: number
  /** The loot the crate grants. */
  loot: CrateLoot
}

/** Which loot the wave's crate holds, by `waveIndex % length` — hearts on
 * even waves, caches on odd. */
export const CRATE_ROTATION = ['heart', 'score'] as const

/** Points a score-cache crate pays. */
export const CRATE_SCORE = 50

/** What picking a crate up grants — pure so the rule is e2e-pinned: a heart
 * is ALWAYS +1 (uncapped — at full hearts it stacks on as an overheal, never
 * converts or evaporates), a cache is always the points. */
export function resolveCrateGrant(loot: CrateLoot): { hearts: number; score: number } {
  return loot === 'heart' ? { hearts: 1, score: 0 } : { hearts: 0, score: CRATE_SCORE }
}

export interface WaveSpec {
  index: number
  targets: TargetSpec[]
  enemiesShoot: boolean
  /** Rooftop weapon crate, from CRATE_FROM_WAVE on (when a roof qualifies). */
  crate?: CrateSpec
}

/** Enemy drones appear from this wave — wave 1, but wave-throttled
 * (`enemyAggressionScale`) so early drones crawl; difficulty scales the rest. */
export const ENEMY_WAVE_START = 1
/** From this wave the LAST enemy of each wave is a kamikaze CHASER
 * (`variant: 1` — lurks on its orbit, then pursues and rams). Waves 1–2 stay
 * all-orbiter so the opening waves teach the basic enemy first. */
export const CHASER_FROM_WAVE = 3
/** A chaser is worth more than an orbiter — shooting it down before it
 * connects is the payoff. */
export const CHASER_POINTS = 35
/** ...and shoot back from this one (normal; difficulty shifts it). Every
 * difficulty's fireWave is > 1, so wave-1 enemies + turrets hold fire. */
export const ENEMY_FIRE_WAVE = 5
/** Jet-trooper flying gunners (the Jet Trooper avatar as an airborne enemy)
 * appear from this wave — the opening wave stays jet-free so the sky reads
 * as drones-only while the basics are taught. */
export const JET_WAVE = 2
/** Military supply trucks (moving road vehicles) appear from this wave. */
export const GROUND_WAVE_START = 1
/** Moving cars (road-bound) appear from this wave — from the very first
 * wave, gently (see the wave-scaled speed in buildWave). */
export const CAR_WAVE_START = 1
/** AA turrets (static ground enemies) appear from this wave — wave 1, but
 * they hold fire until the difficulty's fireWave (all > 1). */
export const TURRET_WAVE = 1
/** Rooftop-stationed avatar soldiers (static, rendered from the Scar /
 * Bazooka Joe avatar `Model3D`s) appear from this wave — wave 1, holding
 * fire until the difficulty's fireWave like the AA turrets. */
export const SOLDIER_WAVE = 1
/** Hard cap on simultaneous targets (perf budget: one InstancedMesh).
 * Sized for the worst case: gallery balloons + drifters + enemy drones +
 * jet troopers + ground trucks + moving cars + AA turrets + patrolling
 * soldiers (rooftop + ground) — the gallery trim funded the jets, so the
 * cap holds. Pool + instanced capacity are pre-allocated so headroom is
 * free. */
export const MAX_TARGETS = 28

/**
 * Wave-scaled enemy-aggression throttle. Enemy drones can appear from wave 1
 * now, so their whole movement — orbit rate, evade burst AND the vertical
 * evade jink — is scaled up with the wave: **wave 1 = 15 %**, reaching full by
 * ~wave 6, so an early drone is a near-static hover that's trivial to track.
 * Applied in the body when it builds the `enemyMove` fed to `stepEnemy`
 * (scales `orbitMult`, eases `evadeMult` toward 1, and carries a `jinkScale`),
 * NOT baked into the seeded spec — so placement seeds are untouched.
 */
export function enemyAggressionScale(waveIndex: number): number {
  return Math.min(1, 0.15 + 0.17 * (waveIndex - 1))
}

/** Enemy difficulty — scales how hard the AI drones are to hit and how
 * much pressure they apply. Easy is the default (see widgetCatalog). */
export type Difficulty = 'easy' | 'normal' | 'hard'

export interface DifficultyPreset {
  /** Orbit angular-speed multiplier. */
  orbitMult: number
  /** Evade-burst speed multiplier (normal reproduces the old constant). */
  evadeMult: number
  /** Evade-burst duration, seconds. */
  evadeTime: number
  /** Enemy hit points. */
  enemyHp: number
  /** Max simultaneous enemies at high waves. */
  enemyCap: number
  /** Wave from which enemies return fire. */
  fireWave: number
  /** Kamikaze-chaser pursuit-speed multiplier. */
  chaseMult: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyPreset> = {
  easy: { orbitMult: 0.4, evadeMult: 1.4, evadeTime: 0.7, enemyHp: 1, enemyCap: 2, fireWave: 7, chaseMult: 0.75 },
  normal: { orbitMult: 1, evadeMult: 2.6, evadeTime: 1.2, enemyHp: 2, enemyCap: 4, fireWave: ENEMY_FIRE_WAVE, chaseMult: 1 },
  hard: { orbitMult: 1.3, evadeMult: 3, evadeTime: 1.4, enemyHp: 2, enemyCap: 4, fireWave: 4, chaseMult: 1.2 },
}

export const coerceDifficulty = (v: unknown): Difficulty | undefined =>
  v === 'easy' || v === 'normal' || v === 'hard' ? v : undefined

export const POINTS: Record<TargetKind, number> = {
  balloon: 10,
  ringDrone: 15,
  enemy: 25,
  ground: 20,
  turret: 30,
  car: 25,
  soldier: 40,
  jet: 30,
}

/** Same PRNG as the world builder — copied, not exported from worldLayout,
 * so the two modules stay independent. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MIN_TARGET_GAP = 6
const MIN_FROM_SPAWN = 14
const ALT_MIN = 3
const ALT_MAX = 22

/* Soldier patrol tuning. A patrol walks a route (line or loop) via stepDrift's
 * soldier branch. `driftSpeed` is the angular rate; peak/tangential LINEAR
 * speed ≈ amp·rate, so we derive `driftSpeed = SOLDIER_WALK_SPEED / amp` to
 * hold a believable ~walking pace regardless of beat/loop size. */
const SOLDIER_WALK_SPEED = 1.3
/** Keep a pacing rooftop soldier's feet on the roof (margin from the edge). */
const SOLDIER_ROOF_MARGIN = 0.8
/** Cap a rooftop beat so big roofs don't give a marathon pace. */
const SOLDIER_ROOF_PACE_CAP = 2.4
/** Below this half-beat a roof is too small to pace → a standing sentry. */
const SOLDIER_MIN_PACE = 1

/** Firing-plant tuning (rocket soldiers). A rocket soldier HALTS to loose its
 * rocket — it plants when a clear shot is within this lead of the next volley,
 * a brief windup so the kneel precedes the launch… */
export const SOLDIER_PLANT_LEAD = 0.35
/** …and stays planted this long after the shot, covering the kneel-read before
 * it stands and resumes the patrol. */
export const SOLDIER_PLANT_TAIL = 0.9

/**
 * Pure firing-plant driver for a soldier. Given its `variant`, whether it has a
 * clear shot right now (`hasShot`), the seconds until its next volley
 * (`cooldown`) and the plant timer it already holds (`current`), return the
 * plant timer to hold. Only **rocket** soldiers (variant 0) plant — through the
 * windup and the shot; SMG soldiers (variant 1) run-and-gun and never plant.
 * Never shortens an existing plant. Kept pure so the soldier suite asserts it
 * off-canvas (the halt/freeze itself lives in `StrikeRig` + `stepDrift`).
 */
export function soldierPlantHold(
  variant: 0 | 1,
  hasShot: boolean,
  cooldown: number,
  current: number,
): number {
  if (variant !== 0 || !hasShot) return current
  if (cooldown <= SOLDIER_PLANT_LEAD) {
    return Math.max(current, Math.max(cooldown, 0) + SOLDIER_PLANT_TAIL)
  }
  return current
}
/** Ground patrol half-beat length (world units). */
const SOLDIER_GROUND_BEAT_MIN = 4
const SOLDIER_GROUND_BEAT_VAR = 3
/** Torso height of a soldier's hit sphere above its feet. */
const SOLDIER_TORSO = 0.9

/** Would a target (with its drift envelope) intersect a building? */
function clearOfBuildings(
  layout: WorldLayout,
  x: number,
  y: number,
  z: number,
  reach: number,
): boolean {
  return !layout.buildings.some(
    (b) =>
      Math.abs(x - b.x) < b.w / 2 + reach &&
      Math.abs(z - b.z) < b.d / 2 + reach &&
      b.h > y - reach,
  )
}

/**
 * Build wave `waveIndex` (1-based) for a world seed. Draws from its own
 * PRNG stream (seed ⊕ wave hash) so waves are independent of each other and
 * of the world-builder stream.
 */
export function buildWave(
  seed: number,
  waveIndex: number,
  layout: WorldLayout,
  difficulty: Difficulty = 'normal',
): WaveSpec {
  const diff = DIFFICULTY[difficulty]
  const rand = mulberry32((seed ^ Math.imul(waveIndex, 0x9e3779b1)) >>> 0)
  const targets: TargetSpec[] = []

  const place = (spec: Omit<TargetSpec, 'x' | 'y' | 'z'>): void => {
    if (targets.length >= MAX_TARGETS) return
    // Ground targets (trucks, AA turrets) sit on the deck; their hit-sphere
    // centre rides just above ground rather than in the altitude band.
    const onDeck = spec.kind === 'ground' || spec.kind === 'turret'
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = (rand() * 2 - 1) * (WORLD_HALF - 8)
      const z = (rand() * 2 - 1) * (WORLD_HALF - 8)
      // Keep the whole drift envelope above the ground band.
      const yLo = ALT_MIN + spec.driftAmp
      const y = onDeck ? 1 : yLo + rand() * Math.max(1, ALT_MAX - yLo)
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < MIN_FROM_SPAWN) continue
      const reach = spec.radius + spec.driftAmp + 0.5
      if (!clearOfBuildings(layout, x, y, z, reach)) continue
      if (
        targets.some(
          (t) =>
            Math.hypot(x - t.x, z - t.z) <
            MIN_TARGET_GAP + spec.driftAmp + t.driftAmp,
        )
      ) {
        continue
      }
      targets.push({ ...spec, x, y, z })
      return
    }
    // Sampling exhausted (dense seed): stack a fallback high (or on the deck
    // for ground targets) near the pad approach where nothing can occlude it.
    targets.push({
      ...spec,
      x: 0,
      y: onDeck ? 1 : ALT_MAX + 4 + targets.length,
      z: -10,
      driftAmp: 0,
    })
  }

  // Gallery targets: count and drift scale with the wave, size shrinks.
  // Kept lean so the wave has room for the road vehicles and the flying
  // jet troopers (the gallery was trimmed 3+w/8 → 2+w/6 to fund the jets).
  const balloons = Math.min(2 + waveIndex, 6)
  const radius = Math.max(0.8, 1.4 - waveIndex * 0.06)
  // Drifting ring-drones from wave 1 (no appearance gate) — half the gallery.
  const drifters = Math.ceil(balloons / 2)
  for (let i = 0; i < balloons; i++) {
    const drifting = i < drifters
    place({
      kind: drifting ? 'ringDrone' : 'balloon',
      radius,
      driftAmp: drifting ? 1.5 + rand() * (1 + waveIndex * 0.3) : 0,
      driftSpeed: drifting ? 0.6 + rand() * 0.8 : 0,
      driftPhase: rand() * Math.PI * 2,
      driftAxis: drifting ? ((Math.floor(rand() * 3) % 3) as 0 | 1 | 2) : 0,
      hp: 1,
      points: drifting ? POINTS.ringDrone : POINTS.balloon,
    })
  }

  // Road vehicles — military supply trucks (`ground`, MilitaryTruck model) +
  // SWAT cars (`car`, LegoSwatTruck model): both road-bound movers that drive
  // the city's lanes, reusing the world's road network + the decorative-
  // traffic motion model (see stepDrift's road branch). Trucks and cars share
  // one lane allocator (`laneSlot`) so the two kinds spread across the city's
  // lanes instead of stacking. Drawn before the difficulty-gated enemy block
  // so their counts and road/speed draws stay difficulty-independent (pure
  // practice, identical across Easy/Normal/Hard — lesson #54).
  let laneSlot = 0
  const placeRoadVehicle = (kind: TargetKind, radius: number, points: number) => {
    if (targets.length >= MAX_TARGETS || layout.roads.length === 0) return
    const road = layout.roads[laneSlot % layout.roads.length]
    laneSlot++
    const dir = rand() < 0.5 ? 1 : -1
    // Wave-scaled speed: gentle movers early (wave 1 ≈ 2.5–5 u/s) ramping to
    // ≈4–8 by wave 5 — fair to lead as a new mechanic, harder as waves climb.
    const speed = (4 + rand() * 4) * Math.min(1, 0.5 + 0.12 * waveIndex) * dir
    const start = rand() * WORLD_HALF * 2
    // Ride one side of the lane, matching RichWorld's decorative traffic.
    const lane = road.at + (dir > 0 ? 0.8 : -0.8)
    const alongX = road.axis === 'x'
    targets.push({
      kind,
      // The moving axis is overwritten each frame; the fixed axis is the
      // lane. y ≈ 1 seats the hit sphere just above the deck.
      x: alongX ? 0 : lane,
      y: 1,
      z: alongX ? lane : 0,
      radius,
      driftAmp: 0,
      driftSpeed: speed, // signed → direction of travel
      driftPhase: start, // start offset along the road
      driftAxis: alongX ? 0 : 2,
      hp: 1,
      points,
    })
  }

  // Military supply trucks (wave 1+): moving road vehicles — like the SWAT
  // cars, they now drive from the very first wave (the model spins its wheels
  // as it moves), gently at first via the wave-scaled speed.
  const trucks =
    layout.roads.length > 0 && waveIndex >= GROUND_WAVE_START
      ? Math.min(1 + Math.floor(waveIndex / 3), 4)
      : 0
  for (let i = 0; i < trucks; i++) placeRoadVehicle('ground', 1.1, POINTS.ground)

  // SWAT cars (wave 1+): moving road vehicles.
  const cars =
    layout.roads.length > 0 && waveIndex >= CAR_WAVE_START
      ? Math.min(1 + Math.floor(waveIndex / 3), 3, layout.roads.length)
      : 0
  for (let i = 0; i < cars; i++) placeRoadVehicle('car', 1, POINTS.car)

  // Enemy drones (wave 1+): placed like targets, moved by the AI at runtime.
  // The drift fields carry their orbit: amp = orbit radius (so placement
  // clears the whole envelope), speed = angular rate, phase = start angle.
  // The wave throttle (`enemyAggressionScale`) is applied in the body's
  // `enemyMove`, not baked here, so the seeded spec stays deterministic.
  const enemies =
    waveIndex >= ENEMY_WAVE_START
      ? Math.min(waveIndex - ENEMY_WAVE_START + 1, diff.enemyCap)
      : 0
  for (let i = 0; i < enemies; i++) {
    // From CHASER_FROM_WAVE the LAST enemy of the wave is the kamikaze
    // chaser (variant 1, bonus points) — derived from the loop index, never
    // from a rand() draw, so the crate/soldier picks downstream of this
    // block stay byte-identical (the append-only stream rule, lesson #54).
    const chaser = waveIndex >= CHASER_FROM_WAVE && i === enemies - 1
    place({
      kind: 'enemy',
      radius: 0.6,
      driftAmp: 4 + rand() * 4,
      driftSpeed: 0.5 + rand() * 0.4,
      driftPhase: rand() * Math.PI * 2,
      driftAxis: 0,
      hp: diff.enemyHp,
      points: chaser ? CHASER_POINTS : POINTS.enemy,
      variant: chaser ? 1 : 0,
    })
  }

  // Jet-trooper flying gunners (JET_WAVE+): the Jet Trooper avatar airborne.
  // Seeded through the same air path as the gallery (`place()` validates the
  // whole drift envelope against the buildings); the drift fields carry a
  // horizontal sinusoid strafe (stepDrift's generic branch — jets are NOT in
  // its enemy exclusion, the sinusoid IS their flight), and the rig fires
  // their beam via stepTurret like a flying turret. Difficulty-gated
  // (enemyCap clamp + hp), so this block sits after the difficulty-
  // independent trucks/cars (lesson #54).
  const jets =
    waveIndex >= JET_WAVE
      ? Math.min(1 + Math.floor((waveIndex - JET_WAVE) / 3), 2, diff.enemyCap)
      : 0
  for (let i = 0; i < jets; i++) {
    place({
      kind: 'jet',
      radius: 0.9,
      driftAmp: 3 + rand() * 2,
      driftSpeed: 0.5 + rand() * 0.4,
      driftPhase: rand() * Math.PI * 2,
      driftAxis: (i % 2 === 0 ? 0 : 2) as 0 | 2,
      hp: diff.enemyHp,
      points: POINTS.jet,
    })
  }

  // AA turrets (TURRET_WAVE+): static ground enemies that fire back up.
  // Gated by difficulty like the drones (count clamped by enemyCap, hp and
  // return fire follow the preset).
  const turrets =
    waveIndex >= TURRET_WAVE
      ? Math.min(1 + Math.floor((waveIndex - TURRET_WAVE) / 2), 2, diff.enemyCap)
      : 0
  for (let i = 0; i < turrets; i++) {
    place({
      kind: 'turret',
      radius: 1,
      driftAmp: 0,
      driftSpeed: 0,
      driftPhase: 0,
      driftAxis: 0,
      hp: diff.enemyHp,
      points: POINTS.turret,
    })
  }

  // Patrolling soldiers (SOLDIER_WAVE+): avatar-model enemies rendered from the
  // Scar / Bazooka Joe `Model3D`s (see SoldierTargets), now on the MOVE. The
  // first ⌈count/2⌉ are **rooftop** soldiers that pace their roof; the rest are
  // **ground** soldiers that patrol a free-roam beat anywhere on open ground
  // (not road-bound). Both pace via `stepDrift`'s sinusoid branch — seeded with
  // `driftAmp > 0` + a horizontal `driftAxis` — so no bespoke movement step is
  // needed; the fire step (`stepTurret`) reads the moving `t.pos` unchanged.
  // Weapon `variant` alternates (rocket/SMG); gated by difficulty like the
  // drones/turrets (count clamped by enemyCap, hp + return fire per preset).
  const soldiers =
    waveIndex >= SOLDIER_WAVE
      ? Math.min(1 + Math.floor(waveIndex / 3), 3, diff.enemyCap)
      : 0
  const rooftopSoldiers = Math.ceil(soldiers / 2)

  // Rooftop pacers — bespoke placement: unlike every other kind they sit ON a
  // building, so they bypass `clearOfBuildings` and seat their torso just above
  // the roof (`b.h + SOLDIER_TORSO`). Perch = a fair sentry post (tall enough
  // to see over the skyline but not a megatower, a footprint the model fits on,
  // away from spawn). The pace runs along the roof's longer axis, its half-beat
  // clamped so the soldier never walks off the edge; a roof too small to pace
  // falls back to a standing sentry (`driftAmp = 0`).
  const perches = layout.buildings
    .map((b, bi) => ({ b, bi }))
    .filter(
      ({ b }) =>
        b.h >= 5 &&
        b.h <= 16 &&
        b.w >= 2.5 &&
        b.d >= 2.5 &&
        Math.hypot(b.x - SPAWN.x, b.z - SPAWN.z) > MIN_FROM_SPAWN,
    )
  const usedBuildings = new Set<number>()
  for (let i = 0; i < rooftopSoldiers; i++) {
    if (targets.length >= MAX_TARGETS || perches.length === 0) break
    let pick = perches[Math.floor(rand() * perches.length)]
    for (let a = 0; a < 8 && usedBuildings.has(pick.bi); a++) {
      pick = perches[Math.floor(rand() * perches.length)]
    }
    if (usedBuildings.has(pick.bi) && usedBuildings.size >= perches.length) break
    usedBuildings.add(pick.bi)
    const alongX = pick.b.w >= pick.b.d
    const half = (alongX ? pick.b.w : pick.b.d) / 2 - SOLDIER_ROOF_MARGIN
    const amp = half >= SOLDIER_MIN_PACE ? Math.min(half, SOLDIER_ROOF_PACE_CAP) : 0
    targets.push({
      kind: 'soldier',
      x: pick.b.x,
      y: pick.b.h + SOLDIER_TORSO,
      z: pick.b.z,
      radius: 1,
      driftAmp: amp,
      driftSpeed: amp > 0 ? SOLDIER_WALK_SPEED / amp : 0,
      driftPhase: rand() * Math.PI * 2,
      driftAxis: alongX ? 0 : 2,
      hp: diff.enemyHp,
      points: POINTS.soldier,
      // Alternate rocketeer (Bazooka Joe) / gunner (Scar) by order.
      variant: (i % 2) as 0 | 1,
      // Rooftop = an axis-aligned line pace (kept on the roof); heading along
      // the longer footprint axis.
      routeKind: 0,
      routeAngle: alongX ? 0 : Math.PI / 2,
    })
  }

  // Ground patrols — walk a free-roam route ANYWHERE on open ground (not tied
  // to road lanes). Each is either a **diagonal line** (paces back & forth
  // along a random heading) or a **loop** (circles its anchor). Sample a centre
  // clear of the spawn/buildings, then validate the WHOLE route clears the city
  // — a line's two endpoints, or several points sampled around the loop — so
  // the soldier never walks into a wall. Seat the torso at ground level
  // (`SOLDIER_TORSO`); SoldierTargets plants the feet at y = 0.
  const inBounds = (px: number, pz: number) =>
    Math.abs(px) <= WORLD_HALF - 4 && Math.abs(pz) <= WORLD_HALF - 4
  const y = SOLDIER_TORSO
  const reach = 1 + 0.6
  for (let i = rooftopSoldiers; i < soldiers; i++) {
    if (targets.length >= MAX_TARGETS) break
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = (rand() * 2 - 1) * (WORLD_HALF - 8)
      const z = (rand() * 2 - 1) * (WORLD_HALF - 8)
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < MIN_FROM_SPAWN) continue
      const amp = SOLDIER_GROUND_BEAT_MIN + rand() * SOLDIER_GROUND_BEAT_VAR
      const loop = rand() < 0.5
      const routeAngle = rand() * Math.PI * 2
      // Sample the route: a loop's ring (8 points) or a line's two endpoints.
      const pts: Array<[number, number]> = loop
        ? Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2
            return [x + Math.cos(a) * amp, z + Math.sin(a) * amp] as [number, number]
          })
        : [
            [x + Math.cos(routeAngle) * amp, z + Math.sin(routeAngle) * amp],
            [x - Math.cos(routeAngle) * amp, z - Math.sin(routeAngle) * amp],
          ]
      if (!clearOfBuildings(layout, x, y, z, reach)) continue
      if (pts.some(([px, pz]) => !inBounds(px, pz) || !clearOfBuildings(layout, px, y, pz, reach))) {
        continue
      }
      targets.push({
        kind: 'soldier',
        x,
        y,
        z,
        radius: 1,
        driftAmp: amp,
        driftSpeed: SOLDIER_WALK_SPEED / amp,
        driftPhase: rand() * Math.PI * 2,
        driftAxis: 0,
        hp: diff.enemyHp,
        points: POINTS.soldier,
        variant: (i % 2) as 0 | 1,
        routeKind: loop ? 1 : 0,
        routeAngle,
      })
      break
    }
  }

  // Rooftop supply crate — deliberately the LAST consumers of this wave's
  // seeded stream (appending draws never moves any placement above; lesson
  // #54). From CRATE_FROM_WAVE on, put a crate on a qualifying roof no
  // soldier pacer owns this wave; the loot alternates CRATE_ROTATION
  // (index-derived, no extra draws).
  let crate: CrateSpec | undefined
  if (waveIndex >= CRATE_FROM_WAVE && perches.length > 0) {
    let pick = perches[Math.floor(rand() * perches.length)]
    for (let a = 0; a < 8 && usedBuildings.has(pick.bi); a++) {
      pick = perches[Math.floor(rand() * perches.length)]
    }
    if (!usedBuildings.has(pick.bi)) {
      crate = {
        x: pick.b.x,
        z: pick.b.z,
        top: pick.b.h,
        loot: CRATE_ROTATION[waveIndex % CRATE_ROTATION.length],
      }
    }
  }

  return { index: waveIndex, targets, enemiesShoot: waveIndex >= diff.fireWave, crate }
}

/* ------------------------------ weapon crate ----------------------------- */

/** Crates appear from this wave (wave 1 stays a clean tutorial mix). */
export const CRATE_FROM_WAVE = 2
/** Horizontal pickup radius around the crate disc. */
export const CRATE_RADIUS = 1.8
/** Vertical pickup window: from just below the roof lip to a low hover. */
export const CRATE_PICKUP_HEIGHT = 1.6

/**
 * True when the drone is on/over the crate's disc — one distance check per
 * frame (the landing-pad pattern). Pure so the rig and the e2e suite share it.
 */
export function crateReached(
  pos: Vec3,
  crate: { x: number; z: number; top: number },
): boolean {
  const dy = pos.y - crate.top
  if (dy < -0.6 || dy > CRATE_PICKUP_HEIGHT) return false
  return Math.hypot(pos.x - crate.x, pos.z - crate.z) <= CRATE_RADIUS
}

/* --------------------------- runtime target pool ------------------------- */

export interface TargetState {
  alive: boolean
  kind: TargetKind
  pos: Vec3
  /** Live velocity (drift derivative / AI motion) — feeds shot leading. */
  vel: Vec3
  radius: number
  hp: number
  points: number
  /** Drift anchor. */
  base: Vec3
  driftAmp: number
  driftSpeed: number
  driftPhase: number
  driftAxis: 0 | 1 | 2
  /** Seconds of hit-flash tint remaining. */
  hitFlash: number
  /** Per-kind sub-type (soldier: rocket/SMG; enemy: orbiter/chaser). */
  variant: 0 | 1
  /** Soldier only: seconds of firing-pose animation remaining. Set on each
   * shot (stepTurret), decayed each frame; SoldierTargets feeds it to the
   * model's aim ref so the figure plays its recoil/muzzle/launch pose. */
  fireTimer: number
  /** Soldier patrol shape: 0 = line (paces along `routeAngle`), 1 = loop. */
  routeKind: 0 | 1
  /** Soldier line route heading (radians); ignored for loops. */
  routeAngle: number
  /** Soldier only: seconds the soldier stays PLANTED — halted mid-patrol to
   * kneel + loose a rocket. While > 0, `StrikeRig` freezes the patrol and zeroes
   * the velocity; set by `stepTurret` around each rocket shot (rocket variant
   * only, via `soldierPlantHold`). */
  plantTimer: number
  /** Soldier only: accumulated paused seconds, subtracted from the drift clock
   * so the patrol resumes smoothly from where a plant froze it (not jumped
   * forward as if wall-clock time had elapsed while it stood still). */
  driftHold: number
}

export function createTargetStates(): TargetState[] {
  return Array.from({ length: MAX_TARGETS }, () => ({
    alive: false,
    kind: 'balloon' as TargetKind,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    radius: 1,
    hp: 1,
    points: 0,
    base: { x: 0, y: 0, z: 0 },
    driftAmp: 0,
    driftSpeed: 0,
    driftPhase: 0,
    driftAxis: 0 as 0 | 1 | 2,
    hitFlash: 0,
    variant: 0 as 0 | 1,
    fireTimer: 0,
    routeKind: 0 as 0 | 1,
    routeAngle: 0,
    plantTimer: 0,
    driftHold: 0,
  }))
}

/** Load a wave into the pool (slots beyond the wave go dormant). */
export function loadWave(states: TargetState[], wave: WaveSpec): void {
  for (let i = 0; i < states.length; i++) {
    const s = states[i]
    const spec = wave.targets[i]
    if (!spec) {
      s.alive = false
      continue
    }
    s.alive = true
    s.kind = spec.kind
    s.pos.x = spec.x
    s.pos.y = spec.y
    s.pos.z = spec.z
    s.base.x = spec.x
    s.base.y = spec.y
    s.base.z = spec.z
    s.vel.x = 0
    s.vel.y = 0
    s.vel.z = 0
    s.radius = spec.radius
    s.hp = spec.hp
    s.points = spec.points
    s.driftAmp = spec.driftAmp
    s.driftSpeed = spec.driftSpeed
    s.driftPhase = spec.driftPhase
    s.driftAxis = spec.driftAxis
    s.hitFlash = 0
    s.variant = spec.variant ?? 0
    s.fireTimer = 0
    s.routeKind = spec.routeKind ?? 0
    s.routeAngle = spec.routeAngle ?? 0
    s.plantTimer = 0
    s.driftHold = 0
  }
}

/** Deterministic sinusoidal drift around the anchor; also writes the
 * velocity derivative so shot leading sees the real motion. */
export function stepDrift(t: TargetState, timeS: number): void {
  if (!t.alive) return
  // Road vehicles (SWAT cars + military supply trucks) drive along a road
  // lane at constant speed, wrapping at the world edge — the same pure
  // linear-wrap the decorative traffic uses (RichWorld), so the target rides
  // the visible road. Velocity is the constant travel speed (not a pos
  // delta), so the once-per-lap wrap never spikes leading. Guarded on
  // driftSpeed so a (fallback) static ground truck skips this branch.
  if ((t.kind === 'car' || t.kind === 'ground') && t.driftSpeed !== 0) {
    const span = WORLD_HALF * 2
    const raw = t.driftPhase + t.driftSpeed * timeS
    const along = (((raw % span) + span) % span) - WORLD_HALF
    t.pos.y = t.base.y
    if (t.driftAxis === 0) {
      t.pos.x = along
      t.pos.z = t.base.z
      t.vel.x = t.driftSpeed
      t.vel.y = 0
      t.vel.z = 0
    } else {
      t.pos.z = along
      t.pos.x = t.base.x
      t.vel.x = 0
      t.vel.y = 0
      t.vel.z = t.driftSpeed
    }
    return
  }
  // Patrolling soldiers walk a bounded route around their anchor — a
  // back-and-forth LINE along `routeAngle` (rooftop pace or a diagonal ground
  // beat) or a circular LOOP — writing the true velocity derivative for shot
  // leading. Generalises the old axis-aligned pace (routeAngle 0/π-2 = x/z).
  if (t.kind === 'soldier' && t.driftAmp > 0) {
    // Subtract time paused in firing plants so the patrol resumes from where it
    // froze (the halt in StrikeRig accumulates `driftHold`), not jumped ahead.
    const ph = (timeS - t.driftHold) * t.driftSpeed + t.driftPhase
    t.pos.y = t.base.y
    t.vel.y = 0
    if (t.routeKind === 1) {
      const c = Math.cos(ph)
      const s = Math.sin(ph)
      t.pos.x = t.base.x + c * t.driftAmp
      t.pos.z = t.base.z + s * t.driftAmp
      t.vel.x = -s * t.driftAmp * t.driftSpeed
      t.vel.z = c * t.driftAmp * t.driftSpeed
    } else {
      const dx = Math.cos(t.routeAngle)
      const dz = Math.sin(t.routeAngle)
      const off = Math.sin(ph) * t.driftAmp
      const deriv = Math.cos(ph) * t.driftAmp * t.driftSpeed
      t.pos.x = t.base.x + dx * off
      t.pos.z = t.base.z + dz * off
      t.vel.x = dx * deriv
      t.vel.z = dz * deriv
    }
    return
  }
  if (t.driftAmp === 0 || t.kind === 'enemy') return
  const phase = timeS * t.driftSpeed + t.driftPhase
  const offset = Math.sin(phase) * t.driftAmp
  const deriv = Math.cos(phase) * t.driftAmp * t.driftSpeed
  t.vel.x = 0
  t.vel.y = 0
  t.vel.z = 0
  if (t.driftAxis === 0) {
    t.pos.x = t.base.x + offset
    t.vel.x = deriv
  } else if (t.driftAxis === 1) {
    t.pos.y = t.base.y + offset
    t.vel.y = deriv
  } else {
    t.pos.z = t.base.z + offset
    t.vel.z = deriv
  }
}

export function aliveCount(states: readonly TargetState[]): number {
  let n = 0
  for (const s of states) if (s.alive) n++
  return n
}
