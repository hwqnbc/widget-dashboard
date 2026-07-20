/**
 * Tank Battle mobile-layout suite (the strike 106 mirror): on an
 * iPhone-sized landscape viewport in fullscreen, every touch control must
 * be on screen and usable — before the responsive port the fixed sizes
 * stacked the fire button onto the toolbar and pushed the scope button
 * off-screen. Asserts the sizes scale to the height, the fire/scope column
 * sits inward of the right stick clear of the toolbar, and the fire button
 * still works (after driving clear of the spawn safe zone, which keeps
 * weapons offline).
 */
import { addTankWidget, launch, reporter, tankReaders, tapFire } from './helpers.mjs'

// iPhone 12-15 class, landscape CSS viewport (minus browser chrome).
const PHONE = { width: 844, height: 390 }

const { check, finish } = reporter('tank-mobile')
const { browser, context, page } = await launch({ viewport: PHONE })
await addTankWidget(page)

// Enter fullscreen (the same widget instance re-mounts in the overlay).
await page.getByRole('button', { name: 'full screen Tank Battle widget' }).click()
await page.waitForTimeout(800)
check(
  'fullscreen shows the widget',
  (await page.locator('[data-testid="tank-battle-root"]').count()) === 1,
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
  'tank-joystick-left',
  'tank-joystick-right',
  'tank-fire',
  'tank-zoom',
]) {
  const r = await rect(tid)
  check(
    `${tid} fully on screen`,
    r.w > 0 && inViewport(r),
    JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.bottom), rt: Math.round(r.right) }),
  )
}

// The fire/scope column must not collide with the top-right toolbar.
const fire = await rect('tank-fire')
const scope = await rect('tank-zoom')
const settings = await rect('tank-settings')
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
// Column layout: fire sits inward (left) of the right stick, scope above.
const rightStick = await rect('tank-joystick-right')
check('fire inward of the right stick', fire.right <= rightStick.x + 4)
check('scope above the fire button', scope.bottom <= fire.y + 4)

// Controls sized down for the short viewport (fullscreen desktop is 140).
check('stick scaled to the height', rightStick.h < 200, `h=${Math.round(rightStick.h)}`)

// The fire button works on this layout — but only outside the spawn safe
// zone (weapons are offline on the pad), so drive clear first.
const { hud, combat } = tankReaders(page)
const waitActive = async () => {
  for (let i = 0; i < 40; i++) {
    if ((await hud.getAttribute('data-wave-state')) === 'active') return true
    await page.waitForTimeout(200)
  }
  return false
}
check('battle active in fullscreen', await waitActive())
await page.keyboard.down('KeyW')
for (let i = 0; i < 40; i++) {
  if ((await hud.getAttribute('data-safe')) === 'off') break
  await page.waitForTimeout(200)
}
await page.keyboard.up('KeyW')
await page.waitForTimeout(400)
check('drove clear of the safe zone', (await hud.getAttribute('data-safe')) === 'off')
const shots0 = (await combat()).shots
await tapFire(page, context, 80, 'tank-fire')
await page.waitForTimeout(400)
check(
  'fire button works on the phone layout',
  (await combat()).shots > shots0,
)

await finish(browser)
