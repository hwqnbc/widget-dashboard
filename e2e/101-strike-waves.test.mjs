/**
 * Drone Strike waves suite: clear wave 1 closed-loop, verify the
 * cleared → intro → active progression into wave 2, check the seeded
 * difficulty curve (drifters from wave 2, enemies from wave 3, return fire
 * from wave 5) via the pure module, and confirm best score/wave persist
 * across a reload (redux-persist).
 */
import {
  addStrikeWidget,
  createStrikePilot,
  launch,
  reporter,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { buildWave, ENEMY_FIRE_WAVE, ENEMY_WAVE_START } from './.bundle/waveLayout.js'

const { check, finish } = reporter('strike-waves')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
const { combat } = strikeReaders(page)

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// The seeded campaign curve, straight from the pure module the app runs.
const layout = buildWorldLayout(DEFAULT_SEED)
const w2 = buildWave(DEFAULT_SEED, 2, layout)
const w3 = buildWave(DEFAULT_SEED, ENEMY_WAVE_START, layout)
const w5 = buildWave(DEFAULT_SEED, ENEMY_FIRE_WAVE, layout)
check('wave 2 introduces drifting targets', w2.targets.some((t) => t.driftAmp > 0))
check('wave 3 introduces enemy drones', w3.targets.some((t) => t.kind === 'enemy'))
check(
  'enemies get orbit envelopes',
  w3.targets.filter((t) => t.kind === 'enemy').every((t) => t.driftAmp >= 4),
)
check('enemies hold fire before wave 5', !w3.enemiesShoot && w5.enemiesShoot)

// Clear wave 1: engage the nearest-target beacon until nothing is left.
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

check('cleared state reported', await waitForWaveState(page, 'cleared', 4000))
check('wave 2 goes active', await waitForWaveState(page, 'active', 8000))
const c2 = await combat()
check('wave counter advanced', c2.wave === 2, `wave=${c2.wave}`)
check(
  'wave 2 fields the seeded target count',
  c2.targetsLeft === w2.targets.length,
  `app=${c2.targetsLeft} expected=${w2.targets.length}`,
)
const scoreAfterW1 = c2.score
check('score banked from wave 1', scoreAfterW1 >= 60, `score=${scoreAfterW1}`)

// Best score/wave persist across a reload; the session itself restarts.
const chip = page.locator('[data-testid="strike-score"]')
const bestScore = parseInt(await chip.getAttribute('data-best-score'), 10)
const bestWave = parseInt(await chip.getAttribute('data-best-wave'), 10)
check('best wave recorded', bestWave === 1, `bestWave=${bestWave}`)
check('best score recorded', bestScore === scoreAfterW1, `bestScore=${bestScore}`)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('widget persists across reload', true)
check('session restarts at wave 1', await waitForWaveState(page, 'active'))
const chipAfter = page.locator('[data-testid="strike-score"]')
check(
  'best score persisted',
  parseInt(await chipAfter.getAttribute('data-best-score'), 10) === bestScore,
)
check(
  'best wave persisted',
  parseInt(await chipAfter.getAttribute('data-best-wave'), 10) === bestWave,
)

await finish(browser)
