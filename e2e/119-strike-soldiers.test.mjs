/**
 * Drone Strike rooftop-soldier suite. Pure module (deterministic): from wave 1
 * the seeded wave includes `soldier` targets — avatar-model enemies stationed
 * ON a building roof (rendered from the Scar / Bazooka Joe `Model3D`s via
 * SoldierTargets). The distinguishing proof is placement: each soldier's
 * `(x,z)` is a building centre and its `y` is that building's height + the
 * torso offset (well above the deck's y≈1), so it is genuinely roof-stationed,
 * not a ground target. Fire is the AA turret's behaviour (`stepTurret`): held
 * on wave 1, armed by the shared return-fire gate. hp follows difficulty; the
 * count is clamped small (draw-call budget). DOM confirms the app fields the
 * seeded wave-1 count (soldiers included). The live rooftop soldier is static,
 * so the closed-loop clear is covered by 100/101/109 (which now clear a
 * wave-1 that includes it).
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
import { SOLDIER_WAVE, buildWave } from './.bundle/waveLayout.js'

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
check(
  'soldiers are static (no drift)',
  soldiers1.every((s) => s.driftAmp === 0 && s.driftSpeed === 0),
)

// Two soldiers never share a roof.
const roofKeys = soldiers1.map((s) => `${s.x},${s.z}`)
check('each soldier is on its own roof', new Set(roofKeys).size === roofKeys.length)

// hp follows difficulty (easy 1 / normal 2), like the drones and turrets.
const sEasy = buildWave(DEFAULT_SEED, 1, layout, 'easy').targets.filter((t) => t.kind === 'soldier')
const sNormal = buildWave(DEFAULT_SEED, 1, layout, 'normal').targets.filter((t) => t.kind === 'soldier')
check(
  'soldier hp follows difficulty',
  sEasy.every((t) => t.hp === 1) && sNormal.every((t) => t.hp === 2),
)

// The count is clamped small (draw-call budget: SoldierTargets pool is ≤2).
const scount = (d, w) =>
  buildWave(DEFAULT_SEED, w, layout, d).targets.filter((t) => t.kind === 'soldier').length
check(
  'soldier count is clamped to at most 2',
  ['easy', 'normal', 'hard'].every((d) => [1, 3, 6, 9].every((w) => scount(d, w) <= 2)),
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

// --- DOM: the app fields the seeded wave-1 targets (soldiers included) ---
const c1 = await combat()
check('app is on wave 1', c1.wave === 1, `wave=${c1.wave}`)
check(
  'wave 1 fields the seeded target count (soldiers included)',
  c1.targetsLeft === w1.targets.length,
  `app=${c1.targetsLeft} expected=${w1.targets.length}`,
)

await finish(browser)
