/**
 * Drone Strike ballistic-lob suite. The lob is `gravity > 0` in the SAME
 * integrator every projectile flies (`stepProjectiles` applies
 * `vy −= gravity·dt`), so the pure checks fly a real shell: it arcs (rises,
 * apex, falls) and ends in a 'world' ground hit at y≈0. The trajectory hint
 * (`sampleTrajectory`) uses the same integration, so the drawn arc IS the
 * flight path — asserted to rise-then-fall for the lob, stay straight for a
 * gravity-0 weapon, and terminate on the ground clamped to y=0. DOM: the
 * picker gains Lob (`strike-weapon-lob`, root `data-weapon="lob"`,
 * persisted), lob shots still fire/register, and the laser-only heat bar
 * stays unmounted.
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  launch,
  openStrikeSettings,
  reporter,
  waitForWaveState,
} from './helpers.mjs'
import {
  BOLT,
  LOB,
  WEAPON_SPECS,
  coerceWeapon,
  createCombatState,
  createHitEvents,
  sampleTrajectory,
  spawnProjectile,
  stepProjectiles,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-lob')

// --- pure: the spec ---
check('LOB is a ballistic spec with real gravity', LOB.kind === 'ballistic' && LOB.gravity > 0)
check('weapon table + coercion know the lob', WEAPON_SPECS.lob === LOB && coerceWeapon('lob') === 'lob')

// --- pure: a live lob shell arcs and lands (the real integrator) ---
const combat = createCombatState()
const events = createHitEvents()
const origin = { x: 0, y: 6, z: 0 }
// Lob upward-forward so the arc has a visible apex.
const dir = { x: 0, y: 0.45, z: -0.893 }
check('shell spawns', spawnProjectile(combat.player, origin, dir, LOB))
const shell = combat.player[0]
let peakY = origin.y
let sawGroundHit = null
for (let i = 0; i < 600 && shell.active; i++) {
  events.count = 0
  stepProjectiles(combat.player, LOB, 1 / 60, [], [], null, 0, events)
  if (shell.pos.y > peakY) peakY = shell.pos.y
  for (let e = 0; e < events.count; e++) {
    if (events.items[e].kind === 'world') sawGroundHit = { y: events.items[e].y }
  }
}
check('the shell arcs (rises past its launch height)', peakY > origin.y + 3, `peak=${peakY.toFixed(1)}`)
check('gravity brings it down to a world hit at the ground',
  sawGroundHit !== null && Math.abs(sawGroundHit.y) < 0.5, sawGroundHit ? `y=${sawGroundHit.y.toFixed(3)}` : 'no hit')

// --- pure: the trajectory hint is the same integration ---
const pts = new Float32Array(64 * 3)
const n = sampleTrajectory(origin, dir, LOB, pts, 64, 0.08)
check('arc sampler returns a bounded path', n > 5 && n <= 64, `n=${n}`)
// Rise then fall: find the apex index; y must climb to it and drop after it.
let apex = 0
for (let i = 1; i < n; i++) if (pts[i * 3 + 1] > pts[apex * 3 + 1]) apex = i
check('the arc rises to an apex then falls', apex > 0 && apex < n - 1 && pts[apex * 3 + 1] > origin.y)
let fallsAfterApex = true
for (let i = apex + 1; i < n; i++) {
  if (pts[i * 3 + 1] > pts[(i - 1) * 3 + 1] + 1e-6) fallsAfterApex = false
}
check('monotonic drop past the apex', fallsAfterApex)
check('the arc terminates ON the ground (clamped to y=0)', pts[(n - 1) * 3 + 1] === 0)
// A gravity-0 weapon samples a straight line (no drop).
const straight = new Float32Array(64 * 3)
const sn = sampleTrajectory(origin, { x: 0, y: 0, z: -1 }, BOLT, straight, 64, 0.08)
let level = true
for (let i = 0; i < sn; i++) if (Math.abs(straight[i * 3 + 1] - origin.y) > 1e-6) level = false
check('a gravity-0 weapon draws a straight, level ray', level, `n=${sn}`)

// --- live: picker + persistence + firing; heat bar stays laser-only ---
const { browser, page } = await launch()
await addStrikeWidget(page)
const root = page.locator('[data-testid="drone-strike-root"]')
await openStrikeSettings(page)
await page.locator('[data-testid="strike-weapon-lob"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('picking the lob updates the root', (await root.getAttribute('data-weapon')) === 'lob')
check('no heat bar with the lob (laser-only UI)',
  (await page.locator('[data-testid="strike-heat"]').count()) === 0)

check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
await page.keyboard.down('Space')
await page.waitForTimeout(1200)
await page.keyboard.up('Space')
await page.waitForTimeout(300)
const shots = Number(await hud.getAttribute('data-shots'))
check('the lob fires on its (heavier) cadence', shots >= 2 && shots <= 5, `shots=${shots}`)
check('lob shells fly as projectiles', Number(await hud.getAttribute('data-sfx-fire')) > 0)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('lob pick persists across reload',
  (await page.locator('[data-testid="drone-strike-root"]').getAttribute('data-weapon')) === 'lob')

await finish(browser)
