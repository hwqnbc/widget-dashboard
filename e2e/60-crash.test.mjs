/**
 * Crash suite: with crash mode on (the default), slamming a building at full
 * speed tumbles the drone (CRASHED! banner, lap voided) and auto-respawns it
 * on the pad; in safe mode the same flight pins against the wall instead.
 */
import {
  ARTIFACTS_DIR,
  addDroneWidget,
  createPilot,
  launch,
  readers,
  reporter,
  rootState,
  setSwitch,
} from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('crash')
const B = buildWorldLayout(DEFAULT_SEED).buildings[0]

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry, timerChip } = readers(page)
const crashState = () => rootState(page, 'data-crashes')
const pilot = await createPilot(page, context)

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Aim at the building's mid-height and floor it until a tumble starts (crash
// mode) or the drone pins against the wall with the stick held (safe mode).
async function flyAtBuilding(timeout = 25000) {
  const target = { x: B.x, y: Math.min(B.h / 2 + 1, 5), z: B.z }
  const deadline = Date.now() + timeout
  let sawCrash = false
  let stopped = null
  await pilot.touchStart()
  while (Date.now() < deadline) {
    const t = await telemetry()
    if (t.crash === 'tumbling') {
      sawCrash = true
      break
    }
    const dx = target.x - t.x
    const dz = target.z - t.z
    const err = wrap(Math.atan2(-dx, -dz) - t.yaw)
    const fwd = Math.abs(err) < 0.4 ? 1 : 0
    await pilot.touch(clamp(-2.0 * err, -1, 1), clamp((target.y - t.alt) * 0.8, -1, 1), 0, fwd)
    if (Math.hypot(dx, dz) < 6 && t.speed < 0.8 && fwd === 1) {
      stopped = t
      break
    }
    await page.waitForTimeout(120)
  }
  await pilot.touchEnd()
  return { sawCrash, stopped }
}

check('crash mode on by default', (await crashState()) === 'on')

const run1 = await flyAtBuilding()
check('impact triggered a tumble', run1.sawCrash)
const bannerText = await page
  .locator('[data-testid="dronesim-lap-banner"]')
  .textContent()
  .catch(() => '')
check('CRASHED! banner shown', (bannerText ?? '').includes('CRASHED'))
await page.screenshot({ path: `${ARTIFACTS_DIR}crash-tumble.png` })
check('lap voided by the crash', (await timerChip.getAttribute('data-lap-status')) === 'ready')
await page.waitForTimeout(2500)
const after = await telemetry()
check(
  'auto-respawned on the pad',
  Math.abs(after.alt - 2) < 0.3 && Math.abs(after.x) < 0.5 && Math.abs(after.z - 18) < 0.5,
  JSON.stringify(after),
)
check('tumble state cleared', after.crash === 'none')

await setSwitch(page, 'dronesim-crash-toggle', false)
check('toggle switches to safe mode', (await crashState()) === 'off')
const run2 = await flyAtBuilding()
check('safe mode: no tumble', !run2.sawCrash)
check(
  'safe mode: drone pinned at the wall instead',
  run2.stopped !== null && Math.hypot(run2.stopped.x - B.x, run2.stopped.z - B.z) < 8,
  JSON.stringify(run2.stopped),
)

await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
check('safe mode persists across reload', (await crashState()) === 'off')

await finish(browser)
