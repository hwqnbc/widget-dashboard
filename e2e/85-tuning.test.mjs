/**
 * Tuning suite: the tune popover's sliders and turbo switch change the
 * persisted rates, observable straight from the HUD — top speed scales with
 * the speed slider (and further with turbo), yaw rate scales heading change,
 * and settings survive a reload.
 */
import { addDroneWidget, createPilot, launch, readers, reporter } from './helpers.mjs'

const { check, finish } = reporter('tuning')
const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)

const openPanel = async () => {
  await page.locator('[data-testid="dronesim-tune"]').click()
  await page.waitForSelector('[data-testid="dronesim-tune-panel"]')
}
const closePanel = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
const setSlider = async (tid, fraction) => {
  const box = await page.locator(`[data-testid="${tid}"]`).boundingBox()
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2)
}

// measure top speed: full forward at altitude for 2.5s
const topSpeed = async () => {
  await pilot.touchStart()
  await pilot.touch(0, 1, 0, 0)
  await page.waitForTimeout(1200)
  await pilot.touch(0, 0, 0, 1)
  await page.waitForTimeout(2500)
  const s = (await telemetry()).speed
  await pilot.touchEnd()
  await page.locator('[data-testid="dronesim-reset"]').click()
  await page.waitForTimeout(400)
  return s
}
// measure yaw change over 1s of full left-stick X
const yawRate = async () => {
  const y0 = (await telemetry()).yaw
  await pilot.touchStart()
  await pilot.touch(1, 0, 0, 0)
  await page.waitForTimeout(1000)
  await pilot.touchEnd()
  await page.waitForTimeout(300)
  const y1 = (await telemetry()).yaw
  await page.locator('[data-testid="dronesim-reset"]').click()
  await page.waitForTimeout(400)
  return Math.abs(y1 - y0)
}

await openPanel()
check('panel opens with all controls', (await page.locator('[data-testid="dronesim-tune-speed"], [data-testid="dronesim-tune-yaw"], [data-testid="dronesim-tune-expo"], [data-testid="dronesim-tune-turbo"]').count()) === 4)
await closePanel()

const baseSpeed = await topSpeed()
check('default top speed ~12', Math.abs(baseSpeed - 12) < 1.5, `spd=${baseSpeed}`)
const baseYaw = await yawRate()

// max out the speed slider
await openPanel()
await setSlider('dronesim-tune-speed', 0.999)
await closePanel()
const fastSpeed = await topSpeed()
check('speed x2 roughly doubles top speed', fastSpeed > baseSpeed * 1.7, `${baseSpeed} -> ${fastSpeed}`)

// turbo stacks on top
await openPanel()
await page.locator('[data-testid="dronesim-tune-turbo"] input').check()
await closePanel()
const turboSpeed = await topSpeed()
check('turbo pushes past the slider value (capped at 2.5x)', turboSpeed > fastSpeed * 1.1 && turboSpeed < 12 * 2.6, `${fastSpeed} -> ${turboSpeed}`)

// yaw slider
await openPanel()
await page.locator('[data-testid="dronesim-tune-turbo"] input').uncheck()
await setSlider('dronesim-tune-yaw', 0.999)
await closePanel()
const fastYaw = await yawRate()
check('yaw x2 roughly doubles turn rate', fastYaw > baseYaw * 1.6, `${baseYaw.toFixed(2)} -> ${fastYaw.toFixed(2)}`)

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-tune"]')
await openPanel()
const speedVal = await page.locator('[data-testid="dronesim-tune-speed"] input').inputValue()
const yawVal = await page.locator('[data-testid="dronesim-tune-yaw"] input').inputValue()
check('tuning persists across reload', parseFloat(speedVal) === 2 && parseFloat(yawVal) === 2, `speed=${speedVal} yaw=${yawVal}`)

await finish(browser)
