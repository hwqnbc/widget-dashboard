/**
 * Collision suite: navigate closed-loop above a known building, brake,
 * descend — the drone must rest ON the roof (not sink through), stay inside
 * the footprint, and hold there under sustained descent.
 */
import { addDroneWidget, createPilot, launch, readers, reporter } from './helpers.mjs'
import { buildWorldLayout, DEFAULT_SEED } from './.bundle/worldLayout.js'

const { check, finish } = reporter('collision')
const L = buildWorldLayout(DEFAULT_SEED)
const B = L.buildings[0]
const C = L.colliders[0]

const { browser, context, page } = await launch()
await addDroneWidget(page)
const { telemetry } = readers(page)
const pilot = await createPilot(page, context)

await pilot.touchStart()
check(
  'navigated above the target building',
  await pilot.flyTo({ x: B.x, y: 12, z: B.z }, { tol: 1.0, maxForward: 0.6 }),
)
await pilot.brake()

// descend onto the roof and keep pushing down
const deadline = Date.now() + 15000
while (Date.now() < deadline) {
  await pilot.touch(0, -1, 0, 0)
  if ((await telemetry()).alt < C.top + 0.5) break
  await page.waitForTimeout(150)
}
await page.waitForTimeout(1200)
const final = await telemetry()
check(
  'drone rests on the roof while descend is held',
  Math.abs(final.alt - C.top) < 0.35,
  `alt=${final.alt}, roof top=${C.top.toFixed(2)} (ground would be 0.3)`,
)
check(
  'still above the building footprint',
  final.x > C.minX && final.x < C.maxX && final.z > C.minZ && final.z < C.maxZ,
  `x=${final.x} z=${final.z}`,
)
await page.waitForTimeout(1000)
const later = await telemetry()
check('sustained descend does not tunnel through the roof', Math.abs(later.alt - C.top) < 0.35, `alt=${later.alt}`)
await pilot.touchEnd()

await finish(browser)
