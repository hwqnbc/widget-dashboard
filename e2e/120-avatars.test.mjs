/**
 * Avatar Actions suite: the character viewer's public contract, asserted on the
 * widget root's data-* attributes (`data-avatar`, `data-playing`).
 *
 * Covers: default selection, every catalogued avatar is selectable in order and
 * renders a figure svg, the tap toggle plays/stops the celebration, switching
 * avatar mid-play returns to the static figure, and the per-widget selection
 * persists across reload (while the transient play state resets). No canvas or
 * pixel assertions — the figures are pure SVG, so presence + the data contract
 * is the whole story.
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
const toggles = root.locator('.MuiToggleButton-root')
const stage = root.locator('button[aria-label*="celebration"]')
const avatarAttr = () => root.getAttribute('data-avatar')
const playingAttr = () => root.getAttribute('data-playing')
const figureCount = () => stage.locator('svg').count()

// defaults
check('default avatar is toy', (await avatarAttr()) === 'toy')
check('not playing by default', (await playingAttr()) === 'no')
check('one toggle per catalogued avatar', (await toggles.count()) === AVATARS.length)
check('a figure svg is rendered', (await figureCount()) >= 1)

// every avatar selectable, in catalog order, each renders a figure
for (let i = 0; i < AVATARS.length; i++) {
  const { id } = AVATARS[i]
  await toggles.nth(i).click()
  await page.waitForTimeout(120)
  check(`selecting #${i} sets data-avatar=${id}`, (await avatarAttr()) === id)
  check(`${id} renders a figure svg`, (await figureCount()) >= 1)
  check(`selecting ${id} does not auto-play`, (await playingAttr()) === 'no')
}

// tap toggles the celebration on the current avatar (imperium, selected last)
await stage.click()
await page.waitForTimeout(150)
check('tap starts the celebration', (await playingAttr()) === 'yes')
check('celebration still shows a figure svg', (await figureCount()) >= 1)
await stage.click()
await page.waitForTimeout(150)
check('tapping again stops the celebration', (await playingAttr()) === 'no')

// switching avatar mid-play returns to the static figure
await stage.click()
await page.waitForTimeout(150)
check('playing again before switch', (await playingAttr()) === 'yes')
await toggles.nth(0).click() // back to toy
await page.waitForTimeout(150)
check('switching avatar stops play', (await playingAttr()) === 'no')
check('switch took effect', (await avatarAttr()) === 'toy')

// persistence: selection survives reload, play state resets
await toggles.nth(5).click() // imperium
await page.waitForTimeout(150)
await stage.click() // start playing (transient — should NOT persist)
await page.waitForTimeout(200)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="avatar-actions"]')
check('selected avatar persists across reload', (await avatarAttr()) === 'imperium')
check('play state resets on reload', (await playingAttr()) === 'no')

await finish(browser)
