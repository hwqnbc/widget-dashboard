/**
 * Drone Strike sim-ports suite: the three settings ported from the Drone
 * Sim. Acro mode (hold brakes vs acro coasts, measured closed-loop),
 * turbo (~1.4× top speed), battery mode (bar, drain under effort, spawn-pad
 * recharge, transient level), and persistence of all three across reload.
 * The battery dead state (~35 s of full-stick drain) is not exercised —
 * same scope as the sim's 98-battery suite.
 */
import {
  addStrikeWidget,
  createStrikePilot,
  launch,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  waitForWaveState,
} from './helpers.mjs'

const { check, finish } = reporter('strike-simports')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
// Full-speed sprints bump buildings; crash mode is suite 105's subject.
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { telemetry } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')

check('wave 1 goes active', await waitForWaveState(page, 'active'))
check('hold mode by default', (await root.getAttribute('data-mode')) === 'hold')
check('turbo off by default', (await root.getAttribute('data-turbo')) === 'off')
check('battery off by default', (await root.getAttribute('data-battery')) === 'off')
check(
  'no battery bar when off',
  (await page.locator('[data-testid="strike-battery"]').count()) === 0,
)

const pilot = await createStrikePilot(page, context)

// Every sprint leg starts from a "runway" above the skyline (max building
// 18 + margin) back over the spawn — three low sprints in a row would
// march the drone across the city into walls/the world border and kill
// the very momentum the checks measure (the sim suites' cruise-high rule).
const returnHome = async () => {
  await pilot.touchStart()
  const ok = await pilot.flyTo({ x: 0, y: 32, z: 18 }, { tol: 3, timeout: 60000 })
  await pilot.brake()
  await pilot.touchEnd()
  return ok
}

/** Full-forward sprint, then release; returns [peak speed, coast speed]. */
const sprintAndRelease = async () => {
  await pilot.touchStart()
  await pilot.touch(0, 0, 0, 1)
  await page.waitForTimeout(2200)
  const peak = (await telemetry()).speed
  await pilot.touch(0, 0, 0, 0)
  await pilot.touchEnd()
  await page.waitForTimeout(1300)
  const coast = (await telemetry()).speed
  return [peak, coast]
}

// --- turbo: ~1.4× the hold-mode top speed ---
check('runway reached (baseline)', await returnHome())
const [vOff, holdCoast] = await sprintAndRelease()
check('hold releases brake to a hover', holdCoast < 2, `coast=${holdCoast.toFixed(1)}`)
await setStrikeSwitch(page, 'strike-tune-turbo', true)
check('turbo reports on', (await root.getAttribute('data-turbo')) === 'on')
check('runway reached (turbo)', await returnHome())
const [vOn] = await sprintAndRelease()
check(
  'turbo raises the top speed ~1.4×',
  vOn > vOff * 1.2 && vOn < vOff * 1.7,
  `off=${vOff.toFixed(1)} on=${vOn.toFixed(1)}`,
)
await setStrikeSwitch(page, 'strike-tune-turbo', false)

// --- acro: momentum coasts instead of braking ---
// The runway altitude also gives the acro sprint (which sheds height while
// pitched) room to stay above the skyline through the coast.
check('runway reached (acro)', await returnHome())
await setStrikeSwitch(page, 'strike-mode-toggle', true)
check('acro reports on', (await root.getAttribute('data-mode')) === 'acro')
const [, acroCoast] = await sprintAndRelease()
check(
  'acro coasts after release',
  acroCoast > 3.5 && acroCoast > holdCoast * 2,
  `acroCoast=${acroCoast.toFixed(1)} holdCoast=${holdCoast.toFixed(1)}`,
)
await setStrikeSwitch(page, 'strike-mode-toggle', false)

// --- battery: bar, drain, pad recharge, transient level ---
await setStrikeSwitch(page, 'strike-battery-toggle', true)
check('battery reports on', (await root.getAttribute('data-battery')) === 'on')
const fill = page.locator('[data-testid="strike-battery-fill"]')
check('bar appears full', (await fill.getAttribute('data-level')) === '100')

// Reset to the pad first (restart is free of progress loss here: score 0).
await page.locator('[data-testid="strike-restart"]').click()
await page.waitForTimeout(400)
// Spin in place above the pad: full effort, no displacement.
await pilot.touchStart()
await pilot.touch(1, 0, 0, 0)
await page.waitForTimeout(5000)
await pilot.touch(0, 0, 0, 0)
const drained = parseInt(await fill.getAttribute('data-level'), 10)
check('hard flying drains the battery', drained < 95, `level=${drained}`)
// Settle onto the pad (full down-stick) and recharge.
await pilot.touch(0, -1, 0, 0)
await page.waitForTimeout(2000)
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
await page.waitForTimeout(4000)
const recharged = parseInt(await fill.getAttribute('data-level'), 10)
check('resting on the pad recharges', recharged > drained, `${drained} -> ${recharged}`)

// --- persistence: all three settings survive a reload; the level is transient ---
await setStrikeSwitch(page, 'strike-mode-toggle', true)
await setStrikeSwitch(page, 'strike-tune-turbo', true)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
await page.waitForTimeout(600)
check('acro persists', (await root.getAttribute('data-mode')) === 'acro')
check('turbo persists', (await root.getAttribute('data-turbo')) === 'on')
check('battery persists', (await root.getAttribute('data-battery')) === 'on')
// The level is transient: a fresh session starts from a full charge (the
// idle 0.8 %/s hover drain runs from mount, so allow a small dip).
const freshLevel = parseInt(
  await page.locator('[data-testid="strike-battery-fill"]').getAttribute('data-level'),
  10,
)
check('battery level restarts near full (transient)', freshLevel >= 97, `level=${freshLevel}`)

await finish(browser)
