/**
 * Drone Strike input suite: true multi-touch (flying on a stick while a
 * second finger holds fire), keyboard flight + Space fire with source
 * arbitration, the auto-fire and aim-assist settings, the gyro toggle
 * surface, and the progress-guarded restart.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  fireCenter,
  launch,
  openStrikeSettings,
  closeStrikeSettings,
  reporter,
  setStrikeSwitch,
  stickCenter,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'

const { check, finish } = reporter('strike-input')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
const { hud, telemetry, combat } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// --- multi-touch: left stick climbs while a second finger holds fire ---
const L = await stickCenter(page, 'strike-joystick-left')
const F = await fireCenter(page)
const cdp = await context.newCDPSession(page)
const t0 = await telemetry()
const c0 = await combat()
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [
    { x: L.x, y: L.y, id: 1 },
    { x: F.x, y: F.y, id: 3 },
  ],
})
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchMove',
  touchPoints: [
    { x: L.x, y: L.y - 35, id: 1 }, // stick up = climb
    { x: F.x, y: F.y, id: 3 }, // fire finger stays down
  ],
})
await page.waitForTimeout(1500)
const midSource = await hud.getAttribute('data-input-source')
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.waitForTimeout(300)
const t1 = await telemetry()
const c1 = await combat()
check('stick climbs during fire hold', t1.alt - t0.alt > 1, `Δalt=${(t1.alt - t0.alt).toFixed(1)}`)
check('fire hold shoots during stick flight', c1.shots - c0.shots >= 3, `Δshots=${c1.shots - c0.shots}`)
check('touch owns the sticks throughout', midSource === 'touch', `source=${midSource}`)

// --- keyboard: W flies (source flips), Space fires ---
await page.keyboard.down('w')
await page.waitForTimeout(700)
const kbSource = await hud.getAttribute('data-input-source')
await page.keyboard.up('w')
check('keyboard claims the sticks', kbSource === 'keyboard', `source=${kbSource}`)
const ck0 = await combat()
await page.keyboard.down('Space')
await page.waitForTimeout(700)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
const ck1 = await combat()
check('Space fires', ck1.shots - ck0.shots >= 2, `Δshots=${ck1.shots - ck0.shots}`)

// --- settings round-trips: aim assist + gyro + auto-fire ---
await openStrikeSettings(page)
await page.locator('[data-testid="strike-assist-strong"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('aim assist round-trips', (await root.getAttribute('data-aim-assist')) === 'strong')

await setStrikeSwitch(page, 'strike-gyro-toggle', true)
check('gyro toggle round-trips', (await root.getAttribute('data-gyro')) === 'on')
await setStrikeSwitch(page, 'strike-gyro-toggle', false)

await setStrikeSwitch(page, 'strike-autofire-toggle', true)
check('auto-fire enabled', (await root.getAttribute('data-auto-fire')) === 'on')

// Auto-fire shoots hands-off: steer onto the beacon without ever touching
// the trigger and a target must still go down (strong assist helps).
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
const autoKill = await pilot.engage({ timeout: 60000, manualFire: false })
await pilot.touchEnd()
check('auto-fire downs a target hands-off', autoKill)

// --- progress-guarded restart ---
await page.locator('[data-testid="strike-restart"]').click()
await page.waitForSelector('[role="dialog"]')
check('restart asks for confirmation once there is progress', true)
await page.getByRole('button', { name: 'Restart' }).click()
await page.waitForTimeout(400)
const cr = await combat()
check('restart returns to wave 1', cr.wave === 1, `wave=${cr.wave}`)
check('restart clears the session score', cr.score === 0, `score=${cr.score}`)

await finish(browser)
