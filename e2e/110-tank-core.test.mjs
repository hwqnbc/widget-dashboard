/**
 * Tank Battle core suite: widget presence + root defaults, the seeded wave
 * composition vs the pure module, terrain grounding (the live tank sits on
 * the bundled heightfield), hull driving + turning, the turret's
 * chase-the-camera traverse lag, firing/reload via the touch button, and
 * the ADS zoom toggle.
 */
import {
  addTankWidget,
  createTankPilot,
  launch,
  reporter,
  tankReaders,
  tapFire,
  waitForTankState,
} from './helpers.mjs'
import { buildTerrain, heightAt, DEFAULT_TANK_SEED, TANK_SPAWN } from './.bundle/terrain.js'
import { buildTankWave } from './.bundle/battleLayout.js'

const { check, finish } = reporter('tank-core')
const { browser, context, page } = await launch()
await addTankWidget(page)
const { telemetry, combat } = tankReaders(page)

for (const tid of [
  'tank-battle-root',
  'tank-canvas',
  'tank-hud',
  'tank-score',
  'tank-reticle',
  'tank-fire',
  'tank-zoom',
  'tank-joystick-left',
  'tank-joystick-right',
  'tank-restart',
  'tank-settings',
  'tank-minimap',
  'tank-damage',
]) {
  const n = await page.locator(`[data-testid="${tid}"]`).count()
  check(`element ${tid} present`, n === 1, `count=${n}`)
}

const root = page.locator('[data-testid="tank-battle-root"]')
check(
  'default terrain seed',
  (await root.getAttribute('data-world-seed')) === String(DEFAULT_TANK_SEED),
)
check('default mode is waves', (await root.getAttribute('data-mode')) === 'waves')
check('default roughness rolling', (await root.getAttribute('data-roughness')) === 'rolling')
check('default aim assist mild', (await root.getAttribute('data-aim-assist')) === 'mild')
check('auto-fire off by default', (await root.getAttribute('data-auto-fire')) === 'off')
check('zoom off by default', (await root.getAttribute('data-zoom')) === 'off')

// Wave 1 goes live after the intro banner, with the seeded composition.
check('wave becomes active', await waitForTankState(page, 'active'))
const terrain = buildTerrain(DEFAULT_TANK_SEED, 'rolling')
const wave1 = buildTankWave(DEFAULT_TANK_SEED, 1, terrain)
const c0 = await combat()
check('wave 1 reported', c0.wave === 1, `wave=${c0.wave}`)
check(
  'seeded wave-1 enemy count',
  c0.targetsLeft === wave1.targets.length,
  `app=${c0.targetsLeft} expected=${wave1.targets.length}`,
)
check('wave 1 holds fire', wave1.enemiesShoot === false)

// Terrain grounding at spawn: the tank rests on the bundled heightfield
// (four-corner average vs the point sample — allow a small tolerance).
const t0 = await telemetry()
const spawnH = heightAt(terrain, t0.x, t0.z)
check(
  'tank grounded on the heightfield at spawn',
  Math.abs(t0.alt - spawnH) < 0.8,
  `alt=${t0.alt} heightAt=${spawnH.toFixed(2)}`,
)
check('spawn basin is level', Math.abs(t0.pitch) < 0.05 && Math.abs(t0.roll) < 0.05)
check('spawn position', Math.abs(t0.x - TANK_SPAWN.x) < 2 && Math.abs(t0.z - TANK_SPAWN.z) < 2)

// Drive forward: z decreases (spawn faces -Z), speed reads, and the tank
// keeps following the terrain height wherever it ends up.
const pilot = await createTankPilot(page, context)
await pilot.touchStart()
await pilot.touch(0, 1, 0, 0)
await page.waitForTimeout(2500)
const mid = await telemetry()
check('throttle drives forward', mid.z < t0.z - 4, `z ${t0.z} → ${mid.z}`)
check('speed telemetry live', mid.speed > 1, `speed=${mid.speed}`)
await pilot.touch(0, 0, 0, 0)
// Heavy-vehicle inertia decays exponentially (TANK_ACCEL 2.2) — give it
// enough time that software-GL frame lag can't leave residual speed.
await page.waitForTimeout(2600)
const stopped = await telemetry()
const groundNow = heightAt(terrain, stopped.x, stopped.z)
check(
  'still grounded after driving',
  Math.abs(stopped.alt - groundNow) < 0.8,
  `alt=${stopped.alt} heightAt=${groundNow.toFixed(2)}`,
)
check('releasing throttle stops the tank', stopped.speed < 0.6, `speed=${stopped.speed}`)

// Hull turning (left stick X) — and the camera does NOT follow the hull.
const yaw0 = (await telemetry()).hullYaw
await pilot.touch(1, 0, 0, 0)
await page.waitForTimeout(900)
await pilot.touch(0, 0, 0, 0)
const turned = await telemetry()
check(
  'left stick X turns the hull',
  Math.abs(turned.hullYaw - yaw0) > 0.5,
  `hullYaw ${yaw0} → ${turned.hullYaw}`,
)
check('camera aim independent of hull', Math.abs(turned.camYaw) < 0.2, `camYaw=${turned.camYaw}`)

// Turret chases the camera: swing the aim, catch the traverse lag, then
// watch the turret settle onto the camera yaw.
await pilot.touch(0, 0, 1, 0)
await page.waitForTimeout(800)
const midAim = await telemetry()
const lag = Math.abs(
  Math.atan2(Math.sin(midAim.camYaw - midAim.turretYaw), Math.cos(midAim.camYaw - midAim.turretYaw)),
)
check('turret lags a fast camera swing', lag > 0.08, `lag=${lag.toFixed(3)}`)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(1600)
const settledAim = await telemetry()
const settledLag = Math.abs(
  Math.atan2(
    Math.sin(settledAim.camYaw - settledAim.turretYaw),
    Math.cos(settledAim.camYaw - settledAim.turretYaw),
  ),
)
check('turret settles onto the camera yaw', settledLag < 0.06, `lag=${settledLag.toFixed(3)}`)
await pilot.touchEnd()

// Fire button: one tap = one shell, then the reload gates the gun.
const shots0 = (await combat()).shots
await tapFire(page, context, 80, 'tank-fire')
await page.waitForTimeout(400)
const c1 = await combat()
check('tap fire registers a shot', c1.shots === shots0 + 1, `shots=${c1.shots}`)
check('reload timer runs after the shot', c1.reload > 0.5, `reload=${c1.reload}`)
await tapFire(page, context, 80, 'tank-fire')
await page.waitForTimeout(300)
const c2 = await combat()
check(
  'reload gates the second tap',
  c2.shots === shots0 + 1,
  `shots=${c2.shots}`,
)

// ADS zoom: tap to scope, tap to drop — mirrored on root and reticle.
await page.locator('[data-testid="tank-zoom"]').click()
await page.waitForTimeout(200)
check('scope toggles on', (await root.getAttribute('data-zoom')) === 'on')
check(
  'reticle shows the scoped ring',
  (await page.locator('[data-testid="tank-reticle"]').getAttribute('data-zoom')) === 'on',
)
await page.locator('[data-testid="tank-zoom"]').click()
await page.waitForTimeout(200)
check('scope toggles off', (await root.getAttribute('data-zoom')) === 'off')

await finish(browser)
