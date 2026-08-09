/**
 * Avatar Actions 3D view suite: the 2D/3D toggle's contract on the widget
 * root — `data-view` ('2d'/'3d', persisted per instance) and `data-figure3d`
 * ('available'/'unavailable' for the selected avatar).
 *
 * Covers: 2D default, toggling to 3D lazy-loads the three.js chunk and
 * renders a WebGL canvas for every avatar (ALL eleven carry a Figure3D now),
 * the action toggle lists the 3D model's named-move library (registry
 * `actions3d`; **the shared Walk (leg-gait) action is pinned FIRST** so the
 * universal moves lead — Idle, Walk, then the avatar's specials): toy
 * [Walk, Dance, 6 7 Show], ninja [Walk, Pump, Draw], fireninja
 * [Walk, Fire Blade], darkarin [Walk, Twin Cross], frak [Walk, Blade
 * Flurry], imperium [Walk, Claw Slash], goldgunner [Walk, Guns Blazing],
 * scar [Walk, Breach & Clear, Sight & Fire],
 * bazookajoe [Walk, Rocket Launch, Take Aim], lloyd [Walk, Sword Chop, Fly],
 * jettrooper [Walk, Jet & Blast]) and each action drives
 * `data-action`/`data-playing`, tapping the 3D figure toggles the turntable
 * (`data-spin`, one uniform rule for every avatar, persisted per widget),
 * switching back restores each view, and the chosen view + spin preference
 * survive a reload.
 * The "no 3D figure" placeholder path (`figure3d-unavailable`, action
 * toggle disabled) is back to unexercised scaffolding — lloyd's 3D model
 * landed, so the roster is fully 3D again (lesson #65) and only the toy
 * block's negative check still probes it. The 3D art itself is reviewed
 * from screenshots — the suite asserts presence + the data contract, like
 * the 2D suite (120).
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

// tapping the figure toggles the turntable (feedback = the motion itself)
const stage3d = root.locator('[data-testid="figure3d-stage"]')
check('turntable spins by default', (await attr('data-spin')) === 'on')
await stage3d.click()
await page.waitForTimeout(150)
check('tapping the figure stops the turntable', (await attr('data-spin')) === 'off')
await stage3d.click()
await page.waitForTimeout(150)
check('tapping again restarts it', (await attr('data-spin')) === 'on')

// the action toggle lists the toy's move library and drives the 3D model
check('toy 3d actions: Idle + Walk + Dance + 6 7 Show', (await celebration.count()) === 4)
await celebration.nth(2).click() // 'Dance'
await page.waitForTimeout(150)
check('Dance starts the 3d action', (await attr('data-playing')) === 'yes')
check('action id is dance', (await attr('data-action')) === 'dance')
check('canvas stays mounted while playing', (await stageCanvas.count()) === 1)
await celebration.nth(3).click() // '6 7 Show' — the numerals variant
await page.waitForTimeout(150)
check('6 7 Show takes over', (await attr('data-action')) === 'sixsevenshow')
check('show keeps playing', (await attr('data-playing')) === 'yes')
await celebration.nth(1).click() // 'Walk' — the shared leg-gait action, pinned first
await page.waitForTimeout(150)
check('Walk plays on toy', (await attr('data-action')) === 'walk')
check('Walk sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle stops it', (await attr('data-playing')) === 'no')

// ninja carries a 3D figure too — with a two-move library
await picker.nth(1).click() // ninja
await page.waitForTimeout(150)
check('ninja advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('ninja 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
await stage3d.click() // the same tap toggle on every avatar
await page.waitForTimeout(150)
check('spin toggle works on ninja too', (await attr('data-spin')) === 'off')
check('ninja 3d actions: Idle + Walk + Pump + Draw', (await celebration.count()) === 4)
await celebration.nth(3).click() // Draw
await page.waitForTimeout(150)
check('Draw plays', (await attr('data-action')) === 'draw')
check('Draw sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(2).click() // Pump — switching mid-play
await page.waitForTimeout(150)
check('Pump takes over', (await attr('data-action')) === 'pump')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the ninja action', (await attr('data-action')) === 'idle')

// fireninja's 3D figure: one-move library, the Fire Blade round-trips
await picker.nth(2).click() // fireninja
await page.waitForTimeout(150)
check('fireninja advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('fireninja 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('fireninja 3d actions: Idle + Walk + Fire Blade', (await celebration.count()) === 3)
await celebration.nth(2).click() // Fire Blade
await page.waitForTimeout(150)
check('Fire Blade plays', (await attr('data-action')) === 'blaze')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the fireninja action', (await attr('data-action')) === 'idle')

// darkarin's 3D figure: one-move library, the Twin Cross round-trips
await picker.nth(3).click() // darkarin
await page.waitForTimeout(150)
check('darkarin advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('darkarin 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('darkarin 3d actions: Idle + Walk + Twin Cross', (await celebration.count()) === 3)
await celebration.nth(2).click() // Twin Cross
await page.waitForTimeout(150)
check('Twin Cross plays', (await attr('data-action')) === 'cross')
check('Twin Cross sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the darkarin action', (await attr('data-action')) === 'idle')

// frak's 3D figure: one-move library, the Blade Flurry round-trips
await picker.nth(4).click() // frak
await page.waitForTimeout(150)
check('frak advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('frak 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('frak 3d actions: Idle + Walk + Blade Flurry', (await celebration.count()) === 3)
await celebration.nth(2).click() // Blade Flurry
await page.waitForTimeout(150)
check('Blade Flurry plays', (await attr('data-action')) === 'flurry')
check('Blade Flurry sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the frak action', (await attr('data-action')) === 'idle')

// imperium's 3D figure: one-move library, the Claw Slash round-trips
await picker.nth(5).click() // imperium
await page.waitForTimeout(150)
check('imperium advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('imperium 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('imperium 3d actions: Idle + Walk + Claw Slash', (await celebration.count()) === 3)
await celebration.nth(2).click() // Claw Slash
await page.waitForTimeout(150)
check('Claw Slash plays', (await attr('data-action')) === 'slash')
check('Claw Slash sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the imperium action', (await attr('data-action')) === 'idle')

// goldgunner's 3D figure: one-move library, Guns Blazing round-trips
await picker.nth(6).click() // goldgunner
await page.waitForTimeout(150)
check('goldgunner advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('goldgunner 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('goldgunner 3d actions: Idle + Walk + Guns Blazing', (await celebration.count()) === 3)
await celebration.nth(2).click() // Guns Blazing
await page.waitForTimeout(150)
check('Guns Blazing plays', (await attr('data-action')) === 'blaze')
check('Guns Blazing sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the goldgunner action', (await attr('data-action')) === 'idle')

// scar's 3D figure: two-move library, Breach & Clear + Sight & Fire round-trip
await picker.nth(7).click() // scar
await page.waitForTimeout(150)
check('scar advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('scar 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('scar 3d actions: Idle + Walk + Breach & Clear + Sight & Fire', (await celebration.count()) === 4)
await celebration.nth(2).click() // Breach & Clear
await page.waitForTimeout(150)
check('Breach & Clear plays', (await attr('data-action')) === 'breach')
check('Breach & Clear sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(3).click() // Sight & Fire (the new aiming action)
await page.waitForTimeout(150)
check('Sight & Fire plays', (await attr('data-action')) === 'sight')
check('Sight & Fire sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(1).click() // Walk (the shared leg-gait action, pinned first)
await page.waitForTimeout(150)
check('Walk plays on scar', (await attr('data-action')) === 'walk')
check('Walk sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the scar action', (await attr('data-action')) === 'idle')

// bazookajoe's 3D figure: two-move library, Rocket Launch + Take Aim round-trip
await picker.nth(8).click() // bazookajoe — the last avatar to gain 3D
await page.waitForTimeout(150)
check('bazookajoe advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('bazookajoe 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('bazookajoe 3d actions: Idle + Walk + Rocket Launch + Take Aim', (await celebration.count()) === 4)
await celebration.nth(2).click() // Rocket Launch
await page.waitForTimeout(150)
check('Rocket Launch plays', (await attr('data-action')) === 'launch')
check('Rocket Launch sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(3).click() // Take Aim (the new aiming action)
await page.waitForTimeout(150)
check('Take Aim plays', (await attr('data-action')) === 'aim')
check('Take Aim sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the bazookajoe action', (await attr('data-action')) === 'idle')

// lloyd's 3D figure: dragon wings + tail, Walk + Sword Chop + Fly round-trip
await picker.nth(9).click()
await page.waitForTimeout(150)
check('lloyd advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('lloyd 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('lloyd 3d actions: Idle + Walk + Sword Chop + Fly', (await celebration.count()) === 4)
await celebration.nth(2).click() // Sword Chop
await page.waitForTimeout(150)
check('Sword Chop plays', (await attr('data-action')) === 'chop')
check('Sword Chop sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(3).click() // Fly (the wing beat — also the Drone Sim craft)
await page.waitForTimeout(150)
check('Fly plays on lloyd', (await attr('data-action')) === 'fly')
await celebration.nth(1).click() // Walk (the shared leg-gait action)
await page.waitForTimeout(150)
check('Walk plays on lloyd', (await attr('data-action')) === 'walk')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the lloyd action', (await attr('data-action')) === 'idle')

// jettrooper's 3D figure: jetpack + beam weapon, Walk + Jet & Blast round-trip
await picker.nth(10).click()
await page.waitForTimeout(150)
check('jettrooper advertises an available 3D figure', (await attr('data-figure3d')) === 'available')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('jettrooper 3d view renders a WebGL canvas', (await stageCanvas.count()) === 1)
check('jettrooper 3d actions: Idle + Walk + Jet & Blast', (await celebration.count()) === 3)
await celebration.nth(2).click() // Jet & Blast (lift-off + beam pulses)
await page.waitForTimeout(150)
check('Jet & Blast plays', (await attr('data-action')) === 'jet')
check('Jet & Blast sets playing', (await attr('data-playing')) === 'yes')
await celebration.nth(1).click() // Walk (the shared leg-gait action)
await page.waitForTimeout(150)
check('Walk plays on jettrooper', (await attr('data-action')) === 'walk')
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle resets the jettrooper action', (await attr('data-action')) === 'idle')

// back to toy: the 3D figure returns and the toggle re-enables
await picker.nth(0).click()
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('canvas returns for toy', (await stageCanvas.count()) === 1)
check('celebration toggle re-enabled for toy', !(await celebration.nth(1).isDisabled()))
check('spin preference follows the widget across avatars', (await attr('data-spin')) === 'off')

// back to 2D: the svg figure renders again
await viewToggle.nth(0).click()
await page.waitForTimeout(150)
check('back to 2d', (await attr('data-view')) === '2d')
check('2d figure svg renders', (await stage.locator('svg').count()) >= 1)
check('leaving 3d unmounts the canvas', (await stageCanvas.count()) === 0)

// persistence: the chosen view + spin preference survive a reload
// (selection is covered by 120; data-spin is still 'off' from above)
await viewToggle.nth(1).click()
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
await page.waitForTimeout(300) // let redux-persist flush
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="avatar-actions"]')
check('3d view persists across reload', (await attr('data-view')) === '3d')
check('spin preference persists across reload', (await attr('data-spin')) === 'off')
await page.waitForSelector('[data-testid="figure3d-stage"] canvas', { timeout: 20000 })
check('3d canvas renders after reload', (await stageCanvas.count()) === 1)

await finish(browser)
