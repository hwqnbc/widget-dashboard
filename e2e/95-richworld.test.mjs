/**
 * Rich-world suite: the scenery toggle defaults on, flips, persists, and the
 * widget keeps flying in both modes. Scene content itself is covered by the
 * worldLayout unit checks (seeded generation, placement constraints) and the
 * screenshots this suite drops in .artifacts for visual review — canvas
 * pixels can't discriminate scenery animation from the ever-spinning rotors.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  launch,
  readers,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'

const { check, finish } = reporter('richworld')
const { browser, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const richState = () => rootState(page, 'data-rich')

check('rich world on by default', (await richState()) === 'on')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${ARTIFACTS_DIR}richworld-on.png` })

await setSwitch(page, 'dronesim-rich-toggle', false)
check('toggle switches off', (await richState()) === 'off')
await page.screenshot({ path: `${ARTIFACTS_DIR}richworld-off.png` })
check('sim still healthy after toggling', (await telemetry()).alt > 1.5)

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('rich-world setting persists across reload', (await richState()) === 'off')
await setSwitch(page, 'dronesim-rich-toggle', true)
check('re-toggling turns scenery back on', (await richState()) === 'on')
check('sim healthy with scenery on', (await telemetry()).alt > 1.5)

await finish(browser)
