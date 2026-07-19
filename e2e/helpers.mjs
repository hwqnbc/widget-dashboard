/**
 * Shared harness for the Drone Sim end-to-end suites.
 *
 * The suites drive the real app in headless Chromium and assert only on the
 * widget's public test contract: `data-testid` hooks and the `data-*`
 * telemetry the HUD publishes every 150 ms (alt/speed/x/z/yaw/wind/
 * crash-state, lap and gate state). Flying is done closed-loop — a small
 * P-controller reads telemetry and steers the virtual sticks via CDP touch
 * events — because open-loop timed input is far too jittery to hit gates or
 * walls reliably.
 */
import { chromium } from 'playwright-core'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5199/'
export const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
export const ARTIFACTS_DIR = new URL('./.artifacts/', import.meta.url).pathname

/** Collects PASS/FAIL lines; `finish()` prints a summary and sets the exit code. */
export function reporter(suite) {
  const results = []
  return {
    check(name, ok, detail = '') {
      results.push(Boolean(ok))
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    },
    async finish(browser) {
      await browser?.close()
      const passed = results.filter(Boolean).length
      console.log(`\n${suite}: ${passed}/${results.length} checks passed`)
      process.exit(passed === results.length ? 0 : 1)
    },
  }
}

/** Headless Chromium with a software-WebGL fallback (no GPU in CI). */
export async function launch() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  })
  const page = await context.newPage()
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))
  return { browser, context, page }
}

/** Fresh dashboard with one Drone Sim widget, sim loop warmed up. */
export async function addDroneWidget(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add widget' }).click()
  // menuitem role: a persisted Drone Sim card's title would also match by text
  await page.getByRole('menuitem', { name: /Drone Sim/ }).click()
  await page.waitForSelector('[data-testid="dronesim-root"]')
  await page.waitForTimeout(600)
}

/** Fresh dashboard with one Avatar Actions widget. */
export async function addAvatarWidget(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page.getByRole('menuitem', { name: /Avatar Actions/ }).click()
  await page.waitForSelector('[data-testid="avatar-actions"]')
}

/** Readers over the HUD/chip data-* attributes (the widget's test contract). */
export function readers(page) {
  const hud = page.locator('[data-testid="dronesim-hud"]')
  const gatesChip = page.locator('[data-testid="dronesim-gates"]')
  const timerChip = page.locator('[data-testid="dronesim-timer"]')
  return {
    hud,
    gatesChip,
    timerChip,
    telemetry: async () => ({
      x: parseFloat(await hud.getAttribute('data-x')),
      z: parseFloat(await hud.getAttribute('data-z')),
      yaw: parseFloat(await hud.getAttribute('data-yaw')),
      alt: parseFloat(await hud.getAttribute('data-alt')),
      speed: parseFloat(await hud.getAttribute('data-speed')),
      wind: parseFloat((await hud.getAttribute('data-wind')) ?? '0'),
      crash: (await hud.getAttribute('data-crash-state')) ?? 'none',
    }),
    lapState: async () => ({
      status: await timerChip.getAttribute('data-lap-status'),
      lapMs: parseInt(await timerChip.getAttribute('data-lap-ms'), 10),
      bestMs: parseInt(await timerChip.getAttribute('data-best-ms'), 10),
      gate: parseInt(await gatesChip.getAttribute('data-gate'), 10),
      laps: parseInt(await gatesChip.getAttribute('data-score'), 10),
    }),
  }
}

/** Open the settings dialog (all mode toggles + tuning live in it now). */
export async function openSettings(page) {
  await page.locator('[data-testid="dronesim-settings"]').click()
  await page.waitForSelector('[data-testid="dronesim-settings-panel"]')
  await page.waitForTimeout(250) // dialog enter transition
}

export async function closeSettings(page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350) // dialog exit transition
}

/** Set a settings switch to the desired state (opens/closes the panel). */
export async function setSwitch(page, testId, desired) {
  await openSettings(page)
  const input = page.locator(`[data-testid="${testId}"] input`)
  if ((await input.isChecked()) !== desired) {
    await input.click()
    await page.waitForTimeout(150)
  }
  await closeSettings(page)
}

/** Mode state attributes are mirrored on the widget root (readable any time,
 * unlike the switches which only exist while the panel is open). */
export async function rootState(page, attr) {
  return await page.locator('[data-testid="dronesim-root"]').getAttribute(attr)
}

export async function stickCenter(page, tid) {
  return await page
    .locator(`[data-testid="${tid}"] > div`)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Twin-stick control rig + closed-loop pilot.
 * - touch(lx, ly, rx, ry): stick deflections in -1..1 via two CDP touches.
 * - flyTo(wp): P-controlled yaw/climb/forward toward a 3D waypoint.
 * - brake(): sticks centred until the drone is nearly stationary — always
 *   brake before precision moves, momentum overshoots otherwise.
 */
export async function createPilot(page, context) {
  const L = await stickCenter(page, 'dronesim-joystick-left')
  const R = await stickCenter(page, 'dronesim-joystick-right')
  const REACH = 40
  const cdp = await context.newCDPSession(page)
  const { telemetry } = readers(page)

  const touch = (lx, ly, rx, ry) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: L.x + lx * REACH, y: L.y - ly * REACH, id: 1 },
        { x: R.x + rx * REACH, y: R.y - ry * REACH, id: 2 },
      ],
    })
  const touchStart = () =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: L.x, y: L.y, id: 1 },
        { x: R.x, y: R.y, id: 2 },
      ],
    })
  const touchEnd = () =>
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  const flyTo = async (wp, { tol = 1.2, maxForward = 1, timeout = 30000 } = {}) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const t = await telemetry()
      const dx = wp.x - t.x
      const dz = wp.z - t.z
      const dxz = Math.hypot(dx, dz)
      const dy = wp.y - t.alt
      if (dxz < tol && Math.abs(dy) < tol) return true
      const err = wrap(Math.atan2(-dx, -dz) - t.yaw)
      const yawInput = clamp(-2.0 * err, -1, 1)
      const climb = clamp(dy * 0.8, -1, 1)
      const fwd = Math.abs(err) < 0.5 ? clamp(dxz * 0.12, 0, maxForward) : 0
      await touch(yawInput, climb, 0, fwd)
      await page.waitForTimeout(140)
    }
    return false
  }

  const brake = async () => {
    for (let i = 0; i < 40; i++) {
      await touch(0, 0, 0, 0)
      if ((await telemetry()).speed < 0.6) return
      await page.waitForTimeout(140)
    }
  }

  return { touch, touchStart, touchEnd, flyTo, brake, sticks: { L, R } }
}

/* ---------------------- Drone Strike (FPV shooter) ---------------------- */

/** Fresh dashboard with one Drone Strike widget, sim loop warmed up. */
export async function addStrikeWidget(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page.getByRole('menuitem', { name: /Drone Strike/ }).click()
  await page.waitForSelector('[data-testid="drone-strike-root"]')
  await page.waitForTimeout(600)
}

/** Readers over the strike HUD/chip data-* attributes (the test contract). */
export function strikeReaders(page) {
  const hud = page.locator('[data-testid="strike-hud"]')
  const scoreChip = page.locator('[data-testid="strike-score"]')
  return {
    hud,
    scoreChip,
    telemetry: async () => ({
      x: parseFloat(await hud.getAttribute('data-x')),
      z: parseFloat(await hud.getAttribute('data-z')),
      yaw: parseFloat(await hud.getAttribute('data-yaw')),
      alt: parseFloat(await hud.getAttribute('data-alt')),
      speed: parseFloat(await hud.getAttribute('data-speed')),
    }),
    combat: async () => ({
      wave: parseInt(await hud.getAttribute('data-wave'), 10),
      waveState: await hud.getAttribute('data-wave-state'),
      score: parseInt(await hud.getAttribute('data-score'), 10),
      shots: parseInt(await hud.getAttribute('data-shots'), 10),
      hits: parseInt(await hud.getAttribute('data-hits'), 10),
      targetsLeft: parseInt(await hud.getAttribute('data-targets-left'), 10),
      lock: parseInt(await hud.getAttribute('data-lock'), 10),
      proj: parseInt(await hud.getAttribute('data-proj'), 10),
    }),
    target: async () => {
      const kind = await hud.getAttribute('data-tgt-kind')
      if (!kind || kind === 'none') return null
      return {
        kind,
        x: parseFloat(await hud.getAttribute('data-tgt-x')),
        y: parseFloat(await hud.getAttribute('data-tgt-y')),
        z: parseFloat(await hud.getAttribute('data-tgt-z')),
      }
    },
  }
}

/** Wait until the wave state machine reports the given state.
 * `data-wave-state` is React-owned and flips at commit time, while the
 * combat telemetry (targets-left, score, …) lags by up to one throttled
 * 150 ms tick — so after the state matches, settle for two ticks before
 * returning, letting callers read a consistent snapshot. */
export async function waitForWaveState(page, state, timeout = 8000) {
  const hud = page.locator('[data-testid="strike-hud"]')
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await hud.getAttribute('data-wave-state')) === state) {
      await page.waitForTimeout(350)
      return true
    }
    await page.waitForTimeout(150)
  }
  return false
}

/** Centre of the fire button's visible circle. */
export async function fireCenter(page) {
  return await stickCenter(page, 'strike-fire')
}

/** Open/close the strike settings dialog. */
export async function openStrikeSettings(page) {
  await page.locator('[data-testid="strike-settings"]').click()
  await page.waitForSelector('[data-testid="strike-settings-panel"]')
  await page.waitForTimeout(250) // dialog enter transition
}

export async function closeStrikeSettings(page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350) // dialog exit transition
}

/** Set a strike settings switch to the desired state (opens/closes panel). */
export async function setStrikeSwitch(page, testId, desired) {
  await openStrikeSettings(page)
  const input = page.locator(`[data-testid="${testId}"] input`)
  if ((await input.isChecked()) !== desired) {
    await input.click()
    await page.waitForTimeout(150)
  }
  await closeStrikeSettings(page)
}

/** Tap a fire button once via CDP touch (independent of the stick rig). */
export async function tapFire(page, context, holdMs = 120, testId = 'strike-fire') {
  const c = await stickCenter(page, testId)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: c.x, y: c.y, id: 9 }],
  })
  await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/**
 * Strike pilot: the drone-sim closed-loop rig retargeted at the strike
 * sticks, plus `engage()` — steer onto the HUD's nearest-target beacon and
 * hold fire (keyboard Space, so it never disturbs the touch ownership of the
 * sticks) until a target drops or the timeout passes.
 */
export async function createStrikePilot(page, context) {
  const L = await stickCenter(page, 'strike-joystick-left')
  const R = await stickCenter(page, 'strike-joystick-right')
  const REACH = 40
  const cdp = await context.newCDPSession(page)
  const { telemetry, combat, target } = strikeReaders(page)

  const touch = (lx, ly, rx, ry) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: L.x + lx * REACH, y: L.y - ly * REACH, id: 1 },
        { x: R.x + rx * REACH, y: R.y - ry * REACH, id: 2 },
      ],
    })
  const touchStart = () =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: L.x, y: L.y, id: 1 },
        { x: R.x, y: R.y, id: 2 },
      ],
    })
  const touchEnd = () =>
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  const flyTo = async (wp, { tol = 1.2, maxForward = 1, timeout = 30000 } = {}) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const t = await telemetry()
      const dx = wp.x - t.x
      const dz = wp.z - t.z
      const dxz = Math.hypot(dx, dz)
      const dy = wp.y - t.alt
      if (dxz < tol && Math.abs(dy) < tol) return true
      const err = wrap(Math.atan2(-dx, -dz) - t.yaw)
      const yawInput = clamp(-2.0 * err, -1, 1)
      const climb = clamp(dy * 0.8, -1, 1)
      const fwd = Math.abs(err) < 0.5 ? clamp(dxz * 0.12, 0, maxForward) : 0
      await touch(yawInput, climb, 0, fwd)
      await page.waitForTimeout(140)
    }
    return false
  }

  const brake = async () => {
    for (let i = 0; i < 40; i++) {
      await touch(0, 0, 0, 0)
      if ((await telemetry()).speed < 0.6) return
      await page.waitForTimeout(140)
    }
  }

  /**
   * Close on the beacon target, hold altitude on it, keep the yaw error
   * inside the lock cone and fire until `data-targets-left` drops.
   */
  const engage = async ({ timeout = 45000, manualFire = true } = {}) => {
    const start = (await combat()).targetsLeft
    if (start === 0) return true
    const deadline = Date.now() + timeout
    let firing = false
    try {
      while (Date.now() < deadline) {
        const c = await combat()
        if (c.targetsLeft < start) return true
        const tgt = await target()
        if (!tgt) return (await combat()).targetsLeft < start
        const t = await telemetry()
        const dx = tgt.x - t.x
        const dz = tgt.z - t.z
        const dxz = Math.hypot(dx, dz)
        const dy = tgt.y - t.alt
        const err = wrap(Math.atan2(-dx, -dz) - t.yaw)
        const yawInput = clamp(-2.0 * err, -1, 1)
        const climb = clamp(dy * 0.8, -1, 1)
        // Close to comfortable gun range, then hover and shoot.
        const fwd = Math.abs(err) < 0.4 && dxz > 30 ? clamp(dxz * 0.08, 0, 0.8) : 0
        await touch(yawInput, climb, 0, fwd)
        const onTarget = Math.abs(err) < 0.1 && Math.abs(dy) < 1.5 && dxz < 60
        if (manualFire) {
          if (onTarget && !firing) {
            await page.keyboard.down('Space')
            firing = true
          } else if (!onTarget && firing) {
            await page.keyboard.up('Space')
            firing = false
          }
        }
        await page.waitForTimeout(140)
      }
      return false
    } finally {
      if (firing) await page.keyboard.up('Space')
    }
  }

  return { touch, touchStart, touchEnd, flyTo, brake, engage, sticks: { L, R } }
}

/* ------------------------- Tank Battle (3D tanks) ------------------------ */

/** Fresh dashboard with one Tank Battle widget, sim loop warmed up. */
export async function addTankWidget(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add widget' }).click()
  await page.getByRole('menuitem', { name: /Tank Battle/ }).click()
  await page.waitForSelector('[data-testid="tank-battle-root"]')
  await page.waitForTimeout(600)
}

/** Readers over the tank HUD/chip data-* attributes (the test contract). */
export function tankReaders(page) {
  const hud = page.locator('[data-testid="tank-hud"]')
  const scoreChip = page.locator('[data-testid="tank-score"]')
  return {
    hud,
    scoreChip,
    telemetry: async () => ({
      x: parseFloat(await hud.getAttribute('data-x')),
      z: parseFloat(await hud.getAttribute('data-z')),
      alt: parseFloat(await hud.getAttribute('data-alt')),
      speed: parseFloat(await hud.getAttribute('data-speed')),
      hullYaw: parseFloat(await hud.getAttribute('data-hull-yaw')),
      turretYaw: parseFloat(await hud.getAttribute('data-turret-yaw')),
      camYaw: parseFloat(await hud.getAttribute('data-cam-yaw')),
      camPitch: parseFloat(await hud.getAttribute('data-cam-pitch')),
      pitch: parseFloat(await hud.getAttribute('data-pitch')),
      roll: parseFloat(await hud.getAttribute('data-roll')),
    }),
    combat: async () => ({
      wave: parseInt(await hud.getAttribute('data-wave'), 10),
      waveState: await hud.getAttribute('data-wave-state'),
      score: parseInt(await hud.getAttribute('data-score'), 10),
      shots: parseInt(await hud.getAttribute('data-shots'), 10),
      hits: parseInt(await hud.getAttribute('data-hits'), 10),
      targetsLeft: parseInt(await hud.getAttribute('data-targets-left'), 10),
      lock: parseInt(await hud.getAttribute('data-lock'), 10),
      sol: await hud.getAttribute('data-sol'),
      reload: parseFloat(await hud.getAttribute('data-reload')),
      hp: parseInt(await hud.getAttribute('data-hp'), 10),
      enemyProj: parseInt((await hud.getAttribute('data-enemy-proj')) ?? '0', 10),
    }),
    target: async () => {
      const kind = await hud.getAttribute('data-tgt-kind')
      if (!kind || kind === 'none') return null
      return {
        kind,
        x: parseFloat(await hud.getAttribute('data-tgt-x')),
        y: parseFloat(await hud.getAttribute('data-tgt-y')),
        z: parseFloat(await hud.getAttribute('data-tgt-z')),
      }
    },
  }
}

/** Wait for the battle state machine, then settle two telemetry ticks
 * (lesson #46 — React-owned state flips ahead of tick-owned counters). */
export async function waitForTankState(page, state, timeout = 10000) {
  const hud = page.locator('[data-testid="tank-hud"]')
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await hud.getAttribute('data-wave-state')) === state) {
      await page.waitForTimeout(350)
      return true
    }
    await page.waitForTimeout(150)
  }
  return false
}

export async function openTankSettings(page) {
  await page.locator('[data-testid="tank-settings"]').click()
  await page.waitForSelector('[data-testid="tank-settings-panel"]')
  await page.waitForTimeout(250)
}

export async function closeTankSettings(page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
}

export async function setTankSwitch(page, testId, desired) {
  await openTankSettings(page)
  const input = page.locator(`[data-testid="${testId}"] input`)
  if ((await input.isChecked()) !== desired) {
    await input.click()
    await page.waitForTimeout(150)
  }
  await closeTankSettings(page)
}

/**
 * Tank pilot: twin-stick CDP rig for the tank controls. Left stick drives
 * the hull, right stick steers the camera aim (the turret chases it).
 * `engage()` closes into terrain line of sight on the HUD's nearest-enemy
 * beacon — over the contour, driving is PART of aiming: spawn usually has
 * no lock until the pilot crests the ridge — then holds fire (keyboard
 * Space) whenever locked with a ballistic solution, until a target drops.
 */
export async function createTankPilot(page, context) {
  const L = await stickCenter(page, 'tank-joystick-left')
  const R = await stickCenter(page, 'tank-joystick-right')
  const REACH = 40
  const cdp = await context.newCDPSession(page)
  const { telemetry, combat, target } = tankReaders(page)
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a))
  const clampV = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  const touch = (lx, ly, rx, ry) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: L.x + lx * REACH, y: L.y - ly * REACH, id: 1 },
        { x: R.x + rx * REACH, y: R.y - ry * REACH, id: 2 },
      ],
    })
  const touchStart = () =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: L.x, y: L.y, id: 1 },
        { x: R.x, y: R.y, id: 2 },
      ],
    })
  const touchEnd = () =>
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  /** Drive the hull to a ground waypoint (x, z). */
  const driveTo = async (wp, { tol = 3, timeout = 45000 } = {}) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const t = await telemetry()
      const dx = wp.x - t.x
      const dz = wp.z - t.z
      const dxz = Math.hypot(dx, dz)
      if (dxz < tol) {
        await touch(0, 0, 0, 0)
        return true
      }
      const err = wrapA(Math.atan2(-dx, -dz) - t.hullYaw)
      const lx = clampV(-1.6 * err, -1, 1)
      const ly = Math.abs(err) < 0.5 ? 0.9 : 0
      await touch(lx, ly, 0, 0)
      await page.waitForTimeout(140)
    }
    return false
  }

  /**
   * Hunt the beacon target: drive into range/LOS, keep the reticle on it,
   * fire on lock+solution. Returns true once `data-targets-left` drops.
   */
  const engage = async ({ timeout = 120000 } = {}) => {
    const start = (await combat()).targetsLeft
    if (start === 0) return true
    const deadline = Date.now() + timeout
    let firing = false
    const setFire = async (on) => {
      if (on === firing) return
      firing = on
      if (on) await page.keyboard.down('Space')
      else await page.keyboard.up('Space')
    }
    try {
      while (Date.now() < deadline) {
        const c = await combat()
        if (c.waveState !== 'active') {
          await setFire(false)
          await touch(0, 0, 0, 0)
          if (c.targetsLeft < start) return true
          await page.waitForTimeout(200)
          continue
        }
        if (c.targetsLeft < start) return true
        const tgt = await target()
        if (!tgt) {
          await touch(0, 0, 0, 0)
          await page.waitForTimeout(200)
          continue
        }
        const t = await telemetry()
        const dx = tgt.x - t.x
        const dz = tgt.z - t.z
        const dxz = Math.hypot(dx, dz)
        const desiredYaw = Math.atan2(-dx, -dz)
        const hullErr = wrapA(desiredYaw - t.hullYaw)
        const wantClose = dxz > 30 || c.lock < 0 || c.sol !== 'ok'
        const lx = wantClose ? clampV(-1.6 * hullErr, -1, 1) : 0
        const ly = wantClose && Math.abs(hullErr) < 0.5 ? 0.85 : 0
        const desiredPitch = Math.atan2(tgt.y - (t.alt + 2.8), dxz)
        const yawErr = wrapA(desiredYaw - t.camYaw)
        const rx = clampV(-1.6 * yawErr, -1, 1)
        const ry = clampV((desiredPitch - t.camPitch) * 2.5, -1, 1)
        await touch(lx, ly, rx, ry)
        await setFire(c.lock >= 0 && c.sol === 'ok')
        await page.waitForTimeout(140)
      }
      return false
    } finally {
      if (firing) await page.keyboard.up('Space')
    }
  }

  return { touch, touchStart, touchEnd, driveTo, engage, sticks: { L, R } }
}
