/**
 * Rich-world suite: the scenery toggle defaults on, flips, persists, and the
 * widget keeps flying in both modes. Scene content itself is covered by the
 * worldLayout unit checks (seeded generation, placement constraints) and the
 * screenshots this suite drops in .artifacts for visual review — canvas
 * pixels can't discriminate scenery animation from the ever-spinning rotors.
 */
import { ARTIFACTS_DIR, addDroneWidget, launch, readers, reporter } from './helpers.mjs'

const { check, finish } = reporter('richworld')
const { browser, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const toggle = page.locator('[data-testid="dronesim-rich-toggle"]')

check('rich world on by default', (await toggle.getAttribute('data-rich')) === 'on')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${ARTIFACTS_DIR}richworld-on.png` })

await toggle.click()
await page.waitForTimeout(600)
check('toggle switches off', (await toggle.getAttribute('data-rich')) === 'off')
await page.screenshot({ path: `${ARTIFACTS_DIR}richworld-off.png` })
check('sim still healthy after toggling', (await telemetry()).alt > 1.5)

// persistence
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-rich-toggle"]')
check(
  'rich-world setting persists across reload',
  (await page.locator('[data-testid="dronesim-rich-toggle"]').getAttribute('data-rich')) === 'off',
)
await page.locator('[data-testid="dronesim-rich-toggle"]').click()
await page.waitForTimeout(600)
check('re-toggling turns scenery back on', (await page.locator('[data-testid="dronesim-rich-toggle"]').getAttribute('data-rich')) === 'on')
check('sim healthy with scenery on', (await telemetry()).alt > 1.5)

await finish(browser)
