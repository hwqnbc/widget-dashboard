/**
 * Tank Battle help-overlay suite: the first-run "How to play" dialog
 * auto-opens on a fresh widget (the aiming model is undiscoverable without
 * it), dismissing persists `helpSeen` so it never auto-opens again, the ?
 * button reopens it on demand, and the battle state machine runs on
 * regardless. Uses the raw add-widget flow (NOT addTankWidget, which
 * dismisses the overlay for every other suite).
 */
import { BASE_URL, launch, reporter, waitForTankState } from './helpers.mjs'

const { check, finish } = reporter('tank-help')
const { browser, page } = await launch()

// Raw add flow so the auto-open is observable.
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Add widget' }).click()
await page.getByRole('menuitem', { name: /Tank Battle/ }).click()
await page.waitForSelector('[data-testid="tank-battle-root"]')
await page.waitForTimeout(600)

const root = page.locator('[data-testid="tank-battle-root"]')
const panel = page.locator('[data-testid="tank-help-panel"]')

check('help auto-opens on first use', await panel.isVisible())
check('help-seen off before dismissal', (await root.getAttribute('data-help-seen')) === 'off')

// Dismiss → persisted seen flag, panel gone.
await page.locator('[data-testid="tank-help-close"]').click()
await page.waitForTimeout(400)
check('got-it closes the overlay', !(await panel.isVisible()))
check('help-seen flips on', (await root.getAttribute('data-help-seen')) === 'on')

// The battle was never blocked by onboarding.
check('battle reaches active', await waitForTankState(page, 'active'))

// Reload: no auto-open, flag persisted.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="tank-battle-root"]')
await page.waitForTimeout(800)
check('no auto-open after reload', !(await panel.isVisible()))
check('help-seen persists', (await root.getAttribute('data-help-seen')) === 'on')

// The ? button reopens on demand; Escape closes; the flag stays on.
await page.locator('[data-testid="tank-help"]').click()
await page.waitForSelector('[data-testid="tank-help-panel"]')
await page.waitForTimeout(250)
check('? button reopens help', await panel.isVisible())
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('escape closes help', !(await panel.isVisible()))
check('flag unchanged after reopen', (await root.getAttribute('data-help-seen')) === 'on')

await finish(browser)
