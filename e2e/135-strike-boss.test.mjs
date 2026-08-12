/**
 * Drone Strike boss-wave suite. Every BOSS_EVERY-th wave (5, 10, 15…) fields
 * one BOSS gunship, APPENDED as the very last consumer of that wave's seeded
 * stream (after even the crate) — so adding bosses moved no other placement
 * anywhere, which is asserted here as an invariant rather than assumed.
 *
 * The boss rides `stepEnemy`'s orbiter patrol (its guard accepts 'boss'), and
 * the interesting part is its damage model: the hull is ARMOUR and only hits
 * landing inside a LIVE weak-point pod damage it. Pod geometry is the pure
 * `bossModel` — the same `podCenter` the renderer positions its pods with and
 * the rig's `podHitAt` resolves impacts against, off the single rig-written
 * `podPhase`, so what you see is what you can hit. Aggregate hp = pods ×
 * `bossPodHp`, so the shared damage path kills the boss exactly when the last
 * pod is spent, and the health bar reads hp/hpMax.
 */
import { addStrikeWidget, launch, reporter, waitForWaveState } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import { SPAWN, WORLD_HALF } from './.bundle/flightModel.js'
import {
  BOSS_EVERY,
  BOSS_POINTS,
  BOSS_RADIUS,
  CHASER_POINTS,
  DIFFICULTY,
  POINTS,
  bossPodHp,
  buildWave,
  createTargetStates,
  isBossWave,
  loadWave,
  stepDrift,
} from './.bundle/waveLayout.js'
import {
  BOSS_HULL_R,
  BOSS_POD_COUNT,
  BOSS_POD_RADIUS,
  BOSS_POD_RING,
  BOSS_SPIN,
  nearestLivePod,
  podCenter,
  podHitAt,
  podsLeft,
} from './.bundle/bossModel.js'
import { BOLT, createCombatState, createHitEvents, spawnProjectile, stepProjectiles } from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-boss')

const layout = buildWorldLayout(DEFAULT_SEED)
const waveOf = (w, d = 'normal') => buildWave(DEFAULT_SEED, w, layout, d)
const bossesOf = (w, d = 'normal') => waveOf(w, d).targets.filter((t) => t.kind === 'boss')

// --- pure: the every-5th rule + append-only seeding ---
check('isBossWave marks every BOSS_EVERY-th wave', [5, 10, 15, 20].every(isBossWave), `every=${BOSS_EVERY}`)
check('and no other wave', [1, 2, 3, 4, 6, 7, 8, 9, 11].every((w) => !isBossWave(w)))
check('non-boss waves field no boss', [1, 2, 3, 4, 6, 7].every((w) => bossesOf(w).length === 0))
check('boss waves field exactly one', [5, 10, 15].every((w) => bossesOf(w).length === 1))
check('the boss is the LAST target of the wave (append-only stream)',
  [5, 10, 15].every((w) => {
    const ts = waveOf(w).targets
    return ts[ts.length - 1].kind === 'boss'
  }))
// The append is what keeps every previously-pinned wave-5 fact true: the
// shielded drone still leads the enemies, the chaser still trails them, the
// jets still fly above the roofs, and the crate is still picked.
{
  const w5 = waveOf(5)
  const enemies = w5.targets.filter((t) => t.kind === 'enemy')
  const jets = w5.targets.filter((t) => t.kind === 'jet')
  const maxRoofH = layout.buildings.reduce((m, b) => Math.max(m, b.h), 0)
  check('wave 5 still leads with the shielded drone and trails with the chaser',
    enemies[0].variant === 2 && enemies[enemies.length - 1].variant === 1)
  check('wave 5 jets still fly the seeded skyline lanes', jets.length > 0 && jets.every((t) => t.y > 3))
  check('wave 5 still gets its supply crate', Boolean(w5.crate))
  check('the boss flies above every roof', bossesOf(5)[0].y > maxRoofH,
    `y=${bossesOf(5)[0].y.toFixed(1)} roof=${maxRoofH.toFixed(1)}`)
}

// --- pure: boss spec ---
{
  const boss = bossesOf(5)[0]
  const podHp = bossPodHp(5, DIFFICULTY.normal)
  check('the boss hull is the big hit sphere', boss.radius === BOSS_RADIUS && BOSS_RADIUS === BOSS_HULL_R)
  check('aggregate hp = pods × podHp', boss.hp === BOSS_POD_COUNT * podHp, `hp=${boss.hp}`)
  check('per-pod hp rides on the spec', boss.podHp === podHp)
  check('the boss is the biggest bounty on the board',
    boss.points === BOSS_POINTS && BOSS_POINTS > CHASER_POINTS && BOSS_POINTS > POINTS.soldier)
  check('its whole orbit stays inside the world and clear of the spawn',
    Math.abs(boss.x) + boss.driftAmp <= WORLD_HALF - 2 &&
      Math.abs(boss.z) + boss.driftAmp <= WORLD_HALF - 2 &&
      Math.hypot(boss.x - SPAWN.x, boss.z - SPAWN.z) > 14)
  check('it patrols slowly (a circling gunship, not a racer)',
    boss.driftSpeed > 0 && boss.driftSpeed < 0.3 && boss.driftAmp >= 10)
  check('pods toughen with each boss', bossPodHp(10, DIFFICULTY.normal) > podHp &&
    bossPodHp(15, DIFFICULTY.normal) > bossPodHp(10, DIFFICULTY.normal))
  check('Easy bosses are softer than Normal/Hard',
    bossPodHp(5, DIFFICULTY.easy) < bossPodHp(5, DIFFICULTY.normal) &&
      bossPodHp(5, DIFFICULTY.hard) === bossPodHp(5, DIFFICULTY.normal))
}

// --- pure: the boss is AI-driven, so stepDrift must leave it alone ---
{
  const states = createTargetStates()
  loadWave(states, waveOf(5))
  const boss = states.find((t) => t.alive && t.kind === 'boss')
  check('the pool loads the pods live', podsLeft(boss.podHp) === BOSS_POD_COUNT &&
    boss.podHp.every((h) => h === bossPodHp(5, DIFFICULTY.normal)))
  check('hpMax records the loaded hp (the health-bar denominator)', boss.hpMax === boss.hp)
  const bx = boss.pos.x
  const bz = boss.pos.z
  for (let i = 0; i < 120; i++) stepDrift(boss, i / 60)
  check('stepDrift never moves the boss (stepEnemy owns its orbit)',
    boss.pos.x === bx && boss.pos.z === bz)
  const other = states.find((t) => t.alive && t.kind === 'balloon')
  check('...while a non-boss slot loads with dead pods (can never register a pod hit)',
    other.podHp.every((h) => h === 0))
}

// --- pure: pod geometry ---
const CENTRE = { x: 4, y: 12, z: -6 }
const scratch = { x: 0, y: 0, z: 0 }
{
  const at = (i, phase) => podCenter(i, CENTRE, phase, { x: 0, y: 0, z: 0 })
  const p0 = at(0, 0)
  check('a pod sits on the ring at the hull height',
    Math.abs(Math.hypot(p0.x - CENTRE.x, p0.z - CENTRE.z) - BOSS_POD_RING) < 1e-9 &&
      p0.y === CENTRE.y)
  const angles = Array.from({ length: BOSS_POD_COUNT }, (_, i) => {
    const p = at(i, 0)
    return Math.atan2(p.z - CENTRE.z, p.x - CENTRE.x)
  })
  check('pods are evenly spaced around the ring',
    angles.every((a, i) => {
      const gap = Math.abs(((a - angles[(i + 1) % angles.length] + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
      return Math.abs(gap - (Math.PI * 2) / BOSS_POD_COUNT) < 1e-6
    }))
  const spun = at(0, 1.2)
  check('the ring rotates with the phase',
    Math.hypot(spun.x - p0.x, spun.z - p0.z) > 1 && BOSS_SPIN > 0)
}

// --- pure: the damage gate ---
{
  const live = Array.from({ length: BOSS_POD_COUNT }, () => 2)
  const phase = 0.7
  // The hull surface point straight outward of pod 0 — a shot landing there
  // is a pod hit (this is the geometry the whole mechanic rests on).
  const pod0 = podCenter(0, CENTRE, phase, { x: 0, y: 0, z: 0 })
  const dirX = (pod0.x - CENTRE.x) / BOSS_POD_RING
  const dirZ = (pod0.z - CENTRE.z) / BOSS_POD_RING
  const onHullAtPod = {
    x: CENTRE.x + dirX * BOSS_HULL_R,
    y: CENTRE.y,
    z: CENTRE.z + dirZ * BOSS_HULL_R,
  }
  check('a hull hit outward of a live pod counts as that pod',
    podHitAt(onHullAtPod, CENTRE, phase, live) === 0)
  // Halfway between two pods (60° off) is bare hull.
  const mid = phase + Math.PI / BOSS_POD_COUNT
  const onHullBetween = {
    x: CENTRE.x + Math.cos(mid) * BOSS_HULL_R,
    y: CENTRE.y,
    z: CENTRE.z + Math.sin(mid) * BOSS_HULL_R,
  }
  check('between the pods is bare armour', podHitAt(onHullBetween, CENTRE, phase, live) === -1)
  check('the hull top is armour too',
    podHitAt({ x: CENTRE.x, y: CENTRE.y + BOSS_HULL_R, z: CENTRE.z }, CENTRE, phase, live) === -1)
  const dead = [0, 2, 2]
  check('a destroyed pod stops accepting hits (its socket is armour)',
    podHitAt(onHullAtPod, CENTRE, phase, dead) === -1)
  check('a pod sphere is smaller than the hull it rides on', BOSS_POD_RADIUS < BOSS_HULL_R)
  check('podsLeft counts live pods only', podsLeft([2, 0, 1]) === 2 && podsLeft([0, 0, 0]) === 0)
}

// --- pure: the assist retarget (aiming a boss's CENTRE hits nothing) ---
{
  const live = Array.from({ length: BOSS_POD_COUNT }, () => 2)
  const phase = 0.3
  const from = { x: CENTRE.x + 30, y: CENTRE.y, z: CENTRE.z }
  const idx = nearestLivePod(from, CENTRE, phase, live, scratch)
  check('nearestLivePod picks a pod and writes its world centre', idx >= 0 &&
    Math.abs(Math.hypot(scratch.x - CENTRE.x, scratch.z - CENTRE.z) - BOSS_POD_RING) < 1e-9)
  const dists = Array.from({ length: BOSS_POD_COUNT }, (_, i) => {
    const p = podCenter(i, CENTRE, phase, { x: 0, y: 0, z: 0 })
    return Math.hypot(from.x - p.x, from.y - p.y, from.z - p.z)
  })
  check('...and it is the pod facing the shooter', dists[idx] === Math.min(...dists))
  const onlyLast = [0, 0, 2]
  check('it skips destroyed pods', nearestLivePod(from, CENTRE, phase, onlyLast, scratch) === 2)
  check('and reports -1 when every pod is gone',
    nearestLivePod(from, CENTRE, phase, [0, 0, 0], scratch) === -1)
}

// --- integration: real bolts through the real sweep, gated by podHitAt ---
{
  const phase = 0.9
  const hull = { alive: true, pos: { x: 0, y: 10, z: 0 }, radius: BOSS_HULL_R }
  const live = Array.from({ length: BOSS_POD_COUNT }, () => 2)
  const fireFrom = (angle) => {
    const origin = {
      x: hull.pos.x + Math.cos(angle) * 26,
      y: hull.pos.y,
      z: hull.pos.z + Math.sin(angle) * 26,
    }
    const dir = { x: -Math.cos(angle), y: 0, z: -Math.sin(angle) }
    const combat = createCombatState()
    const events = createHitEvents()
    spawnProjectile(combat.player, origin, dir, BOLT)
    for (let i = 0; i < 240 && events.count === 0; i++) {
      stepProjectiles(combat.player, BOLT, 1 / 60, [], [hull], null, 0, events)
    }
    return events.count > 0 ? events.items[0] : null
  }
  // Shoot straight down the pod-0 bearing, and 60° off it (between pods).
  const atPod = fireFrom(phase)
  const atGap = fireFrom(phase + Math.PI / BOSS_POD_COUNT)
  check('both test bolts connect with the hull sphere',
    atPod?.kind === 'target' && atGap?.kind === 'target')
  check('a bolt on a live pod bearing resolves to that pod (damage)',
    podHitAt(atPod, hull.pos, phase, live) === 0)
  check('a bolt between pods resolves to armour (deflect)',
    podHitAt(atGap, hull.pos, phase, live) === -1)
  // Drain every pod the way the rig does: pod hit → podHp--, hp--.
  const podHp = bossPodHp(5, DIFFICULTY.normal)
  const pods = Array.from({ length: BOSS_POD_COUNT }, () => podHp)
  let hp = BOSS_POD_COUNT * podHp
  let hits = 0
  for (let i = 0; i < BOSS_POD_COUNT; i++) {
    while (pods[i] > 0) {
      pods[i]--
      hp--
      hits++
    }
  }
  check('draining every pod takes exactly pods × podHp hits and kills the boss',
    hits === BOSS_POD_COUNT * podHp && hp === 0 && podsLeft(pods) === 0)
}

// --- live (light): wave 1 is boss-free and the bar is unmounted ---
const { browser, page } = await launch()
await addStrikeWidget(page)
check('wave 1 goes active', await waitForWaveState(page, 'active'))
const root = page.locator('[data-testid="drone-strike-root"]')
const hud = page.locator('[data-testid="strike-hud"]')
check('wave 1 is not a boss wave', (await root.getAttribute('data-boss-wave')) === 'no')
check('no boss is live', (await hud.getAttribute('data-boss-active')) === 'no')
check('boss telemetry boots at zero',
  (await hud.getAttribute('data-boss-hp')) === '0' &&
    (await hud.getAttribute('data-boss-pods')) === '0')
check('the boss health bar is not mounted off a boss wave',
  (await page.locator('[data-testid="strike-boss"]').count()) === 0)

await finish(browser)
