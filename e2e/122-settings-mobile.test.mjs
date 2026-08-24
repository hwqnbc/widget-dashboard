/**
 * Settings-page mobile-layout suite: on a phone-portrait viewport the two
 * per-seat avatar ToggleButtonGroups (eleven head+name buttons each, up to
 * "Imperium Claw General" wide) must WRAP instead of overflowing the
 * screen — the #51 roster-row defect recurred here when the roster hit
 * six — and the app-bar chrome (brand text + nav labels) must collapse to
 * icons at xs, which the page-level no-horizontal-overflow assertion
 * pins. Asserts every avatar button's box sits inside the viewport width
 * for both seats, the page has no horizontal overflow, and the widest
 * button (previously pushed off-screen) is actually clickable: selecting
 * Imperium for Player 1 round-trips aria-pressed, then the suite swaps
 * back to Toy. Also pins the About build stamp (`yymmdd-hh:mm` text +
 * parseable data-build-iso), the "which deploy am I on?" glance.
 */
import { BASE_URL, launch, reporter } from './helpers.mjs'

// iPhone 12-15 class, portrait CSS viewport.
const PHONE = { width: 390, height: 844 }

const { check, finish } = reporter('settings-mobile')
const { browser, page } = await launch({ viewport: PHONE })

await page.goto(`${BASE_URL}settings`, { waitUntil: 'networkidle' })
const groups = page.locator('.MuiToggleButtonGroup-root')
await page.waitForTimeout(300)
check('both seat picker groups render', (await groups.count()) === 2)

// Every avatar button fully inside the viewport width, both seats.
const buttons = page.locator('.MuiToggleButtonGroup-root .MuiToggleButton-root')
const n = await buttons.count()
check('twenty-two avatar buttons (11 per seat)', n === 22)
let allInside = true
let widest = 0
for (let i = 0; i < n; i++) {
  const r = await buttons.nth(i).evaluate((el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left, right: b.right, w: b.width }
  })
  widest = Math.max(widest, r.w)
  if (r.x < 0 || r.right > PHONE.width + 1) allInside = false
}
check('every avatar button fits the phone width', allInside)
check('buttons are real-sized, not collapsed', widest > 80)

// Build stamp: local-time yymmdd-hh:mm text and a parseable ISO attribute.
const stamp = page.locator('[data-testid="build-stamp"]')
check('build stamp renders', (await stamp.count()) === 1)
check(
  'build stamp text is Build yymmdd-hh:mm',
  /^Build \d{6}-\d{2}:\d{2}$/.test((await stamp.textContent()) ?? ''),
)
const buildIso = await stamp.getAttribute('data-build-iso')
check(
  'build stamp carries a valid ISO timestamp',
  buildIso != null && !Number.isNaN(new Date(buildIso).getTime()),
)

// No horizontal page overflow anywhere on the settings page.
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
)
check('no horizontal page overflow', overflow <= 0)

// The widest button works: select Imperium for Player 1 (first group).
const p1Imperium = groups
  .nth(0)
  .locator('button')
  .filter({ hasText: /^Imperium Claw General$/ })
await p1Imperium.click()
await page.waitForTimeout(300)
check(
  'widest button selects on tap',
  (await p1Imperium.getAttribute('aria-pressed')) === 'true',
)

// Reload: the choice persisted and the layout still fits.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
check(
  'selection persists across reload',
  (await groups
    .nth(0)
    .locator('button')
    .filter({ hasText: /^Imperium Claw General$/ })
    .getAttribute('aria-pressed')) === 'true',
)

// Swap Player 1 back to Toy (leave persisted state as the default).
await groups.nth(0).locator('button').filter({ hasText: /^Toy$/ }).click()
await page.waitForTimeout(300)

await finish(browser)
