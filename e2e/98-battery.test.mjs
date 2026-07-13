/**
 * Battery suite: the toggle shows the HUD bar, flying drains it (harder
 * flying drains faster), landing on the spawn pad recharges it, and the
 * toggle persists. Death/revive timing lives in the pure-unit checks —
 * draining 100% to empty is too slow for E2E.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'

const { check, finish } = reporter('battery')
const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)
const batteryState = () => rootState(page, 'data-battery')
const level = async () =>
  parseFloat(await page.locator('[data-testid="dronesim-battery-fill"]').getAttribute('data-level'))

check('battery mode off by default', (await batteryState()) === 'off')
check('no battery bar when off', (await page.locator('[data-testid="dronesim-battery"]').count()) === 0)

await setSwitch(page, 'dronesim-battery-toggle', true)
await page.waitForTimeout(400)
check('toggle turns battery mode on', (await batteryState()) === 'on')
check('bar appears full', (await level()) >= 98, `level=${await level()}`)

// hard flying drains ~3%/s
await pilot.touchStart()
await pilot.touch(0, 1, 0, 1)
await page.waitForTimeout(4000)
await pilot.touch(0, 0, 0, 0)
const afterFlight = await level()
check('hard flying drains the battery', afterFlight < 92 && afterFlight > 75, `level=${afterFlight}`)

// return to the pad and land -> recharge
await pilot.flyTo({ x: 0, y: 8, z: 18 }, { tol: 1.5 })
await pilot.brake()
const deadline = Date.now() + 15000
while (Date.now() < deadline) {
  await pilot.touch(0, -1, 0, 0)
  if ((await telemetry()).alt < 0.6) break
  await page.waitForTimeout(150)
}
await pilot.touch(0, 0, 0, 0)
const beforeCharge = await level()
await page.waitForTimeout(2000)
const afterCharge = await level()
await pilot.touchEnd()
check(
  'resting on the spawn pad recharges',
  afterCharge >= Math.min(100, beforeCharge + 20),
  `${beforeCharge} -> ${afterCharge}`,
)
await page.screenshot({ path: `${ARTIFACTS_DIR}battery.png` })

// persistence of the toggle (level itself is transient by design)
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check(
  'battery mode persists across reload',
  (await batteryState()) === 'on',
)
check(
  'level restarts full after reload (transient)',
  (await level()) >= 98,
  `level=${await level()}`,
)
await setSwitch(page, 'dronesim-battery-toggle', false)
check(
  'toggling off removes the bar',
  (await page.locator('[data-testid="dronesim-battery"]').count()) === 0,
)

await finish(browser)
