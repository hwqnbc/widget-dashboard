/**
 * Drone Strike soldier suite. Pure module (deterministic): soldiers are
 * avatar-model enemies (Scar / Bazooka Joe `Model3D`s via SoldierTargets) that
 * **patrol** — the first ⌈count/2⌉ pace a building ROOFTOP, the rest walk a
 * free-roam beat on the open GROUND (not road-bound). Both move via the seeded
 * sinusoidal `stepDrift` (driftAmp>0), which writes true velocity for leading.
 * Wave 1 is a single rooftop soldier. Fire is the AA turret's behaviour
 * (`stepTurret`): held on wave 1, armed by the shared return-fire gate. hp
 * follows difficulty; the count is clamped small (draw-call budget). Each
 * soldier is a weapon-matched `variant` (0 = rocket/Bazooka Joe, 1 = SMG/Scar),
 * and the matching weapon tags its projectile's visual — rocket vs bolt — via
 * `spawnProjectile`, so one enemy pool renders as both. DOM confirms the app
 * fields the seeded wave-1 count. The live wave-1 soldier is cleared by
 * 100/101/109 (which now clear a wave-1 that includes a pacing soldier).
 */
import {
  addStrikeWidget,
  launch,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  SOLDIER_WAVE,
  buildWave,
  createTargetStates,
  loadWave,
  stepDrift,
} from './.bundle/waveLayout.js'
import {
  SOLDIER_ROCKET,
  SOLDIER_SMG,
  createCombatState,
  spawnProjectile,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-soldiers')
const { browser, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { combat } = strikeReaders(page)

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// --- pure module: rooftop soldiers from wave 1 ---
const layout = buildWorldLayout(DEFAULT_SEED)
const w1 = buildWave(DEFAULT_SEED, SOLDIER_WAVE, layout)
const soldiers1 = w1.targets.filter((t) => t.kind === 'soldier')
check('soldiers appear from wave 1', soldiers1.length > 0, `n=${soldiers1.length}`)

// Roof-stationed: each soldier sits ON a building — its (x,z) is a building
// centre and its y is that roof height + the torso offset (0.9). This is the
// proof they are NOT deck/ground targets (which sit at y≈1).
const onRoof = soldiers1.every((s) => {
  const b = layout.buildings.find(
    (b) => Math.abs(b.x - s.x) < 1e-6 && Math.abs(b.z - s.z) < 1e-6,
  )
  return b && Math.abs(s.y - (b.h + 0.9)) < 1e-6
})
check('soldiers are stationed on a building roof (x,z,y)', onRoof)
check(
  'soldiers stand well above the deck (not ground targets)',
  soldiers1.every((s) => s.y > 4),
  `ys=${soldiers1.map((s) => s.y.toFixed(1))}`,
)
// Two soldiers never share a roof.
const roofKeys = soldiers1.map((s) => `${s.x},${s.z}`)
check('each soldier is on its own roof', new Set(roofKeys).size === roofKeys.length)

// --- patrol: rooftop pacing + free-roam ground walk ---
// Classify a soldier as rooftop (its (x,z) is a building centre, y = b.h+0.9)
// or ground (y ≈ 0.9). A ground point is "clear of buildings" when it's inside
// no building footprint (the free-roam guarantee).
const roofBuilding = (s) =>
  layout.buildings.find(
    (b) => Math.abs(b.x - s.x) < 1e-6 && Math.abs(b.z - s.z) < 1e-6 && Math.abs(s.y - (b.h + 0.9)) < 1e-6,
  )
const insideBuilding = (x, z, reach) =>
  layout.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + reach && Math.abs(z - b.z) < b.d / 2 + reach)
// Collect soldiers across a spread of waves.
const allSoldiers = [1, 3, 6, 9].flatMap((w) =>
  buildWave(DEFAULT_SEED, w, layout, 'normal').targets.filter((t) => t.kind === 'soldier'),
)
// Rooftop pacers stay ON their roof: half-beat ≤ the roof's chosen (longer) half-extent.
check(
  'rooftop soldiers pace within their own roof',
  allSoldiers.filter(roofBuilding).every((s) => {
    const b = roofBuilding(s)
    return s.driftAmp <= Math.max(b.w, b.d) / 2 + 1e-6
  }),
)
// Some soldiers actually patrol (walk), not all standing sentries.
check('some soldiers patrol (driftAmp > 0)', allSoldiers.some((s) => s.driftAmp > 0))
// Ground patrollers: y ≈ 0.9, off any building, walking, whole beat clear of the city.
const groundSoldiers = allSoldiers.filter((s) => Math.abs(s.y - 0.9) < 1e-6)
check('ground patrol soldiers appear', groundSoldiers.length > 0, `n=${groundSoldiers.length}`)
check(
  'ground soldiers walk a free-roam beat clear of buildings',
  groundSoldiers.every((s) => {
    if (s.driftAmp <= 0) return false
    if (insideBuilding(s.x, s.z, 1)) return false
    const e1x = s.driftAxis === 0 ? s.x - s.driftAmp : s.x
    const e1z = s.driftAxis === 0 ? s.z : s.z - s.driftAmp
    const e2x = s.driftAxis === 0 ? s.x + s.driftAmp : s.x
    const e2z = s.driftAxis === 0 ? s.z : s.z + s.driftAmp
    return !insideBuilding(e1x, e1z, 1) && !insideBuilding(e2x, e2z, 1)
  }),
)
// A single wave fields BOTH a rooftop and a ground soldier (the user's ask).
let mixed = null
for (let w = 1; w <= 12 && !mixed; w++) {
  const ss = buildWave(DEFAULT_SEED, w, layout, 'normal').targets.filter((t) => t.kind === 'soldier')
  if (ss.some(roofBuilding) && ss.some((s) => Math.abs(s.y - 0.9) < 1e-6)) mixed = w
}
check('a wave fields both a rooftop and a ground soldier', mixed !== null, `wave=${mixed}`)

// Movement: a patrolling soldier is paced by stepDrift along its axis (with a
// real velocity for leading); a standing sentry (driftAmp 0) does not move.
const w6 = buildWave(DEFAULT_SEED, 6, layout, 'normal')
const states = createTargetStates()
loadWave(states, w6)
const patrol = states.find((s) => s.alive && s.kind === 'soldier' && s.driftAmp > 0)
check('wave 6 has a patrolling soldier to step', patrol !== undefined)
if (patrol) {
  const axis = patrol.driftAxis
  const read = (s) => (axis === 0 ? s.pos.x : s.pos.z)
  stepDrift(patrol, 0)
  const p0 = read(patrol)
  stepDrift(patrol, 0.6)
  const p1 = read(patrol)
  const vel = axis === 0 ? patrol.vel.x : patrol.vel.z
  check('patrol soldier walks along its axis', Math.abs(p1 - p0) > 0.1, `${p0.toFixed(2)}→${p1.toFixed(2)}`)
  check('patrol soldier has a non-zero travel velocity', Math.abs(vel) > 0.1, `vel=${vel.toFixed(2)}`)
  // The cross axis stays put (paces a straight line).
  const cross = axis === 0 ? patrol.pos.z : patrol.pos.x
  const crossBase = axis === 0 ? patrol.base.z : patrol.base.x
  check('patrol soldier holds its cross axis', Math.abs(cross - crossBase) < 1e-6)
}

// hp follows difficulty (easy 1 / normal 2), like the drones and turrets.
const sEasy = buildWave(DEFAULT_SEED, 1, layout, 'easy').targets.filter((t) => t.kind === 'soldier')
const sNormal = buildWave(DEFAULT_SEED, 1, layout, 'normal').targets.filter((t) => t.kind === 'soldier')
check(
  'soldier hp follows difficulty',
  sEasy.every((t) => t.hp === 1) && sNormal.every((t) => t.hp === 2),
)

// The count is clamped small (draw-call budget: SoldierTargets pool is ≤3).
const scount = (d, w) =>
  buildWave(DEFAULT_SEED, w, layout, d).targets.filter((t) => t.kind === 'soldier').length
check(
  'soldier count is clamped to at most 3',
  ['easy', 'normal', 'hard'].every((d) => [1, 3, 6, 9].every((w) => scount(d, w) <= 3)),
)

// Fire gate: soldiers hold fire on wave 1 on every difficulty (they ride the
// shared `enemiesShoot` gate, exactly like the AA turrets), and are armed by
// the return-fire wave (normal wave 5).
check(
  'wave-1 soldiers hold fire on every difficulty',
  ['easy', 'normal', 'hard'].every((d) => !buildWave(DEFAULT_SEED, 1, layout, d).enemiesShoot),
)
check(
  'soldiers ride the shared fire gate (armed by wave 5 on normal)',
  buildWave(DEFAULT_SEED, 5, layout, 'normal').enemiesShoot,
)

// --- weapon-matched variants ---
// Each soldier carries a variant (0 = rocket/Bazooka Joe, 1 = SMG/Scar),
// assigned by order — so wave 1's lone soldier is the rocketeer (variant 0).
check('wave-1 soldier is the rocketeer (variant 0)', soldiers1.every((s) => s.variant === 0))
// Find a wave that fields two soldiers and confirm one of each variant.
let pair = null
for (let w = 1; w <= 12 && !pair; w++) {
  const ss = buildWave(DEFAULT_SEED, w, layout, 'normal').targets.filter((t) => t.kind === 'soldier')
  if (ss.length === 2) pair = ss
}
check('a two-soldier wave fields one of each variant', pair !== null && pair[0].variant !== pair[1].variant, pair ? `variants=${pair.map((s) => s.variant)}` : 'no 2-soldier wave')

// The variant's weapon tags the projectile's visual (one enemy pool renders as
// both a rocket and a bolt).
check('SOLDIER_ROCKET fires a rocket-visual projectile', SOLDIER_ROCKET.projectile === 'rocket')
check('SOLDIER_SMG fires a bolt-visual projectile', SOLDIER_SMG.projectile === 'bolt')
const combatState = createCombatState()
const dir = { x: 0, y: 0, z: 1 }
spawnProjectile(combatState.enemy, { x: 0, y: 5, z: 0 }, dir, SOLDIER_ROCKET)
check('spawned rocket projectile is tagged visual=rocket', combatState.enemy[0].visual === 'rocket')
spawnProjectile(combatState.enemy, { x: 0, y: 5, z: 0 }, dir, SOLDIER_SMG)
check('spawned SMG projectile is tagged visual=bolt', combatState.enemy[1].visual === 'bolt')

// --- DOM: the app fields the seeded wave-1 targets (soldiers included) ---
const c1 = await combat()
check('app is on wave 1', c1.wave === 1, `wave=${c1.wave}`)
check(
  'wave 1 fields the seeded target count (soldiers included)',
  c1.targetsLeft === w1.targets.length,
  `app=${c1.targetsLeft} expected=${w1.targets.length}`,
)

await finish(browser)
