/**
 * Core suite: widget presence, flight physics via the sticks (climb,
 * altitude hold, inertia braking), simultaneous multi-touch, reset, camera
 * toggle + persistence, and react-grid-layout interop.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  closeSettings,
  createPilot,
  launch,
  openSettings,
  readers,
  reporter,
  stickCenter,
} from './helpers.mjs'

const { check, finish } = reporter('core')
const { browser, context, page } = await launch()
await addDroneWidget(page)
const { hud, telemetry } = readers(page)

for (const tid of [
  'dronesim-root',
  'dronesim-canvas',
  'dronesim-hud',
  'dronesim-gates',
  'dronesim-timer',
  'dronesim-joystick-left',
  'dronesim-joystick-right',
  'dronesim-view-toggle',
  'dronesim-reset',
  'dronesim-settings',
]) {
  const n = await page.locator(`[data-testid="${tid}"]`).count()
  check(`element ${tid} present`, n === 1, `count=${n}`)
}
// mode toggles + tuning + new-course live inside the settings panel
await openSettings(page)
for (const tid of [
  'dronesim-mode-toggle',
  'dronesim-crash-toggle',
  'dronesim-landing-toggle',
  'dronesim-battery-toggle',
  'dronesim-weather-toggle',
  'dronesim-rich-toggle',
  'dronesim-minimap-toggle',
  'dronesim-tune-speed',
  'dronesim-tune-yaw',
  'dronesim-tune-expo',
  'dronesim-tune-turbo',
  'dronesim-gate-count',
  'dronesim-new-course',
]) {
  const n = await page.locator(`[data-testid="${tid}"]`).count()
  check(`settings panel has ${tid}`, n === 1, `count=${n}`)
}
await closeSettings(page)
const canvasSize = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="dronesim-canvas"] canvas')
  return c ? { w: c.clientWidth, h: c.clientHeight } : null
})
check('WebGL canvas has nonzero size', !!canvasSize && canvasSize.w > 50 && canvasSize.h > 50, JSON.stringify(canvasSize))

const alt0 = (await telemetry()).alt
check('spawn altitude ~2.0', Math.abs(alt0 - 2.0) < 0.3, `alt=${alt0}`)

// left stick up via mouse: climb, then altitude hold on release
const lc = await stickCenter(page, 'dronesim-joystick-left')
await page.mouse.move(lc.x, lc.y)
await page.mouse.down()
await page.mouse.move(lc.x, lc.y - 40, { steps: 5 })
await page.waitForTimeout(1500)
const altUp = (await telemetry()).alt
check('left stick up raises altitude', altUp > alt0 + 2, `alt ${alt0} -> ${altUp}`)
await page.mouse.up()
await page.waitForTimeout(900)
const hold1 = (await telemetry()).alt
await page.waitForTimeout(500)
const hold2 = (await telemetry()).alt
check('altitude holds after release', Math.abs(hold2 - hold1) < 0.3, `${hold1} vs ${hold2}`)

// right stick up via mouse: speed, then inertia braking
const rc = await stickCenter(page, 'dronesim-joystick-right')
await page.mouse.move(rc.x, rc.y)
await page.mouse.down()
await page.mouse.move(rc.x, rc.y - 40, { steps: 5 })
await page.waitForTimeout(1200)
const spdMoving = (await telemetry()).speed
check('right stick up produces speed', spdMoving > 3, `spd=${spdMoving}`)
await page.mouse.up()
await page.waitForTimeout(1500)
const spdAfter = (await telemetry()).speed
check('speed decays after release (inertia braking)', spdAfter < 1.0, `spd=${spdAfter}`)

// simultaneous multi-touch: both sticks at once
const pilot = await createPilot(page, context)
const before = await telemetry()
await pilot.touchStart()
await pilot.touch(0, 1, 0, 1) // climb + forward together
await page.waitForTimeout(1500)
const during = await telemetry()
await pilot.touchEnd()
check('multi-touch: altitude climbs', during.alt > before.alt + 1.5, `alt ${before.alt} -> ${during.alt}`)
check('multi-touch: speed builds simultaneously', during.speed > 3, `spd=${during.speed}`)
await page.waitForTimeout(1200)

// reset
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(400)
const altReset = (await telemetry()).alt
check('reset returns to spawn altitude', Math.abs(altReset - 2.0) < 0.3, `alt=${altReset}`)

// view toggle + persistence
const toggle = page.locator('[data-testid="dronesim-view-toggle"]')
check('default view is tp', (await toggle.getAttribute('data-view')) === 'tp')
await page.screenshot({ path: `${ARTIFACTS_DIR}core-tp.png` })
await toggle.click()
check('toggle switches to fp', (await toggle.getAttribute('data-view')) === 'fp')
await page.waitForTimeout(400)
await page.screenshot({ path: `${ARTIFACTS_DIR}core-fp.png` })
await page.waitForTimeout(1600) // redux-persist debounce
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-view-toggle"]')
check(
  'view persists across reload',
  (await page.locator('[data-testid="dronesim-view-toggle"]').getAttribute('data-view')) === 'fp',
)

// grid interop: joystick drag must not move the card
const cardPos = async () =>
  await page.evaluate(() => {
    const el = document
      .querySelector('[data-testid="dronesim-root"]')
      .closest('.react-grid-item')
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y) }
  })
const p0 = await cardPos()
const lc2 = await stickCenter(page, 'dronesim-joystick-left')
await page.mouse.move(lc2.x, lc2.y)
await page.mouse.down()
await page.mouse.move(lc2.x + 60, lc2.y - 60, { steps: 8 })
await page.mouse.up()
const p1 = await cardPos()
check('joystick drag does not move the grid card', p0.x === p1.x && p0.y === p1.y, `${JSON.stringify(p0)} vs ${JSON.stringify(p1)}`)
void hud

await finish(browser)
