/**
 * Drone Strike jet-trooper suite. From JET_WAVE (2) waves field flying
 * gunners — the Jet Trooper avatar airborne (`kind: 'jet'`) — seeded through
 * the same envelope-validated air path as the gallery, moved by stepDrift's
 * generic horizontal sinusoid (the hover-strafe), and firing the JET_BEAM
 * through the REAL `stepTurret` like a flying turret (muzzle-offset origin,
 * fireTimer pose signal, LOS + range gated). The gallery was trimmed
 * (3+w/8 → 2+w/6) to fund the jets; wave 1 keeps both gallery kinds. This
 * gallery change re-rolled the whole downstream seed stream — the other
 * placement-pinned suites re-verify against the pure module by construction.
 */
import { addStrikeWidget, createStrikePilot, launch, reporter, setStrikeAssist, setStrikeSwitch, strikeReaders, waitForWaveState } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'
import {
  DIFFICULTY,
  JET_WAVE,
  POINTS,
  buildWave,
  createTargetStates,
  loadWave,
  stepDrift,
} from './.bundle/waveLayout.js'
import { createEnemyAIStates, seedEnemyAIStates, stepTurret } from './.bundle/enemyAI.js'
import { ENEMY_BOLT, JET_BEAM, createCombatState } from './.bundle/combatModel.js'

const { check, finish } = reporter('strike-jets')

const layout = buildWorldLayout(DEFAULT_SEED)
const wavesOf = (w, d = 'normal') => buildWave(DEFAULT_SEED, w, layout, d)
const jetsOf = (w, d = 'normal') => wavesOf(w, d).targets.filter((t) => t.kind === 'jet')

// --- pure: seeding rules ---
check('wave 1 is jet-free (the opening sky is drones-only)',
  jetsOf(1).length === 0 && JET_WAVE === 2)
check('jets ramp from JET_WAVE with the seeded count formula',
  [2, 3, 4, 5, 8].every((w) => {
    const d = DIFFICULTY.normal
    const expected = Math.min(1 + Math.floor((w - JET_WAVE) / 3), 2, d.enemyCap)
    return jetsOf(w).length === expected
  }),
  `w2=${jetsOf(2).length} w5=${jetsOf(5).length} w8=${jetsOf(8).length}`)
check('difficulty clamps the jet count like the drones',
  [2, 5, 8].every((w) => jetsOf(w, 'easy').length <= Math.min(2, DIFFICULTY.easy.enemyCap)))

const jetsAll = [2, 3, 4, 5, 6, 7, 8].flatMap((w) => jetsOf(w))
check('every jet is seeded airborne with a strafe envelope',
  jetsAll.length > 0 &&
    jetsAll.every(
      (t) =>
        t.y > 3 &&
        t.driftAmp >= 3 &&
        t.driftSpeed > 0 &&
        (t.driftAxis === 0 || t.driftAxis === 2),
    ),
  `jets=${jetsAll.length}`)
check('jet hp follows the difficulty preset',
  jetsOf(3, 'easy').every((t) => t.hp === DIFFICULTY.easy.enemyHp) &&
    jetsOf(3, 'normal').every((t) => t.hp === DIFFICULTY.normal.enemyHp))
check('a jet pays its own points', jetsAll.every((t) => t.points === POINTS.jet) && POINTS.jet > POINTS.enemy)

// --- pure: the gallery trim funds the jets ---
const galleryOf = (w) =>
  wavesOf(w, 'easy').targets.filter((t) => t.kind === 'balloon' || t.kind === 'ringDrone')
check('the gallery was trimmed to min(2 + wave, 6)',
  [1, 2, 3, 4, 5, 8].every((w) => galleryOf(w).length === Math.min(2 + w, 6)),
  `w1=${galleryOf(1).length} w8=${galleryOf(8).length}`)
check('wave 1 still fields BOTH gallery kinds',
  galleryOf(1).some((t) => t.kind === 'ringDrone') && galleryOf(1).some((t) => t.kind === 'balloon'))

// --- pure: difficulty independence of the pre-jet stream (the 108 rule) ---
const diffIndependent = (t) =>
  t.kind === 'balloon' || t.kind === 'ringDrone' || t.kind === 'ground' || t.kind === 'car'
const w6e = wavesOf(6, 'easy').targets.filter(diffIndependent)
const w6n = wavesOf(6, 'normal').targets.filter(diffIndependent)
check('the jet block sits after the difficulty-independent draws',
  JSON.stringify(w6e) === JSON.stringify(w6n))

// --- pure: hover-strafe through the real stepDrift ---
{
  const states = createTargetStates()
  loadWave(states, wavesOf(3))
  const jet = states.find((t) => t.alive && t.kind === 'jet')
  const x0 = jet.pos.x
  const y0 = jet.pos.y
  const z0 = jet.pos.z
  let maxAlong = 0
  let crossDrift = 0
  for (let i = 0; i <= 600; i++) {
    stepDrift(jet, i / 60)
    const along = jet.driftAxis === 0 ? jet.pos.x - x0 : jet.pos.z - z0
    const cross = jet.driftAxis === 0 ? Math.abs(jet.pos.z - z0) : Math.abs(jet.pos.x - x0)
    maxAlong = Math.max(maxAlong, Math.abs(along))
    crossDrift = Math.max(crossDrift, cross, Math.abs(jet.pos.y - y0))
  }
  check('a jet strafes its horizontal axis inside the validated envelope',
    maxAlong > 0.5 && maxAlong <= jet.driftAmp + 1e-6, `along=${maxAlong.toFixed(2)}/${jet.driftAmp.toFixed(2)}`)
  check('…and never leaves its altitude or cross axis', crossDrift < 1e-9)
}

// --- pure: beam fire through the real stepTurret ---
check('the jet beam outpaces the drone bolt on a slower cadence',
  JET_BEAM.speed > ENEMY_BOLT.speed && JET_BEAM.cooldown > 0 && JET_BEAM.gravity === 0)
{
  const states = createTargetStates()
  loadWave(states, wavesOf(3))
  const ai = createEnemyAIStates()
  seedEnemyAIStates(ai, states)
  const idx = states.findIndex((t) => t.alive && t.kind === 'jet')
  const jet = states[idx]
  const combat = createCombatState()
  // Park the player inside the jet's own validated strafe envelope — a
  // clear line by construction — and force the stagger cooldown down.
  const player = {
    x: jet.pos.x + (jet.driftAxis === 0 ? 2 : 0),
    y: jet.pos.y,
    z: jet.pos.z + (jet.driftAxis === 2 ? 2 : 0),
  }
  ai[idx].fireCooldown = 0
  stepTurret(jet, ai[idx], idx, 1 / 60, player, layout.colliders, false, combat.enemy, JET_BEAM)
  check('a hold-fire jet never shoots', combat.enemy.every((p) => !p.active))
  stepTurret(jet, ai[idx], idx, 1 / 60, player, layout.colliders, true, combat.enemy, JET_BEAM)
  const bolt = combat.enemy.find((p) => p.active)
  check('a cleared jet fires the beam through the real stepTurret', !!bolt)
  check('the beam leaves a raised muzzle, not the torso',
    !!bolt &&
      Math.hypot(bolt.pos.x - jet.pos.x, bolt.pos.y - jet.pos.y, bolt.pos.z - jet.pos.z) > 0.3)
  check('firing arms the pose signal (fireTimer drives the model flash)', jet.fireTimer > 0)
  check('the cadence latches the stagger cooldown', ai[idx].fireCooldown > 0)
}

// --- live: wave 1 boots jet-free; clearing it fields the wave-2 jet ---
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
await setStrikeAssist(page, 'strong')
const { combat: readCombat } = strikeReaders(page)
check('wave 1 goes active', await waitForWaveState(page, 'active'))
const w1 = wavesOf(1, 'easy')
const c1 = await readCombat()
check('the app fields the seeded (jet-free) wave-1 count',
  c1.targetsLeft === w1.targets.length, `app=${c1.targetsLeft} expected=${w1.targets.length}`)

const pilot = await createStrikePilot(page, context)
await pilot.touchStart()
let cleared = true
const deadline = Date.now() + 240000
while ((await readCombat()).targetsLeft > 0) {
  if (Date.now() > deadline || !(await pilot.engage({ timeout: 60000 }))) {
    cleared = false
    break
  }
}
await pilot.touchEnd()
check('wave 1 fully cleared', cleared)
if (cleared) {
  await waitForWaveState(page, 'cleared', 4000)
  check('wave 2 goes active', await waitForWaveState(page, 'active', 12000))
  const w2 = wavesOf(2, 'easy')
  const c2 = await readCombat()
  check('the live wave-2 pool includes the seeded jet trooper',
    w2.targets.some((t) => t.kind === 'jet') && c2.targetsLeft === w2.targets.length,
    `app=${c2.targetsLeft} expected=${w2.targets.length} jets=${w2.targets.filter((t) => t.kind === 'jet').length}`)
}

await finish(browser)
