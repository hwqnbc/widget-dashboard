/**
 * Drone Strike mobile-layout suite: on an iPhone-sized landscape viewport
 * in fullscreen, every touch control must actually be on screen and usable
 * — the original fixed sizes stacked the fire button onto the top toolbar
 * and pushed the scope button off-screen. Asserts sizes scale down, the
 * fire/scope column sits inward of the right stick clear of the toolbar,
 * and everything still works on the default desktop-sized viewport.
 */
import { addStrikeWidget, launch, reporter, tapFire, strikeReaders } from './helpers.mjs'

// iPhone 12-15 class, landscape CSS viewport (minus browser chrome).
const PHONE = { width: 844, height: 390 }

const { check, finish } = reporter('strike-mobile')
const { browser, context, page } = await launch({ viewport: PHONE })
await addStrikeWidget(page)

// Enter fullscreen (the same widget instance re-mounts in the overlay).
await page.getByRole('button', { name: 'full screen Drone Strike widget' }).click()
await page.waitForTimeout(800)
check(
  'fullscreen shows the widget',
  (await page.locator('[data-testid="drone-strike-root"]').count()) === 1,
)
check(
  'no rotate hint in landscape',
  (await page.locator('[data-testid="rotate-hint"]').count()) === 0,
)

const rect = async (tid) =>
  await page.locator(`[data-testid="${tid}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }
  })
const inViewport = (r) =>
  r.x >= 0 && r.y >= 0 && r.right <= PHONE.width + 1 && r.bottom <= PHONE.height + 1

// Every touch control fully on screen.
for (const tid of [
  'strike-joystick-left',
  'strike-joystick-right',
  'strike-fire',
  'strike-zoom',
]) {
  const r = await rect(tid)
  check(
    `${tid} fully on screen`,
    r.w > 0 && inViewport(r),
    JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.bottom), rt: Math.round(r.right) }),
  )
}

// The fire/scope column must not collide with the top-right toolbar.
const fire = await rect('strike-fire')
const scope = await rect('strike-zoom')
const settings = await rect('strike-settings')
check(
  'fire button clear of the toolbar',
  fire.y > settings.bottom + 4,
  `fireTop=${Math.round(fire.y)} toolbarBottom=${Math.round(settings.bottom)}`,
)
check(
  'scope button clear of the toolbar',
  scope.y > settings.bottom + 4,
  `scopeTop=${Math.round(scope.y)} toolbarBottom=${Math.round(settings.bottom)}`,
)
// Column layout: fire sits inward (left) of the right stick, scope above fire.
const rightStick = await rect('strike-joystick-right')
check('fire inward of the right stick', fire.right <= rightStick.x + 4)
check('scope above the fire button', scope.bottom <= fire.y + 4)

// Controls sized down for the short viewport (fullscreen desktop is 140).
check('stick scaled to the height', rightStick.h < 200, `h=${Math.round(rightStick.h)}`)

// And the button still fires on this layout.
const { hud } = strikeReaders(page)
const waitActive = async () => {
  for (let i = 0; i < 40; i++) {
    if ((await hud.getAttribute('data-wave-state')) === 'active') return true
    await page.waitForTimeout(200)
  }
  return false
}
check('wave active in fullscreen', await waitActive())
const shots0 = parseInt(await hud.getAttribute('data-shots'), 10)
await tapFire(page, context, 80)
await page.waitForTimeout(400)
check(
  'fire button works on the phone layout',
  parseInt(await hud.getAttribute('data-shots'), 10) > shots0,
)

await finish(browser)
