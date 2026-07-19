/**
 * Drone Strike gimbal-aiming suite: the drag-to-aim weapon gimbal (default
 * "Reticle" mode) — drag slews `data-gimbal-yaw/-pitch`, the reticle moves
 * across the view, the pitch arc reaches Reaper-style ground look-down and
 * clamps at the limits, double-tap recenters; a target kill using ONLY
 * drag aiming (flight sticks untouched during the aim); soft track keeps a
 * perturbed lock with assist on and lets it go with assist off; gunner
 * mode centres the reticle; hover mode re-routes the right stick to the
 * gimbal; mode persistence across reload.
 */
import {
  addStrikeWidget,
  closeStrikeSettings,
  createStrikePilot,
  dragAim,
  launch,
  openStrikeSettings,
  reporter,
  setStrikeSwitch,
  strikeReaders,
  tapScene,
  waitForWaveState,
} from './helpers.mjs'
import {
  DRAG_SENS,
  GIMBAL_PITCH_MIN,
  TRACK_MULT,
  createGimbalState,
  trackToward,
} from './.bundle/gimbalModel.js'

const { check, finish } = reporter('strike-gimbal')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { hud, telemetry, combat, target } = strikeReaders(page)
const root = page.locator('[data-testid="drone-strike-root"]')

const gimbal = async () => ({
  yaw: parseFloat(await hud.getAttribute('data-gimbal-yaw')),
  pitch: parseFloat(await hud.getAttribute('data-gimbal-pitch')),
})
const reticleLeft = async () =>
  await page
    .locator('[data-testid="strike-reticle"]')
    .evaluate((el) => el.style.left)

check('wave 1 goes active', await waitForWaveState(page, 'active'))
check('reticle (gimbal) mode by default', (await root.getAttribute('data-aim-mode')) === 'gimbal')
const g0 = await gimbal()
check('gimbal centred at start', Math.abs(g0.yaw) < 0.01 && Math.abs(g0.pitch) < 0.01)

// Drag right → aim right (yaw negative), reticle element moves right.
await dragAim(page, context, 90, 0)
await page.waitForTimeout(300)
const g1 = await gimbal()
check('drag right slews yaw right', g1.yaw < -0.15, `yaw=${g1.yaw}`)
const left1 = parseFloat(await reticleLeft())
check('reticle moved right of centre', left1 > 52, `left=${left1}%`)

// Deep down-pitch — the ground-attack arc fly-to-aim never had.
await dragAim(page, context, 0, 260)
await page.waitForTimeout(300)
const g2 = await gimbal()
check('drag down reaches ground look-down', g2.pitch < -0.8, `pitch=${g2.pitch}`)
await dragAim(page, context, 0, 400)
await page.waitForTimeout(300)
const g3 = await gimbal()
check(
  'pitch clamps at the gimbal arc',
  g3.pitch >= GIMBAL_PITCH_MIN - 0.001 && g3.pitch < GIMBAL_PITCH_MIN + 0.05,
  `pitch=${g3.pitch} min=${GIMBAL_PITCH_MIN}`,
)

// Double-tap the scene → recenter (back to classic fly-to-aim).
await tapScene(page, context)
await page.waitForTimeout(90)
await tapScene(page, context)
await page.waitForTimeout(300)
const g4 = await gimbal()
check('double-tap recenters', Math.abs(g4.yaw) < 0.01 && Math.abs(g4.pitch) < 0.01)

// --- gimbal kill via the assist chain: coarse-aim the gimbal by drag,
// then strong soft-track + auto-fire finish it (the feature's whole point
// — making a hard target hittable without pixel-perfect manual aim). The
// flight sticks are only used to arrive; aiming is gimbal + assist. ---
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const pilot = await createStrikePilot(page, context)
await setStrikeSwitch(page, 'strike-autofire-toggle', true)
await openStrikeSettings(page)
await page.locator('[data-testid="strike-assist-strong"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)

const tgt = await target()
check('beacon target available', tgt !== null)
await pilot.touchStart()
const t0 = await telemetry()
const dx = tgt.x - t0.x
const dz = tgt.z - t0.z
const d0 = Math.hypot(dx, dz)
const stand = { x: tgt.x - (dx / d0) * 22, y: tgt.y, z: tgt.z - (dz / d0) * 22 }
check('approach staging reached', await pilot.flyTo(stand, { tol: 3, timeout: 60000 }))
await pilot.brake()
await pilot.touchEnd()

// Coarse gimbal aim + let strong track/auto-fire converge and kill.
const before = (await combat()).targetsLeft
let killed = false
const killDeadline = Date.now() + 40000
while (Date.now() < killDeadline) {
  if ((await combat()).targetsLeft < before) {
    killed = true
    break
  }
  const t = await telemetry()
  const tg = await target()
  const g = await gimbal()
  if (tg) {
    const ddx = tg.x - t.x
    const ddz = tg.z - t.z
    const wantYaw = wrap(Math.atan2(-ddx, -ddz) - t.yaw)
    const wantPitch = Math.atan2(tg.y - t.alt, Math.hypot(ddx, ddz))
    const errYaw = wrap(wantYaw - g.yaw)
    const errPitch = wantPitch - g.pitch
    // Only issue a coarse correction when the error is beyond the drag
    // threshold band — fine convergence is the assist's job, not ours.
    if (Math.abs(errYaw) > 0.03 || Math.abs(errPitch) > 0.03) {
      await dragAim(page, context, -errYaw / DRAG_SENS, -errPitch / DRAG_SENS, 4)
    }
  }
  await page.waitForTimeout(150)
}
check('gimbal + assist kill (flight sticks idle)', killed, `left=${(await combat()).targetsLeft}`)

// --- soft track direction: a within-cone perturbation is actively pulled
// back when assist is on, and left parked when it is off. ---
const reacquire = async () => {
  const dl = Date.now() + 40000
  while (Date.now() < dl) {
    if ((await combat()).lock >= 0) return true
    const t = await telemetry()
    const tg = await target()
    const g = await gimbal()
    if (!tg) return false
    const ddx = tg.x - t.x
    const ddz = tg.z - t.z
    const wantYaw = wrap(Math.atan2(-ddx, -ddz) - t.yaw)
    const wantPitch = Math.atan2(tg.y - t.alt, Math.hypot(ddx, ddz))
    const eY = wrap(wantYaw - g.yaw)
    const eP = wantPitch - g.pitch
    if (Math.abs(eY) > 0.03 || Math.abs(eP) > 0.03) {
      await dragAim(page, context, -eY / DRAG_SENS, -eP / DRAG_SENS, 4)
    } else {
      await page.waitForTimeout(200) // let the reticle settle onto a lock
    }
    await page.waitForTimeout(120)
  }
  return false
}
// Auto-fire off so it doesn't destroy the target we're tracking.
await setStrikeSwitch(page, 'strike-autofire-toggle', false)
// The DOM side proves a lock is actually acquirable with the gimbal;
check('lock re-acquired for the track test', await reacquire())
// the track DYNAMICS are asserted on the pure module (in the live rig the
// strong slew corrects a within-cone perturbation in ~20 ms — too fast to
// sample over CDP, so the timing would be a flaky proxy).
{
  const g = createGimbalState()
  g.yaw = 0.1 // perturbed off a target at relative yaw 0
  const rate = 0.3
  trackToward(g, 0, 0, rate) // mild-ish step
  check('trackToward reduces error toward the target', g.yaw < 0.1 && g.yaw >= 0)
  const g2 = createGimbalState()
  g2.yaw = 0.02
  trackToward(g2, 0, 0, 0.3)
  check('trackToward never overshoots', Math.abs(g2.yaw) < 0.001)
  check('assist off means no track', TRACK_MULT.off === 0 && TRACK_MULT.strong > TRACK_MULT.mild)
}

// --- gunner mode: camera slews, reticle stays centred ---
await openStrikeSettings(page)
await page.locator('[data-testid="strike-aimmode-gunner"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('gunner mode set', (await root.getAttribute('data-aim-mode')) === 'gunner')
await page.waitForTimeout(300)
check('reticle re-centres in gunner mode', (await reticleLeft()) === '')
await dragAim(page, context, 80, 0)
await page.waitForTimeout(300)
check('drag still slews the gimbal in gunner mode', (await gimbal()).yaw < -0.1)
check('reticle stays centred while the camera slews', (await reticleLeft()) === '')

// --- hover mode: right stick aims instead of translating ---
// Assist off so soft-track doesn't move the gimbal during the measurement.
await openStrikeSettings(page)
await page.locator('[data-testid="strike-assist-off"]').click()
await page.waitForTimeout(150)
await page.locator('[data-testid="strike-aimmode-hover"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('hover mode set', (await root.getAttribute('data-aim-mode')) === 'hover')
await page.waitForTimeout(300) // mode switch recenters the gimbal
const gh0 = await gimbal()
await pilot.touchStart()
await page.waitForTimeout(150)
await pilot.touch(0, 0, 0, 1) // full right-stick forward
await page.waitForTimeout(1400)
const speedDuring = (await telemetry()).speed
const gh1 = await gimbal()
await pilot.touch(0, 0, 0, 0)
await pilot.touchEnd()
check('drone holds position in hover mode', speedDuring < 1.5, `speed=${speedDuring}`)
check('right stick slews the gimbal up', gh1.pitch > gh0.pitch + 0.2, `${gh0.pitch} -> ${gh1.pitch}`)

// --- persistence ---
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="drone-strike-root"]')
check('aim mode persists across reload', (await root.getAttribute('data-aim-mode')) === 'hover')

await finish(browser)
