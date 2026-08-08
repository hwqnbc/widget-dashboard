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
// Collect soldiers across a spread of waves (wide enough to see both route kinds).
const waveSpread = Array.from({ length: 14 }, (_, k) => k + 1)
const allSoldiers = waveSpread.flatMap((w) =>
  buildWave(DEFAULT_SEED, w, layout, 'normal').targets.filter((t) => t.kind === 'soldier'),
)
// Rooftop pacers stay ON their roof: half-beat ≤ the roof's chosen (longer)
// half-extent, and the route is an axis-aligned line (routeAngle 0 or π/2).
const roofSoldiers = allSoldiers.filter(roofBuilding)
check(
  'rooftop soldiers pace within their own roof',
  roofSoldiers.every((s) => {
    const b = roofBuilding(s)
    return s.driftAmp <= Math.max(b.w, b.d) / 2 + 1e-6
  }),
)
check(
  'rooftop routes are axis-aligned lines',
  roofSoldiers.every(
    (s) => s.routeKind === 0 && (Math.abs(s.routeAngle) < 1e-6 || Math.abs(s.routeAngle - Math.PI / 2) < 1e-6),
  ),
)
// Some soldiers actually patrol (walk), not all standing sentries.
check('some soldiers patrol (driftAmp > 0)', allSoldiers.some((s) => s.driftAmp > 0))

// Ground patrollers: y ≈ 0.9, off any building, walking a route whose WHOLE
// span (a line's two endpoints, or a loop's ring) is clear of the city.
const routeClear = (s) => {
  if (insideBuilding(s.x, s.z, 1)) return false
  if (s.routeKind === 1) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      if (insideBuilding(s.x + Math.cos(a) * s.driftAmp, s.z + Math.sin(a) * s.driftAmp, 1)) return false
    }
    return true
  }
  const dx = Math.cos(s.routeAngle)
  const dz = Math.sin(s.routeAngle)
  return !insideBuilding(s.x + dx * s.driftAmp, s.z + dz * s.driftAmp, 1) && !insideBuilding(s.x - dx * s.driftAmp, s.z - dz * s.driftAmp, 1)
}
const groundSoldiers = allSoldiers.filter((s) => Math.abs(s.y - 0.9) < 1e-6)
check('ground patrol soldiers appear', groundSoldiers.length > 0, `n=${groundSoldiers.length}`)
check(
  'ground soldiers walk a free-roam route clear of buildings',
  groundSoldiers.every((s) => s.driftAmp > 0 && routeClear(s)),
)
// Both route shapes occur among ground patrols: a diagonal line + a loop.
const diagLine = groundSoldiers.find(
  (s) => s.routeKind === 0 && Math.abs(Math.sin(s.routeAngle)) > 0.1 && Math.abs(Math.cos(s.routeAngle)) > 0.1,
)
const loopSoldier = groundSoldiers.find((s) => s.routeKind === 1)
check('a ground soldier walks a diagonal line route', diagLine !== undefined)
check('a ground soldier walks a loop route', loopSoldier !== undefined)

// A single wave fields BOTH a rooftop and a ground soldier (the user's ask).
let mixed = null
for (let w = 1; w <= 14 && !mixed; w++) {
  const ss = buildWave(DEFAULT_SEED, w, layout, 'normal').targets.filter((t) => t.kind === 'soldier')
  if (ss.some(roofBuilding) && ss.some((s) => Math.abs(s.y - 0.9) < 1e-6)) mixed = w
}
check('a wave fields both a rooftop and a ground soldier', mixed !== null, `wave=${mixed}`)

// Movement (via stepDrift): a DIAGONAL line soldier walks on BOTH x and z (not
// axis-aligned); a LOOP soldier holds a constant radius from its anchor while
// circling; both carry a real velocity for shot-leading.
const findGround = (pred) => {
  for (const w of waveSpread) {
    const st = createTargetStates()
    loadWave(st, buildWave(DEFAULT_SEED, w, layout, 'normal'))
    const s = st.find((t) => t.alive && t.kind === 'soldier' && Math.abs(t.pos.y - 0.9) < 1e-6 && pred(t))
    if (s) return s
  }
  return undefined
}
const line = findGround((s) => s.routeKind === 0 && Math.abs(Math.sin(s.routeAngle)) > 0.1 && Math.abs(Math.cos(s.routeAngle)) > 0.1)
check('found a diagonal-line ground soldier to step', line !== undefined)
if (line) {
  stepDrift(line, 0)
  const a = { x: line.pos.x, z: line.pos.z }
  stepDrift(line, 0.5)
  const movedX = Math.abs(line.pos.x - a.x) > 1e-3
  const movedZ = Math.abs(line.pos.z - a.z) > 1e-3
  check('diagonal soldier walks on both x and z', movedX && movedZ)
  check('diagonal soldier has a travel velocity', Math.hypot(line.vel.x, line.vel.z) > 0.1)
}
const loop = findGround((s) => s.routeKind === 1)
check('found a loop ground soldier to step', loop !== undefined)
if (loop) {
  const rad = (s) => Math.hypot(s.pos.x - s.base.x, s.pos.z - s.base.z)
  stepDrift(loop, 0)
  const r0 = rad(loop)
  const a = { x: loop.pos.x, z: loop.pos.z }
  stepDrift(loop, 0.5)
  const r1 = rad(loop)
  check('loop soldier holds a constant radius (circles)', Math.abs(r1 - r0) < 1e-3 && r0 > 1, `r=${r0.toFixed(2)}→${r1.toFixed(2)}`)
  check('loop soldier moves around the circle', Math.abs(loop.pos.x - a.x) > 1e-3 || Math.abs(loop.pos.z - a.z) > 1e-3)
}

// A standing sentry (a too-small roof → driftAmp 0) does not move.
const sentryStates = createTargetStates()
loadWave(sentryStates, buildWave(DEFAULT_SEED, 3, layout, 'normal'))
const sentry = sentryStates.find((s) => s.alive && s.kind === 'soldier' && s.driftAmp === 0)
if (sentry) {
  const sx = sentry.pos.x
  const sz = sentry.pos.z
  stepDrift(sentry, 1.2)
  check('a standing sentry does not move', Math.abs(sentry.pos.x - sx) < 1e-9 && Math.abs(sentry.pos.z - sz) < 1e-9)
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
