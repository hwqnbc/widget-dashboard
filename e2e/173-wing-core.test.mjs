/**
 * Wing Flyer core suite (browser): element presence and root defaults, the
 * first-run "How to fly" overlay (auto-opens once, `helpSeen` persists, ?
 * reopens), preflight → Launch → a climbing flight (hand launch), the
 * trainer's Runway start lifting off, the wing having no Runway button,
 * the settings contract (airframe switch also switches to that plane's
 * camera; assist / invert pitch / FPV level / sound persist; Reset
 * settings restores defaults), the camera button, HUD telemetry sanity and
 * the render budget (draw calls).
 */
import { BASE_URL, addWingWidget, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('wing-core')
const { browser, page } = await launch()

// --- first run: help opens by itself -----------------------------------------
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Add widget' }).click()
await page.getByRole('menuitem', { name: /Wing Flyer/ }).click()
await page.waitForSelector('[data-testid="wingflyer-root"]')
await page.waitForTimeout(1000)
const root = page.locator('[data-testid="wingflyer-root"]')
const hud = page.locator('[data-testid="wingflyer-hud"]')
const attr = (a) => root.getAttribute(a)
const tel = (a) => hud.getAttribute(a)
check('first run opens "How to fly"', await page.locator('[data-testid="wingflyer-help-panel"]').isVisible())
check('help is not yet marked seen', (await attr('data-help-seen')) === 'off')
await page.click('[data-testid="wingflyer-help-close"]')
await page.waitForTimeout(400)
check('closing marks help seen', (await attr('data-help-seen')) === 'on')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="wingflyer-root"]')
await page.waitForTimeout(1200)
check('help stays closed after reload', !(await page.locator('[data-testid="wingflyer-help-panel"]').isVisible()))
await page.click('[data-testid="wingflyer-help"]')
await page.waitForTimeout(300)
check('? reopens the help', await page.locator('[data-testid="wingflyer-help-panel"]').isVisible())
await page.click('[data-testid="wingflyer-help-close"]')
await page.waitForTimeout(300)

// --- presence + defaults ------------------------------------------------------
for (const tid of [
  'wingflyer-canvas',
  'wingflyer-hud',
  'wingflyer-home',
  'wingflyer-reset',
  'wingflyer-view',
  'wingflyer-help',
  'wingflyer-settings',
  'wingflyer-panic',
  'wingflyer-joystick-left',
  'wingflyer-joystick-right',
  'wingflyer-launch',
  'wingflyer-runway',
]) {
  check(`present: ${tid}`, (await page.locator(`[data-testid="${tid}"]`).count()) === 1)
}
check(
  'defaults: trainer, Trainer assist, chase cam, sound off, preflight',
  (await attr('data-airframe')) === 'trainer' &&
    (await attr('data-assist')) === 'trainer' &&
    (await attr('data-view')) === 'chase' &&
    (await attr('data-sound')) === 'off' &&
    (await attr('data-phase')) === 'preflight',
)

// --- hand launch ----------------------------------------------------------------
check('preflight: plane in the hand (~1.75 m up, not moving)', Math.abs(Number(await tel('data-agl')) - 1.75) < 0.3 && Number(await tel('data-airspeed')) < 0.5)
await page.click('[data-testid="wingflyer-launch"]')
await page.waitForTimeout(500)
check('Launch → flying, launch autopilot engaged', (await attr('data-phase')) === 'flying' && (await tel('data-assist-mode')) === 'launch')
// Poll, don't sleep: under load the 8-sub-step cap turns long frames into
// slow motion, so wall-clock time is not flight time.
let agl = 0
for (let i = 0; i < 60 && agl <= 8; i++) {
  await page.waitForTimeout(250)
  agl = Number(await tel('data-agl'))
}
check('hand launch climbs away', agl > 8 && Number(await tel('data-crashes')) === 0, `agl ${agl}`)
check('telemetry: airspeed sane, stall ok', Number(await tel('data-airspeed')) > 9 && (await tel('data-stall')) === 'ok')
const calls = Number(await tel('data-draw-calls'))
check('render budget: draw calls in flight < 45', calls > 0 && calls < 45, `${calls} calls, ${await tel('data-triangles')} tris`)
check('home arrow reports distance + bearing', Number(await tel('data-home-dist')) > 0 && (await tel('data-home-bearing')) !== null)

// --- runway start (trainer) --------------------------------------------------------
await page.click('[data-testid="wingflyer-reset"]')
await page.waitForTimeout(600)
check('reset → back in the hand', (await attr('data-phase')) === 'preflight')
await page.click('[data-testid="wingflyer-runway"]')
await page.waitForTimeout(800)
check('Runway → rolling on the ground', (await tel('data-ground')) === 'ground' && (await tel('data-assist-mode')) === 'runway')
let lifted = false
for (let i = 0; i < 40 && !lifted; i++) {
  await page.waitForTimeout(250)
  lifted = (await tel('data-ground')) === 'air' && Number(await tel('data-agl')) > 3
}
check('Trainer runway take-off lifts off by itself', lifted && Number(await tel('data-crashes')) === 0)

// --- settings ------------------------------------------------------------------------
const setting = async (tid) => {
  await page.click('[data-testid="wingflyer-settings"]')
  await page.click(`[data-testid="${tid}"]`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}
await setting('wingflyer-airframe-wing')
check('wing selected → its FPV camera too', (await attr('data-airframe')) === 'wing' && (await attr('data-view')) === 'fpv')
await page.click('[data-testid="wingflyer-paused"]').catch(() => {})
await page.waitForTimeout(2200)
check('the wing has no Runway start (no wheels)', (await page.locator('[data-testid="wingflyer-runway"]').count()) === 0)
await setting('wingflyer-assist-acro')
await setting('wingflyer-invert-pitch')
await setting('wingflyer-fpv-level')
await setting('wingflyer-sound')
check(
  'assist / invert / FPV level / sound toggles land on the root',
  (await attr('data-assist')) === 'acro' &&
    (await attr('data-invert-pitch')) === 'on' &&
    (await attr('data-fpv-level')) === 'off' &&
    (await attr('data-sound')) === 'on',
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="wingflyer-root"]')
await page.waitForTimeout(1200)
check(
  'settings persist across reload',
  (await attr('data-airframe')) === 'wing' && (await attr('data-assist')) === 'acro' && (await attr('data-sound')) === 'on',
)
await page.click('[data-testid="wingflyer-view"]')
await page.waitForTimeout(300)
check('camera button toggles the view', (await attr('data-view')) === 'chase')
await setting('wingflyer-reset-settings')
check(
  'Reset settings restores the defaults',
  (await attr('data-airframe')) === 'trainer' &&
    (await attr('data-assist')) === 'trainer' &&
    (await attr('data-view')) === 'chase' &&
    (await attr('data-invert-pitch')) === 'off' &&
    (await attr('data-fpv-level')) === 'on' &&
    (await attr('data-sound')) === 'off',
)

await page.screenshot({ path: new URL('./.artifacts/173-wing-core.png', import.meta.url).pathname })
void addWingWidget
await finish(browser)
