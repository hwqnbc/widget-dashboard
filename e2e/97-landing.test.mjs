/**
 * Landing-challenge suite: toggle on shows the pads (minimap markers are the
 * DOM observable), a closed-loop descent onto a designated rooftop pad
 * scores a LANDED! banner and persists the best, a non-pad roof scores
 * nothing, and the toggle + best survive a reload.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('landing')
const L = buildWorldLayout(DEFAULT_SEED)
const PAD = L.landingPads[0]
// a roof that is NOT a pad (the collision suite's usual target)
const PLAIN = { x: L.buildings[0].x, z: L.buildings[0].z, top: L.colliders[0].top }
const CRUISE_ALT = 24

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)
const toggle = page.locator('[data-testid="dronesim-landing-toggle"]')
const root = page.locator('[data-testid="dronesim-root"]')
const best = async () => parseInt(await root.getAttribute('data-landing-best'), 10)
const bannerText = () =>
  page
    .locator('[data-testid="dronesim-lap-banner"]')
    .textContent({ timeout: 1500 })
    .catch(() => '')

check('landing challenge off by default', (await toggle.getAttribute('data-landing')) === 'off')
check('no pad markers on the minimap when off', (await page.locator('[data-landing-pad]').count()) === 0)

await toggle.click()
await page.waitForTimeout(400)
check('toggle turns it on', (await toggle.getAttribute('data-landing')) === 'on')
check(
  'minimap shows the pads',
  (await page.locator('[data-landing-pad]').count()) === L.landingPads.length,
)

// land on the designated pad
const landOn = async (target) => {
  await pilot.touchStart()
  await pilot.flyTo({ x: target.x, y: CRUISE_ALT, z: target.z })
  await pilot.brake()
  await pilot.flyTo({ x: target.x, y: target.top + 4, z: target.z }, { maxForward: 0.4 })
  await pilot.brake()
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    await pilot.touch(0, -1, 0, 0)
    if ((await telemetry()).alt < target.top + 0.4) break
    await page.waitForTimeout(150)
  }
  await pilot.touch(0, 0, 0, 0)
  await page.waitForTimeout(800)
  await pilot.touchEnd()
}

await landOn(PAD)
const text1 = (await bannerText()) ?? ''
check('LANDED! banner appears', text1.includes('LANDED!'), text1 || 'no banner')
const b1 = await best()
check('points recorded as best (10-100)', b1 >= 10 && b1 <= 100, `best=${b1}`)
check('first landing announces NEW BEST', text1.includes('NEW BEST'), text1)
await page.screenshot({ path: `${ARTIFACTS_DIR}landing.png` })

// a plain roof scores nothing
await page.locator('[data-testid="dronesim-reset"]').click()
await page.waitForTimeout(2600) // reset + let the old banner expire
await landOn(PLAIN)
const text2 = (await bannerText()) ?? ''
check('non-pad roof gives no banner', !text2.includes('LANDED!'), text2 || '(none)')
check('best unchanged after plain-roof landing', (await best()) === b1)

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-landing-toggle"]')
check(
  'toggle and best persist across reload',
  (await page.locator('[data-testid="dronesim-landing-toggle"]').getAttribute('data-landing')) === 'on' &&
    parseInt(await page.locator('[data-testid="dronesim-root"]').getAttribute('data-landing-best'), 10) === b1,
)
await page.locator('[data-testid="dronesim-landing-toggle"]').click()
await page.waitForTimeout(400)
check(
  'toggling off hides the pads again',
  (await page.locator('[data-landing-pad]').count()) === 0,
)

await finish(browser)
