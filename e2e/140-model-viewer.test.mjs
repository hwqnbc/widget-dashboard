/**
 * Model Viewer suite: the widget's root data-* contract — `data-model` (the
 * selected catalog model), `data-animate`/`data-autorotate` ('on'/'off',
 * persisted per instance) and the tick-owned `data-frames` counter the
 * FrameProbe writes from inside the render loop (the only way to prove the
 * canvas is producing frames without reading pixels).
 *
 * Covers: adding the widget lazy-loads the three.js chunk and renders a
 * WebGL canvas, the default model is the LEGO SWAT truck, the render loop
 * advances `data-frames`, the picker switches between all catalog models
 * (SWAT truck / AA turret / military truck — `data-model` + canvas + frames
 * survive the swap), the Animate and
 * Auto-rotate toggles flip their root attributes, and the model choice +
 * toggle settings survive a reload. The model art itself is reviewed from
 * screenshots — the suite asserts presence + the data contract (lesson #52).
 */
import { addModelViewerWidget, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('model-viewer')
const { browser, page } = await launch()
await addModelViewerWidget(page)

const root = page.locator('[data-testid="model-viewer"]')
const picker = root.locator('[data-testid="model-viewer-picker"] .MuiToggleButton-root')
const animateBtn = root.locator('[data-testid="model-viewer-animate"]')
const autoRotateBtn = root.locator('[data-testid="model-viewer-autorotate"]')
const attr = (name) => root.getAttribute(name)

// defaults + the lazy three.js chunk renders a WebGL canvas
check('default model is the SWAT truck', (await attr('data-model')) === 'legoSwatTruck')
check('animate defaults on', (await attr('data-animate')) === 'on')
check('auto-rotate defaults off', (await attr('data-autorotate')) === 'off')
await page.waitForSelector('[data-testid="model-viewer"] canvas', { timeout: 20000 })
check('viewer renders a WebGL canvas', (await root.locator('canvas').count()) === 1)

// the render loop runs: the tick-owned data-frames counter advances
await page.waitForFunction(
  () => document.querySelector('[data-testid="model-viewer"]')?.dataset.frames !== undefined,
  null,
  { timeout: 20000 },
)
const framesBefore = parseInt(await attr('data-frames'), 10)
await page.waitForTimeout(1000)
const framesAfter = parseInt(await attr('data-frames'), 10)
check(
  'render loop advances data-frames',
  framesAfter > framesBefore,
  `${framesBefore} -> ${framesAfter}`,
)

// the picker mirrors data-model and switches models
check('picker lists all three models', (await picker.count()) === 3)
check(
  'selected picker button matches data-model',
  (await picker.first().getAttribute('aria-pressed')) === 'true',
)
await picker.nth(1).click() // AA Turret
await page.waitForTimeout(200)
check('switching sets data-model=aaTurret', (await attr('data-model')) === 'aaTurret')
check('canvas survives the model switch', (await root.locator('canvas').count()) === 1)
const framesAtSwitch = parseInt(await attr('data-frames'), 10)
await page.waitForTimeout(1000)
check(
  'render loop keeps advancing on the turret',
  parseInt(await attr('data-frames'), 10) > framesAtSwitch,
)

// Animate toggle drives data-animate
await animateBtn.click()
await page.waitForTimeout(150)
check('Animate toggles off', (await attr('data-animate')) === 'off')
await animateBtn.click()
await page.waitForTimeout(150)
check('Animate toggles back on', (await attr('data-animate')) === 'on')

// Auto-rotate toggle drives data-autorotate
await autoRotateBtn.click()
await page.waitForTimeout(150)
check('Auto-rotate toggles on', (await attr('data-autorotate')) === 'on')

// persistence: flip Animate off too, then model choice + settings survive
// a reload (the turret is still the selected model here)
await animateBtn.click()
await page.waitForTimeout(300) // let redux-persist flush
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="model-viewer"]')
check('model choice persists across reload', (await attr('data-model')) === 'aaTurret')
check('animate=off persists across reload', (await attr('data-animate')) === 'off')
check('auto-rotate=on persists across reload', (await attr('data-autorotate')) === 'on')
await page.waitForSelector('[data-testid="model-viewer"] canvas', { timeout: 20000 })
check('canvas renders after reload', (await root.locator('canvas').count()) === 1)

// the military truck is selectable too
await picker.nth(2).click()
await page.waitForTimeout(200)
check('switching sets data-model=militaryTruck', (await attr('data-model')) === 'militaryTruck')
check('canvas survives the militaryTruck switch', (await root.locator('canvas').count()) === 1)

// switch back to the SWAT truck
await picker.first().click()
await page.waitForTimeout(200)
check('switching back restores the truck', (await attr('data-model')) === 'legoSwatTruck')

await finish(browser)
