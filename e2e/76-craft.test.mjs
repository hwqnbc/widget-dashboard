/**
 * Craft suite: the "Fly as Lloyd" toggle swaps the quadcopter for the winged
 * dragon-ninja avatar — a purely visual swap over identical flight physics.
 * Asserts the contract: drone by default, toggle flips `data-craft`, flight
 * stays fully healthy as Lloyd (climb, altitude hold, lap start off the
 * pad), the choice persists across reload, and Reset settings restores the
 * drone. A tp-view screenshot lands in .artifacts/ to eyeball the pose.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  openSettings,
  closeSettings,
  rootState,
  setSwitch,
} from './helpers.mjs'

const { check, finish } = reporter('craft')

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry, lapState } = readers(page)
const pilot = await createPilot(page, context)

// ---- default: the quadcopter -------------------------------------------------
check('craft defaults to drone', (await rootState(page, 'data-craft')) === 'drone')

// ---- toggle → lloyd -----------------------------------------------------------
await setSwitch(page, 'dronesim-craft-toggle', true)
check('toggle flips the root to lloyd', (await rootState(page, 'data-craft')) === 'lloyd')
await page.waitForTimeout(800) // lazy Lloyd chunk loads + a few frames render

// ---- flight is identical as Lloyd ----------------------------------------------
const before = await telemetry()
await pilot.touchStart()
await pilot.touch(0, 1, 0, 0)
await page.waitForTimeout(1500)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(700)
const climbed = await telemetry()
check('Lloyd climbs under the stick', climbed.alt > before.alt + 2, `alt ${before.alt} -> ${climbed.alt}`)
await page.waitForTimeout(1200)
const held = await telemetry()
check(
  'altitude hold still brakes to a hover',
  Math.abs(held.alt - climbed.alt) < 0.6 && held.speed < 0.8,
  `alt ${climbed.alt} -> ${held.alt}, spd=${held.speed}`,
)

// Lap machinery unchanged: leaving the pad under own power starts the lap.
await pilot.touch(0, 0, 0, 1)
await page.waitForTimeout(1800)
await pilot.touch(0, 0, 0, 0)
const lap = await lapState()
check('flying off the pad still starts a lap', lap.status === 'running', `status=${lap.status}`)
await pilot.touchEnd()

// tp-view screenshot for a human eyeball of scale/pose.
await page.screenshot({ path: `${ARTIFACTS_DIR}craft-lloyd-tp.png` })

// ---- persistence ---------------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
await page.waitForTimeout(800)
check('lloyd persists across reload', (await rootState(page, 'data-craft')) === 'lloyd')
const t = await telemetry()
check('sim healthy after reload as lloyd', Math.abs(t.alt - 2) < 0.4, `alt=${t.alt}`)

// ---- Reset settings restores the drone -------------------------------------------
await openSettings(page)
await page.locator('[data-testid="dronesim-settings-reset"]').click()
await page.waitForTimeout(400)
await closeSettings(page)
check('reset settings restores the drone craft', (await rootState(page, 'data-craft')) === 'drone')

await finish(browser)
