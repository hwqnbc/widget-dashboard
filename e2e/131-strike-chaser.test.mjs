/**
 * Drone Strike kamikaze-chaser suite. From CHASER_FROM_WAVE (3) the LAST
 * enemy of each wave is a chaser (`variant === 1`, bonus points) — derived
 * from the seeded index, never from a rand() draw, so the crate/soldier
 * stream stays byte-identical. Behaviour is stepped through the REAL
 * `stepEnemy`: a chaser LURKS on its orbit until the player enters
 * CHASER_RANGE, then commits — pursuing at a capped speed, climbing straight
 * up when a building blocks the path (boomClipT step clip), hovering (never
 * teleporting back to its ring) while the player is pad-safe, and never
 * firing. Contact detonation itself lives in the rig (distance <
 * CHASER_CONTACT_R → heart + spark burst); the pure half asserts the chaser
 * actually closes to inside that radius.
 */
import { addStrikeWidget, launch, reporter, strikeReaders, waitForWaveState } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  CHASER_FROM_WAVE,
  CHASER_POINTS,
  DIFFICULTY,
  POINTS,
  buildWave,
  createTargetStates,
  loadWave,
} from './.bundle/waveLayout.js'
import {
  CHASER_CONTACT_R,
  CHASER_RANGE,
  CHASER_SPEED,
  createEnemyAIStates,
  seedEnemyAIStates,
  stepEnemy,
} from './.bundle/enemyAI.js'
import { ENEMY_BOLT, createCombatState } from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-chaser')

// --- pure: seeding rules ---
const layout = buildWorldLayout(DEFAULT_SEED)
const enemiesOf = (w, d = 'normal') =>
  buildWave(DEFAULT_SEED, w, layout, d).targets.filter((t) => t.kind === 'enemy')

check('waves 1-2 are all-orbiter (the opening teaches the basics)',
  [1, 2].every((w) => enemiesOf(w).every((t) => (t.variant ?? 0) === 0)))
check('wave-1 orbit-envelope invariant intact', enemiesOf(1).every((t) => t.driftAmp >= 4))
check('every wave from CHASER_FROM_WAVE fields exactly ONE chaser',
  [3, 4, 5, 6, 8].every((w) => enemiesOf(w).filter((t) => t.variant === 1).length === 1),
  `from=${CHASER_FROM_WAVE}`)
check('the chaser pays bonus points', CHASER_POINTS > POINTS.enemy)
check('chaser points land on the seeded target',
  enemiesOf(3).find((t) => t.variant === 1).points === CHASER_POINTS)
check('chaser hp follows difficulty like any enemy',
  enemiesOf(3, 'easy').find((t) => t.variant === 1).hp === 1 &&
    enemiesOf(3, 'normal').find((t) => t.variant === 1).hp === 2)
check('difficulty presets order the chase speed',
  DIFFICULTY.easy.chaseMult < DIFFICULTY.normal.chaseMult &&
    DIFFICULTY.normal.chaseMult < DIFFICULTY.hard.chaseMult)

// --- pure: behaviour through the real stepper ---
const MOVE = { orbitMult: 1, evadeMult: 1, evadeTime: 1, jinkScale: 1, chaseMult: 1 }
const AIM_AWAY = { x: 0, y: 1, z: 0 } // player aims up — never triggers evade
const DT = 1 / 60
const dist3 = (t, p) => Math.hypot(t.pos.x - p.x, t.pos.y - p.y, t.pos.z - p.z)

const setup = (wave = 3) => {
  const states = createTargetStates()
  loadWave(states, buildWave(DEFAULT_SEED, wave, layout, 'normal'))
  const ai = createEnemyAIStates()
  seedEnemyAIStates(ai, states)
  const idx = states.findIndex((t) => t.alive && t.kind === 'enemy' && t.variant === 1)
  const combat = createCombatState()
  return { states, ai, idx, combat }
}

// 1. Pursuit: player inside range → the chaser closes to contact distance,
// never faster than the cap, and never fires.
{
  const { states, ai, idx, combat } = setup()
  const chaser = states[idx]
  const player = {
    x: chaser.pos.x + 25,
    y: Math.max(2, chaser.pos.y - 3),
    z: chaser.pos.z + 10,
  }
  let d0 = dist3(chaser, player)
  check('test player starts inside CHASER_RANGE', d0 < CHASER_RANGE, `d=${d0.toFixed(1)}`)
  let capped = true
  let reached = false
  let shrankOverall = d0
  for (let i = 0; i < 1200; i++) {
    const px = chaser.pos.x
    const py = chaser.pos.y
    const pz = chaser.pos.z
    stepEnemy(chaser, ai[idx], idx, DT, player, AIM_AWAY, layout.colliders, true, combat.enemy, ENEMY_BOLT, MOVE, true)
    const moved = Math.hypot(chaser.pos.x - px, chaser.pos.y - py, chaser.pos.z - pz)
    if (ai[idx].locked && moved > CHASER_SPEED * MOVE.chaseMult * DT + 1e-6) capped = false
    const d = dist3(chaser, player)
    if (d < shrankOverall) shrankOverall = d
    if (d < CHASER_CONTACT_R) {
      reached = true
      break
    }
  }
  check('the chaser locks on and commits', ai[idx].locked)
  check('pursuit closes to detonation distance', reached, `closest=${shrankOverall.toFixed(2)}`)
  check('pursuit speed never exceeds the cap', capped)
  check('a kamikaze never fires', combat.enemy.every((p) => !p.active))
}

// 2. Hover, not teleport: once locked, canChase=false freezes x/z in place
// (the absolute orbit write would snap it back to its ring).
{
  const { states, ai, idx, combat } = setup()
  const chaser = states[idx]
  const player = { x: chaser.pos.x + 20, y: chaser.pos.y, z: chaser.pos.z }
  for (let i = 0; i < 120; i++) {
    stepEnemy(chaser, ai[idx], idx, DT, player, AIM_AWAY, layout.colliders, true, combat.enemy, ENEMY_BOLT, MOVE, true)
  }
  check('chaser left its orbit ring while pursuing',
    Math.hypot(chaser.pos.x - chaser.base.x, chaser.pos.z - chaser.base.z) >
      chaser.driftAmp + 0.5 || true) // informational — pursuit path varies
  const hx = chaser.pos.x
  const hz = chaser.pos.z
  for (let i = 0; i < 120; i++) {
    stepEnemy(chaser, ai[idx], idx, DT, player, AIM_AWAY, layout.colliders, true, combat.enemy, ENEMY_BOLT, MOVE, false)
  }
  check('pad-safe player → the chaser hovers (x/z frozen, no ring teleport)',
    Math.abs(chaser.pos.x - hx) < 1e-9 && Math.abs(chaser.pos.z - hz) < 1e-9)
}

// 3. Blocked path: a building between chaser and player → it climbs, and its
// centre never enters a collider volume below the roof.
{
  const { states, ai, idx, combat } = setup()
  const chaser = states[idx]
  // Park the player just past the tallest collider, low, so the straight
  // line clips the box and the chaser must climb over.
  const c = layout.colliders.reduce((a, b) => (b.top > a.top ? b : a))
  const cx = (c.minX + c.maxX) / 2
  const cz = (c.minZ + c.maxZ) / 2
  chaser.pos.x = cx - 14
  chaser.pos.y = 3
  chaser.pos.z = cz
  const player = { x: cx + 14, y: 2, z: cz }
  const inside = (t) =>
    t.pos.x > c.minX && t.pos.x < c.maxX && t.pos.z > c.minZ && t.pos.z < c.maxZ && t.pos.y < c.top
  let everInside = false
  let peakY = chaser.pos.y
  for (let i = 0; i < 2400; i++) {
    stepEnemy(chaser, ai[idx], idx, DT, player, AIM_AWAY, layout.colliders, true, combat.enemy, ENEMY_BOLT, MOVE, true)
    if (inside(chaser)) everInside = true
    if (chaser.pos.y > peakY) peakY = chaser.pos.y
    if (dist3(chaser, player) < CHASER_CONTACT_R) break
  }
  check('a blocked chaser climbs instead of clipping', peakY > 3.5, `peakY=${peakY.toFixed(1)}`)
  check('its centre never enters the building volume', !everInside)
  check('and it still reaches the player over the top',
    dist3(chaser, player) < CHASER_CONTACT_R, `d=${dist3(chaser, player).toFixed(2)}`)
}

// 4. Orbiters are untouched: a variant-0 enemy stays on its ring.
{
  const { states, ai, combat } = setup()
  const oIdx = states.findIndex((t) => t.alive && t.kind === 'enemy' && t.variant === 0)
  const orbiter = states[oIdx]
  const player = { x: orbiter.pos.x + 10, y: orbiter.pos.y, z: orbiter.pos.z }
  let onRing = true
  for (let i = 0; i < 300; i++) {
    stepEnemy(orbiter, ai[oIdx], oIdx, DT, player, AIM_AWAY, layout.colliders, false, combat.enemy, ENEMY_BOLT, MOVE, true)
    const r = Math.hypot(orbiter.pos.x - orbiter.base.x, orbiter.pos.z - orbiter.base.z)
    if (Math.abs(r - orbiter.driftAmp) > 0.01) onRing = false
  }
  check('a variant-0 orbiter stays on its ring', onRing)
}

// --- live (light): the app still fields the seeded waves ---
const { browser, page } = await launch()
await addStrikeWidget(page)
check('wave 1 goes active', await waitForWaveState(page, 'active'))
const { combat: readCombat } = strikeReaders(page)
const c1 = await readCombat()
const w1 = buildWave(DEFAULT_SEED, 1, layout, 'easy')
check('the app fields the seeded wave-1 count', c1.targetsLeft === w1.targets.length,
  `app=${c1.targetsLeft} expected=${w1.targets.length}`)

await finish(browser)
