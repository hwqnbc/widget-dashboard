/**
 * Tank Battle auto-turn suite: the WoT-style hull-follows-camera drive
 * assist. Default ON; only acts under forward throttle (stationary aiming
 * never swings the hull); manual stick-X steering always overrides; the
 * settings toggle turns it off (hull then ignores the camera entirely);
 * off-state persists across reload and reset-to-defaults restores it.
 */
import {
  addTankWidget,
  createTankPilot,
  launch,
  openTankSettings,
  closeTankSettings,
  reporter,
  setTankSwitch,
  tankReaders,
  waitForTankState,
} from './helpers.mjs'

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

const { check, finish } = reporter('tank-autoturn')
const { browser, context, page } = await launch()
await addTankWidget(page)
const { telemetry } = tankReaders(page)
const root = page.locator('[data-testid="tank-battle-root"]')

check('auto-turn on by default', (await root.getAttribute('data-auto-turn')) === 'on')
check('battle active', await waitForTankState(page, 'active'))

const pilot = await createTankPilot(page, context)
await pilot.touchStart()

// Swing the camera off the hull heading while STATIONARY — the hull must
// not move (auto-turn only engages under forward throttle).
await pilot.touch(0, 0, 1, 0)
await page.waitForTimeout(700)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(400)
const aimed = await telemetry()
const gap0 = Math.abs(wrap(aimed.camYaw - aimed.hullYaw))
check('camera swung off the hull', gap0 > 0.6, `gap=${gap0.toFixed(2)}`)
check('stationary aiming leaves the hull', Math.abs(aimed.hullYaw) < 0.05, `hullYaw=${aimed.hullYaw}`)

// Throttle only (no stick X): the hull walks onto the camera heading.
await pilot.touch(0, 0.9, 0, 0)
await page.waitForTimeout(2200)
const followed = await telemetry()
const gap1 = Math.abs(wrap(followed.camYaw - followed.hullYaw))
check('hull follows the camera while driving', gap1 < 0.15, `gap ${gap0.toFixed(2)} → ${gap1.toFixed(2)}`)

// Manual steer overrides the assist mid-drive.
const preManual = (await telemetry()).hullYaw
await pilot.touch(1, 0.7, 0, 0)
await page.waitForTimeout(900)
await pilot.touch(0, 0, 0, 0)
const manual = await telemetry()
check(
  'stick X overrides auto-turn',
  wrap(manual.hullYaw - preManual) < -0.5,
  `hullYaw ${preManual.toFixed(2)} → ${manual.hullYaw.toFixed(2)}`,
)
await pilot.touchEnd()

// Toggle off: the hull ignores the camera under throttle.
await setTankSwitch(page, 'tank-autoturn-toggle', false)
check('toggle mirrors on the root', (await root.getAttribute('data-auto-turn')) === 'off')
await pilot.touchStart()
await pilot.touch(0, 0, -1, 0)
await page.waitForTimeout(700)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(300)
const offAimed = await telemetry()
const offGap = Math.abs(wrap(offAimed.camYaw - offAimed.hullYaw))
check('camera swung again (off mode)', offGap > 0.6, `gap=${offGap.toFixed(2)}`)
await pilot.touch(0, 0.9, 0, 0)
await page.waitForTimeout(1800)
await pilot.touch(0, 0, 0, 0)
const offDriven = await telemetry()
check(
  'hull ignores the camera with auto-turn off',
  Math.abs(wrap(offDriven.hullYaw - offAimed.hullYaw)) < 0.12,
  `hullYaw ${offAimed.hullYaw.toFixed(2)} → ${offDriven.hullYaw.toFixed(2)}`,
)
await pilot.touchEnd()

// Off-state persists across reload; reset-to-defaults restores on.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="tank-battle-root"]')
await page.waitForTimeout(800)
check('off persists across reload', (await root.getAttribute('data-auto-turn')) === 'off')
await openTankSettings(page)
await page.locator('[data-testid="tank-settings-reset"]').click()
await page.waitForTimeout(300)
await closeTankSettings(page)
check('settings reset restores auto-turn', (await root.getAttribute('data-auto-turn')) === 'on')

await finish(browser)
