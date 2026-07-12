/**
 * New-course suite: the shuffle button re-rolls the persisted world seed —
 * instantly when nothing would be lost, behind a ConfirmDialog when a best
 * lap exists or a lap is running — clearing laps/best and re-padding the
 * drone; the re-rolled course persists across reloads.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  launch,
  readers,
  reporter,
  stickCenter,
} from './helpers.mjs'
import { DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('shuffle')
const { browser, page } = await launch()
await addDroneWidget(page)
const { hud, timerChip, gatesChip } = readers(page)

const root = page.locator('[data-testid="dronesim-root"]')
const seed = async () => await root.getAttribute('data-world-seed')
const btn = page.locator('[data-testid="dronesim-new-course"]')

const seed0 = await seed()
check('starts on the default seed', seed0 === String(DEFAULT_SEED), `seed=${seed0}`)
await page.screenshot({ path: `${ARTIFACTS_DIR}course-default.png` })

// no best lap yet -> shuffles immediately, no dialog
await btn.click()
await page.waitForTimeout(600)
check('no confirm dialog without a best lap', (await page.getByRole('dialog').count()) === 0)
const seed1 = await seed()
check('seed re-rolled', seed1 !== seed0, `${seed0} -> ${seed1}`)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${ARTIFACTS_DIR}course-shuffled.png` })

// start a lap (fly forward off the pad) -> shuffle now needs confirmation
const rc = await stickCenter(page, 'dronesim-joystick-right')
await page.mouse.move(rc.x, rc.y)
await page.mouse.down()
await page.mouse.move(rc.x, rc.y - 40, { steps: 4 })
await page.waitForTimeout(1500)
await page.mouse.up()
check('lap is running', (await timerChip.getAttribute('data-lap-status')) === 'running')

await btn.click()
await page.waitForTimeout(400)
check('confirm dialog appears mid-lap', (await page.getByRole('dialog').count()) === 1)
await page.getByRole('button', { name: 'Keep course' }).click()
await page.waitForTimeout(400)
check('cancel keeps the seed', (await seed()) === seed1)

await btn.click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Shuffle' }).click()
await page.waitForTimeout(600)
const seed2 = await seed()
check('confirm re-rolls the seed', seed2 !== seed1, `${seed1} -> ${seed2}`)
check(
  'lap cancelled and stats cleared',
  (await timerChip.getAttribute('data-lap-status')) === 'ready' &&
    (await timerChip.getAttribute('data-best-ms')) === '0' &&
    (await gatesChip.getAttribute('data-score')) === '0',
)
check(
  'drone back at the pad',
  Math.abs(parseFloat(await hud.getAttribute('data-alt')) - 2) < 0.3 &&
    Math.abs(parseFloat(await hud.getAttribute('data-x'))) < 0.5,
)

// re-rolled course persists
await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('seed persists across reload', (await seed()) === seed2, `seed=${await seed()}`)

await finish(browser)
