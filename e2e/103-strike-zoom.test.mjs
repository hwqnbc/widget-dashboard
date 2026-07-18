/**
 * Drone Strike ADS/zoom suite: the scope button toggle, hold-Shift zoom,
 * the halved yaw sensitivity while scoped (measured closed-loop), firing
 * while zoomed, the tighter scoped assist cones (pure module), the gyro
 * "Zoom only" mode, and the FPV-only surface of the scope button.
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  createStrikePilot,
  launch,
  openStrikeSettings,
  reporter,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { AIM_CONE_RAD, AIM_CONE_RAD_ZOOM } from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-zoom')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
const { hud, telemetry, combat } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')
const scope = page.locator('[data-testid="strike-zoom"]')

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// Pure-module check: every scoped cone is tighter than its hip cone.
check(
  'scoped assist cones are tighter per level',
  Object.keys(AIM_CONE_RAD).every((k) => AIM_CONE_RAD_ZOOM[k] < AIM_CONE_RAD[k]),
)

// --- scope button toggles ---
check('scope button present in FPV', (await scope.count()) === 1)
check('unzoomed by default', (await root.getAttribute('data-zoom')) === 'off')
await scope.click()
await page.waitForTimeout(300)
check('tap zooms', (await root.getAttribute('data-zoom')) === 'on')
check('HUD mirrors zoom', (await hud.getAttribute('data-zoom')) === 'on')
check(
  'reticle shows the scope',
  (await page
    .locator('[data-testid="strike-reticle"]')
    .getAttribute('data-zoom')) === 'on',
)
await scope.click()
await page.waitForTimeout(300)
check('second tap unzooms', (await root.getAttribute('data-zoom')) === 'off')

// --- yaw sensitivity halves while scoped (closed-loop measurement) ---
const pilot = await createStrikePilot(page, context)
const yawSweep = async (ms) => {
  await pilot.touchStart()
  await pilot.touch(1, 0, 0, 0) // full right yaw
  const start = (await telemetry()).yaw
  await page.waitForTimeout(ms)
  const end = (await telemetry()).yaw
  await pilot.touch(0, 0, 0, 0)
  await pilot.touchEnd()
  // Yaw only ever decreases under stick-right; no wrap inside a short sweep.
  return Math.abs(end - start)
}
const hipSweep = await yawSweep(1500)
await scope.click()
await page.waitForTimeout(300)
const adsSweep = await yawSweep(1500)
const ratio = adsSweep / hipSweep
check(
  'scoped yaw rate is ~half',
  ratio > 0.3 && ratio < 0.7,
  `hip=${hipSweep.toFixed(2)} ads=${adsSweep.toFixed(2)} ratio=${ratio.toFixed(2)}`,
)

// --- firing still works while scoped ---
const c0 = await combat()
await page.keyboard.down('Space')
await page.waitForTimeout(700)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
const c1 = await combat()
check('fire works while scoped', c1.shots - c0.shots >= 2, `Δshots=${c1.shots - c0.shots}`)
await scope.click() // unzoom for the keyboard test
await page.waitForTimeout(200)

// --- desktop hold-Shift zoom ---
await page.keyboard.down('Shift')
await page.waitForTimeout(300)
check('holding Shift zooms', (await root.getAttribute('data-zoom')) === 'on')
await page.keyboard.up('Shift')
await page.waitForTimeout(300)
check('releasing Shift unzooms', (await root.getAttribute('data-zoom')) === 'off')

// --- gyro "Zoom only" mode round-trips ---
await openStrikeSettings(page)
await page.locator('[data-testid="strike-gyro-zoom"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('gyro zoom-only mode set', (await root.getAttribute('data-gyro')) === 'zoom')
await openStrikeSettings(page)
await page.locator('[data-testid="strike-gyro-off"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)

// --- the scope is FPV-only ---
await page.locator('[data-testid="strike-view-toggle"]').click()
await page.waitForTimeout(300)
check('scope button hidden in chase view', (await scope.count()) === 0)
check('leaving FPV drops the zoom', (await root.getAttribute('data-zoom')) === 'off')
await page.locator('[data-testid="strike-view-toggle"]').click()

await finish(browser)
