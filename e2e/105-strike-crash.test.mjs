/**
 * Drone Strike crash + heart-recharge suite: crash mode defaults on; a
 * full-speed wall hit tumbles the drone (data-crash-state), costs a heart,
 * banners CRASHED! and respawns at the pad; resting on the pad restores
 * the heart; with crash mode off the same wall hit is just a bounce/pin;
 * the toggle persists across reload.
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
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { SPAWN } from './.bundle/flightModel.js'

const { check, finish } = reporter('strike-crash')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
const { hud } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')

check('crash mode on by default', (await root.getAttribute('data-crashes')) === 'on')
check('no tumble at rest', (await hud.getAttribute('data-crash-state')) === 'none')
check('wave 1 goes active', await waitForWaveState(page, 'active'))

// Pick a rammable wall: a tall-enough building at a comfortable distance.
const layout = buildWorldLayout(DEFAULT_SEED)
const b = layout.buildings.find((c) => {
  const d = Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z)
  return c.h >= 5 && d >= 18 && d <= 45
})
check('found a wall to ram', Boolean(b))
const toSpawn = { x: SPAWN.x - b.x, z: SPAWN.z - b.z }
const toSpawnLen = Math.hypot(toSpawn.x, toSpawn.z)
const standOff = Math.max(b.w, b.d) / 2 + 12
const staging = {
  x: b.x + (toSpawn.x / toSpawnLen) * standOff,
  y: Math.max(2.5, Math.min(b.h - 1.5, 8)),
  z: b.z + (toSpawn.z / toSpawnLen) * standOff,
}

// Approach with crashes OFF (the transit itself must not tumble), then arm.
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
check('reached the staging point', await pilot.flyTo(staging, { tol: 2, timeout: 60000 }))
await pilot.brake()
await pilot.touchEnd()
await setStrikeSwitch(page, 'strike-crash-toggle', true)

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
/** Full-speed ram at the building centre until a tumble (or timeout). */
const ram = async (timeout = 20000) => {
  await pilot.touchStart()
  const deadline = Date.now() + timeout
  let tumbled = false
  while (Date.now() < deadline) {
    if ((await hud.getAttribute('data-crash-state')) === 'tumbling') {
      tumbled = true
      break
    }
    const x = parseFloat(await hud.getAttribute('data-x'))
    const z = parseFloat(await hud.getAttribute('data-z'))
    const yaw = parseFloat(await hud.getAttribute('data-yaw'))
    const err = wrap(Math.atan2(-(b.x - x), -(b.z - z)) - yaw)
    await pilot.touch(Math.min(1, Math.max(-1, -2 * err)), 0, 0, 1)
    await page.waitForTimeout(120)
  }
  await pilot.touch(0, 0, 0, 0)
  await pilot.touchEnd()
  return tumbled
}

check('full-speed wall hit tumbles', await ram())
const banner = page.locator('[data-testid="strike-wave"]')
check(
  'CRASHED! banner shows',
  (await banner.count()) === 1 && (await banner.textContent()) === 'CRASHED!',
)
await page.waitForTimeout(400)
check('crash costs a heart', (await hud.getAttribute('data-hp')) === '2')

// Tumble ends → respawn at the pad.
await page.waitForTimeout(2200)
check('tumble over', (await hud.getAttribute('data-crash-state')) === 'none')
const rx = parseFloat(await hud.getAttribute('data-x'))
const rz = parseFloat(await hud.getAttribute('data-z'))
check(
  'respawned at the pad',
  Math.abs(rx - SPAWN.x) < 1 && Math.abs(rz - SPAWN.z) < 1,
  `x=${rx} z=${rz}`,
)

// Rest on the pad → the heart comes back.
await pilot.touchStart()
await pilot.touch(0, -1, 0, 0)
await page.waitForTimeout(2000)
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
let healed = false
const healDeadline = Date.now() + 8000
while (Date.now() < healDeadline) {
  if ((await hud.getAttribute('data-hp')) === '3') {
    healed = true
    break
  }
  await page.waitForTimeout(250)
}
check('pad rest restores the heart', healed)

// Still parked on the pad — the safe-zone contract. (Immunity to live
// enemy fire needs a wave-5 armed build; verified on the dev build, see
// docs/drone-strike.md.)
check('safe zone reported on the pad', (await hud.getAttribute('data-safe')) === 'on')
const padChip = page.locator('[data-testid="strike-pad-chip"]')
check(
  'pad chip shows full after the heal',
  (await padChip.getAttribute('data-pad-state')) === 'safe',
)
const shotsOnPad = parseInt(await hud.getAttribute('data-shots'), 10)
await page.keyboard.down('Space')
await page.waitForTimeout(800)
await page.keyboard.up('Space')
check(
  'weapons offline while resting',
  parseInt(await hud.getAttribute('data-shots'), 10) === shotsOnPad,
)
await pilot.touchStart()
await pilot.touch(0, 1, 0, 0)
await page.waitForTimeout(1200)
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
await page.waitForTimeout(500)
check('leaving the pad drops the safe zone', (await hud.getAttribute('data-safe')) === 'off')
check(
  'pad chip hides off the pad',
  (await padChip.getAttribute('data-pad-state')) === 'off',
)

// Safe mode: the same ram only pins against the wall.
await setStrikeSwitch(page, 'strike-crash-toggle', false)
await pilot.touchStart()
check(
  'transit back to the staging point',
  await pilot.flyTo(staging, { tol: 2, timeout: 60000 }),
)
await pilot.brake()
await pilot.touchEnd()
const bumped = await ram(8000)
check('no tumble with crash mode off', !bumped)
check('no heart lost on a safe bump', (await hud.getAttribute('data-hp')) === '3')

// The toggle persists.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('crash toggle persists across reload', (await root.getAttribute('data-crashes')) === 'off')

await finish(browser)
