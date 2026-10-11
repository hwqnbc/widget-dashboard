/**
 * Wing Flyer missions UI suite (browser, keyboard): the Round 1b start
 * screen and scorecard through the real widget — the menu on open (four
 * game-mode tiles, Landing live and the rest "Soon"; Free flight, the five
 * missions with mission 1 open and 2–5 locked, Touch and go with its best
 * chain), picking First flight (root `data-mission`, HUD `data-mode`, the
 * mission checklist), flying the whole mission with the Trainer — hand
 * launch, fly out, steer onto the hoop line, hands off → the slope hold
 * lands it — the scorecard (`data-outcome`/`data-score`/`data-stars`/
 * `data-badge`), Next unlocking mission 2, the star + badge in the menu
 * surviving a reload (records slice), Clear mission stars (confirmed)
 * locking it again, Unlock all missions opening every row, Touch and go's
 * chain step, Crosswind's wind on the HUD, and Engine out cutting the
 * motor only after the fly-out above 35 m (`data-motor-out`, throttle 0,
 * the "Motor out!" step).
 */
import { addWingWidget, launch, reporter } from './helpers.mjs'
import { CUT_AGL } from './.bundle/missions.js'

const { check, finish } = reporter('wing-missions-ui')
const { browser, page } = await launch()
await addWingWidget(page, 'free')
const root = page.locator('[data-testid="wingflyer-root"]')
const hud = page.locator('[data-testid="wingflyer-hud"]')
const menu = page.locator('[data-testid="wingflyer-menu"]')
const obj = page.locator('[data-testid="wingflyer-objective"]')
const card = page.locator('[data-testid="wingflyer-scorecard"]')
const tel = async (a) => Number(await hud.getAttribute(a))
const str = async (a) => hud.getAttribute(a)
const waitFor = async (pred, ms = 10000) => {
  for (let t = 0; t < ms; t += 150) {
    if (await pred()) return true
    await page.waitForTimeout(150)
  }
  return false
}
const locked = (m) => page.locator(`[data-testid="wingflyer-mode-${m}"]`).getAttribute('data-locked')
/** Close the settings dialog (Escape) and wait until it is really gone. */
const closeSettings = async () => {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    if ((await page.locator('[data-testid="wingflyer-settings-dialog"]').count()) === 0) return
  }
}

// --- the start screen ------------------------------------------------------------
check('picking Free flight closed the menu and plays free', (await root.getAttribute('data-menu')) === 'closed' && (await root.getAttribute('data-mission')) === 'free')
await page.click('[data-testid="wingflyer-menu-open"]')
check('the list button reopens the start screen', await waitFor(async () => (await root.getAttribute('data-menu')) === 'open', 2000) && (await menu.isVisible()))
check('game modes: Landing live, Rings / Soaring / Combat "Soon"', (await page.locator('[data-testid="wingflyer-game-landing"]').getAttribute('data-ready')) === 'true' && (await Promise.all(['rings', 'soaring', 'combat'].map(async (g) => (await page.locator(`[data-testid="wingflyer-game-${g}"]`).getAttribute('data-ready')) === 'false' && /Soon/.test((await page.locator(`[data-testid="wingflyer-game-${g}"]`).textContent()) ?? '')))).every(Boolean))
check('rows: Free flight, five missions, Touch and go', (await Promise.all(['free', 'first', 'circuit', 'short', 'crosswind', 'engineout', 'touchgo'].map((m) => page.locator(`[data-testid="wingflyer-mode-${m}"]`).count()))).every((n) => n === 1))
check('mission 1 open, 2–5 locked (in-order unlock)', (await locked('first')) === 'false' && (await locked('circuit')) === 'true' && (await locked('engineout')) === 'true')
check('Touch and go shows best ×0', /×0/.test((await page.locator('[data-testid="wingflyer-best-chain"]').textContent()) ?? ''))
check('no badge yet', (await page.locator('[data-testid="wingflyer-badge"]').count()) === 0)
await page.click('[data-testid="wingflyer-mode-first"]')
check('pick First flight → menu closes, root + HUD carry the mode', await waitFor(async () => (await root.getAttribute('data-mission')) === 'first' && (await str('data-mode')) === 'first', 3000) && (await root.getAttribute('data-menu')) === 'closed')
check('the checklist is the mission\'s: take off ▸ fly out ▸ land', (await obj.getAttribute('data-step')) === 'takeoff' && (await page.locator('[data-testid="wingflyer-obj-land"]').count()) === 1)
check('Launch is up (in the hand), no scorecard yet', (await page.locator('[data-testid="wingflyer-launch"]').isVisible()) && (await card.count()) === 0)

// --- fly mission 1: launch, fly out, steer onto the line, hands off -------------------
await page.click('[data-testid="wingflyer-launch"]')
check('fly out → the land step', await waitFor(async () => (await obj.getAttribute('data-step')) === 'land', 45000), `max ${await str('data-max-dist')} m`)
let held = null
const hold = async (want) => {
  if (want === held) return
  if (held) await page.keyboard.up(held)
  if (want) await page.keyboard.down(want)
  held = want
}
let lined = false
for (let t = 0; t < 120000 && !lined; t += 150) {
  const rel = await tel('data-home-bearing')
  await hold(Math.abs(rel) > 12 ? (rel > 0 ? 'ArrowRight' : 'ArrowLeft') : null)
  await page.waitForTimeout(150)
  lined = (await str('data-lined-up')) === 'true'
  if ((await tel('data-crashes')) > 0) break
}
await hold(null)
check('steered onto the approach line (lined up)', lined, `end ${await str('data-approach-end')}, crashes ${await str('data-crashes')}`)
const resolved = await waitFor(async () => (await card.count()) > 0, 90000)
check('hands off → the Trainer lands it and the scorecard comes up', resolved, `landings ${await str('data-landings')}, crashes ${await str('data-crashes')}, outcome ${await str('data-mission-outcome')}`)
const outcome = await card.getAttribute('data-outcome')
const score = Number(await card.getAttribute('data-score'))
const stars = Number(await card.getAttribute('data-stars'))
check('mission 1 done on the runway with a score and at least one star', outcome === 'done' && score >= 40 && stars >= 1, `${outcome} score ${score} ★${stars} fail ${await card.getAttribute('data-fail')}`)
check('badge = Trainer (the level flown)', (await card.getAttribute('data-badge')) === 'trainer')
check('the scorecard shows its parts (spot / line / smoothness / sink)', /spot \d+/.test((await page.locator('[data-testid="wingflyer-scorecard-parts"]').textContent()) ?? ''))
check('Next is offered (mission 2 just unlocked), Retry and Menu too', (await page.locator('[data-testid="wingflyer-next"]').isVisible()) && (await page.locator('[data-testid="wingflyer-retry"]').isVisible()) && (await page.locator('[data-testid="wingflyer-menu-button"]').isVisible()))

// --- records: the menu, a reload, clear, unlock all ---------------------------------
await page.click('[data-testid="wingflyer-menu-button"]')
await waitFor(async () => (await root.getAttribute('data-menu')) === 'open', 2000)
check('menu: mission 1 starred with a T badge, mission 2 unlocked', (await page.locator('[data-testid="wingflyer-mode-first"] [data-testid="wingflyer-badge"]').getAttribute('data-badge')) === 'trainer' && (await locked('circuit')) === 'false' && (await locked('short')) === 'true')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="wingflyer-menu"]')
check('after a reload the start screen is back with the star, badge and unlock (records slice)', (await page.locator('[data-testid="wingflyer-mode-first"] [data-testid="wingflyer-badge"]').count()) === 1 && (await locked('circuit')) === 'false')
check('the persisted mode is highlighted / kept', (await root.getAttribute('data-mission')) === 'first')
await page.click('[data-testid="wingflyer-mode-first"]')
await page.click('[data-testid="wingflyer-settings"]')
await page.click('[data-testid="wingflyer-reset-records"]')
await page.getByRole('button', { name: 'Clear stars' }).click()
await page.waitForTimeout(300)
await closeSettings()
await page.click('[data-testid="wingflyer-menu-open"]')
await waitFor(async () => (await root.getAttribute('data-menu')) === 'open', 2000)
check('Clear mission stars (confirmed) → no badge, mission 2 locked again', (await page.locator('[data-testid="wingflyer-badge"]').count()) === 0 && (await locked('circuit')) === 'true')
await page.click('[data-testid="wingflyer-mode-first"]')
await page.click('[data-testid="wingflyer-settings"]')
await page.click('[data-testid="wingflyer-unlock-all"]')
await closeSettings()
check('Unlock all missions lands on the root', (await root.getAttribute('data-unlock-all')) === 'on')
await page.click('[data-testid="wingflyer-menu-open"]')
await waitFor(async () => (await root.getAttribute('data-menu')) === 'open', 2000)
check('…and every mission row is open', (await Promise.all(['circuit', 'short', 'crosswind', 'engineout'].map(locked))).every((v) => v === 'false'))

// --- the other modes' contracts --------------------------------------------------
await page.click('[data-testid="wingflyer-mode-touchgo"]')
check('Touch and go: the chain step in the checklist', await waitFor(async () => (await str('data-mode')) === 'touchgo', 3000) && (await page.locator('[data-testid="wingflyer-obj-chain"]').count()) === 1)
await page.click('[data-testid="wingflyer-menu-open"]')
await page.click('[data-testid="wingflyer-mode-crosswind"]')
check('Crosswind: the HUD reports the wind', await waitFor(async () => (await str('data-wind')) === '0.0,3.0', 3000))
await page.click('[data-testid="wingflyer-menu-open"]')
await page.click('[data-testid="wingflyer-mode-short"]')
check('Short field selected (stop lines painted in the scene)', await waitFor(async () => (await str('data-mode')) === 'short' && (await str('data-wind')) === 'calm', 3000))

// --- engine out: climb, fly out, the cut ----------------------------------------
await page.click('[data-testid="wingflyer-menu-open"]')
await page.click('[data-testid="wingflyer-mode-engineout"]')
await waitFor(async () => (await str('data-mode')) === 'engineout', 3000)
check('Engine out: the climb step is in the checklist', (await page.locator('[data-testid="wingflyer-obj-climb"]').count()) === 1 && (await str('data-motor-out')) === 'false')
await page.click('[data-testid="wingflyer-launch"]')
await waitFor(async () => (await str('data-assist-mode')) === 'fly', 20000)
// ↓ = pull back = climb (RC convention). Climb above the cut height early:
// the motor must stay on until the fly-out is done.
await page.keyboard.down('ArrowDown')
const high = await waitFor(async () => (await tel('data-agl')) >= CUT_AGL + 3, 40000)
await page.keyboard.up('ArrowDown')
check(`above ${CUT_AGL} m before the fly-out: motor still on`, high && (await str('data-motor-out')) === 'false' && (await tel('data-throttle')) > 0, `agl ${await str('data-agl')}, flyout step ${await page.locator('[data-testid="wingflyer-obj-flyout"]').getAttribute('data-done')}`)
const cut = await waitFor(async () => (await str('data-motor-out')) === 'true', 60000)
check('…fly-out done and high → the motor cuts', cut && (await page.locator('[data-testid="wingflyer-obj-flyout"]').getAttribute('data-done')) === 'true', `motor-out ${await str('data-motor-out')}, max ${await str('data-max-dist')} m`)
check('dead stick: throttle 0, "Motor out!" ticked on the checklist', await waitFor(async () => (await tel('data-throttle')) === 0, 3000) && (await page.locator('[data-testid="wingflyer-obj-climb"]').getAttribute('data-done')) === 'true' && /Motor out/.test((await page.locator('[data-testid="wingflyer-obj-climb"]').textContent()) ?? ''))
check('no crash through all of it', (await tel('data-crashes')) === 0)

await page.screenshot({ path: new URL('./.artifacts/178-wing-missions-ui.png', import.meta.url).pathname })
await finish(browser)
