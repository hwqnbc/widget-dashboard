/**
 * Tank Battle safe-zone suite: the spawn basin is the Drone Strike pad,
 * groundside. At spawn: `data-safe` on, pad chip shows SAFE, the player's
 * gun is offline. Outside: contract clears and the gun works. Then the
 * full repair loop, closed-loop: clear wave 1, bait a real hit from the
 * armed wave-2 enemies, retreat to the pad (chip flips to REPAIRING,
 * enemies hold fire) and rest until the heart comes back.
 */
import {
  addTankWidget,
  createTankPilot,
  launch,
  reporter,
  tankReaders,
  waitForTankState,
} from './helpers.mjs'
import { TANK_SPAWN } from './.bundle/terrain.js'
import { SAFE_ZONE_RADIUS } from './.bundle/tankModel.js'

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

const { check, finish } = reporter('tank-safezone')
const { browser, context, page } = await launch()
await addTankWidget(page)
const { telemetry, combat, target } = tankReaders(page)
const hud = page.locator('[data-testid="tank-hud"]')
const padChip = page.locator('[data-testid="tank-pad-chip"]')

check('battle active', await waitForTankState(page, 'active'))

// At spawn: inside the zone, gun offline.
check('safe at spawn', (await hud.getAttribute('data-safe')) === 'on')
check(
  'pad chip shows SAFE (full hearts)',
  (await padChip.getAttribute('data-pad-state')) === 'safe',
)
await page.keyboard.down('Space')
await page.waitForTimeout(500)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
check('weapons offline in the zone', (await combat()).shots === 0)

// Drive out: contract clears, gun works.
const pilot = await createTankPilot(page, context)
await pilot.touchStart()
await pilot.touch(0, 1, 0, 0)
await page.waitForTimeout(2400)
await pilot.touch(0, 0, 0, 0)
await page.waitForTimeout(500)
const out = await telemetry()
check(
  'actually left the zone',
  Math.hypot(out.x - TANK_SPAWN.x, out.z - TANK_SPAWN.z) > SAFE_ZONE_RADIUS,
)
check('safe clears outside', (await hud.getAttribute('data-safe')) === 'off')
check('pad chip hides outside', (await padChip.getAttribute('data-pad-state')) === 'off')
await page.keyboard.down('Space')
await page.waitForTimeout(400)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
check('weapons online outside', (await combat()).shots === 1)

// Clear wave 1 so the armed wave 2 loads.
check('wave 1 cleared', await pilot.engage({ timeout: 130000 }))
check('wave 1 second kill', await pilot.engage({ timeout: 130000 }))
await pilot.touchEnd()
check('cleared banner', await waitForTankState(page, 'cleared', 15000))
check('wave 2 active', await waitForTankState(page, 'active', 15000))

// Bait a hit: close to gun range and stand still in the open.
await pilot.touchStart()
let hp = 3
{
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const c = await combat()
    if (c.waveState !== 'active') {
      await pilot.touch(0, 0, 0, 0)
      await page.waitForTimeout(300)
      continue
    }
    hp = c.hp
    if (hp < 3) break
    const tgt = await target()
    if (!tgt) continue
    const t = await telemetry()
    const dx = tgt.x - t.x
    const dz = tgt.z - t.z
    const dxz = Math.hypot(dx, dz)
    const desiredYaw = Math.atan2(-dx, -dz)
    const hullErr = wrap(desiredYaw - t.hullYaw)
    if (dxz > 32) {
      await pilot.touch(
        clamp(-1.6 * hullErr, -1, 1),
        Math.abs(hullErr) < 0.5 ? 0.85 : 0,
        0,
        0,
      )
    } else {
      await pilot.touch(0, 0, 0, 0)
    }
    await page.waitForTimeout(150)
  }
}
check('took a hit from wave-2 fire', hp < 3, `hp=${hp}`)

// Retreat to the pad.
check('drove home', await pilot.driveTo({ x: TANK_SPAWN.x, z: TANK_SPAWN.z }, { tol: 4, timeout: 90000 }))
await page.waitForTimeout(600)
check('safe again on the pad', (await hud.getAttribute('data-safe')) === 'on')
check(
  'pad chip shows REPAIRING with hearts missing',
  (await padChip.getAttribute('data-pad-state')) === 'repairing',
)

// Rest → the heart comes back, chip returns to SAFE.
let healed = false
{
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if ((await combat()).hp >= 3) {
      healed = true
      break
    }
    await page.waitForTimeout(400)
  }
}
await pilot.touchEnd()
check('resting repairs the heart', healed)
check(
  'pad chip returns to SAFE at full hearts',
  (await padChip.getAttribute('data-pad-state')) === 'safe',
)

await finish(browser)
