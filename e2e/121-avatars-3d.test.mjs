/**
 * Avatar Actions 3D view suite: the 2D/3D toggle's contract on the widget
 * root — `data-view` ('2d'/'3d', persisted per instance) and `data-figure3d`
 * ('available'/'unavailable' for the selected avatar).
 *
 * Covers: 2D default, toggling to 3D lazy-loads the three.js chunk and
 * renders a WebGL canvas for the avatars with a Figure3D (toy, ninja), the
 * action toggle lists the 3D model's named-move library (registry
 * `actions3d`: toy [6 7], ninja [Pump, Draw]) and each action drives
 * `data-action`/`data-playing`, an avatar without a 3D figure (fireninja)
 * shows the "not available" placeholder instead of a canvas (with the
 * action toggle disabled — nothing would visibly play), switching back
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
// nth(0) = Idle, nth(1) = Celebrate.
const celebration = root.locator('[data-testid="celebration-toggle"] .MuiToggleButton-root')
const stage = root.locator('[data-testid="avatar-stage"]')
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

// the action toggle lists the toy's move library and drives the 3D model
check('toy 3d actions: Idle + 6 7', (await celebration.count()) === 2)
await celebration.nth(1).click() // '6 7'
await page.waitForTimeout(150)
check('6 7 starts the 3d action', (await attr('data-playing')) === 'yes')
check('action id is sixseven', (await attr('data-action')) === 'sixseven')
check('canvas stays mounted while playing', (await stageCanvas.count()) === 1)
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle stops it', (await attr('data-playing')) === 'no')

// ninja carries a 3D figure too — with a two-move library
await picker.nth(1).click() // ninja
await page.waitForTimeout(150)
check('ninja advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('ninja 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('ninja 3d actions: Idle + Pump + Draw', (await celebration.count()) === 3)
await celebration.nth(2).click() // Draw
await page.waitForTimeout(150)
check('Draw plays', (await attr('data-action')) === 'draw')
check('Draw sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(1).click() // Pump — switching mid-play
await page.waitForTimeout(150)
check('Pump takes over', (await attr('data-action')) === 'pump')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the ninja action', (await attr('data-action')) === 'idle')

// an avatar without a Figure3D shows the placeholder, not a canvas
await picker.nth(2).click() // fireninja — still 3D-less
await page.waitForTimeout(150)
check('fireninja reports no 3D figure', (await attr('data-figure3d')) === 'unavailable')
check('unavailable placeholder shown', (await unavailable.count()) === 1)
check('no canvas for an unavailable figure', (await stageCanvas.count()) === 0)
check('placeholder names the avatar', /Fire Ninja/.test(await unavailable.innerText()))
check('celebration toggle disabled on the placeholder', await celebration.nth(1).isDisabled())

// back to toy: the 3D figure returns and the toggle re-enables
await picker.nth(0).click()
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('canvas returns for toy', (await stageCanvas.count()) === 1)
check('celebration toggle re-enabled for toy', !(await celebration.nth(1).isDisabled()))

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
