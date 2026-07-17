/**
 * FPV-polish suite: the opt-in (default OFF) first-person feel — artificial
 * horizon appears only in fp view with the toggle on, banks with strafe
 * (data-roll), levels out on release, and the setting persists. Shake and
 * exact roll rendering are visual (screenshot artifact); the DOM contract
 * is the horizon element + its data-roll.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'

const { check, finish } = reporter('fpv')
const { browser, context, page } = await launch()
await addDroneWidget(page)
const pilot = await createPilot(page, context)
const horizon = page.locator('[data-testid="dronesim-horizon"]')
const viewToggle = page.locator('[data-testid="dronesim-view-toggle"]')

check('fpv polish off by default', (await rootState(page, 'data-fpv')) === 'off')
await viewToggle.click() // tp -> fp
await page.waitForTimeout(300)
check('no horizon in fp while off', (await horizon.count()) === 0)

await setSwitch(page, 'dronesim-fpv-toggle', true)
check('toggle turns fpv polish on', (await rootState(page, 'data-fpv')) === 'on')
check('horizon appears in fp', (await horizon.count()) === 1)

// strafe banks the drone -> the horizon line counter-rolls
await pilot.touchStart()
await pilot.touch(0, 0.6, 1, 0) // climb a little + full strafe right
await page.waitForTimeout(900)
const rollBanked = parseFloat(await horizon.getAttribute('data-roll'))
check('strafe banks the horizon', Math.abs(rollBanked) > 5, `roll=${rollBanked}`)
await page.screenshot({ path: `${ARTIFACTS_DIR}fpv-banked.png` })
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(1200)
await pilot.touchEnd()
const rollLevel = parseFloat(await horizon.getAttribute('data-roll'))
check('levels out on release', Math.abs(rollLevel) < 1.5, `roll=${rollLevel}`)

// fp-only: the overlay never shows in other views
await viewToggle.click() // fp -> los
check('no horizon outside fp (los)', (await horizon.count()) === 0)
await viewToggle.click() // los -> walk
await viewToggle.click() // walk -> tp
check('no horizon outside fp (tp)', (await horizon.count()) === 0)
await viewToggle.click() // tp -> fp again

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('fpv polish persists across reload', (await rootState(page, 'data-fpv')) === 'on')
check('horizon back after reload (fp persisted)', (await horizon.count()) === 1)

await setSwitch(page, 'dronesim-fpv-toggle', false)
check('toggling off removes the horizon', (await horizon.count()) === 0)

await finish(browser)
