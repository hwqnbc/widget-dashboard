/**
 * Avatar Actions suite: the character viewer's public contract, asserted on the
 * widget root's data-* attributes (`data-avatar`, `data-playing`).
 *
 * Covers: default selection, every catalogued avatar is selectable in order and
 * renders a figure svg, the Idle/Celebrate toggle plays/stops the celebration,
 * switching avatar mid-play returns to the static figure, and the per-widget
 * selection persists across reload (while the transient play state resets). No
 * canvas or pixel assertions — the figures are pure SVG, so presence + the data
 * contract is the whole story.
 */
import { addAvatarWidget, launch, reporter } from './helpers.mjs'

// Must match AVATAR_CATALOG order (features/avatars/avatarCatalog.ts).
const AVATARS = [
  { id: 'toy', name: 'Toy' },
  { id: 'ninja', name: 'Ninja' },
  { id: 'fireninja', name: 'Fire Ninja' },
  { id: 'darkarin', name: 'DarkArin' },
  { id: 'frak', name: 'frak' },
  { id: 'imperium', name: 'Imperium Claw General' },
]

const { check, finish } = reporter('avatars')
const { browser, page } = await launch()
await addAvatarWidget(page)

const root = page.locator('[data-testid="avatar-actions"]')
// Scoped to the avatar picker — the 2D/3D view toggle (suite 121) and the
// Idle/Celebrate toggle are separate ToggleButtonGroups on the same root.
const toggles = root.locator('[data-testid="avatar-picker"] .MuiToggleButton-root')
// nth(0) = Idle, nth(1) = Celebrate.
const celebration = root.locator('[data-testid="celebration-toggle"] .MuiToggleButton-root')
const stage = root.locator('[data-testid="avatar-stage"]')
const avatarAttr = () => root.getAttribute('data-avatar')
const playingAttr = () => root.getAttribute('data-playing')
const figureCount = () => stage.locator('svg').count()
// The figure svg must sit centred in the stage — the plain-div stage lost
// <button>'s UA text-align:center once TapStage was removed, which slid the
// svg to the left edge (user-reported).
const svgCentered = async () => {
  const s = await stage.boundingBox()
  const f = await stage.locator('svg').first().boundingBox()
  if (!s || !f) return false
  return Math.abs(f.x + f.width / 2 - (s.x + s.width / 2)) < 4
}

// defaults
check('default avatar is toy', (await avatarAttr()) === 'toy')
check('not playing by default', (await playingAttr()) === 'no')
check('default action is idle', (await root.getAttribute('data-action')) === 'idle')
check('one toggle per catalogued avatar', (await toggles.count()) === AVATARS.length)
check('celebration toggle has Idle and Celebrate', (await celebration.count()) === 2)
check('a figure svg is rendered', (await figureCount()) >= 1)
check('idle figure is horizontally centred', await svgCentered())

// every avatar selectable, in catalog order, each renders a figure
for (let i = 0; i < AVATARS.length; i++) {
  const { id } = AVATARS[i]
  await toggles.nth(i).click()
  await page.waitForTimeout(120)
  check(`selecting #${i} sets data-avatar=${id}`, (await avatarAttr()) === id)
  check(`${id} renders a figure svg`, (await figureCount()) >= 1)
  check(`selecting ${id} does not auto-play`, (await playingAttr()) === 'no')
}

// the Celebrate/Idle toggle drives the celebration (imperium, selected last)
await celebration.nth(1).click()
await page.waitForTimeout(150)
check('Celebrate starts the celebration', (await playingAttr()) === 'yes')
check('2d action id is celebrate', (await root.getAttribute('data-action')) === 'celebrate')
check('celebration still shows a figure svg', (await figureCount()) >= 1)
check('celebrating figure is horizontally centred', await svgCentered())
await celebration.nth(0).click()
await page.waitForTimeout(150)
check('Idle stops the celebration', (await playingAttr()) === 'no')

// switching avatar mid-play returns to the static figure
await celebration.nth(1).click()
await page.waitForTimeout(150)
check('playing again before switch', (await playingAttr()) === 'yes')
await toggles.nth(0).click() // back to toy
await page.waitForTimeout(150)
check('switching avatar stops play', (await playingAttr()) === 'no')
check('switch took effect', (await avatarAttr()) === 'toy')

// persistence: selection survives reload, play state resets
await toggles.nth(5).click() // imperium
await page.waitForTimeout(150)
await celebration.nth(1).click() // start playing (transient — should NOT persist)
await page.waitForTimeout(200)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="avatar-actions"]')
check('selected avatar persists across reload', (await avatarAttr()) === 'imperium')
check('play state resets on reload', (await playingAttr()) === 'no')

await finish(browser)
