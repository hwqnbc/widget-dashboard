/**
 * Wing Flyer auto-pause suite (browser): a plane can't stop, so leaving it
 * must pause it (docs/wing-flyer.md §11). Window blur pauses an airborne
 * flight and FREEZES it (position unchanged over a second), the overlay
 * shows, tap → 3-2-1 → it flies on; a hidden tab (visibilitychange) and an
 * open settings dialog pause too; in preflight nothing pauses (there is
 * nothing to protect). The scrolled-away (IntersectionObserver) path shares
 * the same `pause()` and is not driven here.
 */
import { addWingWidget, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('wing-pause')
const { browser, page } = await launch()
await addWingWidget(page)
const root = page.locator('[data-testid="wingflyer-root"]')
const hud = page.locator('[data-testid="wingflyer-hud"]')
const tel = async (a) => Number(await hud.getAttribute(a))
const paused = async () => (await root.getAttribute('data-paused')) === 'true'
const waitFor = async (pred, ms = 8000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await pred()) return true
    await page.waitForTimeout(200)
  }
  return false
}
const resume = async () => {
  await page.click('[data-testid="wingflyer-paused"]')
  return waitFor(async () => !(await paused()), 6000)
}

// Preflight: nothing to protect → no pause.
await page.evaluate(() => window.dispatchEvent(new Event('blur')))
await page.waitForTimeout(400)
check('preflight: blur does not pause', !(await paused()))

await page.click('[data-testid="wingflyer-launch"]')
await waitFor(async () => (await tel('data-agl')) > 6, 15000)

// --- window blur ------------------------------------------------------------
await page.evaluate(() => window.dispatchEvent(new Event('blur')))
check('airborne: blur pauses', await waitFor(paused, 2000))
check('pause overlay shown', await page.locator('[data-testid="wingflyer-paused"]').isVisible())
await page.waitForTimeout(400) // let the last pre-pause HUD tick land
const x0 = await tel('data-x')
const y0 = await tel('data-alt')
await page.waitForTimeout(1200)
check('paused flight is frozen', Math.abs((await tel('data-x')) - x0) < 0.01 && Math.abs((await tel('data-alt')) - y0) < 0.01, `Δx ${((await tel('data-x')) - x0).toFixed(3)}`)
check('tap → 3-2-1 → flying again', await resume())
check('…and moving again', await waitFor(async () => Math.abs((await tel('data-x')) - x0) > 0.5, 4000))

// --- hidden tab ---------------------------------------------------------------
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
  document.dispatchEvent(new Event('visibilitychange'))
})
check('hidden tab pauses', await waitFor(paused, 2000))
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
})
check('resume after the tab returns', await resume())

// --- a dialog -------------------------------------------------------------------
await page.click('[data-testid="wingflyer-settings"]')
check('opening settings pauses', await waitFor(paused, 2000))
check('overlay waits behind the dialog', !(await page.locator('[data-testid="wingflyer-paused"]').isVisible()))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('closing settings shows the resume overlay', await page.locator('[data-testid="wingflyer-paused"]').isVisible())
check('resume after settings', await resume())
check('no crash through all the pauses', (await tel('data-crashes')) === 0)

await finish(browser)
