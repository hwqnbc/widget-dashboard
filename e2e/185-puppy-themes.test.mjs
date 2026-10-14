/**
 * Puppy Rescue — colour themes live, through the `data-*` contract:
 * `data-theme` on the root, the ⚙ menu's `puppy-theme` row of
 * `puppy-theme-<id>` swatch chips (`aria-pressed` on the current one).
 *
 * A fresh card is Sunshine (the default): the stage background is its
 * surround and the control strip its deep shade. Every chip recolours the
 * stage and the strip to that theme's colours, and the canvas itself
 * clears to the surround (sampled from a corner pixel). Switching mid-run
 * does NOT restart the level. The choice survives a reload; a card saved
 * before themes existed (no `theme` field) opens as Sunshine.
 */
import { addPuppyWidget, launch, puppyMenu, reporter } from './helpers.mjs'

const { check, finish } = reporter('puppy-themes')
const { browser, page } = await launch({ viewport: { width: 1000, height: 1000 } })

const THEMES = {
  sunshine: { surround: '#ffe066', strip: '#22357f' },
  toybox: { surround: '#48d3f2', strip: '#2a2554' },
  ocean: { surround: '#9be7ff', strip: '#173a73' },
  night: { surround: '#141a33', strip: '#0d1126' },
  sandbox: { surround: '#87ceeb', strip: '#5c4322' },
}
const hex = (rgb) => {
  const m = rgb.match(/\d+/g)?.map(Number) ?? []
  return '#' + m.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')
}
const bg = async (testId) => hex(await page.locator(`[data-testid="${testId}"]`).evaluate((el) => getComputedStyle(el).backgroundColor))
const ds = (k) => page.locator('[data-testid="puppy-root"]').evaluate((el, key) => el.dataset[key] ?? '', k)
/** The canvas's top-left pixel — outside the maze, so the clear colour.
 * Read from a real screenshot (WebGL doesn't keep its buffer for readback). */
const cornerPixel = async () => {
  const box = await page.locator('[data-testid="puppy-3d"] canvas').boundingBox()
  const png = await page.screenshot({ clip: { x: box.x + 4, y: box.y + 4, width: 2, height: 2 } })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, 1, 1).data
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')
  }, png.toString('base64'))
}
const near = (a, b, tol = 10) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return x.every((v, i) => Math.abs(v - y[i]) <= tol)
}

await addPuppyWidget(page)

// ------------------------------------------------------------ 1. default
{
  check('a fresh card is Sunshine', (await ds('theme')) === 'sunshine')
  check('…stage surround + strip in Sunshine colours', (await bg('puppy-stage')) === THEMES.sunshine.surround && (await bg('puppy-stick-strip')) === THEMES.sunshine.strip)
  check('…and the canvas clears to the surround', near(await cornerPixel(), THEMES.sunshine.surround), await cornerPixel())
  await page.locator('[data-testid="puppy-settings"]').click()
  const chips = page.locator('[data-testid^="puppy-theme-"]')
  check('the ⚙ menu offers five theme chips', (await chips.count()) === 5)
  check('…Sunshine pressed', (await page.locator('[data-testid="puppy-theme-sunshine"]').getAttribute('aria-pressed')) === 'true')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// ----------------------------------------------- 2. every chip recolours
for (const [id, t] of Object.entries(THEMES)) {
  await puppyMenu(page, `puppy-theme-${id}`)
  await page.waitForTimeout(250)
  const px = await cornerPixel()
  check(`${id}: data-theme, stage, strip and canvas follow`,
    (await ds('theme')) === id && (await bg('puppy-stage')) === t.surround && (await bg('puppy-stick-strip')) === t.strip && near(px, t.surround),
    `${await bg('puppy-stage')} ${await bg('puppy-stick-strip')} ${px}`)
}

// ---------------------------------------------- 3. mid-run: no restart
{
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(250)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(150) // let the stop reach the 50 ms telemetry
  const run0 = await ds('run')
  const y0 = parseFloat(await ds('y'))
  check('(a run is under way)', (await ds('status')) === 'play')
  await puppyMenu(page, 'puppy-theme-ocean')
  check('switching theme mid-run keeps the run going (no restart, no confirm)',
    (await ds('theme')) === 'ocean' && (await ds('status')) === 'play' && (await ds('run')) === run0 &&
      Math.abs(parseFloat(await ds('y')) - y0) < 1e-3 && (await page.getByRole('dialog').count()) === 0)
}

// ------------------------------------------------------- 4. persistence
{
  await page.waitForTimeout(1000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="puppy-root"]')
  check('the theme survives a reload', (await ds('theme')) === 'ocean' && (await bg('puppy-stage')) === THEMES.ocean.surround)
  // A card saved before themes: strip the field from the persisted data.
  await page.evaluate(() => {
    const root = JSON.parse(localStorage.getItem('persist:testsite'))
    const w = JSON.parse(root.widgets)
    for (const inst of w.instances) if (inst.type === 'puppyRescue') delete inst.data.theme
    root.widgets = JSON.stringify(w)
    localStorage.setItem('persist:testsite', JSON.stringify(root))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="puppy-root"]')
  check('a pre-themes card (no theme saved) opens as Sunshine', (await ds('theme')) === 'sunshine' && (await bg('puppy-stage')) === THEMES.sunshine.surround)
}

await finish(browser)
