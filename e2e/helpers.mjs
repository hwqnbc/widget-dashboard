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
  await page.getByText('Drone Sim').click()
  await page.waitForSelector('[data-testid="dronesim-root"]')
  await page.waitForTimeout(600)
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
