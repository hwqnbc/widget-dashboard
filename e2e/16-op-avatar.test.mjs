/**
 * Operator-avatar suite: the Drone Sim's RC operator renders Player 1's
 * (seat 'toy') selected avatar as its 3D model when the avatar carries a
 * `Model3D`, and falls back to the basic primitive figure otherwise.
 *
 * Contract on the widget root (React-owned): `data-op-avatar` (Player 1's
 * avatar id from the persisted seat map) and `data-op-figure`
 * ('avatar' | 'basic'). The meshes themselves aren't DOM-observable, so —
 * like the mode toggles — the attributes are the test surface; the model's
 * look is reviewed from screenshots. The avatar is swapped on the real
 * Settings page (Player 1 is the first seat row), then the suite returns to
 * the dashboard where the persisted Drone Sim widget remounts.
 */
import { BASE_URL, addDroneWidget, launch, readers, reporter } from './helpers.mjs'

const { check, finish } = reporter('op-avatar')
const { browser, page } = await launch()
await addDroneWidget(page)

const root = page.locator('[data-testid="dronesim-root"]')
const opAttrs = async () => ({
  avatar: await root.getAttribute('data-op-avatar'),
  figure: await root.getAttribute('data-op-figure'),
})

// default seat map: Player 1 = toy, the avatar with a Model3D
let op = await opAttrs()
check('operator avatar is toy by default', op.avatar === 'toy')
check('toy operator uses the avatar 3D model', op.figure === 'avatar')
const t0 = await readers(page).telemetry()
check('telemetry alive with the avatar operator in-world', Number.isFinite(t0.alt))

// swap Player 1 → Ninja on the Settings page (ninja has no Model3D yet)
await page.goto(`${BASE_URL}settings`, { waitUntil: 'networkidle' })
// Player 1 is the FIRST seat row; each row has one toggle per avatar. Match
// the button TEXT (the head svg's aria-label pollutes the accessible name).
await page.locator('button').filter({ hasText: /^Ninja$/ }).first().click()
await page.waitForTimeout(300) // let redux-persist flush
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
await page.waitForTimeout(600)

op = await opAttrs()
check('operator follows the swapped avatar', op.avatar === 'ninja')
check('no Model3D → basic primitive figure', op.figure === 'basic')
const t1 = await readers(page).telemetry()
check('sim still runs with the basic operator', Number.isFinite(t1.alt))

// swap back to Toy — the avatar model returns
await page.goto(`${BASE_URL}settings`, { waitUntil: 'networkidle' })
await page.locator('button').filter({ hasText: /^Toy$/ }).first().click()
await page.waitForTimeout(300)
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="dronesim-root"]')
await page.waitForTimeout(600)

op = await opAttrs()
check('swap back restores the toy avatar', op.avatar === 'toy')
check('avatar 3D model returns', op.figure === 'avatar')

await finish(browser)
