/**
 * Drone Strike core suite: widget presence + telemetry contract, the wave
 * intro → active state machine, deterministic seeded wave composition,
 * firing via the touch fire button, and a full closed-loop engagement —
 * fly onto the HUD's nearest-target beacon and shoot it down.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  launch,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  tapFire,
  waitForWaveState,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { buildWave } from './.bundle/waveLayout.js'

const { check, finish } = reporter('strike-core')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
// The closed-loop routes below bump walls at speed; crash mode (default
// on) would tumble the pilot mid-flight — suite 105 covers crashes.
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { combat, target } = strikeReaders(page)

for (const tid of [
  'drone-strike-root',
  'strike-canvas',
  'strike-hud',
  'strike-score',
  'strike-reticle',
  'strike-fire',
  'strike-joystick-left',
  'strike-joystick-right',
  'strike-view-toggle',
  'strike-restart',
  'strike-damage',
]) {
  const n = await page.locator(`[data-testid="${tid}"]`).count()
  check(`element ${tid} present`, n === 1, `count=${n}`)
}

// Damage-vignette contract at rest (the live flash needs wave-5 enemy fire
// — verified on the armed dev build; see docs/drone-strike.md).
const damage = page.locator('[data-testid="strike-damage"]')
check('vignette unflashed at rest', (await damage.getAttribute('data-flash')) === '0')
check('low-hp edge off at full hearts', (await damage.getAttribute('data-low-hp')) === 'off')

const root = page.locator('[data-testid="drone-strike-root"]')
check(
  'default world seed',
  (await root.getAttribute('data-world-seed')) === String(DEFAULT_SEED),
)
check('default aim assist mild', (await root.getAttribute('data-aim-assist')) === 'mild')
check('auto-fire off by default', (await root.getAttribute('data-auto-fire')) === 'off')
check('FPV is the default view', (await root.getAttribute('data-view')) === 'fp')

// Wave 1 goes live after the intro banner.
check('wave becomes active', await waitForWaveState(page, 'active'))
const c0 = await combat()
check('wave 1 reported', c0.wave === 1, `wave=${c0.wave}`)

// The wave is seeded: the app must field exactly the targets the pure
// module predicts (wave 1 = static balloons only).
const wave1 = buildWave(DEFAULT_SEED, 1, buildWorldLayout(DEFAULT_SEED))
check(
  'seeded wave-1 target count',
  c0.targetsLeft === wave1.targets.length,
  `app=${c0.targetsLeft} expected=${wave1.targets.length}`,
)
check(
  'wave 1 is a static gallery',
  wave1.targets.every((t) => t.kind === 'balloon' && t.driftAmp === 0),
)
const beacon = await target()
check('nearest-target beacon published', beacon !== null && beacon.kind === 'balloon')

// The fire button shoots: shots increment and a bolt goes live.
await tapFire(page, context, 60)
await page.waitForTimeout(400)
const c1 = await combat()
check('tap fire registers a shot', c1.shots > 0, `shots=${c1.shots}`)

// Holding fire respects the cooldown (~4.5 shots/s): a 1.2 s hold must fire
// several times but nowhere near one per frame.
await tapFire(page, context, 1200)
await page.waitForTimeout(400)
const c2 = await combat()
const burst = c2.shots - c1.shots
check('held fire obeys the cooldown', burst >= 3 && burst <= 8, `burst=${burst}`)

// Closed-loop engagement: chase the beacon and take a target down.
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
const killed = await pilot.engage({ timeout: 60000 })
await pilot.touchEnd()
const c3 = await combat()
check('closed-loop engagement downs a target', killed, `targetsLeft=${c3.targetsLeft}`)
check('score awarded', c3.score >= 10, `score=${c3.score}`)
check('hits recorded', c3.hits > 0, `hits=${c3.hits}`)

await finish(browser)
