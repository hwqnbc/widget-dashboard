/**
 * Drone Strike ground-target suite. Pure module (deterministic): from wave 2
 * the seeded wave includes static supply trucks (`ground`) sitting on the
 * deck (low y); from TURRET_WAVE it includes AA turrets (`turret`); trucks
 * are difficulty-independent while turrets follow the difficulty preset
 * (hp + shared return-fire gate). DOM: clear wave 1 closed-loop and confirm
 * wave 2 fields the seeded target count (now including the ground trucks) —
 * proof the app actually spawns them (101-style). The hit model is a normal
 * pos+radius sphere, already covered by suite 100.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  launch,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  GROUND_WAVE_START,
  TURRET_WAVE,
  buildWave,
} from './.bundle/waveLayout.js'

const { check, finish } = reporter('strike-ground')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { combat } = strikeReaders(page)

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// --- pure module: ground trucks + AA turrets in the seeded campaign ---
const layout = buildWorldLayout(DEFAULT_SEED)
const w2 = buildWave(DEFAULT_SEED, GROUND_WAVE_START, layout)
const ground2 = w2.targets.filter((t) => t.kind === 'ground')
check('ground trucks appear from wave 2', ground2.length > 0, `n=${ground2.length}`)
check('trucks sit on the deck (low y)', ground2.every((t) => t.y <= 2), `ys=${ground2.map((t) => t.y)}`)
check('trucks die in one hit', ground2.every((t) => t.hp === 1))
check('no turrets before TURRET_WAVE', w2.targets.every((t) => t.kind !== 'turret'))

const wT = buildWave(DEFAULT_SEED, TURRET_WAVE, layout)
const turretsT = wT.targets.filter((t) => t.kind === 'turret')
check('AA turrets appear from TURRET_WAVE', turretsT.length > 0, `n=${turretsT.length}`)
check('turrets are static (no drift)', turretsT.every((t) => t.driftAmp === 0))
check('turrets sit on the deck (low y)', turretsT.every((t) => t.y <= 2))

// Trucks are difficulty-independent; turrets follow the preset.
const gcount = (d) =>
  buildWave(DEFAULT_SEED, 6, layout, d).targets.filter((t) => t.kind === 'ground').length
check(
  'truck count identical across difficulties',
  gcount('easy') === gcount('normal') && gcount('normal') === gcount('hard') && gcount('easy') > 0,
  `easy=${gcount('easy')} normal=${gcount('normal')} hard=${gcount('hard')}`,
)
const w6easy = buildWave(DEFAULT_SEED, 6, layout, 'easy')
const w6normal = buildWave(DEFAULT_SEED, 6, layout, 'normal')
const turEasy = w6easy.targets.filter((t) => t.kind === 'turret')
const turNormal = w6normal.targets.filter((t) => t.kind === 'turret')
check('turret hp follows difficulty', turEasy.every((t) => t.hp === 1) && turNormal.every((t) => t.hp === 2))

// Turret fire rides the shared return-fire gate: wave 5 armed on normal, held on easy.
const w5easy = buildWave(DEFAULT_SEED, 5, layout, 'easy')
const w5normal = buildWave(DEFAULT_SEED, 5, layout, 'normal')
check('wave 5 turrets hold fire on easy but shoot on normal', !w5easy.enemiesShoot && w5normal.enemiesShoot)

// --- DOM: the app fields the seeded wave-2 targets (trucks included) ---
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
let cleared = true
const start = Date.now()
while ((await combat()).targetsLeft > 0) {
  if (Date.now() - start > 240000) {
    cleared = false
    break
  }
  if (!(await pilot.engage({ timeout: 60000 }))) {
    cleared = false
    break
  }
}
await pilot.touchEnd()
check('wave 1 fully cleared', cleared, `targetsLeft=${(await combat()).targetsLeft}`)
check('wave 2 goes active', await waitForWaveState(page, 'active', 8000))
const c2 = await combat()
check('wave counter advanced', c2.wave === 2, `wave=${c2.wave}`)
check(
  'wave 2 fields the seeded target count (trucks included)',
  c2.targetsLeft === w2.targets.length,
  `app=${c2.targetsLeft} expected=${w2.targets.length} (ground=${ground2.length})`,
)

await finish(browser)
