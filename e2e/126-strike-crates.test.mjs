/**
 * Drone Strike supply-crate suite. Crates are seeded per wave as the LAST
 * consumers of the wave's RNG stream (appending draws keeps every existing
 * placement identical — the seed-stability lesson): from CRATE_FROM_WAVE (2)
 * a crate sits on a qualifying rooftop no soldier pacer owns, its loot
 * alternating CRATE_ROTATION — non-weapon drops ONLY (bonus heart, score
 * cache; weapon drops died with the in-game weapon chip — any gun is a
 * free swipe, so "equip a special" stopped being a reward). They are NOT
 * targets — not shootable, not counted toward the wave clear
 * (WaveSpec.crate sits beside the target list). Pickup is the pure
 * `crateReached` (one distance check per frame in the rig — the
 * landing-pad pattern); what a pickup grants is the pure
 * `resolveCrateGrant`: a heart is ALWAYS +1 — uncapped, stacking past the
 * nominal 3 (the overheal is the reward for the detour) — and a cache
 * always pays CRATE_SCORE. Live: wave 1 publishes no crate
 * (`data-crate-active="no"`); clearing wave 1 with the pilot recipe brings
 * wave 2's crate online with the exact seeded coords + loot on the HUD
 * beacon, while the equipped weapon stays the un-picked-up default bolt.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  launch,
  reporter,
  setStrikeAssist,
  setStrikeSwitch,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  CRATE_FROM_WAVE,
  CRATE_PICKUP_HEIGHT,
  CRATE_RADIUS,
  CRATE_ROTATION,
  CRATE_SCORE,
  MILESTONE_SCORE,
  buildWave,
  crateReached,
  milestoneHearts,
  resolveCrateGrant,
} from './.bundle/waveLayout.js'

const { check, finish } = reporter('strike-crates')

// --- pure: seeding rules ---
const layout = buildWorldLayout(DEFAULT_SEED)
const w1 = buildWave(DEFAULT_SEED, 1, layout, 'easy')
check('wave 1 has no crate (clean tutorial wave)', w1.crate === undefined)
check('crates start at CRATE_FROM_WAVE', CRATE_FROM_WAVE === 2)

const waves = [2, 3, 4, 5, 6, 7, 8, 9]
const specs = waves.map((w) => buildWave(DEFAULT_SEED, w, layout, 'easy'))
check('every wave from 2 fields a crate (this seed)', specs.every((s) => s.crate !== undefined),
  `crates=${specs.filter((s) => s.crate).length}/${specs.length}`)

// On a real rooftop: (x,z) is a building centre and top is its height.
const onRoof = specs.every((s) => {
  if (!s.crate) return true
  const c = s.crate
  return layout.buildings.some(
    (b) => Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.z - c.z) < 1e-6 && Math.abs(b.h - c.top) < 1e-6,
  )
})
check('crates sit on real building rooftops', onRoof)

// Never on a roof a soldier pacer owns that wave.
const clearOfSoldiers = specs.every((s) => {
  if (!s.crate) return true
  return !s.targets.some(
    (t) => t.kind === 'soldier' && Math.abs(t.x - s.crate.x) < 1e-6 && Math.abs(t.z - s.crate.z) < 1e-6,
  )
})
check('no crate shares a roof with a soldier', clearOfSoldiers)

// The loot alternates the CRATE_ROTATION (non-weapon drops only — hearts
// on even waves, score caches on odd).
check('crate loot follows the rotation',
  specs.every((s, i) => !s.crate || s.crate.loot === CRATE_ROTATION[waves[i] % CRATE_ROTATION.length]))
check('the rotation is non-weapon loot only (heart + score cache)',
  CRATE_ROTATION.length === 2 && ['heart', 'score'].every((w) => CRATE_ROTATION.includes(w)))

// --- pure: what a pickup grants (resolveCrateGrant) ---
const gHeart = resolveCrateGrant('heart')
check('a heart crate grants exactly one heart (uncapped — overheal stacks)',
  gHeart.hearts === 1 && gHeart.score === 0)
const gScore = resolveCrateGrant('score')
check('a score cache pays CRATE_SCORE', gScore.hearts === 0 && gScore.score === CRATE_SCORE && CRATE_SCORE > 0)

// --- pure: score milestones pay hearts (milestoneHearts) ---
check('crossing one milestone pays one heart', (() => {
  const r = milestoneHearts(0, MILESTONE_SCORE + 10)
  return r.hearts === 1 && r.paid === 1
})())
check('a jump across two thresholds in one tick pays both', (() => {
  const r = milestoneHearts(1, MILESTONE_SCORE * 3 + 5)
  return r.hearts === 2 && r.paid === 3
})())
check('sub-threshold score pays nothing', (() => {
  const r = milestoneHearts(0, MILESTONE_SCORE - 1)
  return r.hearts === 0 && r.paid === 0
})())
check('a run reset re-syncs the paid line without paying', (() => {
  const r = milestoneHearts(3, 40) // restart dropped the score to 40
  return r.hearts === 0 && r.paid === 0
})())

// Crates are NOT targets: the target list is unchanged in kind terms.
check('a crate is not a shootable target',
  specs.every((s) => s.targets.every((t) => t.kind !== 'crate')))

// --- pure: pickup detection (crateReached) ---
const crate = { x: 10, z: -5, top: 8 }
check('reached hovering on the disc',
  crateReached({ x: 10.5, y: 8.6, z: -5 }, crate))
check('reached right at the roof lip',
  crateReached({ x: 10, y: crate.top - 0.3, z: -5.4 }, crate))
check('not reached outside the radius',
  !crateReached({ x: 10 + CRATE_RADIUS + 0.3, y: 8.5, z: -5 }, crate))
check('not reached at ground level under the roof',
  !crateReached({ x: 10, y: 1, z: -5 }, crate))
check('not reached hovering too high above it',
  !crateReached({ x: 10, y: crate.top + CRATE_PICKUP_HEIGHT + 0.5, z: -5 }, crate))

// --- live: wave 1 = no crate; wave 2 = the seeded crate on the beacon ---
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
await setStrikeAssist(page, 'strong')
const { combat } = strikeReaders(page)
const hud = page.locator('[data-testid="strike-hud"]')
const root = page.locator('[data-testid="drone-strike-root"]')

check('wave 1 goes active', await waitForWaveState(page, 'active'))
check('wave 1 publishes no crate', (await hud.getAttribute('data-crate-active')) === 'no')
check('no milestones paid at boot', (await hud.getAttribute('data-milestones')) === '0')
check('default weapon equipped (nothing picked up)', (await root.getAttribute('data-weapon')) === 'bolt')

// Clear wave 1 with the standard pilot recipe (the 101 idiom).
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
let cleared = true
const deadline = Date.now() + 240000
while ((await combat()).targetsLeft > 0) {
  if (Date.now() > deadline || !(await pilot.engage({ timeout: 60000 }))) {
    cleared = false
    break
  }
}
await pilot.touchEnd()
check('wave 1 fully cleared', cleared)
if (cleared) {
  await waitForWaveState(page, 'cleared', 4000)
  check('wave 2 goes active', await waitForWaveState(page, 'active', 12000))
  check('wave 2 brings the crate online', (await hud.getAttribute('data-crate-active')) === 'yes')
  const w2 = buildWave(DEFAULT_SEED, 2, layout, 'easy')
  check('the live crate is the seeded one (coords + loot)',
    w2.crate &&
      Math.abs(Number(await hud.getAttribute('data-crate-x')) - w2.crate.x) < 0.2 &&
      Math.abs(Number(await hud.getAttribute('data-crate-z')) - w2.crate.z) < 0.2 &&
      (await hud.getAttribute('data-crate-loot')) === w2.crate.loot,
    `hud=(${await hud.getAttribute('data-crate-x')},${await hud.getAttribute('data-crate-z')},${await hud.getAttribute('data-crate-loot')})`)
  check('weapon still the settings pick until touched',
    (await root.getAttribute('data-weapon')) === 'bolt')
}

await finish(browser)
