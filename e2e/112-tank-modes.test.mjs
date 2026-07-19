/**
 * Tank Battle modes & settings suite: the Waves ↔ Roam game-mode toggle
 * (direct without progress, roam garrison size from the pure module, roam
 * HP pool), terrain roughness reshaping, settings round-trips mirrored on
 * the root, minimap toggle, reset-to-defaults semantics (mode/roughness/
 * seed kept), and persistence across reload.
 */
import {
  addTankWidget,
  closeTankSettings,
  launch,
  openTankSettings,
  reporter,
  setTankSwitch,
  tankReaders,
  waitForTankState,
} from './helpers.mjs'
import { buildTerrain, heightAt, DEFAULT_TANK_SEED } from './.bundle/terrain.js'
import { ROAM_ENEMIES } from './.bundle/battleLayout.js'

const { check, finish } = reporter('tank-modes')
const { browser, context, page } = await launch()
void context
await addTankWidget(page)
const { combat } = tankReaders(page)
const root = page.locator('[data-testid="tank-battle-root"]')

check('starts in waves mode', (await root.getAttribute('data-mode')) === 'waves')
check('wave 1 active', await waitForTankState(page, 'active'))

// Mode toggle without progress applies directly — no confirm dialog.
await openTankSettings(page)
await page.locator('[data-testid="tank-mode-roam"]').click()
await page.waitForTimeout(400)
const dlgShown = await page
  .getByRole('button', { name: 'Switch', exact: true })
  .isVisible()
  .catch(() => false)
check('no confirm without progress', !dlgShown)
check('root flips to roam', (await root.getAttribute('data-mode')) === 'roam')

// The roam garrison: ROAM_ENEMIES tanks, a 5-heart HP pool.
check('roam goes active', await waitForTankState(page, 'active', 12000))
const roam = await combat()
check(
  'roam fields the whole garrison',
  roam.targetsLeft === ROAM_ENEMIES,
  `left=${roam.targetsLeft} expected=${ROAM_ENEMIES}`,
)
check('roam HP pool is 5', roam.hp === 5, `hp=${roam.hp}`)
check(
  'hp chip shows the roam pool',
  (await page.locator('[data-testid="tank-hp"]').getAttribute('data-hp')) === '5',
)

// Terrain roughness reshapes the battlefield (no progress → direct), and
// the two builds genuinely differ per the pure module.
await openTankSettings(page)
await page.locator('[data-testid="tank-roughness-gentle"]').click()
await page.waitForTimeout(400)
check('roughness flips to gentle', (await root.getAttribute('data-roughness')) === 'gentle')
const rolling = buildTerrain(DEFAULT_TANK_SEED, 'rolling')
const gentle = buildTerrain(DEFAULT_TANK_SEED, 'gentle')
const probe = { x: 25, z: -20 }
check(
  'gentle terrain is flatter (pure module)',
  Math.abs(heightAt(gentle, probe.x, probe.z)) <
    Math.abs(heightAt(rolling, probe.x, probe.z)) + 0.001,
)

// Settings round-trips mirrored on the root.
await setTankSwitch(page, 'tank-autofire-toggle', true)
check('auto-fire on', (await root.getAttribute('data-auto-fire')) === 'on')
await openTankSettings(page)
await page.locator('[data-testid="tank-assist-strong"]').click()
await page.waitForTimeout(200)
await closeTankSettings(page)
check('assist strong', (await root.getAttribute('data-aim-assist')) === 'strong')
await setTankSwitch(page, 'tank-weather-toggle', true)
check('storm weather on', (await root.getAttribute('data-weather')) === 'storm')
await setTankSwitch(page, 'tank-minimap-toggle', false)
check('minimap hidden when off', (await page.locator('[data-testid="tank-minimap"]').count()) === 0)

// Reset settings: combat/driving/UI back to defaults; mode, roughness and
// the seed are the battlefield and survive.
await openTankSettings(page)
await page.locator('[data-testid="tank-settings-reset"]').click()
await page.waitForTimeout(300)
await closeTankSettings(page)
check('reset restores auto-fire off', (await root.getAttribute('data-auto-fire')) === 'off')
check('reset restores assist mild', (await root.getAttribute('data-aim-assist')) === 'mild')
check('reset restores clear weather', (await root.getAttribute('data-weather')) === 'clear')
check('reset restores minimap', (await page.locator('[data-testid="tank-minimap"]').count()) === 1)
check('reset keeps roam mode', (await root.getAttribute('data-mode')) === 'roam')
check('reset keeps gentle roughness', (await root.getAttribute('data-roughness')) === 'gentle')
check(
  'reset keeps the seed',
  (await root.getAttribute('data-world-seed')) === String(DEFAULT_TANK_SEED),
)

// Mode + roughness persist across a reload.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="tank-battle-root"]')
await page.waitForTimeout(800)
check('mode persists across reload', (await root.getAttribute('data-mode')) === 'roam')
check(
  'roughness persists across reload',
  (await root.getAttribute('data-roughness')) === 'gentle',
)
check('roam re-arms after reload', await waitForTankState(page, 'active', 12000))
const reloaded = await combat()
check(
  'garrison re-seeded after reload',
  reloaded.targetsLeft === ROAM_ENEMIES,
  `left=${reloaded.targetsLeft}`,
)

await finish(browser)
