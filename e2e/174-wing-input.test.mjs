/**
 * Wing Flyer input suite (browser): the LATCHING touch throttle (Normal
 * assist, so the throttle is manual: drag up → release → it stays; a new
 * touch continues from the latched value instead of jumping), the right
 * stick (pull back = nose up, RC convention; invert-pitch flips it), the
 * keyboard (arrows bank and pitch, W ramps the latched throttle, Space =
 * Panic, Enter = Launch), a stubbed gamepad (right stick rolls, source
 * arbitration), and the Trainer's 45° bank limit under full stick.
 */
import { addWingWidget, launch, reporter, stickCenter } from './helpers.mjs'

const { check, finish } = reporter('wing-input')
const { browser, context, page } = await launch()
await page.addInitScript(() => {
  window.__gpAxes = null
  navigator.getGamepads = () =>
    window.__gpAxes
      ? [{ id: 'stub-pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, buttons: [], axes: window.__gpAxes }]
      : []
})
await addWingWidget(page)
const root = page.locator('[data-testid="wingflyer-root"]')
const hud = page.locator('[data-testid="wingflyer-hud"]')
const tel = async (a) => Number(await hud.getAttribute(a))
const setAxes = (axes) => page.evaluate((a) => void (window.__gpAxes = a), axes)
const waitFor = async (pred, ms = 8000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await pred()) return true
    await page.waitForTimeout(200)
  }
  return false
}
const setting = async (tid) => {
  await page.click('[data-testid="wingflyer-settings"]')
  await page.click(`[data-testid="${tid}"]`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// --- Enter launches -------------------------------------------------------------
await page.keyboard.press('Enter')
check('Enter launches from the hand', await waitFor(async () => (await root.getAttribute('data-phase')) === 'flying'))
// (Poll the real climb-out: in preflight the assist mode also reads 'fly'.)
check(
  'climb-out to the hand-over height',
  await waitFor(
    async () => (await hud.getAttribute('data-phase')) === 'flying' && (await hud.getAttribute('data-assist-mode')) === 'fly' && (await tel('data-agl')) > 10,
    20000,
  ),
)

// --- keyboard: Trainer bank limit + pitch ------------------------------------------
await page.keyboard.down('ArrowRight')
await waitFor(async () => (await tel('data-bank')) > 40)
await page.waitForTimeout(800)
const bank = await tel('data-bank')
await page.keyboard.up('ArrowRight')
check('→ banks right, Trainer limit ~45°', bank > 40 && bank < 47.5, `${bank}°`)
check('input source = keyboard', (await hud.getAttribute('data-input-source')) === 'keyboard')
check('release levels the wings (Trainer)', await waitFor(async () => Math.abs(await tel('data-bank')) < 3))
await page.keyboard.down('ArrowDown')
const noseUp = await waitFor(async () => (await tel('data-pitch')) > 8)
await page.keyboard.up('ArrowDown')
check('↓ (pull back) raises the nose', noseUp)
await page.waitForTimeout(1500)

// --- gamepad -------------------------------------------------------------------------
await setAxes([0, 0, -1, 0])
const padRoll = await waitFor(async () => (await tel('data-bank')) < -30)
check('gamepad right stick rolls left; source = gamepad', padRoll && (await hud.getAttribute('data-input-source')) === 'gamepad')
await setAxes([0, 0, 0, 0])
await waitFor(async () => Math.abs(await tel('data-bank')) < 3)
await setAxes(null)

// --- Space = Panic -------------------------------------------------------------------
await page.keyboard.press('Space')
check('Space triggers Panic', await waitFor(async () => (await hud.getAttribute('data-assist-mode')) === 'panic', 2000))
await waitFor(async () => (await hud.getAttribute('data-assist-mode')) === 'fly', 6000)

// --- latching touch throttle (Normal = manual throttle) ------------------------------------
await setting('wingflyer-assist-normal')
await page.click('[data-testid="wingflyer-paused"]').catch(() => {})
await waitFor(async () => (await root.getAttribute('data-paused')) === 'false', 5000)
const cdp = await context.newCDPSession(page)
const L = await stickCenter(page, 'wingflyer-joystick-left')
const R = await stickCenter(page, 'wingflyer-joystick-right')
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
// Knob starts latched at idle (bottom) after the fresh start → grab where it is.
const knobY = async () =>
  page.locator('[data-testid="wingflyer-joystick-left"] > div > div').first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top + r.height / 2
  })
const y0 = await knobY()
await touch('touchStart', [{ x: L.x, y: y0, id: 1 }])
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', [{ x: L.x, y: y0 - i * 8, id: 1 }])
  await page.waitForTimeout(25)
}
await page.waitForTimeout(500)
const held = await tel('data-throttle')
await touch('touchEnd', [])
await page.waitForTimeout(700)
const released = await tel('data-throttle')
check('dragging the left stick up raises the throttle', held > 0.4, `${held}`)
check('release: the throttle STAYS (latched)', Math.abs(released - held) < 0.05, `${held} → ${released}`)
const y1 = await knobY()
await touch('touchStart', [{ x: L.x, y: y1, id: 1 }])
await page.waitForTimeout(500)
const retouch = await tel('data-throttle')
await touch('touchEnd', [])
check('a new touch on the knob does not jump the throttle', Math.abs(retouch - released) < 0.06, `${released} → ${retouch}`)

// W ramps the latched throttle and the knob follows.
const before = await tel('data-throttle')
await page.keyboard.down('KeyS')
await page.waitForTimeout(700)
await page.keyboard.up('KeyS')
await page.waitForTimeout(400)
check('S ramps the latched throttle down', (await tel('data-throttle')) < before - 0.15, `${before} → ${await tel('data-throttle')}`)

// Right stick: pull back (down) = nose up; invert-pitch flips it.
const pitchFor = async (dy) => {
  await touch('touchStart', [{ x: R.x, y: R.y, id: 2 }])
  await touch('touchMove', [{ x: R.x, y: R.y + dy, id: 2 }])
  await page.waitForTimeout(900)
  const p = await tel('data-pitch')
  await touch('touchEnd', [])
  await waitFor(async () => Math.abs(await tel('data-pitch')) < 4, 4000)
  return p
}
check('touch: pull the right stick back → nose up', (await pitchFor(30)) > 8)
// The source tracks who last drove the STEERING sticks (a throttle-only drag
// doesn't claim it) — the right-stick touch just did.
check('input source = touch after a right-stick touch', (await hud.getAttribute('data-input-source')) === 'touch')
await setting('wingflyer-invert-pitch')
await page.click('[data-testid="wingflyer-paused"]').catch(() => {})
await waitFor(async () => (await root.getAttribute('data-paused')) === 'false', 5000)
check('invert pitch: pulling back now dives', (await pitchFor(30)) < -8)

await finish(browser)
