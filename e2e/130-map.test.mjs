/**
 * Map page suite. Asserts the page's data-* contract, not tile pixels —
 * the basemap comes from the ArcGIS CDN, which this environment may block.
 * A reachability probe (run in the page, so it measures what the browser
 * actually sees) picks between the online and offline branches:
 *  - always: nav link, lazy-chunk isolation (no @arcgis code until the Map
 *    page is visited), theme-follow (data-basemap + injected ArcGIS CSS flip
 *    with the app toggle — render-computed, works offline), 2D/3D toggle +
 *    persistence, tool toggles, route control with a MOCKED OSRM response
 *    contract check, deep-link render.
 *  - online only: data-map-status reaches "ready" (from view.when, never
 *    networkidle), attribution + zoom UI present, click-driven pins with
 *    reload persistence, click-driven A→B route distance from the mock.
 */
import { BASE_URL, launch, reporter } from './helpers.mjs'

const { check, finish } = reporter('map')
const { browser, page } = await launch()

const root = () => page.locator('[data-testid="map-page"]')

async function waitForAttr(attr, pred, timeout = 30000) {
  const deadline = Date.now() + timeout
  let last = null
  while (Date.now() < deadline) {
    last = await root().getAttribute(attr)
    if (pred(last)) return last
    await page.waitForTimeout(200)
  }
  return last
}

// Mock OSRM before any navigation: the route contract must assert the same
// way whether routing.openstreetmap.de is reachable or not.
const MOCK_ROUTE = {
  code: 'Ok',
  routes: [
    {
      distance: 12345.6,
      duration: 1800,
      geometry: {
        coordinates: [
          [11.5, 48.1],
          [11.6, 48.2],
        ],
      },
    },
  ],
}
let osrmRequests = 0
await page.route('**/routing.openstreetmap.de/**', (route) => {
  osrmRequests += 1
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MOCK_ROUTE),
  })
})

// ---- dashboard first: the arcgis chunk must NOT load with the app shell ----
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
const resourcesBefore = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name),
)
check(
  'no arcgis code on the dashboard',
  !resourcesBefore.some((u) => u.includes('arcgis') || u.includes('MapPageBody')),
)

// Browser-side CDN reachability probe — decides online vs offline branch.
const online = await page.evaluate(() =>
  Promise.race([
    fetch('https://js.arcgis.com/', { mode: 'no-cors' }).then(
      () => true,
      () => false,
    ),
    new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
  ]),
)
if (!online) {
  console.log('NOTE: ArcGIS CDN unreachable — tile-dependent checks degrade to offline mode')
}

// ---- navigate via the app-bar link; the lazy chunk loads on demand ----
await page.getByRole('link', { name: 'Map' }).click()
await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
check('map page renders via nav link', true)
const resourcesAfter = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name),
)
check(
  'arcgis chunk loads with the map page',
  resourcesAfter.some((u) => u.includes('arcgis') || u.includes('MapPageBody')),
)

// ---- view readiness contract (view.when → data-map-status) ----
if (online) {
  const status = await waitForAttr('data-map-status', (v) => v === 'ready', 45000)
  check('map view becomes ready', status === 'ready', `status=${status}`)
  check(
    'attribution UI present (Esri/OSM requirement)',
    (await page.locator('.esri-attribution').count()) === 1 &&
      ((await page.locator('.esri-attribution').textContent()) ?? '').length > 0,
  )
  check('zoom UI present (ArcGIS CSS applied)', (await page.locator('.esri-zoom').count()) === 1)
} else {
  const status = await root().getAttribute('data-map-status')
  check(
    'offline: status stays loading/error (no crash)',
    status === 'loading' || status === 'error',
    `status=${status}`,
  )
}

// ---- theme follow: render-computed, asserts identically offline ----
check('light theme starts on gray-vector', (await root().getAttribute('data-basemap')) === 'gray-vector')
const cssLenLight = await page.evaluate(
  () => document.getElementById('arcgis-theme')?.textContent?.length ?? 0,
)
check('arcgis theme css injected', cssLenLight > 1000, `len=${cssLenLight}`)
await page.getByRole('button', { name: 'Switch to dark mode' }).click()
await page.waitForTimeout(300)
check('dark theme swaps to dark-gray-vector', (await root().getAttribute('data-basemap')) === 'dark-gray-vector')
const cssLenDark = await page.evaluate(
  () => document.getElementById('arcgis-theme')?.textContent?.length ?? 0,
)
check('arcgis css swapped with theme', cssLenDark > 1000 && cssLenDark !== cssLenLight)
await page.getByRole('button', { name: 'Switch to light mode' }).click()
await page.waitForTimeout(300)
check('toggle back restores gray-vector', (await root().getAttribute('data-basemap')) === 'gray-vector')

// ---- 2D/3D toggle + persistence ----
check('starts in 2D', (await root().getAttribute('data-view-mode')) === '2d')
await page.locator('[data-testid="map-mode-3d"]').click()
await page.waitForTimeout(500)
check('3D mode selected', (await root().getAttribute('data-view-mode')) === '3d')
if (online) {
  const status3d = await waitForAttr('data-map-status', (v) => v === 'ready', 60000)
  check('scene view becomes ready', status3d === 'ready', `status=${status3d}`)
}
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
check(
  '3D choice persists across reload',
  (await root().getAttribute('data-view-mode')) === '3d',
)
await page.locator('[data-testid="map-mode-2d"]').click()
await page.waitForTimeout(500)
check('back to 2D', (await root().getAttribute('data-view-mode')) === '2d')

// ---- tool strip contract ----
check('no tool active initially', (await root().getAttribute('data-tool')) === 'none')
await page.locator('[data-testid="map-tool-route"]').click()
await page.waitForTimeout(200)
check('route tool activates', (await root().getAttribute('data-tool')) === 'route')
check('route starts idle', (await root().getAttribute('data-route-status')) === 'idle')
check(
  'route profile picker renders',
  (await page.locator('[data-testid="map-route-walk"]').count()) === 1 &&
    (await page.locator('[data-testid="map-route-drive"]').count()) === 1,
)
check('locate control renders', (await page.locator('[data-testid="map-locate"]').count()) === 1)

if (online) {
  // ---- route: two map clicks → mocked OSRM → distance chip ----
  if (await waitForAttr('data-map-status', (v) => v === 'ready', 45000) === 'ready') {
    const box = await page.locator('[data-testid="map-container"]').boundingBox()
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
    await page.waitForTimeout(400)
    check('first click arms end point', (await root().getAttribute('data-route-status')) === 'picking')
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
    const routeStatus = await waitForAttr('data-route-status', (v) => v === 'ok' || v === 'error', 15000)
    check('route resolves from (mocked) OSRM', routeStatus === 'ok', `status=${routeStatus}`)
    check('route distance published', (await root().getAttribute('data-route-km')) === '12.3')
    check('OSRM was called through the mock', osrmRequests >= 1, `requests=${osrmRequests}`)
    await page.locator('[data-testid="map-route-clear"]').click()
    await page.waitForTimeout(200)
    check('route clears', (await root().getAttribute('data-route-status')) === 'idle')

    // ---- pins: click to add, click pin to remove, persist across reload ----
    await page.locator('[data-testid="map-tool-pins"]').click()
    await page.waitForTimeout(200)
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45)
    await page.waitForTimeout(400)
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55)
    await page.waitForTimeout(400)
    check('two pins dropped', (await root().getAttribute('data-pin-count')) === '2')
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
    check(
      'pins persist across reload',
      (await root().getAttribute('data-pin-count')) === '2',
    )
    // clean up persisted pins so other suites see a fresh board
    await page.locator('[data-testid="map-tool-pins"]').click()
    await page.waitForTimeout(200)
    await page.locator('[data-testid="map-pins-clear"]').click()
    await page.getByRole('button', { name: 'Remove all' }).click()
    await page.waitForTimeout(300)
    check('clear-all removes pins', (await root().getAttribute('data-pin-count')) === '0')

    // ---- measure: widget mounts in the view UI ----
    await page.locator('[data-testid="map-tool-measure-line"]').click()
    await page.waitForTimeout(600)
    check(
      'distance measurement widget mounts',
      (await page.locator('.esri-distance-measurement-2d').count()) === 1,
    )
    await page.locator('[data-testid="map-tool-measure-line"]').click() // toggle off
    await page.waitForTimeout(300)
    check(
      'measurement widget unmounts',
      (await page.locator('.esri-distance-measurement-2d').count()) === 0,
    )
  } else {
    check('online but view never ready', false, 'ready wait timed out')
  }
} else {
  console.log('SKIP: click-driven pins/route/measure checks need a ready view (CDN blocked)')
}

// ---- deep link ----
await page.goto(`${BASE_URL}map`, { waitUntil: 'networkidle' })
const deepLinkOk = (await page.locator('[data-testid="map-page"]').count()) === 1
check('deep link /map renders the page', deepLinkOk)

await finish(browser)
