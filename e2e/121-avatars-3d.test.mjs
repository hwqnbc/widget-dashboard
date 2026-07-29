/**
 * Avatar Actions 3D view suite: the 2D/3D toggle's contract on the widget
 * root — `data-view` ('2d'/'3d', persisted per instance) and `data-figure3d`
 * ('available'/'unavailable' for the selected avatar).
 *
 * Covers: 2D default, toggling to 3D lazy-loads the three.js chunk and
 * renders a WebGL canvas for the toy (the first avatar with a Figure3D), the
 * tap play/stop toggle keeps working in 3D, an avatar without a 3D figure
 * shows the "not available" placeholder instead of a canvas, switching back
 * restores each view, and the chosen view survives a reload. The 3D art
 * itself is reviewed from screenshots — the suite asserts presence + the
 * data contract, like the 2D suite (120).
 */
import { addAvatarWidget, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('avatars-3d')
const { browser, page } = await launch()
await addAvatarWidget(page)

const root = page.locator('[data-testid="avatar-actions"]')
const picker = root.locator('[data-testid="avatar-picker"] .MuiToggleButton-root')
const viewToggle = root.locator('[data-testid="avatar-view-toggle"] .MuiToggleButton-root')
const stage = root.locator('button[aria-label*="celebration"]')
const stageCanvas = root.locator('[data-testid="figure3d-stage"] canvas')
const unavailable = root.locator('[data-testid="figure3d-unavailable"]')
const attr = (name) => root.getAttribute(name)

// defaults: 2D view, and the toy avatar advertises a 3D figure
check('default view is 2d', (await attr('data-view')) === '2d')
check('view toggle has 2D and 3D options', (await viewToggle.count()) === 2)
check('toy advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
check('no canvas in 2d view', (await stageCanvas.count()) === 0)

// switch to 3D: the lazy three.js chunk loads and a WebGL canvas appears
await viewToggle.nth(1).click()
await page.waitForTimeout(150)
check('toggling sets data-view=3d', (await attr('data-view')) === '3d')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('toy 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('no unavailable placeholder for toy', (await unavailable.count()) === 0)
check('switching view does not auto-play', (await attr('data-playing')) === 'no')

// the tap toggle drives the 3D celebration exactly like the 2D one
await stage.click()
await page.waitForTimeout(150)
check('tap starts the 3d celebration', (await attr('data-playing')) === 'yes')
check('canvas stays mounted while playing', (await stageCanvas.count()) === 1)
await stage.click()
await page.waitForTimeout(150)
check('tapping again stops it', (await attr('data-playing')) === 'no')

// an avatar without a Figure3D shows the placeholder, not a canvas
await picker.nth(1).click() // ninja
await page.waitForTimeout(150)
check('ninja reports no 3D figure', (await attr('data-figure3d')) === 'unavailable')
check('unavailable placeholder shown', (await unavailable.count()) === 1)
check('no canvas for an unavailable figure', (await stageCanvas.count()) === 0)
check('placeholder names the avatar', /Ninja/.test(await unavailable.innerText()))

// back to toy: the 3D figure returns
await picker.nth(0).click()
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('canvas returns for toy', (await stageCanvas.count()) === 1)

// back to 2D: the svg figure renders again
await viewToggle.nth(0).click()
await page.waitForTimeout(150)
check('back to 2d', (await attr('data-view')) === '2d')
check('2d figure svg renders', (await stage.locator('svg').count()) >= 1)
check('leaving 3d unmounts the canvas', (await stageCanvas.count()) === 0)

// persistence: the chosen view survives a reload (selection is covered by 120)
await viewToggle.nth(1).click()
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
await page.waitForTimeout(300) // let redux-persist flush
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="avatar-actions"]')
check('3d view persists across reload', (await attr('data-view')) === '3d')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('3d canvas renders after reload', (await stageCanvas.count()) === 1)

await finish(browser)
