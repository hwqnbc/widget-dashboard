/**
 * Walking-operator suite: in the walk view the operator follows the drone on
 * foot at a hard-capped human pace (losing a fast drone is intended), stops
 * inside the follow band, and — battery mode — rescues a dead drone: walks
 * over, picks it up, carries it to the pad, places it, and the pad recharge
 * revives it. All asserted through the data-op-* telemetry and the minimap.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  setSwitch,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { WALK_SPEED, FOLLOW_START, FOLLOW_STOP } from './.bundle/operatorWalk.js'

const { check, finish } = reporter('walker')
const L = buildWorldLayout(DEFAULT_SEED)
const HOME = { x: 3.2, z: 23 }
const PAD = { x: 0, z: 18 }
const CRUISE_ALT = 24

// A drain/landing spot: clear of buildings (5 u), 20-32 u from the pad.
function findClearSpot() {
  for (let x = -32; x <= 32; x += 4) {
    for (let z = -32; z <= 32; z += 4) {
      const dPad = Math.hypot(x - PAD.x, z - PAD.z)
      if (dPad < 20 || dPad > 32) continue
      const clear = L.buildings.every(
        (b) =>
          Math.abs(x - b.x) > b.w / 2 + 5 || Math.abs(z - b.z) > b.d / 2 + 5,
      )
      if (clear) return { x, z }
    }
  }
  throw new Error('no clear spot found')
}
const SPOT = findClearSpot()

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { hud, telemetry } = readers(page)
const pilot = await createPilot(page, context)
const opState = async () => ({
  x: parseFloat(await hud.getAttribute('data-op-x')),
  z: parseFloat(await hud.getAttribute('data-op-z')),
  mode: await hud.getAttribute('data-op-mode'),
})
const level = async () =>
  parseFloat(await page.locator('[data-testid="dronesim-battery-fill"]').getAttribute('data-level'))
const toggle = page.locator('[data-testid="dronesim-view-toggle"]')
const setView = async (name) => {
  for (let i = 0; i < 4; i++) {
    if ((await toggle.getAttribute('data-view')) === name) return
    await toggle.click()
    await page.waitForTimeout(200)
  }
}

const op0 = await opState()
check('operator starts at the pad-side spot, idle', Math.abs(op0.x - HOME.x) < 0.1 && Math.abs(op0.z - HOME.z) < 0.1 && op0.mode === 'idle', JSON.stringify(op0))
check('minimap shows the operator dot', (await page.locator('[data-testid="dronesim-minimap-operator"]').count()) === 1)

// --- follow on foot, speed-capped ---
await setView('walk')
await pilot.touchStart()
await pilot.flyTo({ x: SPOT.x, y: CRUISE_ALT, z: SPOT.z }, { tol: 2 })
await pilot.brake()
// the drone (12 u/s) trivially outran the walker (2.2 u/s)
const opMid = await opState()
const t0 = await telemetry()
const gap = Math.hypot(t0.x - opMid.x, t0.z - opMid.z)
check('op is following (mode/motion)', opMid.mode === 'follow' && Math.hypot(opMid.x - HOME.x, opMid.z - HOME.z) > 1.5, JSON.stringify(opMid))
check('drone outran the walker (gap beyond follow band)', gap > FOLLOW_START, `gap=${gap.toFixed(1)}`)

// speed cap: consecutive 1 s samples while walking
let maxStep = 0
let prev = await opState()
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(1000)
  const cur = await opState()
  maxStep = Math.max(maxStep, Math.hypot(cur.x - prev.x, cur.z - prev.z))
  prev = cur
}
check('walking speed hard-capped', maxStep <= WALK_SPEED * 1.2, `max=${maxStep.toFixed(2)}/s cap=${WALK_SPEED}`)

// hover in place -> op closes in and stops inside the band
const arriveDeadline = Date.now() + 45000
let arrived = null
while (Date.now() < arriveDeadline) {
  const s = await opState()
  if (s.mode === 'idle') {
    arrived = s
    break
  }
  await page.waitForTimeout(500)
}
const tHover = await telemetry()
const stopGap = arrived ? Math.hypot(tHover.x - arrived.x, tHover.z - arrived.z) : NaN
check('op arrives and idles inside the follow band', arrived !== null && stopGap <= FOLLOW_START, `gap=${stopGap.toFixed(1)}`)
await page.screenshot({ path: `${ARTIFACTS_DIR}walker-follow.png` })

// --- rescue: drain to dead, walk over, carry home, recharge ---
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
await setSwitch(page, 'dronesim-battery-toggle', true)
await pilot.touchStart()
// descend to a low hover first so the dead drone lands quickly
await pilot.flyTo({ x: SPOT.x, y: 6, z: SPOT.z }, { maxForward: 0.4, tol: 1.5 })
// full-yaw spin = max stick activity (~3 %/s) without going anywhere
const drainDeadline = Date.now() + 90000
while (Date.now() < drainDeadline) {
  const l = await level()
  if (l <= 0.5) break
  await pilot.touch(1, 0, 0, 0)
  await page.waitForTimeout(400)
}
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
check('battery drained to dead', (await level()) <= 0.5, `level=${await level()}`)

// dead drone auto-lands; the walker retrieves it
const groundDeadline = Date.now() + 30000
while (Date.now() < groundDeadline) {
  if ((await telemetry()).alt < 0.5) break
  await page.waitForTimeout(400)
}
check('dead drone auto-landed', (await telemetry()).alt < 0.5, `alt=${(await telemetry()).alt}`)

const carryDeadline = Date.now() + 30000
let sawRetrieve = false
let carrying = false
while (Date.now() < carryDeadline) {
  const s = await opState()
  if (s.mode === 'retrieve') sawRetrieve = true
  if (s.mode === 'carry') {
    carrying = true
    break
  }
  await page.waitForTimeout(300)
}
check('op walked over to retrieve', sawRetrieve)
check('op picked the drone up (carry)', carrying)
const tCarried = await telemetry()
const opCarry = await opState()
check(
  'carried drone rides with the op at hand height',
  Math.hypot(tCarried.x - opCarry.x, tCarried.z - opCarry.z) < 1.2 && Math.abs(tCarried.alt - 1.0) < 0.3,
  `drone=(${tCarried.x},${tCarried.alt},${tCarried.z}) op=(${opCarry.x},${opCarry.z})`,
)
await page.screenshot({ path: `${ARTIFACTS_DIR}walker-carry.png` })

// carried home and placed on the pad; the pad recharge revives it
const placeDeadline = Date.now() + 45000
let placed = false
while (Date.now() < placeDeadline) {
  const t = await telemetry()
  const s = await opState()
  if (s.mode !== 'carry' && Math.hypot(t.x - PAD.x, t.z - PAD.z) < 1 && t.alt < 0.5) {
    placed = true
    break
  }
  await page.waitForTimeout(400)
}
check('drone placed on the charging pad', placed, JSON.stringify(await telemetry()))
const rechargeDeadline = Date.now() + 15000
while (Date.now() < rechargeDeadline) {
  if ((await level()) >= 20) break
  await page.waitForTimeout(400)
}
check('pad recharge revives the drone (level ≥ 20)', (await level()) >= 20, `level=${await level()}`)

// follow-band constant sanity so the bundle and suite agree
check('band constants sane', FOLLOW_STOP < FOLLOW_START)

await finish(browser)
