/**
 * Drone Strike shielded-drone suite. From SHIELD_FROM_WAVE (5) the FIRST
 * enemy of each wave is SHIELDED (`variant === 2`): a bigger airframe
 * (SHIELD_RADIUS hit sphere, matching render scale) whose front dome
 * deflects the player's fire — only shots arriving from behind (travelling
 * WITH its heading) damage it. Index-derived like the chaser, so the seeded
 * stream gains no draws and waves below 5 stay byte-identical. The facing
 * gate is the pure `shieldBlocks(dx, dy, dz, vel)` on the HitEvent's new
 * normalized shot direction (written by `stepProjectiles` from the live
 * bolt velocity — so it's also correct for curving homing missiles — and by
 * `fireHitscan` from the beam direction). The rig's shared damage path
 * checks it before `hp--`: a deflect sparks, flashes the shell, clanks and
 * bumps the monotonic `data-deflects`, but pays no damage/combo/score.
 */
import { addStrikeWidget, launch, reporter, waitForWaveState } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  CHASER_POINTS,
  SHIELD_FROM_WAVE,
  SHIELD_POINTS,
  SHIELD_RADIUS,
  buildWave,
} from './.bundle/waveLayout.js'
import {
  BOLT,
  SHIELD_REAR_COS,
  createCombatState,
  createHitEvents,
  shieldBlocks,
  spawnProjectile,
  stepProjectiles,
} from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-shield')

// --- pure: seeding rules ---
const layout = buildWorldLayout(DEFAULT_SEED)
const enemiesOf = (w, d = 'normal') =>
  buildWave(DEFAULT_SEED, w, layout, d).targets.filter((t) => t.kind === 'enemy')

check('waves below SHIELD_FROM_WAVE field no shielded drone',
  [1, 2, 3, 4].every((w) => enemiesOf(w).every((t) => (t.variant ?? 0) !== 2)),
  `from=${SHIELD_FROM_WAVE}`)
check('pre-shield waves keep the normal 0.6 enemy hit sphere (stream untouched)',
  [1, 2, 3, 4].every((w) => enemiesOf(w).every((t) => t.radius === 0.6)))
check('every wave from SHIELD_FROM_WAVE fields exactly ONE shielded drone',
  [5, 6, 8].every((w) => enemiesOf(w).filter((t) => t.variant === 2).length === 1))
check('the shielded drone is the FIRST enemy; the chaser stays LAST',
  [5, 6, 8].every((w) => {
    const e = enemiesOf(w)
    return e[0].variant === 2 && e[e.length - 1].variant === 1
  }))
check('shielded pays the top drone bounty', SHIELD_POINTS > CHASER_POINTS)
check('shield points land on the seeded target',
  enemiesOf(5).find((t) => t.variant === 2).points === SHIELD_POINTS)
check('the shielded airframe is honestly bigger (hitbox matches the look)',
  enemiesOf(5).find((t) => t.variant === 2).radius === SHIELD_RADIUS &&
    SHIELD_RADIUS > 0.6)
check('shielded hp follows difficulty like any enemy',
  enemiesOf(5, 'easy').find((t) => t.variant === 2).hp === 1 &&
    enemiesOf(5, 'normal').find((t) => t.variant === 2).hp === 2)

// --- pure: the facing gate ---
const HEADING_X = { x: 5, y: 0, z: 0 } // the drone flies +x → its front is +x
check('a frontal shot (against the heading) is blocked',
  shieldBlocks(-1, 0, 0, HEADING_X))
check('a rear shot (with the heading) passes', !shieldBlocks(1, 0, 0, HEADING_X))
check('a pure side-on shot still deflects (the dome wraps past the beam)',
  shieldBlocks(0, 0, 1, HEADING_X))
check('a top-down shot deflects too (facing is horizontal-agnostic math)',
  shieldBlocks(0, -1, 0, HEADING_X))
check('the SHIELD_REAR_COS boundary: at the margin passes, under it deflects',
  !shieldBlocks(SHIELD_REAR_COS, Math.sqrt(1 - SHIELD_REAR_COS ** 2), 0, HEADING_X) &&
    shieldBlocks(SHIELD_REAR_COS - 0.01, Math.sqrt(1 - (SHIELD_REAR_COS - 0.01) ** 2), 0, HEADING_X))
check('a stalled drone has no facing — the shield falls open',
  !shieldBlocks(-1, 0, 0, { x: 0, y: 0, z: 0 }) &&
    !shieldBlocks(-1, 0, 0, { x: 0.01, y: 0, z: 0 }))

// --- pure: integration through the REAL projectile sweep ---
// A shielded Hittable mid-air; fire the real BOLT at it from ahead and from
// behind through stepProjectiles, and gate the produced HitEvents.
const fireAt = (origin, dir) => {
  const target = { alive: true, pos: { x: 0, y: 8, z: 0 }, radius: SHIELD_RADIUS }
  const combat = createCombatState()
  const events = createHitEvents()
  spawnProjectile(combat.player, origin, dir, BOLT)
  for (let i = 0; i < 240 && events.count === 0; i++) {
    stepProjectiles(combat.player, BOLT, 1 / 60, [], [target], null, 0, events)
  }
  return events.count > 0 ? events.items[0] : null
}
const front = fireAt({ x: 12, y: 8, z: 0 }, { x: -1, y: 0, z: 0 })
const rear = fireAt({ x: -12, y: 8, z: 0 }, { x: 1, y: 0, z: 0 })
check('both test bolts connect with the target',
  front?.kind === 'target' && rear?.kind === 'target')
check('the HitEvent carries the normalized shot direction',
  Math.abs(front.dx + 1) < 1e-9 && Math.abs(front.dy) < 1e-9 && Math.abs(front.dz) < 1e-9 &&
    Math.abs(rear.dx - 1) < 1e-9)
check('the frontal hit deflects, the rear hit damages',
  shieldBlocks(front.dx, front.dy, front.dz, HEADING_X) &&
    !shieldBlocks(rear.dx, rear.dy, rear.dz, HEADING_X))

// --- live (light): the widget publishes the deflect counter ---
const { browser, page } = await launch()
await addStrikeWidget(page)
check('wave 1 goes active', await waitForWaveState(page, 'active'))
const hud = page.locator('[data-testid="strike-hud"]')
check('deflect counter boots at 0', (await hud.getAttribute('data-deflects')) === '0')

await finish(browser)
