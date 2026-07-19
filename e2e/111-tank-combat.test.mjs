/**
 * Tank Battle combat suite: a full closed-loop wave-1 clear — the pilot
 * must DRIVE into terrain line of sight before a lock exists (hull-down
 * cover works both ways), then aim and kill both enemies — the wave state
 * machine advancing to the seeded wave 2, the ballistic-solution reticle
 * contract, best score/wave persistence across reload, and the
 * progress-guarded mode switch.
 */
import {
  addTankWidget,
  createTankPilot,
  launch,
  openTankSettings,
  reporter,
  tankReaders,
  waitForTankState,
} from './helpers.mjs'
import { buildTerrain, DEFAULT_TANK_SEED } from './.bundle/terrain.js'
import { buildTankWave, POINTS_LIGHT } from './.bundle/battleLayout.js'
import { AIM_CONE_RAD, AIM_CONE_RAD_ZOOM } from './.bundle/shellModel.js'

const { check, finish } = reporter('tank-combat')
const { browser, context, page } = await launch()
await addTankWidget(page)
const { telemetry, combat } = tankReaders(page)

check('wave 1 active', await waitForTankState(page, 'active'))
const terrain = buildTerrain(DEFAULT_TANK_SEED, 'rolling')
const wave1 = buildTankWave(DEFAULT_TANK_SEED, 1, terrain)
const wave2 = buildTankWave(DEFAULT_TANK_SEED, 2, terrain)

// From the spawn basin there is deliberately no lock — a ridge covers the
// wave-1 enemies (the pure modules agree; the pilot must crest it).
const atSpawn = await combat()
check('no lock from spawn (terrain cover)', atSpawn.lock === -1, `lock=${atSpawn.lock}`)

// Scoped assist cones are tighter than hip cones at every level (pure).
check(
  'scoped cones tighter per level',
  ['off', 'mild', 'strong'].every((l) => AIM_CONE_RAD_ZOOM[l] < AIM_CONE_RAD[l]),
)

// Kill 1: drive over the ridge, lock, solve, fire.
const pilot = await createTankPilot(page, context)
await pilot.touchStart()
check('first enemy destroyed', await pilot.engage({ timeout: 130000 }))
const afterFirst = await combat()
check(
  'kill scores light-tank points',
  afterFirst.score >= POINTS_LIGHT,
  `score=${afterFirst.score}`,
)
check('hits recorded', afterFirst.hits >= 1, `hits=${afterFirst.hits}`)

// Kill 2 clears the wave.
check('second enemy destroyed', await pilot.engage({ timeout: 130000 }))
await pilot.touchEnd()
check('wave 1 clears', await waitForTankState(page, 'cleared', 15000))
const clearedScore = (await combat()).score
check(
  'cleared with both kills banked',
  clearedScore >= 2 * POINTS_LIGHT,
  `score=${clearedScore}`,
)

// Wave 2 arrives with the seeded composition, and its enemies are armed.
check('wave 2 goes active', await waitForTankState(page, 'active', 15000))
const c2 = await combat()
check('wave 2 reported', c2.wave === 2, `wave=${c2.wave}`)
check(
  'seeded wave-2 enemy count',
  c2.targetsLeft === wave2.targets.length,
  `app=${c2.targetsLeft} expected=${wave2.targets.length}`,
)
check('wave 2 returns fire (pure module)', wave2.enemiesShoot === true)
check('hp chip live once enemies shoot', c2.hp === 3, `hp=${c2.hp}`)

// The reticle's ballistic-solution contract: pointing at the sky has no
// solution (grey), pointing at nearby ground solves.
await pilot.touchStart()
await pilot.touch(0, 0, 0, 1)
await page.waitForTimeout(1400)
const skyward = await combat()
check('no ballistic solution into the sky', skyward.sol === 'none', `sol=${skyward.sol}`)
// Steer the pitch back to the shallow default band — mid-range ground has
// a solution (full-down pitch aims under the gun's depression arc).
for (let i = 0; i < 30; i++) {
  const p = (await telemetry()).camPitch
  if (p < -0.05 && p > -0.15) break
  await pilot.touch(0, 0, 0, p > -0.05 ? -0.5 : 0.5)
  await page.waitForTimeout(140)
}
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(400)
const groundward = await combat()
check('solution returns on the ground', groundward.sol === 'ok', `sol=${groundward.sol}`)
await pilot.touchEnd()

// Bests persisted at the wave-1 clear survive a reload.
const t1 = await telemetry()
void t1
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="tank-score"]')
await page.waitForTimeout(800)
const chip = page.locator('[data-testid="tank-score"]')
const bestScore = parseInt(await chip.getAttribute('data-best-score'), 10)
const bestWave = parseInt(await chip.getAttribute('data-best-wave'), 10)
check(
  'best score persists across reload',
  bestScore >= 2 * POINTS_LIGHT,
  `bestScore=${bestScore}`,
)
check('best wave persists across reload', bestWave >= 1, `bestWave=${bestWave}`)

// Progress-guarded mode switch: earn progress (score), then switching to
// Roam must confirm; cancelling keeps the mode.
check('post-reload wave active', await waitForTankState(page, 'active'))
const pilot2 = await createTankPilot(page, context)
await pilot2.touchStart()
check('progress kill for the guard', await pilot2.engage({ timeout: 130000 }))
await pilot2.touchEnd()
await openTankSettings(page)
await page.locator('[data-testid="tank-mode-roam"]').click()
await page.waitForTimeout(400)
const dlg = page.getByRole('button', { name: 'Switch', exact: true })
check('mode switch confirm-guarded with progress', await dlg.isVisible())
await page.getByRole('button', { name: 'Keep playing' }).click()
await page.waitForTimeout(400)
check(
  'cancel keeps waves mode',
  (await page.locator('[data-testid="tank-battle-root"]').getAttribute('data-mode')) === 'waves',
)

await finish(browser)
