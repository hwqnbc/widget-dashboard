/**
 * Drone Strike ADS/zoom suite: the scope button toggle, hold-Shift zoom,
 * the scoped sensitivity + FOV scaling (pure module — see the note at the
 * yaw section), firing while zoomed, the tighter scoped assist cones (pure
 * module), the gyro "Zoom only" mode, the FPV-only surface of the scope
 * button, and the adjustable zoom power (default 2×; a stronger power
 * tightens the scoped aim proportionally, and the setting round-trips +
 * persists).
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  launch,
  openStrikeSettings,
  reporter,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { AIM_CONE_RAD, AIM_CONE_RAD_ZOOM } from './.bundle/combatModel.js'
import { BASE_FOV, zoomFovFor, zoomSensFor } from './.bundle/aimModel.js'

const { check, finish } = reporter('strike-zoom')
const { browser, page } = await launch()
await addStrikeWidget(page)
const { hud, combat } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')
const scope = page.locator('[data-testid="strike-zoom"]')

check('wave 1 goes active', await waitForWaveState(page, 'active'))

// Pure-module check: every scoped cone is tighter than its hip cone.
check(
  'scoped assist cones are tighter per level',
  Object.keys(AIM_CONE_RAD).every((k) => AIM_CONE_RAD_ZOOM[k] < AIM_CONE_RAD[k]),
)

// --- scope button toggles ---
check('scope button present in FPV', (await scope.count()) === 1)
check('unzoomed by default', (await root.getAttribute('data-zoom')) === 'off')
check('default zoom power is 2×', (await root.getAttribute('data-zoom-power')) === '2')
await scope.click()
await page.waitForTimeout(300)
check('tap zooms', (await root.getAttribute('data-zoom')) === 'on')
check('HUD mirrors zoom', (await hud.getAttribute('data-zoom')) === 'on')
check(
  'reticle shows the scope',
  (await page
    .locator('[data-testid="strike-reticle"]')
    .getAttribute('data-zoom')) === 'on',
)
await scope.click()
await page.waitForTimeout(300)
check('second tap unzooms', (await root.getAttribute('data-zoom')) === 'off')

// --- scoped sensitivity + FOV scale with zoom power (pure module) ---
// The scoped aim slows exactly by 1/power (and the FOV narrows by the same
// factor), applied to the flight yaw rate + the FPV pitch follow. Asserting
// this closed-loop means timing a yaw sweep, but under software GL a heavy
// wide-FOV scene can dip below the sim's 20 fps dt-clamp and slow the
// *unzoomed* sweep more than the narrow-FOV scoped one — the ratio wandered
// 0.44–0.99 run to run. The factor itself is pure config, so verify it there
// (deterministic) and keep the live coverage to the mechanics below.
check('2× scope halves aim sensitivity', zoomSensFor(2) === 0.5)
check(
  'stronger zoom aims proportionally finer',
  zoomSensFor(1.5) > zoomSensFor(2) && zoomSensFor(2) > zoomSensFor(3),
  `1.5×=${zoomSensFor(1.5).toFixed(2)} 2×=${zoomSensFor(2).toFixed(2)} 3×=${zoomSensFor(3).toFixed(2)}`,
)
check('2× scope halves the FOV', zoomFovFor(2) === BASE_FOV / 2)
check(
  'stronger zoom narrows the FOV further, all below base',
  zoomFovFor(1.5) > zoomFovFor(2) &&
    zoomFovFor(2) > zoomFovFor(3) &&
    zoomFovFor(1.5) < BASE_FOV,
)

// --- firing works while scoped (live) ---
await scope.click() // scope on
await page.waitForTimeout(300)
check('scoped for the fire test', (await root.getAttribute('data-zoom')) === 'on')
const c0 = await combat()
await page.keyboard.down('Space')
await page.waitForTimeout(700)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
const c1 = await combat()
check('fire works while scoped', c1.shots - c0.shots >= 2, `Δshots=${c1.shots - c0.shots}`)
await scope.click() // unzoom for the keyboard test
await page.waitForTimeout(200)

// --- desktop hold-Shift zoom ---
await page.keyboard.down('Shift')
await page.waitForTimeout(300)
check('holding Shift zooms', (await root.getAttribute('data-zoom')) === 'on')
await page.keyboard.up('Shift')
await page.waitForTimeout(300)
check('releasing Shift unzooms', (await root.getAttribute('data-zoom')) === 'off')

// --- gyro "Zoom only" mode round-trips ---
await openStrikeSettings(page)
await page.locator('[data-testid="strike-gyro-zoom"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('gyro zoom-only mode set', (await root.getAttribute('data-gyro')) === 'zoom')
await openStrikeSettings(page)
await page.locator('[data-testid="strike-gyro-off"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)

// --- the scope is FPV-only ---
await page.locator('[data-testid="strike-view-toggle"]').click()
await page.waitForTimeout(300)
check('scope button hidden in chase view', (await scope.count()) === 0)
check('leaving FPV drops the zoom', (await root.getAttribute('data-zoom')) === 'off')
await page.locator('[data-testid="strike-view-toggle"]').click()
await page.waitForTimeout(300)

// --- adjustable zoom power: settings round-trip + persistence (DOM) ---
// (The proportional-tightening is proven on the pure module above.)
await openStrikeSettings(page)
await page.locator('[data-testid="strike-zoompower-3"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('zoom power set to 3×', (await root.getAttribute('data-zoom-power')) === '3')

// 1.5× round-trips and the setting persists across a reload.
await openStrikeSettings(page)
await page.locator('[data-testid="strike-zoompower-1_5"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('zoom power set to 1.5×', (await root.getAttribute('data-zoom-power')) === '1.5')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('zoom power persists across reload', (await root.getAttribute('data-zoom-power')) === '1.5')

await finish(browser)
