/**
 * Weather suite: storm mode brings gusting wind (the hands-off drone drifts;
 * a clear-mode drone holds station), a live HUD wind readout, the dusk
 * visual, and persistence — and clearing the weather stops the drift.
 */
import { ARTIFACTS_DIR, addDroneWidget, launch, readers, reporter } from './helpers.mjs'

const { check, finish } = reporter('weather')
const { browser, page } = await launch()
await addDroneWidget(page)
const { hud, telemetry } = readers(page)
const toggle = page.locator('[data-testid="dronesim-weather-toggle"]')
// Plain read — for storm phases, where the drone is legitimately drifting.
const posNow = async () => {
  const t = await telemetry()
  return { x: t.x, z: t.z }
}
// Stable position read — for clear phases (station-hold expected): two
// consecutive samples must agree, so a read can't race a telemetry write;
// retries (loudly) if it hits the exact-spawn signature seen in one flaky
// run while the previous sample sat elsewhere.
const pos = async (prev) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const a = await telemetry()
    await page.waitForTimeout(200)
    const b = await telemetry()
    const stable = Math.hypot(a.x - b.x, a.z - b.z) < 0.02
    const spawnAnomaly =
      prev && b.x === 0 && b.z === 18 && Math.hypot(prev.x, prev.z - 18) > 0.2
    if (stable && !spawnAnomaly) return { x: b.x, z: b.z }
    console.log(
      `  (pos read retry ${attempt + 1}: stable=${stable} spawnAnomaly=${Boolean(spawnAnomaly)} a=${JSON.stringify(a)} b=${JSON.stringify(b)})`,
    )
  }
  const t = await telemetry()
  return { x: t.x, z: t.z }
}

check('starts clear', (await toggle.getAttribute('data-weather')) === 'clear')
check('no wind readout when clear', (await telemetry()).wind === 0)

const c0 = await pos()
await page.waitForTimeout(2500)
const c1 = await pos()
check('clear: drone holds station hands-off', Math.hypot(c1.x - c0.x, c1.z - c0.z) < 0.05, JSON.stringify({ c0, c1 }))

await toggle.click()
await page.waitForTimeout(600)
check('toggle switches to storm', (await toggle.getAttribute('data-weather')) === 'storm')
const wind = (await telemetry()).wind
check('HUD reports live wind', wind > 0.2 && wind <= 4.6, `wind=${wind}`)
check('HUD text includes WIND', (await hud.textContent()).includes('WIND'))

const s0 = await posNow()
await page.waitForTimeout(3000)
const s1 = await posNow()
const drift = Math.hypot(s1.x - s0.x, s1.z - s0.z)
check('storm: drone drifts hands-off', drift > 1.0, `drift=${drift.toFixed(2)} over 3s`)

await page.waitForTimeout(1000)
await page.screenshot({ path: `${ARTIFACTS_DIR}weather-storm.png` })

await page.waitForTimeout(1600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-weather-toggle"]')
check(
  'weather persists across reload',
  (await page.locator('[data-testid="dronesim-weather-toggle"]').getAttribute('data-weather')) === 'storm',
)

await page.locator('[data-testid="dronesim-weather-toggle"]').click()
await page.waitForTimeout(800)
const b0 = await pos()
await page.waitForTimeout(2500)
const b1 = await pos(b0)
check('clear again: drift stops', Math.hypot(b1.x - b0.x, b1.z - b0.z) < 0.05, JSON.stringify({ b0, b1 }))

await finish(browser)
