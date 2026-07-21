/**
 * Drone Strike gimbal-aiming suite. The default is Classic (fly-to-aim,
 * gimbal frozen); switching to Reticle, drag slews `data-gimbal-yaw/-pitch`,
 * the reticle moves across the view, the pitch arc reaches Reaper-style
 * ground look-down and clamps, double-tap recenters. The fire-direction
 * COMPOSITION (shared by fire path, lock cone and reticle) and the
 * soft-track / recenter dynamics are asserted on the pure module
 * (deterministic — a live drag-onto-target kill is too finicky to automate,
 * and firing-kills a target is already covered by suite 100). Gunner
 * centres the reticle; hover re-routes the right stick to the gimbal; the
 * mode persists across reload.
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
  GIMBAL_PITCH_MIN,
  TRACK_MULT,
  aimAngles,
  createGimbalState,
  dirFromAngles,
  trackToward,
} from './.bundle/gimbalModel.js'

const { check, finish } = reporter('strike-gimbal')
const { browser, context, page } = await launch()
await addStrikeWidget(page)
await setStrikeSwitch(page, 'strike-crash-toggle', false)
const { hud, telemetry } = strikeReaders(page)
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

// --- Classic is the default: original fly-to-aim, gimbal frozen ---
check('classic mode by default', (await root.getAttribute('data-aim-mode')) === 'classic')
await dragAim(page, context, 120, 120)
await page.waitForTimeout(300)
const gc = await gimbal()
check(
  'classic ignores drag (gimbal frozen at boresight)',
  Math.abs(gc.yaw) < 0.01 && Math.abs(gc.pitch) < 0.01,
  `yaw=${gc.yaw} pitch=${gc.pitch}`,
)
check('classic reticle stays centred', (await reticleLeft()) === '')

// Switch to Reticle (gimbal) for the drag/track/reticle tests below.
await openStrikeSettings(page)
await page.locator('[data-testid="strike-aimmode-gimbal"]').click()
await page.waitForTimeout(150)
await closeStrikeSettings(page)
check('reticle (gimbal) mode set', (await root.getAttribute('data-aim-mode')) === 'gimbal')
const g0 = await gimbal()
check('gimbal centred on entry', Math.abs(g0.yaw) < 0.01 && Math.abs(g0.pitch) < 0.01)

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

// A pilot for the hover section below.
const pilot = await createStrikePilot(page, context)

// --- the gun fires along the composed gimbal direction (pure module) ---
// A live drag-onto-target kill is too finicky to automate deterministically
// (tight cones, beacon flips) and firing itself is already proven in suite
// 100; here we assert the aim COMPOSITION the fire path + lock cone + the
// on-screen reticle all share, so a gimbal offset genuinely points the gun.
{
  const dir0 = { x: 0, y: 0, z: 0 }
  const a0 = { yaw: 0, pitch: 0 }
  const g = createGimbalState()
  // Boresight: nose is -Z at yaw 0.
  aimAngles(0, 0, g, 0, 0, a0)
  dirFromAngles(a0.yaw, a0.pitch, dir0)
  check('boresight fire dir points down -Z', dir0.z < -0.99, `z=${dir0.z.toFixed(3)}`)
  // Gimbal yaw left (+) swings the fire dir toward -X (heading convention).
  g.yaw = 0.5
  aimAngles(0, 0, g, 0, 0, a0)
  dirFromAngles(a0.yaw, a0.pitch, dir0)
  check('gimbal yaw swings the fire dir left', dir0.x < -0.4, `x=${dir0.x.toFixed(3)}`)
  // Gimbal pitch down aims the dir below the horizon.
  g.yaw = 0
  g.pitch = -1.0
  aimAngles(0, 0, g, 0, 0, a0)
  dirFromAngles(a0.yaw, a0.pitch, dir0)
  check('gimbal pitch down aims below horizon', dir0.y < -0.6, `y=${dir0.y.toFixed(3)}`)
}

// --- soft-track / recenter DYNAMICS on the pure module (deterministic;
// in the live rig the strong slew corrects a within-cone perturbation in
// ~20 ms — too fast to sample over CDP). ---
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
check('aim mode persists across reload (hover)', (await root.getAttribute('data-aim-mode')) === 'hover')

await finish(browser)
