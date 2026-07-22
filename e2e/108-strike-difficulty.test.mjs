/**
 * Drone Strike difficulty suite. DOM: Easy is the default, the setting
 * round-trips (Easy/Normal/Hard) and persists across reload. Pure module:
 * the difficulty presets scale enemy speed/pressure the intended way, and
 * buildWave threads difficulty into enemy count / hp / return-fire wave —
 * asserted directly (reaching armed enemy waves closed-loop is impractical
 * under software GL).
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  launch,
  openStrikeSettings,
  reporter,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { DIFFICULTY, buildWave } from './.bundle/waveLayout.js'

const { check, finish } = reporter('strike-difficulty')
const { browser, page } = await launch()
await addStrikeWidget(page)
const root = page.locator('[data-testid="drone-strike-root"]')

check('wave 1 goes active', await waitForWaveState(page, 'active'))
check('easy is the default', (await root.getAttribute('data-difficulty')) === 'easy')

// Setting round-trips.
const pick = async (which) => {
  await openStrikeSettings(page)
  await page.locator(`[data-testid="strike-difficulty-${which}"]`).click()
  await page.waitForTimeout(150)
  await closeStrikeSettings(page)
}
await pick('hard')
check('hard selected', (await root.getAttribute('data-difficulty')) === 'hard')
await pick('normal')
check('normal selected', (await root.getAttribute('data-difficulty')) === 'normal')

// Persists across reload.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('difficulty persists across reload', (await root.getAttribute('data-difficulty')) === 'normal')

// --- pure-module presets: Easy is genuinely easier ---
const { easy, normal, hard } = DIFFICULTY
check(
  'orbit speed easy < normal < hard',
  easy.orbitMult < normal.orbitMult && normal.orbitMult < hard.orbitMult,
  `${easy.orbitMult}/${normal.orbitMult}/${hard.orbitMult}`,
)
check('evade burst easy < normal', easy.evadeMult < normal.evadeMult)
check('easy evade shorter than normal', easy.evadeTime < normal.evadeTime)
check('easy enemies die in one hit', easy.enemyHp === 1 && normal.enemyHp === 2)
check('easy delays return fire', easy.fireWave > normal.fireWave)

// --- buildWave threads difficulty (positions stay seeded/identical) ---
const layout = buildWorldLayout(DEFAULT_SEED)
const w6easy = buildWave(DEFAULT_SEED, 6, layout, 'easy')
const w6normal = buildWave(DEFAULT_SEED, 6, layout, 'normal')
const enemies = (w) => w.targets.filter((t) => t.kind === 'enemy')
check(
  'easy fields no more enemies than normal',
  enemies(w6easy).length <= enemies(w6normal).length &&
    enemies(w6normal).length > 0,
  `easy=${enemies(w6easy).length} normal=${enemies(w6normal).length}`,
)
check('easy enemy hp is 1 in the wave spec', enemies(w6easy).every((t) => t.hp === 1))
check(
  'wave 5 holds fire on easy but shoots on normal',
  buildWave(DEFAULT_SEED, 5, layout, 'easy').enemiesShoot === false &&
    buildWave(DEFAULT_SEED, 5, layout, 'normal').enemiesShoot === true,
)
// The difficulty-independent targets (gallery balloons/drifters + ground
// trucks) are identical regardless of difficulty; only enemies and turrets
// (both difficulty-gated) may differ.
const diffIndependent = (t) =>
  t.kind === 'balloon' || t.kind === 'ringDrone' || t.kind === 'ground'
check(
  'gallery placement unchanged by difficulty',
  JSON.stringify(w6easy.targets.filter(diffIndependent)) ===
    JSON.stringify(w6normal.targets.filter(diffIndependent)),
)

await finish(browser)
