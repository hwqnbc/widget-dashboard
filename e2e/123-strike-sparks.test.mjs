/**
 * Drone Strike spark-burst suite. The particle system is pure
 * (`sparkModel.ts`): a fixed ring of bursts × particles in flat arrays, with
 * NO randomness — directions/speeds derive from the particle index, so the
 * exact post-spawn/post-step state is assertable off-canvas. The rig spawns a
 * MUZZLE burst on every shot and an IMPACT burst at every player-fire hit
 * point (targets and world) plus enemy world impacts; `SparkField` draws the
 * pool as one Points call. DOM: the HUD publishes the monotonic burst count
 * as `data-sparks`, so a single fire-button tap proves the muzzle flash fired
 * without needing a kill (or pixels).
 */
import { addStrikeWidget, launch, reporter, tapFire, waitForWaveState } from './helpers.mjs'
import {
  SPARK_BURSTS,
  SPARK_CAP,
  SPARK_LIFE_IMPACT,
  SPARK_LIFE_MUZZLE,
  SPARK_PER,
  createSparkPool,
  spawnBurst,
  stepSparks,
} from './.bundle/sparkModel.js'

const { check, finish } = reporter('strike-sparks')

// --- pure module: pool lifecycle ---
const pool = createSparkPool()
check('new pool is dormant (all alpha 0, none spawned)',
  pool.spawned === 0 && pool.alpha.every((a) => a === 0))

spawnBurst(pool, 1, 2, 3, 'impact')
check('spawnBurst fills the first block', pool.spawned === 1 && pool.cursor === 1)
let block0Live = true
for (let j = 0; j < SPARK_PER; j++) {
  if (pool.alpha[j] !== 1 || pool.pos[j * 3] !== 1 || pool.pos[j * 3 + 1] !== 2) block0Live = false
}
check('burst particles start at the emit point, fully lit', block0Live)
// Float32Array storage — compare with a tolerance, not ===.
check('impact particles carry the impact lifetime', Math.abs(pool.life[0] - SPARK_LIFE_IMPACT) < 1e-6)

// Deterministic: two pools, identical calls → byte-identical state.
const p2 = createSparkPool()
spawnBurst(p2, 1, 2, 3, 'impact')
let identical = true
for (let j = 0; j < SPARK_PER * 3; j++) {
  if (pool.vel[j] !== p2.vel[j] || pool.color[j] !== p2.color[j]) identical = false
}
check('bursts are deterministic (no randomness)', identical)

// Stepping: sparks fly, fall and fade.
const beforeY = pool.vel[1]
stepSparks(pool, 0.04)
check('sparks move off the emit point', pool.pos[0] !== 1)
check('gravity pulls sparks down', pool.vel[1] < beforeY)
check('alpha fades with age', pool.alpha[0] > 0 && pool.alpha[0] < 1)
// dt clamp: one huge step advances at most 0.05 s (no teleport on a hitch).
const p3 = createSparkPool()
spawnBurst(p3, 0, 0, 0, 'impact')
stepSparks(p3, 5)
check('step clamps dt (hitch-safe)', Math.abs(p3.age[0] - 0.05) < 1e-6, `age=${p3.age[0]}`)
// Ages out to dormant.
for (let i = 0; i < 20; i++) stepSparks(pool, 0.05)
check('burst ages out to dormant', pool.alpha.slice(0, SPARK_PER).every((a) => a === 0))

// Muzzle bursts are quicker than impacts.
const pm = createSparkPool()
spawnBurst(pm, 0, 0, 0, 'muzzle')
check('muzzle life shorter than impact',
  Math.abs(pm.life[0] - SPARK_LIFE_MUZZLE) < 1e-6 && SPARK_LIFE_MUZZLE < SPARK_LIFE_IMPACT)

// Ring wrap: overwriting block 0 leaves its neighbours untouched.
const pw = createSparkPool()
for (let b = 0; b < SPARK_BURSTS; b++) spawnBurst(pw, b, 0, 0, 'impact')
const neighbourX = pw.pos[SPARK_PER * 3] // block 1's first particle
spawnBurst(pw, 99, 0, 0, 'impact') // wraps onto block 0
check('ring wraps back to block 0', pw.cursor === 1 && pw.pos[0] === 99)
check('wrap does not corrupt the neighbour block', pw.pos[SPARK_PER * 3] === neighbourX)
check('pool capacity is bursts × per', SPARK_CAP === SPARK_BURSTS * SPARK_PER)

// --- live: a fire tap spawns a muzzle burst (data-sparks) ---
const { browser, context, page } = await launch()
await addStrikeWidget(page)
check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
const sparks0 = Number(await hud.getAttribute('data-sparks'))
await tapFire(page, context, 60)
await page.waitForTimeout(400)
const sparks1 = Number(await hud.getAttribute('data-sparks'))
const shots1 = Number(await hud.getAttribute('data-shots'))
check('firing spawns a muzzle burst', sparks1 > sparks0, `sparks ${sparks0}→${sparks1}`)
check('the shot itself still registers', shots1 > 0, `shots=${shots1}`)
// A held burst keeps spawning flashes (one per cooldown-limited shot).
await tapFire(page, context, 1000)
await page.waitForTimeout(400)
const sparks2 = Number(await hud.getAttribute('data-sparks'))
check('held fire keeps sparking', sparks2 > sparks1, `sparks ${sparks1}→${sparks2}`)

await finish(browser)
