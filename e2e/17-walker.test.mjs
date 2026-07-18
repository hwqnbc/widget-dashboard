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
  closeSettings,
  createPilot,
  launch,
  openSettings,
  readers,
  reporter,
  rootState,
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

// pilot chip differentiates standing vs walking
const chip = page.locator('[data-testid="dronesim-pilot-chip"]')
check('no pilot chip in tp view', (await chip.count()) === 0)
await setView('los')
await page.waitForTimeout(500) // chip text arrives on the ~150ms tick
check('chip reads STANDING in los', (await chip.getAttribute('data-pilot')) === 'standing')
check('no hold button in los (standing never walks)', (await page.locator('[data-testid="dronesim-op-hold"]').count()) === 0)

// --- follow on foot, speed-capped ---
await setView('walk')
await page.waitForTimeout(500) // chip text arrives on the ~150ms tick
check('chip reads WALKING in walk view', (await chip.getAttribute('data-pilot')) === 'walking')
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

// --- configurable follow distance: a larger preference keeps the op put ---
const setFollowSlider = async (value) => {
  await openSettings(page)
  const slider = page.locator('[data-testid="dronesim-follow-dist"]')
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  await page.mouse.click(box.x + (box.width * (value - 5)) / 13, box.y + box.height / 2)
  await page.waitForTimeout(250)
  await closeSettings(page)
}
await setFollowSlider(15)
check('follow-distance slider persists to the root', (await rootState(page, 'data-follow-dist')) === '15')
const opNear = await opState()
await pilot.flyTo({ x: opNear.x + 12, y: CRUISE_ALT, z: opNear.z }, { tol: 1.5 })
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(2500)
const opFar = await opState()
check(
  'gap 12 with preference 15: op stays put (default would follow)',
  Math.hypot(opFar.x - opNear.x, opFar.z - opNear.z) < 0.3 && opFar.mode === 'idle',
  JSON.stringify(opFar),
)
await setFollowSlider(7)
await page.waitForTimeout(1500)
check('restoring the default resumes the follow at gap 12', (await opState()).mode === 'follow')

// --- hold position: op stands at the new spot while the drone leaves ---
const holdBtn = page.locator('[data-testid="dronesim-op-hold"]')
check('hold button present in walk view', (await holdBtn.count()) === 1)
await holdBtn.click()
await page.waitForTimeout(500)
check('chip flips to HOLDING', (await chip.getAttribute('data-pilot')) === 'holding')
check('root mirrors data-op-hold', (await page.locator('[data-testid="dronesim-root"]').getAttribute('data-op-hold')) === 'on')
await pilot.flyTo({ x: PAD.x, y: CRUISE_ALT, z: PAD.z }, { tol: 2 }) // drone leaves
const heldA = await opState()
await page.waitForTimeout(2000)
const heldB = await opState()
check(
  'held op stands at the new spot (drone far away)',
  Math.hypot(heldB.x - heldA.x, heldB.z - heldA.z) < 0.3 && heldB.mode === 'idle',
  `${JSON.stringify(heldA)} vs ${JSON.stringify(heldB)}`,
)
await holdBtn.click()
await page.waitForTimeout(1500)
const resumed = await opState()
check(
  'releasing hold resumes the follow',
  resumed.mode === 'follow' && Math.hypot(resumed.x - heldB.x, resumed.z - heldB.z) > 1,
  JSON.stringify(resumed),
)

// --- rescue: drain to dead, walk over, carry home, recharge ---
await pilot.flyTo({ x: SPOT.x, y: CRUISE_ALT, z: SPOT.z }, { tol: 2 }) // back out for the drain
await pilot.brake()
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
await setSwitch(page, 'dronesim-battery-toggle', true)
// Engage the toggle now: a harmless hold while the drone still flies, and
// MANUAL WALK the moment it dies — proving the same button covers both.
await holdBtn.click()
await page.waitForTimeout(300)
check('toggle engaged: holding while the drone still flies', (await chip.getAttribute('data-pilot')) === 'holding')
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

// --- manual walk: toggle held, so no auto-approach; sticks drive the op ---
await page.waitForTimeout(500)
check('chip: MANUAL WALK once the drone is down', (await chip.getAttribute('data-pilot')) === 'manual-walk')
const mw0 = await opState()
await page.waitForTimeout(2000)
const mw1 = await opState()
check(
  'manual: op does not auto-approach the dead drone',
  Math.hypot(mw1.x - mw0.x, mw1.z - mw0.z) < 0.3 && mw1.mode === 'retrieve',
  JSON.stringify(mw1),
)
const heading0 = parseFloat(await hud.getAttribute('data-op-heading'))
await pilot.touchStart()
await pilot.touch(1, 0, 0, 0) // left stick right = turn right
await page.waitForTimeout(1000)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(300)
const heading1 = parseFloat(await hud.getAttribute('data-op-heading'))
check('left stick turns the op', heading1 < heading0 - 1, `${heading0} -> ${heading1}`)
const w0 = await opState()
await pilot.touch(0, 0, 0, 1) // right stick forward = walk along the facing
await page.waitForTimeout(1500)
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
const w1 = await opState()
const wd = Math.hypot(w1.x - w0.x, w1.z - w0.z)
const dot = wd > 0 ? ((w1.x - w0.x) * -Math.sin(heading1) + (w1.z - w0.z) * -Math.cos(heading1)) / wd : 0
check('right stick walks along the facing', wd > 1.5 && dot > 0.9, `moved=${wd.toFixed(1)} dot=${dot.toFixed(2)}`)
await page.screenshot({ path: `${ARTIFACTS_DIR}walker-manual.png` })
// hand the job back to the autopilot for the rest of the rescue
await holdBtn.click()
await page.waitForTimeout(300)
check('chip: AUTO RESCUE after disengaging', (await chip.getAttribute('data-pilot')) === 'auto-rescue')

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
