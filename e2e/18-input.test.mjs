/**
 * External-input suite: keyboard (W/S climb, A/D yaw, arrows move) and
 * gamepad (standard-layout axes, stubbed navigator.getGamepads — no
 * hardware headless) both drive the same shared ControlInput, with
 * last-active-source arbitration reported as data-input-source. Typing in
 * another widget's text field must never fly the drone.
 */
import { addDroneWidget, launch, readers, reporter, stickCenter } from './helpers.mjs'

const { check, finish } = reporter('input')
const { browser, page } = await launch()
// Stub the Gamepad API before the app loads: axes are scripted through
// window.__gpAxes so the per-frame poll sees a "real" pad.
await page.addInitScript(() => {
  window.__gpAxes = null
  navigator.getGamepads = () =>
    window.__gpAxes
      ? [
          {
            id: 'stub-pad',
            index: 0,
            connected: true,
            mapping: 'standard',
            timestamp: 0,
            buttons: [],
            axes: window.__gpAxes,
          },
        ]
      : []
})
await addDroneWidget(page)
const { hud, telemetry } = readers(page)
const source = () => hud.getAttribute('data-input-source')
const setAxes = (axes) => page.evaluate((a) => { window.__gpAxes = a }, axes)

check('input source starts as touch', (await source()) === 'touch')

// --- keyboard: climb / yaw / move ---
const alt0 = (await telemetry()).alt
await page.keyboard.down('KeyW')
await page.waitForTimeout(1500)
check('holding W climbs', (await telemetry()).alt > alt0 + 2, `alt=${(await telemetry()).alt}`)
check('source flips to keyboard', (await source()) === 'keyboard')
await page.keyboard.up('KeyW')
await page.waitForTimeout(900)
const kHold1 = (await telemetry()).alt
await page.waitForTimeout(500)
const kHold2 = (await telemetry()).alt
check('releasing W holds altitude', Math.abs(kHold2 - kHold1) < 0.3, `${kHold1} vs ${kHold2}`)
check('source returns to touch after release', (await source()) === 'touch')

const yaw0 = (await telemetry()).yaw
await page.keyboard.down('KeyA')
await page.waitForTimeout(800)
await page.keyboard.up('KeyA')
await page.waitForTimeout(300)
check('A yaws the drone', Math.abs((await telemetry()).yaw - yaw0) > 0.5, `yaw ${yaw0} -> ${(await telemetry()).yaw}`)

await page.keyboard.down('ArrowUp')
await page.waitForTimeout(1200)
const kSpd = (await telemetry()).speed
check('ArrowUp builds speed', kSpd > 3, `spd=${kSpd}`)
check('arrows report keyboard source', (await source()) === 'keyboard')
await page.keyboard.up('ArrowUp')
await page.waitForTimeout(1500)
check('release brakes (inertia)', (await telemetry()).speed < 1, `spd=${(await telemetry()).speed}`)

// --- typing guard: keys aimed at another widget's editor stay there ---
await page.getByRole('button', { name: 'Add widget' }).click()
await page.getByRole('menuitem', { name: /Notes/ }).click()
await page.waitForTimeout(400)
const notes = page.locator('textarea').first()
await notes.click()
const altT0 = (await telemetry()).alt
await page.keyboard.type('wasd flying words')
await page.waitForTimeout(800)
check('typed text lands in the Notes widget', (await notes.inputValue()).includes('wasd'), await notes.inputValue())
check('typing does not fly the drone', Math.abs((await telemetry()).alt - altT0) < 0.4, `alt ${altT0} -> ${(await telemetry()).alt}`)
check('source stays touch while typing', (await source()) === 'touch')
await page.mouse.click(1000, 830) // blur the textarea

// --- gamepad (stubbed axes) ---
const altG0 = (await telemetry()).alt
await setAxes([0, -1, 0, 0]) // left stick up = climb (gamepad y is +down)
await page.waitForTimeout(1500)
check('gamepad left stick climbs', (await telemetry()).alt > altG0 + 2, `alt=${(await telemetry()).alt}`)
check('source flips to gamepad', (await source()) === 'gamepad')
await setAxes([0, 0, 0, -0.9]) // right stick forward
await page.waitForTimeout(1500)
const gSpd = (await telemetry()).speed
check('gamepad right stick builds speed', gSpd > 3, `spd=${gSpd}`)
await setAxes([0, 0, 0, 0]) // centred: zero-once release
await page.waitForTimeout(1500)
check('centred pad releases (drone brakes)', (await telemetry()).speed < 1, `spd=${(await telemetry()).speed}`)
check('source back to touch', (await source()) === 'touch')

// deadzone: tiny drift never claims the controls
await setAxes([0.08, -0.08, 0.05, 0.06])
await page.waitForTimeout(800)
check('inside-deadzone drift ignored', (await telemetry()).speed < 1 && (await source()) === 'touch')

// arbitration regression: touch sticks still work with the idle pad present
const lc = await stickCenter(page, 'dronesim-joystick-left')
const altR0 = (await telemetry()).alt
await page.mouse.move(lc.x, lc.y)
await page.mouse.down()
await page.mouse.move(lc.x, lc.y - 40, { steps: 5 })
await page.waitForTimeout(1200)
check('touch joystick still climbs with an idle pad connected', (await telemetry()).alt > altR0 + 1.5)
await page.mouse.up()

await finish(browser)
