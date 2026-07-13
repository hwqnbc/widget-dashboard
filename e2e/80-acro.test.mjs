/**
 * Acro-mode suite: the flight-mode toggle switches between beginner
 * altitude-hold and manual acro (gravity + attitude thrust). Asserted
 * behaviourally through the HUD: in acro, momentum coasts after releasing
 * the sticks and a cut throttle falls faster than hold's descent cap; in
 * hold the same inputs brake/limit. The mode persists across reloads.
 */
import {
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'

const { check, finish } = reporter('acro')
const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)
const modeState = () => rootState(page, 'data-mode')

check('defaults to beginner (hold) mode', (await modeState()) === 'hold')

// baseline: hold mode brakes after release
await pilot.touchStart()
await pilot.touch(0, 1, 0, 0) // climb to a safe test altitude
await page.waitForTimeout(2500)
await pilot.touch(0, 0, 0, 1) // full forward
await page.waitForTimeout(2000)
const holdMoving = (await telemetry()).speed
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(1500)
const holdAfter = (await telemetry()).speed
check('hold: releasing the stick brakes to a stop', holdMoving > 8 && holdAfter < 1, `${holdMoving} -> ${holdAfter}`)
await pilot.touchEnd()

// switch to acro
await setSwitch(page, 'dronesim-mode-toggle', true)
check('toggle switches to acro', (await modeState()) === 'acro')

// acro: momentum coasts after release
await pilot.touchStart()
await pilot.touch(0, 0.4, 0, 0) // extra thrust: climb away from the ground
await page.waitForTimeout(1500)
await pilot.touch(0, 0.3, 0, 1) // pitch forward with some climb authority
await page.waitForTimeout(2000)
const acroMoving = (await telemetry()).speed
await pilot.touch(0, 0, 0, 0) // sticks centred = hover thrust, no braking
await page.waitForTimeout(1500)
const acroAfter = (await telemetry()).speed
check('acro: builds real speed', acroMoving > 6, `spd=${acroMoving}`)
check(
  'acro: momentum coasts after release (>40% kept)',
  acroAfter > acroMoving * 0.4 && acroAfter > 3,
  `${acroMoving} -> ${acroAfter}`,
)

// acro: cutting the throttle falls faster than hold's 5 u/s descent cap.
// Climb momentum takes ~1.5 s to reverse under gravity, so measure the fall
// rate over the second AFTER the reversal.
await pilot.touch(0, 1, 0, 0)
await page.waitForTimeout(2000) // climb high first
await pilot.touch(0, -1, 0, 0) // throttle cut
await page.waitForTimeout(1500) // let the upward momentum cancel
const alt1 = (await telemetry()).alt
await page.waitForTimeout(1000)
const alt2 = (await telemetry()).alt
const fallRate = alt1 - alt2 // u/s once falling
check('acro: gravity fall beats the hold descent cap', fallRate > 6, `fell ${fallRate.toFixed(1)} u in ~1s`)
await pilot.touchEnd()

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('flight mode persists across reload', (await modeState()) === 'acro')

// back to hold: descent is capped again
await setSwitch(page, 'dronesim-mode-toggle', false)
check('toggle returns to hold', (await modeState()) === 'hold')

await finish(browser)
