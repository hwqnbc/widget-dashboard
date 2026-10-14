/**
 * Puppy Rescue — pick your dog, live, through the `data-*` contract:
 * `data-dog` on the root, the ⚙ menu's `puppy-dog` row of
 * `puppy-dog-<id>` coat chips (`aria-pressed` on the current one) — plus
 * the theme-following stick knob.
 *
 * A fresh card is Ginger (the original dog). Every chip switches the dog
 * (and its pressed chip); a switch mid-run doesn't restart the level. The
 * movement stick's knob takes each theme's `knob` accent. The dog survives
 * a reload, and a card saved before dogs existed (no `dog` field) opens as
 * Ginger.
 */
import { addPuppyWidget, launch, puppyMenu, reporter } from './helpers.mjs'

const { check, finish } = reporter('puppy-dogs')
const { browser, page } = await launch({ viewport: { width: 1000, height: 1000 } })

const DOGS = ['ginger', 'golden', 'dalmatian', 'husky', 'blacktan', 'chocolate']
const KNOBS = { sunshine: '#ffd54a', toybox: '#8f7cf7', ocean: '#5aa9ff', night: '#8b89d6', sandbox: '#e2c08a' }
const ds = (k) => page.locator('[data-testid="puppy-root"]').evaluate((el, key) => el.dataset[key] ?? '', k)
/** The stick knob's colour as #rrggbb (it's drawn at 0.9 alpha). */
const knob = () =>
  page.locator('[data-testid="puppy-stick-strip"]').evaluate((strip) => {
    // The knob is the innermost round child of the stick's base.
    const round = [...strip.querySelectorAll('div')].filter((d) => getComputedStyle(d).borderRadius === '50%' && d.children.length === 0)
    const knobEl = round.find((d) => d.getBoundingClientRect().width < 40)
    const m = getComputedStyle(knobEl).backgroundColor.match(/[\d.]+/g).map(Number)
    return '#' + m.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')
  })
const pressed = (id) => page.locator(`[data-testid="puppy-dog-${id}"]`).getAttribute('aria-pressed')

await addPuppyWidget(page)

// ------------------------------------------------------------ 1. default
{
  check('a fresh card has the Ginger dog', (await ds('dog')) === 'ginger')
  await page.locator('[data-testid="puppy-settings"]').click()
  check('the ⚙ menu offers six dog chips', (await page.locator('[data-testid^="puppy-dog-"]').count()) === 6)
  check('…Ginger pressed', (await pressed('ginger')) === 'true')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// ------------------------------------------------- 2. every chip applies
for (const d of DOGS) {
  await puppyMenu(page, `puppy-dog-${d}`)
  await page.locator('[data-testid="puppy-settings"]').click()
  const p = await pressed(d)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check(`${d}: data-dog follows, its chip pressed`, (await ds('dog')) === d && p === 'true')
}

// -------------------------------------------- 3. the knob follows the theme
for (const [t, k] of Object.entries(KNOBS)) {
  await puppyMenu(page, `puppy-theme-${t}`)
  check(`${t}: the stick knob takes the theme's accent`, (await knob()) === k, await knob())
}

// ---------------------------------------------- 4. mid-run: no restart
{
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(250)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(150) // let the stop reach the 50 ms telemetry
  const run0 = await ds('run')
  const y0 = parseFloat(await ds('y'))
  check('(a run is under way)', (await ds('status')) === 'play')
  await puppyMenu(page, 'puppy-dog-dalmatian')
  check('switching dog mid-run keeps the run going',
    (await ds('dog')) === 'dalmatian' && (await ds('status')) === 'play' && (await ds('run')) === run0 && Math.abs(parseFloat(await ds('y')) - y0) < 1e-3,
    `${await ds('dog')} ${await ds('status')} run ${run0}→${await ds('run')} y ${y0}→${await ds('y')}`)
}

// ------------------------------------------------------- 5. persistence
{
  await page.waitForTimeout(1000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="puppy-root"]')
  check('the dog survives a reload', (await ds('dog')) === 'dalmatian')
  await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem('persist:testsite'))
    const w = JSON.parse(root.widgets)
    for (const inst of w.instances) if (inst.type === 'puppyRescue') delete inst.data.dog
    root.widgets = JSON.stringify(w)
    localStorage.setItem('persist:testsite', JSON.stringify(root))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="puppy-root"]')
  check('a pre-dogs card (no dog saved) opens as Ginger', (await ds('dog')) === 'ginger')
}

await finish(browser)
