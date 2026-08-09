/**
 * Drone Strike shotgun suite. One trigger pull fans SHOTGUN.pellets bolts
 * through the ordinary projectile integrator/sweep — pellet 0 flies true,
 * the rest ring the aim axis via the pure, DETERMINISTIC `pelletDir`
 * (golden-angle azimuths + index-jittered radii, no Math.random), capped at
 * the spec's `spread` half-angle. Stats count pulls, not pellets. Live: the
 * settings picker gains Shotgun (root `data-weapon`, persisted); a single
 * tap increments `data-shots` by ONE while putting a multi-pellet salvo in
 * flight (`data-proj`), and the laser-only heat bar stays unmounted.
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  launch,
  openStrikeSettings,
  reporter,
  tapFire,
  waitForWaveState,
} from './helpers.mjs'
import {
  BOLT,
  SHOTGUN,
  WEAPON_SPECS,
  coerceWeapon,
  pelletDir,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-shotgun')

// --- pure: the spec ---
check('SHOTGUN fans multiple pellets', (SHOTGUN.pellets ?? 1) > 1, `pellets=${SHOTGUN.pellets}`)
check('the fan has a real spread', (SHOTGUN.spread ?? 0) > 0)
check('pump cadence is heavier than the bolt', SHOTGUN.cooldown > BOLT.cooldown)
check('short-range weapon', SHOTGUN.maxRange < BOLT.maxRange)
check('picker plumbing knows the shotgun',
  WEAPON_SPECS.shotgun === SHOTGUN && coerceWeapon('shotgun') === 'shotgun')

// --- pure: the pellet fan (deterministic, bounded, distinct) ---
const dir = { x: 0, y: 0, z: -1 }
const out = { x: 0, y: 0, z: 0 }
const pellets = SHOTGUN.pellets ?? 7
const spread = SHOTGUN.spread ?? 0
pelletDir(dir, 0, spread, out)
check('pellet 0 flies true', out.x === dir.x && out.y === dir.y && out.z === dir.z)

const fan = []
let unit = true
let inCone = true
for (let i = 0; i < pellets; i++) {
  const p = pelletDir(dir, i, spread, { x: 0, y: 0, z: 0 })
  fan.push(p)
  const len = Math.hypot(p.x, p.y, p.z)
  if (Math.abs(len - 1) > 1e-9) unit = false
  const angle = Math.acos(Math.max(-1, Math.min(1, p.x * dir.x + p.y * dir.y + p.z * dir.z)))
  if (angle > spread + 1e-9) inCone = false
}
check('every pellet is a unit direction', unit)
check('every pellet stays inside the spread cone', inCone)
let distinct = true
for (let i = 1; i < fan.length; i++) {
  for (let j = i + 1; j < fan.length; j++) {
    if (fan[i].x === fan[j].x && fan[i].y === fan[j].y && fan[i].z === fan[j].z) distinct = false
  }
}
check('ring pellets are pairwise distinct', distinct)
const again = pelletDir(dir, 3, spread, { x: 0, y: 0, z: 0 })
check('the fan is deterministic',
  again.x === fan[3].x && again.y === fan[3].y && again.z === fan[3].z)
// Degenerate axis: aiming straight up still yields a valid unit fan.
const up = pelletDir({ x: 0, y: 1, z: 0 }, 2, spread, { x: 0, y: 0, z: 0 })
check('vertical aim uses the fallback basis', Math.abs(Math.hypot(up.x, up.y, up.z) - 1) < 1e-9)

// --- live: picker + one pull = one shot, many pellets ---
const { browser, context, page } = await launch()
await addStrikeWidget(page)
const root = page.locator('[data-testid="drone-strike-root"]')
await openStrikeSettings(page)
await page.locator('[data-testid="strike-weapon-shotgun"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('picking the shotgun updates the root', (await root.getAttribute('data-weapon')) === 'shotgun')
check('no heat bar with the shotgun', (await page.locator('[data-testid="strike-heat"]').count()) === 0)

check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
const shots0 = Number(await hud.getAttribute('data-shots'))
await tapFire(page, context, 60)
await page.waitForTimeout(250)
const proj = Number(await hud.getAttribute('data-proj'))
await page.waitForTimeout(200)
const shots1 = Number(await hud.getAttribute('data-shots'))
check('one pull counts ONE shot', shots1 === shots0 + 1, `shots ${shots0}→${shots1}`)
check('the pull puts a multi-pellet salvo in flight', proj >= 2, `proj=${proj}`)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('shotgun pick persists across reload',
  (await page.locator('[data-testid="drone-strike-root"]').getAttribute('data-weapon')) === 'shotgun')

await finish(browser)
