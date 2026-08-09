/**
 * Drone Strike homing-missile suite. HOMING is a slow rocket-visual
 * projectile that STEERS toward the target locked at fire time —
 * `spawnProjectile` stores the lock as `Projectile.targetIdx`, and
 * `stepProjectiles` turns the velocity toward the target at a rate capped by
 * the spec's `homing` (rad/s), constant speed. Fired without a lock (or once
 * the target dies) it flies straight. All pure and stepped through the REAL
 * integrator: an off-axis target a straight shot would miss gets hit; the
 * per-frame turn never exceeds the cap. Live: the picker gains Homing (root
 * `data-weapon`, persisted), a shot flies as a slow long-lived projectile,
 * and the laser-only heat bar stays unmounted.
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
  HOMING,
  WEAPON_SPECS,
  coerceWeapon,
  createCombatState,
  createHitEvents,
  spawnProjectile,
  stepProjectiles,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-homing')

// --- pure: the spec ---
check('HOMING steers (real turn rate)', (HOMING.homing ?? 0) > 0)
check('missiles wear the rocket visual', HOMING.projectile === 'rocket')
check('slow + heavy cadence (tracking is the power)',
  HOMING.speed < BOLT.speed && HOMING.cooldown > BOLT.cooldown)
check('picker plumbing knows the missiles',
  WEAPON_SPECS.homing === HOMING && coerceWeapon('homing') === 'homing')

// --- pure: the lock is stored at spawn ---
const combat = createCombatState()
const events = createHitEvents()
const origin = { x: 0, y: 5, z: 0 }
const AHEAD = { x: 0, y: 0, z: -1 }
spawnProjectile(combat.player, origin, AHEAD, HOMING, 3)
check('spawn stores the fired-under lock', combat.player[0].targetIdx === 3)
check('and tags the rocket visual', combat.player[0].visual === 'rocket')
combat.player[0].active = false
spawnProjectile(combat.player, origin, AHEAD, HOMING)
check('no lock defaults to -1 (flies dumb)', combat.player[0].targetIdx === -1)
combat.player[0].active = false

// --- pure: steering hits what a straight shot would miss ---
const offAxis = [{ alive: true, pos: { x: 12, y: 5, z: -25 }, radius: 2 }]
spawnProjectile(combat.player, origin, AHEAD, HOMING, 0)
const missile = combat.player[0]
let hit = null
for (let i = 0; i < 600 && missile.active; i++) {
  events.count = 0
  stepProjectiles(combat.player, HOMING, 1 / 60, [], offAxis, null, 0, events)
  for (let e = 0; e < events.count; e++) {
    if (events.items[e].kind === 'target') hit = events.items[e].targetIdx
  }
}
check('the missile curves onto an off-axis target', hit === 0, `hit=${hit}`)

// The same shot WITHOUT a lock misses (proves the steering did it).
spawnProjectile(combat.player, origin, AHEAD, HOMING, -1)
const dumb = combat.player.find((p) => p.active)
let dumbHit = false
for (let i = 0; i < 600 && dumb.active; i++) {
  events.count = 0
  stepProjectiles(combat.player, HOMING, 1 / 60, [], offAxis, null, 0, events)
  for (let e = 0; e < events.count; e++) if (events.items[e].kind === 'target') dumbHit = true
}
check('unlocked, the same shot flies straight past', !dumbHit && !dumb.active)

// --- pure: the turn rate is capped per frame ---
const sideTarget = [{ alive: true, pos: { x: 20, y: 5, z: 0 }, radius: 1 }]
spawnProjectile(combat.player, origin, AHEAD, HOMING, 0)
const capped = combat.player.find((p) => p.active)
events.count = 0
stepProjectiles(combat.player, HOMING, 1 / 60, [], sideTarget, null, 0, events)
const speed = Math.hypot(capped.vel.x, capped.vel.y, capped.vel.z)
const dot = -capped.vel.z / speed // cos(angle to the original -z heading)
const turned = Math.acos(Math.max(-1, Math.min(1, dot)))
const maxTurn = (HOMING.homing ?? 0) / 60
check('one frame turns at most homing·dt', turned > 0.001 && turned <= maxTurn + 0.005,
  `turned=${turned.toFixed(4)} cap=${maxTurn.toFixed(4)}`)
check('steering keeps the speed constant', Math.abs(speed - HOMING.speed) < 1e-6)
// A dead target releases the missile.
sideTarget[0].alive = false
stepProjectiles(combat.player, HOMING, 1 / 60, [], sideTarget, null, 0, events)
check('a dead target releases the lock', capped.targetIdx === -1)

// --- live: picker + a slow missile in flight ---
const { browser, context, page } = await launch()
await addStrikeWidget(page)
const root = page.locator('[data-testid="drone-strike-root"]')
await openStrikeSettings(page)
await page.locator('[data-testid="strike-weapon-homing"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('picking homing updates the root', (await root.getAttribute('data-weapon')) === 'homing')
check('no heat bar with the missiles', (await page.locator('[data-testid="strike-heat"]').count()) === 0)

check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
await tapFire(page, context, 60)
await page.waitForTimeout(400)
check('the launcher fires', Number(await hud.getAttribute('data-shots')) >= 1)
check('a slow missile is in flight', Number(await hud.getAttribute('data-proj')) >= 1,
  `proj=${await hud.getAttribute('data-proj')}`)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('homing pick persists across reload',
  (await page.locator('[data-testid="drone-strike-root"]').getAttribute('data-weapon')) === 'homing')

await finish(browser)
