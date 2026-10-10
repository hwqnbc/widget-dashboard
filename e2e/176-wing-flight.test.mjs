/**
 * Wing Flyer live flight suite (browser): a whole Trainer circuit through the
 * real UI and keyboard — hand launch, climb-out, a dive with ↑ held (the
 * Trainer's auto-flare caps the sink near the ground even with the stick
 * held), let go low → it settles, touches down as a LANDING (soft sink),
 * rolls out and stops (phase `landed`, "Landed!" banner, start buttons
 * back); then in Normal assist a powered dive into the ground CRASHES and
 * respawns in the pilot's hand. Sound effects are counted (`data-sfx-*`)
 * whether or not audio plays: launch, touchdown, crash, panic.
 */
import { addWingWidget, launch, reporter } from './helpers.mjs'
import { FLY_OUT_DIST } from './.bundle/objective.js'

const { check, finish } = reporter('wing-flight')
const { browser, page } = await launch()
await addWingWidget(page)
const root = page.locator('[data-testid="wingflyer-root"]')
const hud = page.locator('[data-testid="wingflyer-hud"]')
const tel = async (a) => Number(await hud.getAttribute(a))
const str = async (a) => hud.getAttribute(a)
const waitFor = async (pred, ms = 10000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await pred()) return true
    await page.waitForTimeout(150)
  }
  return false
}

// --- Trainer: launch, climb, fly out, dive, settle, land ---------------------------
const obj = page.locator('[data-testid="wingflyer-objective"]')
check('objective chip starts on "take off"', (await obj.getAttribute('data-step')) === 'takeoff')
await page.click('[data-testid="wingflyer-launch"]')
check('launch sfx counted', (await waitFor(async () => (await tel('data-sfx-launch')) === 1, 2000)))
check('take-off ticks the objective', await waitFor(async () => (await obj.getAttribute('data-step')) === 'flyout', 3000))
check('climbs out', await waitFor(async () => (await str('data-assist-mode')) === 'fly' && (await tel('data-agl')) > 10, 20000))
// The launch heads east along the runway; flying straight on passes 150 m
// from the runway centre. Then turn back (→ held) until inside 100 m.
check(`flying straight out passes ${FLY_OUT_DIST} m → "land"`, await waitFor(async () => (await obj.getAttribute('data-step')) === 'land', 40000), `max ${await str('data-max-dist')} m`)
// Steer home: bank toward the runway until the nose is within 25° of it,
// then fly straight (a held 45° bank just circles 17 m across).
let back = false
let held = null
for (let t = 0; t < 60000 && !back; t += 150) {
  const rel = await tel('data-home-bearing')
  const want = Math.abs(rel) > 25 ? (rel > 0 ? 'ArrowRight' : 'ArrowLeft') : null
  if (want !== held) {
    if (held) await page.keyboard.up(held)
    if (want) await page.keyboard.down(want)
    held = want
  }
  await page.waitForTimeout(150)
  back = (await str('data-objective-back')) === 'true'
}
if (held) await page.keyboard.up(held)
check('steering home inside 100 m → back', back, `home ${await str('data-home-dist')} m, crashes ${await str('data-crashes')}`)
await page.keyboard.down('ArrowUp')
const low = await waitFor(async () => (await tel('data-agl')) < 4, 20000)
await page.keyboard.up('ArrowUp')
check('↑ dives toward the ground without crashing (auto-flare)', low && (await tel('data-crashes')) === 0)
const touched = await waitFor(async () => (await tel('data-landings')) >= 1 || (await tel('data-crashes')) > 0, 20000)
check('let go low → touchdown is a LANDING', touched && (await str('data-touchdown')) === 'landed', `${await str('data-touchdown')} at ${await str('data-touch-sink')} m/s`)
check('soft touchdown (< 1.2 m/s sink)', (await tel('data-touch-sink')) < 1.2, `${await str('data-touch-sink')} m/s`)
check('touchdown sfx counted', (await tel('data-sfx-touchdown')) >= 1)
check('rolls out and stops → phase landed', await waitFor(async () => (await root.getAttribute('data-phase')) === 'landed', 25000))
check('landing after the fly-out completes the goal', (await obj.getAttribute('data-step')) === 'done' && (await str('data-objective-done')) === '1')
check('banner says the goal is complete + start buttons', (await page.locator('[data-testid="wingflyer-landed-banner"]').getAttribute('data-objective-complete')) === 'true' && (await page.locator('[data-testid="wingflyer-hand-launch"]').isVisible()) && (await page.locator('[data-testid="wingflyer-runway"]').isVisible()))
check('chip shows the ×1 completed count', (await page.locator('[data-testid="wingflyer-obj-count"]').textContent()) === '×1')
check('no crash on the way', (await tel('data-crashes')) === 0)

// --- Normal: a powered dive crashes and respawns in the hand ---------------------------
await page.click('[data-testid="wingflyer-settings"]')
await page.click('[data-testid="wingflyer-assist-normal"]')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.click('[data-testid="wingflyer-hand-launch"]')
await waitFor(async () => (await root.getAttribute('data-phase')) === 'preflight', 3000)
await page.click('[data-testid="wingflyer-launch"]')
await page.keyboard.down('KeyW') // throttle up (manual in Normal)
await page.waitForTimeout(1200)
await page.keyboard.up('KeyW')
await waitFor(async () => (await str('data-assist-mode')) === 'fly' && (await tel('data-agl')) > 10, 20000)
await page.keyboard.press('Space')
check('panic sfx counted', await waitFor(async () => (await tel('data-sfx-panic')) >= 1, 2000))
await waitFor(async () => (await str('data-assist-mode')) === 'fly', 6000)
await page.keyboard.down('ArrowUp')
const crashed = await waitFor(async () => (await tel('data-crashes')) >= 1, 20000)
await page.keyboard.up('ArrowUp')
check('Normal: a powered dive into the ground crashes', crashed)
check('crash sfx counted', (await tel('data-sfx-crash')) >= 1)
check('…and respawns in the pilot\'s hand', await waitFor(async () => (await root.getAttribute('data-phase')) === 'preflight', 5000))

await page.screenshot({ path: new URL('./.artifacts/176-wing-flight.png', import.meta.url).pathname })
await finish(browser)
