/**
 * Chase-camera wall-avoidance suite: the third-person boom publishes its live
 * length as data-boom on the HUD; it sits at full extension in open sky,
 * clamps short when a building stands directly behind the drone (camera side),
 * and re-extends once the obstruction clears. Geometry math is unit-covered
 * (boomClipT); this asserts the integrated behaviour through telemetry.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('chasecam')
const L = buildWorldLayout(DEFAULT_SEED)
const C = L.colliders[0] // the collision suite's building at (23, -23)
const CX = (C.minX + C.maxX) / 2
const FULL_BOOM = Math.hypot(2.4, 6) // |CHASE_OFFSET| ~ 6.46
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { hud, telemetry } = readers(page)
const boom = async () => parseFloat(await hud.getAttribute('data-boom'))
const pilot = await createPilot(page, context)

// open sky: the damped boom settles at full extension
await page.waitForTimeout(1500)
const b0 = await boom()
check('full boom in open sky', Math.abs(b0 - FULL_BOOM) < 1, `boom=${b0}`)

// park just off the building's low-z face at mid-height, then face AWAY from
// it (yaw 0 puts the camera boom pointing straight into the wall)
await pilot.touchStart()
await pilot.flyTo({ x: CX, y: 24, z: C.minZ - 1.6 }, { tol: 2 })
await pilot.brake()
await pilot.flyTo({ x: CX, y: 5, z: C.minZ - 1.6 }, { maxForward: 0.4, tol: 0.8 })
await pilot.brake()
// telemetry lags 150 ms, so a continuous loop overshoots: nudge, settle,
// re-read, repeat until the settled yaw is close enough
for (let round = 0; round < 6; round++) {
  const err = wrap(0 - (await telemetry()).yaw)
  if (Math.abs(err) < 0.1) break
  await pilot.touch(clamp(-1.2 * err, -0.6, 0.6), 0, 0, 0)
  await page.waitForTimeout(Math.min(500, (Math.abs(err) / 2.8) * 1000))
  await pilot.touch(0, 0, 0, 0)
  await page.waitForTimeout(350) // settle + fresh telemetry
}
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(1200) // let the damper converge into the clamp
const t1 = await telemetry()
check('parked by the wall facing away', Math.abs(wrap(t1.yaw)) < 0.3, `yaw=${t1.yaw}`)
check('no crash while parking', t1.crash === 'none')
const b1 = await boom()
check('boom clamped against the wall', b1 >= 0.75 && b1 <= 3.5, `boom=${b1}`)
await page.screenshot({ path: `${ARTIFACTS_DIR}chasecam-clamped.png` })

// clear the obstruction: boom re-extends through the same damper
await pilot.flyTo({ x: CX, y: 24, z: C.minZ - 12 }, { tol: 2 })
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(1500)
await pilot.touchEnd()
const b2 = await boom()
check('boom re-extends in the clear', Math.abs(b2 - FULL_BOOM) < 1, `boom=${b2}`)

await finish(browser)
