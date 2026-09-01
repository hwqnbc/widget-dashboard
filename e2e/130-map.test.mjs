/**
 * Map page suite. Asserts the page's data-* contract, not tile pixels —
 * the basemap comes from the ArcGIS CDN, which this environment may block.
 * A reachability probe (run in the page, so it measures what the browser
 * actually sees) picks between the online and offline branches:
 *  - always: nav link, lazy-chunk isolation (no @arcgis code until the Map
 *    page is visited), theme-follow (data-basemap + injected ArcGIS CSS flip
 *    with the app toggle — render-computed, works offline), the basemap
 *    gallery (12 tiles, explicit pick beats the theme, CARTO WebTileLayer
 *    path, persistence, back to Auto + pure resolver units), 2D/3D toggle +
 *    persistence, tool toggles, pure routeGeometry unit checks (bundled
 *    module: insert index, nearest-distance, tap threshold), pure
 *    flightPathModel checks (3D lengths, sampling, heading, done) + the
 *    flight tool's 3D-only enable and contract defaults, undo-disabled
 *    state, deep-link render.
 *  - online only: data-map-status reaches "ready" (from view.when, never
 *    networkidle), attribution + zoom UI present, click-driven pins with
 *    reload persistence, and the waypoint-editing flow against an ECHO OSRM
 *    mock (returns a line through the requested coords): A→B distance,
 *    insert by clicking the line, remove by clicking a marker, undo of
 *    remove/insert/clear, drag-to-move a marker (re-routes with the moved
 *    coordinate), saved routes (save dialog, load from the menu,
 *    persistence across reload, delete), and the drone flight flow in 3D
 *    (plant + waypoints via clicks, play/pause/reset animation, clear,
 *    2D switch releases the tool).
 */
import { BASE_URL, launch, reporter } from './helpers.mjs'
import {
  insertIndexFor,
  nearestOnPath,
  pathDistanceThresholdMeters,
} from './.bundle/routeGeometry.js'
import {
  armDrag,
  createDragState,
  dragPointerDown,
  dragPointerUp,
  dragStep,
} from './.bundle/dragModel.js'
import { BASEMAP_DEFS, resolveBasemapId } from './.bundle/basemapCatalog.js'
import { buildFlightPath, sampleFlight } from './.bundle/flightPathModel.js'

const { check, finish } = reporter('map')
const { browser, context, page } = await launch()

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
// way whether routing.openstreetmap.de is reachable or not. It's an ECHO
// mock — the returned geometry runs straight through whatever coordinates
// were requested — so the drawn line lies where the suite clicked and
// insert-on-line is testable.
const osrmCoords = [] // per request: [[lon,lat], ...]
await page.route('**/routing.openstreetmap.de/**', (route) => {
  const url = decodeURIComponent(route.request().url())
  const coords = (url.match(/route\/v1\/driving\/([^?]+)/)?.[1] ?? '')
    .split(';')
    .map((pair) => pair.split(',').map(Number))
  osrmCoords.push(coords)
  const legCount = Math.max(1, coords.length - 1)
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance: 12345.6,
          duration: 1800,
          geometry: { coordinates: coords },
          // one leg per waypoint pair, splitting the totals evenly
          legs: Array.from({ length: legCount }, () => ({
            distance: 12345.6 / legCount,
            duration: 1800 / legCount,
          })),
        },
      ],
      waypoints: coords.map((c) => ({ location: c })),
    }),
  })
})

// ---- stale-chunk recovery: a dead lazy-chunk URL triggers one automatic
// reload; a persistent failure shows the boundary's Reload card; removing
// the block and reloading recovers. Isolated context — its reload games
// must not disturb the main flow. ----
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const p2 = await ctx2.newPage()
  await p2.route('**/MapPageBody*', (r) => r.abort())
  await p2.goto(`${BASE_URL}map`, { waitUntil: 'domcontentloaded' })
  await p2.waitForSelector('[data-testid="error-boundary"]', { timeout: 20000 })
  check(
    'persistent chunk failure shows the boundary with Reload page',
    (await p2.locator('[data-testid="error-boundary-reload"]').count()) === 1,
  )
  // The latch is keyed `chunk-reload:<chunk>:<build>` (suite 142 owns the
  // full policy) — match the prefix, not a fixed key.
  const mapLatches = () =>
    p2.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('chunk-reload:map:')))
  check('reload-once flag recorded (auto-reload happened first)', (await mapLatches()).length === 1)
  await p2.unroute('**/MapPageBody*')
  await p2.locator('[data-testid="error-boundary-reload"]').click()
  await p2.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
  check('Reload page recovers once the chunk is reachable', true)
  check('reload-once flag cleared on successful load', (await mapLatches()).length === 0)
  await ctx2.close()
}

// ---- pure route-geometry unit checks (bundled module, no network) ----
{
  const path = [
    [0, 0],
    [0, 1],
    [0, 2],
  ]
  const snapped = path
  check('insertIndexFor picks the first leg', insertIndexFor(path, snapped, [0.001, 0.4]) === 1)
  check('insertIndexFor picks the second leg', insertIndexFor(path, snapped, [-0.001, 1.6]) === 2)
  const near = nearestOnPath(path, [0.001, 0.5])
  check(
    'nearestOnPath distance ~111 m for 0.001° offset',
    near && Math.abs(near.distMeters - 111.3) < 2,
    `d=${near?.distMeters?.toFixed(1)}`,
  )
  const t1 = pathDistanceThresholdMeters(1_000_000)
  const t2 = pathDistanceThresholdMeters(2_000_000)
  check(
    'threshold scales linearly with view scale',
    Math.abs(t2 / t1 - 2) < 1e-9 && t1 > 0,
    `t1=${t1.toFixed(0)}m`,
  )

  // Drag state machine — the pointer-up vs drag-end ordering rules.
  // Regression for the shipped bug: pointer-up outracing drag end ate the
  // commit, so a moved waypoint never re-routed.
  {
    const s = createDragState()
    armDrag(s, 1)
    dragStep(s, 'start', [10, 20])
    dragStep(s, 'update', [11, 21])
    dragPointerUp(s) // arrives BEFORE the drag end event
    const commit = dragStep(s, 'end', null) // and toMap failed at release
    check(
      'drag commits when pointer-up outraces drag end',
      commit != null && commit.index === 1 && commit.pos[0] === 11 && commit.pos[1] === 21,
      JSON.stringify(commit),
    )
  }
  {
    const s = createDragState()
    armDrag(s, 0)
    dragStep(s, 'start', [1, 2])
    const commit = dragStep(s, 'end', [3, 4])
    check(
      'drag end commits at the release position',
      commit != null && commit.index === 0 && commit.pos[0] === 3,
      JSON.stringify(commit),
    )
    check('drag state fully disarmed after commit', s.index === null && !s.active)
  }
  {
    const s = createDragState()
    armDrag(s, 2) // plain click: armed, but no drag steps ever fire
    dragPointerUp(s)
    check('click without drag disarms on pointer-up', s.index === null)
    check('no phantom commit after a click', dragStep(s, 'end', [5, 6]) === null)
  }
  {
    const s = createDragState()
    armDrag(s, 3)
    dragStep(s, 'update', [7, 8])
    dragPointerDown(s) // next gesture begins before any end arrived
    check('pointer-down clears a lost gesture', s.index === null && !s.active && s.pos === null)
  }

  // Basemap catalog resolver — 'auto' and junk follow the theme, known ids win.
  check(
    'resolveBasemapId: auto follows the theme',
    resolveBasemapId('auto', 'light') === 'gray-vector' &&
      resolveBasemapId('auto', 'dark') === 'dark-gray-vector',
  )
  check(
    'resolveBasemapId: explicit choice wins over the theme',
    resolveBasemapId('osm', 'dark') === 'osm' &&
      resolveBasemapId('carto-voyager', 'light') === 'carto-voyager',
  )
  check(
    'resolveBasemapId: unknown/malformed persisted values fall back',
    resolveBasemapId('not-a-basemap', 'light') === 'gray-vector' &&
      resolveBasemapId(undefined, 'dark') === 'dark-gray-vector' &&
      resolveBasemapId(42, 'light') === 'gray-vector',
  )
  check(
    'catalog entries each construct one way (esriId xor cartoUrl)',
    BASEMAP_DEFS.length === 11 &&
      BASEMAP_DEFS.every((d) => Boolean(d.esriId) !== Boolean(d.cartoUrl)),
  )

  // Flight-path model: 3D distances, sampling, heading, done semantics.
  {
    // 0.001° of latitude ≈ 111.32 m, due north, constant z.
    const north = buildFlightPath([
      { lon: 103.8, lat: 1.35, z: 60 },
      { lon: 103.8, lat: 1.351, z: 60 },
    ])
    check('flight path length ~111 m for 0.001° north', Math.abs(north.total - 111.3) < 1, `total=${north.total.toFixed(1)}`)
    const mid = sampleFlight(north, north.total / 2)
    check(
      'mid-flight sample: halfway position, heading north, not done',
      mid != null &&
        Math.abs(mid.lat - 1.3505) < 1e-6 &&
        Math.abs(mid.headingDeg) < 0.5 &&
        !mid.done,
      JSON.stringify(mid),
    )
    const past = sampleFlight(north, north.total + 5)
    check(
      'sampling past the end clamps to the last point and reports done',
      past != null && Math.abs(past.lat - 1.351) < 1e-9 && past.done,
    )
    check(
      'negative distance clamps to the start',
      Math.abs((sampleFlight(north, -10)?.lat ?? 0) - 1.35) < 1e-9,
    )

    // A purely vertical hop still has length (the z term).
    const climb = buildFlightPath([
      { lon: 103.8, lat: 1.35, z: 0 },
      { lon: 103.8, lat: 1.35, z: 100 },
    ])
    check('vertical climb contributes 3D length', Math.abs(climb.total - 100) < 1e-6)

    // Heading east is 90° clockwise from north.
    const east = buildFlightPath([
      { lon: 103.8, lat: 0, z: 60 },
      { lon: 103.801, lat: 0, z: 60 },
    ])
    check(
      'eastward leg reports heading 90',
      Math.abs((sampleFlight(east, 1)?.headingDeg ?? 0) - 90) < 0.5,
    )

    check('single-point path is done where it stands', sampleFlight(buildFlightPath([{ lon: 1, lat: 2, z: 3 }]), 0)?.done === true)
    check('empty path samples to null', sampleFlight(buildFlightPath([]), 0) === null)
  }
}

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
  // Fail the blocked hosts INSTANTLY instead of letting proxy connections
  // hang: ArcGIS then gives up on the basemap quickly and view.when settles
  // (ready, with a broken basemap) — which is what lets the click-driven
  // branch below run offline deterministically.
  for (const host of [
    'js.arcgis.com',
    'cdn.arcgis.com',
    'basemaps.arcgis.com',
    'static.arcgis.com',
    'ibasemaps-api.arcgis.com',
    'services.arcgisonline.com',
    'tiles.arcgis.com',
    'www.arcgis.com',
  ]) {
    await page.route(`**://${host}/**`, (r) => r.abort())
  }
  // CARTO raster tiles (a–d.basemaps.cartocdn.com) — same fail-fast reasoning.
  await page.route('**://*.cartocdn.com/**', (r) => r.abort())
}

check(
  'no error boundary tripped on the dashboard',
  (await page.locator('[data-testid="error-boundary"]').count()) === 0,
)

// ---- navigate via the app-bar link; the lazy chunk loads on demand ----
await page.getByRole('link', { name: 'Map' }).click()
await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
check('map page renders via nav link', true)
check(
  'no error boundary tripped on the map page',
  (await page.locator('[data-testid="error-boundary"]').count()) === 0,
)
const resourcesAfter = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name),
)
check(
  'arcgis chunk loads with the map page',
  resourcesAfter.some((u) => u.includes('arcgis') || u.includes('MapPageBody')),
)

// ---- view readiness contract (view.when → data-map-status) ----
// Offline the view still settles eventually: ArcGIS gives up on the blocked
// basemap and resolves view.when with a broken basemap — clicks, toMap and
// goTo all work from then on. Only tile-dependent checks stay online-gated.
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
    'offline: status is a legal state (no crash)',
    status === 'loading' || status === 'error' || status === 'ready',
    `status=${status}`,
  )
}

// ---- default viewport: Singapore when nothing is persisted yet ----
// (render-computed from the redux map slice, so it asserts offline too)
check(
  'fresh map opens focused on Singapore',
  (await root().getAttribute('data-center-lat')) === '1.3521' &&
    (await root().getAttribute('data-center-lon')) === '103.8198',
  `${await root().getAttribute('data-center-lon')},${await root().getAttribute('data-center-lat')}`,
)
check('default scale is city-wide', (await root().getAttribute('data-scale')) === '288895')

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

// ---- overlays panel: slide-out at the map's right edge ----
check('panel starts closed', (await root().getAttribute('data-panel')) === 'closed')
await page.locator('[data-testid="map-overlays-toggle"]').click()
// Wait for the slide-in to FINISH rather than guessing an interval. The
// panel's transform is a matrix throughout its 200ms animation and exactly
// `none` only once it has settled open, so this is unambiguous.
//
// Two things make the obvious alternatives wrong. A fixed sleep races the
// animation: measured on a loaded main thread, the transition does not even
// START until ~260ms after the click (React re-render + style recalc), so at
// the old 350ms the panel was still moving — right edge 1317 against a
// settled 1256, which is precisely what made this assertion flaky. And
// "wait until the position stops changing" latches onto that pre-transition
// stillness and resolves before the slide has begun.
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="map-overlays-panel"]')
    return el != null && getComputedStyle(el).transform === 'none'
  },
  null,
  { timeout: 10000 },
)
check('panel opens', (await root().getAttribute('data-panel')) === 'open')
{
  const panelBox = await page.locator('[data-testid="map-overlays-panel"]').boundingBox()
  const mapBox = await page.locator('[data-testid="map-container"]').boundingBox()
  check(
    'panel slides in at the right edge of the map',
    panelBox != null &&
      Math.abs(panelBox.x + panelBox.width - (mapBox.x + mapBox.width)) < 3 &&
      panelBox.width > 200,
    JSON.stringify(panelBox),
  )
}
// ---- basemap gallery: choice + effective id are render-computed (redux +
// pure resolver), so every check here asserts identically offline ----
const tiles = page.locator('[data-testid="map-basemap-tile"]')
const tile = (id) => page.locator(`[data-testid="map-basemap-tile"][data-id="${id}"]`)
check('gallery renders 12 tiles (Auto + 11 basemaps)', (await tiles.count()) === 12)
check(
  'Auto selected by default',
  (await root().getAttribute('data-basemap-choice')) === 'auto' &&
    (await tile('auto').getAttribute('data-selected')) === 'yes',
)
await tile('osm').click()
await page.waitForTimeout(200)
check(
  'picking OpenStreetMap switches the effective basemap',
  (await root().getAttribute('data-basemap')) === 'osm' &&
    (await root().getAttribute('data-basemap-choice')) === 'osm' &&
    (await tile('osm').getAttribute('data-selected')) === 'yes',
)
await page.getByRole('button', { name: 'Switch to dark mode' }).click()
await page.waitForTimeout(300)
check(
  'explicit choice wins over the theme toggle',
  (await root().getAttribute('data-basemap')) === 'osm',
)
await page.getByRole('button', { name: 'Switch to light mode' }).click()
await page.waitForTimeout(300)
await tile('carto-voyager').click()
await page.waitForTimeout(300)
check(
  'CARTO basemap constructs via WebTileLayer without crashing',
  (await root().getAttribute('data-basemap')) === 'carto-voyager' &&
    (await page.locator('[data-testid="error-boundary"]').count()) === 0,
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
check(
  'basemap choice persists across reload',
  (await root().getAttribute('data-basemap-choice')) === 'carto-voyager' &&
    (await root().getAttribute('data-basemap')) === 'carto-voyager',
)
await page.locator('[data-testid="map-overlays-toggle"]').click()
await page.waitForTimeout(350)
check(
  'persisted tile shown selected after reload',
  (await tile('carto-voyager').getAttribute('data-selected')) === 'yes',
)
await tile('auto').click()
await page.waitForTimeout(200)
check(
  'back to Auto follows the theme again',
  (await root().getAttribute('data-basemap-choice')) === 'auto' &&
    (await root().getAttribute('data-basemap')) === 'gray-vector',
)

check('pins overlay on by default', (await root().getAttribute('data-pins-visible')) === 'on')
await page.locator('[data-testid="map-pins-visible"]').click()
await page.waitForTimeout(200)
check('pins overlay toggles off', (await root().getAttribute('data-pins-visible')) === 'off')
await page.locator('[data-testid="map-pins-visible"]').click()
await page.waitForTimeout(200)
check('no drawings initially', (await root().getAttribute('data-drawings')) === '0')
check('draw mode starts none', (await root().getAttribute('data-draw-mode')) === 'none')

// ---- overlay groups: add / activate / hide / rename / delete (pure redux,
// asserts offline) ----
const overlayRows = page.locator('[data-testid="map-overlay-item"]')
check(
  'no overlays initially',
  (await root().getAttribute('data-overlays')) === '0' &&
    (await root().getAttribute('data-active-overlay')) === '',
)
await page.locator('[data-testid="map-overlay-add"]').click()
await page.waitForTimeout(200)
check(
  'new overlay created and active',
  (await root().getAttribute('data-overlays')) === '1' &&
    (await overlayRows.nth(0).getAttribute('data-active')) === 'yes' &&
    ((await overlayRows.nth(0).textContent()) ?? '').includes('Overlay 1'),
)
await page.locator('[data-testid="map-overlay-add"]').click()
await page.waitForTimeout(200)
check(
  'second overlay becomes active',
  (await root().getAttribute('data-overlays')) === '2' &&
    (await overlayRows.nth(1).getAttribute('data-active')) === 'yes',
)
await overlayRows.nth(0).locator('[data-testid="map-overlay-name"]').click()
await page.waitForTimeout(200)
check(
  'clicking a name re-activates that overlay',
  (await overlayRows.nth(0).getAttribute('data-active')) === 'yes' &&
    (await overlayRows.nth(1).getAttribute('data-active')) === 'no',
)
await overlayRows.nth(0).locator('[data-testid="map-overlay-eye"]').click()
await page.waitForTimeout(200)
check('eye hides an overlay', (await overlayRows.nth(0).getAttribute('data-visible')) === 'no')
await overlayRows.nth(0).locator('[data-testid="map-overlay-eye"]').click()
await page.waitForTimeout(200)
check('eye shows it again', (await overlayRows.nth(0).getAttribute('data-visible')) === 'yes')
await overlayRows.nth(0).locator('[data-testid="map-overlay-rename"]').click()
await page.waitForTimeout(300)
await page.locator('[data-testid="map-overlay-rename-name"]').fill('Site A')
await page.locator('[data-testid="map-overlay-rename-confirm"]').click()
await page.waitForTimeout(300)
check(
  'rename updates the overlay',
  ((await overlayRows.nth(0).textContent()) ?? '').includes('Site A'),
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
await page.locator('[data-testid="map-overlays-toggle"]').click()
await page.waitForTimeout(350)
check(
  'overlays persist across reload (names + active)',
  (await root().getAttribute('data-overlays')) === '2' &&
    ((await overlayRows.nth(0).textContent()) ?? '').includes('Site A') &&
    (await overlayRows.nth(0).getAttribute('data-active')) === 'yes',
)
await overlayRows.nth(1).locator('[data-testid="map-overlay-delete"]').click()
await page.waitForTimeout(200)
check(
  'deleting an empty overlay is instant',
  (await root().getAttribute('data-overlays')) === '1',
)
{
  // draw tools follow view readiness — offline the view may or may not have
  // settled yet, so assert consistency rather than a fixed state
  const st = await root().getAttribute('data-map-status')
  check(
    'draw tools follow view readiness',
    (await page.locator('[data-testid="map-draw-marker"]').isDisabled()) === (st !== 'ready') &&
      (await page.locator('[data-testid="map-draw-edit"]').isDisabled()) === (st !== 'ready'),
    `status=${st}`,
  )
}

// ---- 2D/3D toggle + persistence, 3D buildings/trees switches (in panel) ----
check('starts in 2D', (await root().getAttribute('data-view-mode')) === '2d')
check(
  'buildings switch hidden in 2D',
  (await page.locator('[data-testid="map-buildings"]').count()) === 0,
)
check(
  'trees switch hidden in 2D',
  (await page.locator('[data-testid="map-trees"]').count()) === 0,
)
// Drone flight is a 3D-only tool; its contract attrs render offline.
check(
  'flight tool disabled in 2D',
  await page.locator('[data-testid="map-tool-flight"]').isDisabled(),
)
check(
  'flight contract defaults (no points, idle, cruise 60)',
  (await root().getAttribute('data-flight-points')) === '0' &&
    (await root().getAttribute('data-flight-anim')) === 'idle' &&
    (await root().getAttribute('data-flight-cruise')) === '60' &&
    (await root().getAttribute('data-drone-t')) === '0.000',
)
await page.locator('[data-testid="map-mode-3d"]').click()
await page.waitForTimeout(500)
check('3D mode selected', (await root().getAttribute('data-view-mode')) === '3d')
check(
  'flight tool enables in 3D',
  !(await page.locator('[data-testid="map-tool-flight"]').isDisabled()),
)
if (online) {
  const status3d = await waitForAttr('data-map-status', (v) => v === 'ready', 60000)
  check('scene view becomes ready', status3d === 'ready', `status=${status3d}`)
}
check(
  'buildings switch appears in 3D, on by default',
  (await page.locator('[data-testid="map-buildings"]').count()) === 1 &&
    (await root().getAttribute('data-buildings')) === 'on',
)
check(
  'trees switch appears in 3D, on by default',
  (await page.locator('[data-testid="map-trees"]').count()) === 1 &&
    (await root().getAttribute('data-trees')) === 'on',
)
await page.locator('[data-testid="map-buildings"]').click()
await page.waitForTimeout(300)
check('buildings switch off', (await root().getAttribute('data-buildings')) === 'off')
await page.locator('[data-testid="map-trees"]').click()
await page.waitForTimeout(300)
check(
  'trees switch off (independent of buildings)',
  (await root().getAttribute('data-trees')) === 'off',
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
check(
  '3D choice persists across reload',
  (await root().getAttribute('data-view-mode')) === '3d',
)
check(
  'buildings choice persists across reload',
  (await root().getAttribute('data-buildings')) === 'off',
)
check(
  'trees choice persists across reload',
  (await root().getAttribute('data-trees')) === 'off',
)
// panel open state is transient — reopen to reach the switches
check('panel closed after reload (transient)', (await root().getAttribute('data-panel')) === 'closed')
await page.locator('[data-testid="map-overlays-toggle"]').click()
await page.waitForTimeout(350)
await page.locator('[data-testid="map-buildings"]').click()
await page.waitForTimeout(300)
check('buildings back on', (await root().getAttribute('data-buildings')) === 'on')
await page.locator('[data-testid="map-trees"]').click()
await page.waitForTimeout(300)
check('trees back on', (await root().getAttribute('data-trees')) === 'on')
await page.locator('[data-testid="map-overlays-toggle"]').click()
await page.waitForTimeout(350)
check('panel closes', (await root().getAttribute('data-panel')) === 'closed')
await page.locator('[data-testid="map-mode-2d"]').click()
await page.waitForTimeout(500)
check('back to 2D', (await root().getAttribute('data-view-mode')) === '2d')

// ---- tool strip contract ----
check('no tool active initially', (await root().getAttribute('data-tool')) === 'none')
await page.locator('[data-testid="map-tool-route"]').click()
await page.waitForTimeout(200)
check('route tool activates', (await root().getAttribute('data-tool')) === 'route')
check('route starts idle', (await root().getAttribute('data-route-status')) === 'idle')
check('route starts with no waypoints', (await root().getAttribute('data-route-points')) === '0')
check('route starts with no legs', (await root().getAttribute('data-route-legs')) === '0')
check(
  'route profile picker renders',
  (await page.locator('[data-testid="map-route-walk"]').count()) === 1 &&
    (await page.locator('[data-testid="map-route-drive"]').count()) === 1,
)
check(
  'undo renders disabled with no history',
  await page.locator('[data-testid="map-route-undo"]').isDisabled(),
)
check(
  'save disabled with no route',
  await page.locator('[data-testid="map-route-save"]').isDisabled(),
)
check(
  'saved-routes menu disabled when empty',
  await page.locator('[data-testid="map-routes-open"]').isDisabled(),
)
check('no saved routes initially', (await root().getAttribute('data-saved-routes')) === '0')
check('locate control renders', (await page.locator('[data-testid="map-locate"]').count()) === 1)
check('no bookmarks initially', (await root().getAttribute('data-bookmarks')) === '0')
check(
  'bookmarks menu disabled when empty',
  await page.locator('[data-testid="map-bookmarks-open"]').isDisabled(),
)
{
  const st = await root().getAttribute('data-map-status')
  check(
    'bookmark save follows view readiness',
    (await page.locator('[data-testid="map-bookmark-save"]').isDisabled()) === (st !== 'ready'),
    `status=${st}`,
  )
}

// ---- coordinate readout: pointer tracking + click-to-copy. Offline-safe:
// view.toMap only needs the view transform (center/scale), not tiles. ----
{
  const coords = page.locator('[data-testid="map-coords"]')
  check('coordinate readout renders', (await coords.count()) === 1)
  const mapBox = await page.locator('[data-testid="map-container"]').boundingBox()
  const deadline = Date.now() + 10000
  let lat = null
  let lon = null
  while (Date.now() < deadline) {
    await page.mouse.move(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.5)
    await page.mouse.move(mapBox.x + mapBox.width * 0.52, mapBox.y + mapBox.height * 0.52)
    lat = await coords.getAttribute('data-lat')
    lon = await coords.getAttribute('data-lon')
    if (lat && lon) break
    await page.waitForTimeout(300)
  }
  check(
    'readout tracks the pointer near Singapore',
    lat != null &&
      lon != null &&
      Math.abs(parseFloat(lat) - 1.35) < 2 &&
      Math.abs(parseFloat(lon) - 103.82) < 3,
    `${lat},${lon}`,
  )
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await coords.click()
  await page.waitForTimeout(200)
  check('copy feedback shows', ((await coords.textContent()) ?? '') === 'Copied')
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  check('clipboard holds lat, lon', clip === `${lat}, ${lon}`, clip)
  await page.waitForTimeout(1100)
  check(
    'readout restores after the copy flash',
    ((await coords.textContent()) ?? '').includes(','),
  )
}

// ---- fullscreen: in-place CSS (no remount), fully offline-assertable ----
check('starts windowed', (await root().getAttribute('data-fullscreen')) === 'off')
const windowedBox = await root().boundingBox()
await page.locator('[data-testid="map-fullscreen"]').click()
await page.waitForTimeout(400)
check('fullscreen toggles on', (await root().getAttribute('data-fullscreen')) === 'on')
const fsMetrics = await root().evaluate((el) => {
  const r = el.getBoundingClientRect()
  return {
    position: getComputedStyle(el).position,
    left: r.left,
    top: r.top,
    right: r.width + r.left,
    bottom: r.height + r.top,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }
})
check(
  'fullscreen root is fixed over the whole viewport',
  fsMetrics.position === 'fixed' &&
    fsMetrics.left <= 2 &&
    fsMetrics.top <= 2 &&
    fsMetrics.right >= fsMetrics.vw - 2 &&
    fsMetrics.bottom >= fsMetrics.vh - 2,
  JSON.stringify(fsMetrics),
)
const fsBox = await root().boundingBox()
check(
  'map area grew (view resizes in place, no remount)',
  windowedBox != null && fsBox != null && fsBox.height > windowedBox.height + 30,
  `h ${windowedBox?.height} -> ${fsBox?.height}`,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('Escape exits fullscreen', (await root().getAttribute('data-fullscreen')) === 'off')
check(
  'root back in normal flow',
  (await root().evaluate((el) => getComputedStyle(el).position)) !== 'fixed',
)

// The click-driven checks need a READY view, not tiles: offline the view
// settles ready with a broken basemap, and clicks/toMap/goTo/SketchVM all
// work against the view transform. OSRM is mocked either way.
{
  // Offline this is opportunistic: the first view settles ready fast, but a
  // view re-created after the 2D/3D swaps waits on the failed scene layers
  // and may never settle — then this branch skips, same as tile checks.
  const interactive =
    (await waitForAttr('data-map-status', (v) => v === 'ready', online ? 45000 : 15000)) ===
    'ready'
  if (interactive) {
    const box = await page.locator('[data-testid="map-container"]').boundingBox()
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]

    // Build A → B. Same screen height = same latitude, so the echoed route
    // line runs exactly through the midpoint we insert at later.
    await page.mouse.click(...at(0.35, 0.5))
    await page.waitForTimeout(400)
    check('first click arms next point', (await root().getAttribute('data-route-status')) === 'picking')
    await page.mouse.click(...at(0.65, 0.5))
    const routeStatus = await waitForAttr('data-route-status', (v) => v === 'ok' || v === 'error', 15000)
    check('route resolves from (mocked) OSRM', routeStatus === 'ok', `status=${routeStatus}`)
    check('route distance published', (await root().getAttribute('data-route-km')) === '12.3')
    check('OSRM was called through the mock', osrmCoords.length >= 1, `requests=${osrmCoords.length}`)

    // Insert: click ON the drawn line, halfway along — waypoint 2 of 3.
    await page.mouse.click(...at(0.5, 0.5))
    await waitForAttr('data-route-status', (v) => v === 'ok', 15000)
    check('click on the line inserts a waypoint', (await root().getAttribute('data-route-points')) === '3')

    // Per-leg breakdown: 3 waypoints → 2 legs listed in the chip's popover.
    check('three waypoints publish two legs', (await root().getAttribute('data-route-legs')) === '2')
    await page.locator('[data-testid="map-route-result"]').click()
    await page.waitForTimeout(300)
    const legRows = await page.locator('[data-testid="map-route-leg"]').count()
    check('chip popover lists one row per leg', legRows === 2, `rows=${legRows}`)
    const firstLeg = await page.locator('[data-testid="map-route-leg"]').first().textContent()
    check(
      'leg rows carry the numbered-marker labels and split distance',
      (firstLeg ?? '').includes('1 → 2') && (firstLeg ?? '').includes('6.2 km'),
      firstLeg ?? 'null',
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const last = osrmCoords[osrmCoords.length - 1]
    check(
      'inserted waypoint routed in the middle',
      last.length === 3 && last[0][0] < last[1][0] && last[1][0] < last[2][0],
      JSON.stringify(last),
    )

    // Remove: click the destination marker (waypoint 3).
    await page.mouse.click(...at(0.65, 0.5))
    await waitForAttr('data-route-points', (v) => v === '2', 15000)
    check('clicking a waypoint marker removes it', (await root().getAttribute('data-route-points')) === '2')

    // Undo unwinds remove, then insert.
    await page.locator('[data-testid="map-route-undo"]').click()
    await page.waitForTimeout(300)
    check('undo restores the removed waypoint', (await root().getAttribute('data-route-points')) === '3')
    await page.locator('[data-testid="map-route-undo"]').click()
    await page.waitForTimeout(300)
    check('undo unwinds the insert', (await root().getAttribute('data-route-points')) === '2')

    // Clear is undoable too.
    await page.locator('[data-testid="map-route-clear"]').click()
    await page.waitForTimeout(200)
    check('route clears', (await root().getAttribute('data-route-status')) === 'idle')
    await page.locator('[data-testid="map-route-undo"]').click()
    await page.waitForTimeout(300)
    check('undo restores a cleared route', (await root().getAttribute('data-route-points')) === '2')
    await waitForAttr('data-route-status', (v) => v === 'ok', 15000)

    // ---- drag-to-move: grab the destination marker, pull it up-screen ----
    const preDrag = osrmCoords[osrmCoords.length - 1]
    const [fx, fy] = at(0.65, 0.5)
    await page.mouse.move(fx, fy)
    await page.mouse.down()
    await page.waitForTimeout(200) // pointer-down hitTest arms the drag
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(fx, fy - i * 15)
      await page.waitForTimeout(50)
    }
    await page.mouse.up()
    await waitForAttr('data-route-status', (v) => v === 'ok', 15000)
    check('drag keeps the waypoint count', (await root().getAttribute('data-route-points')) === '2')
    const postDrag = osrmCoords[osrmCoords.length - 1]
    check(
      'dragging a marker re-routes with the moved coordinate',
      osrmCoords.length > 0 &&
        postDrag.length === 2 &&
        postDrag[1][1] > preDrag[1][1] + 1e-6 &&
        Math.abs(postDrag[0][0] - preDrag[0][0]) < 1e-9,
      `B lat ${preDrag[1][1].toFixed(4)} -> ${postDrag[1][1].toFixed(4)}`,
    )
    check('drag is undoable', !(await page.locator('[data-testid="map-route-undo"]').isDisabled()))

    // ---- saved routes: save, clear, load, persist across reload, delete ----
    await page.locator('[data-testid="map-route-save"]').click()
    await page.waitForTimeout(300)
    check(
      'save dialog prefills a name',
      (await page.locator('[data-testid="map-route-save-name"]').inputValue()) === 'Route 1',
    )
    await page.locator('[data-testid="map-route-save-confirm"]').click()
    await page.waitForTimeout(300)
    check('route saved', (await root().getAttribute('data-saved-routes')) === '1')
    await page.locator('[data-testid="map-route-clear"]').click()
    await page.waitForTimeout(200)
    await page.locator('[data-testid="map-routes-open"]').click()
    await page.waitForTimeout(300)
    check('saved route listed', (await page.locator('[data-testid="map-route-item"]').count()) === 1)
    await page.locator('[data-testid="map-route-item"]').click()
    await waitForAttr('data-route-status', (v) => v === 'ok', 15000)
    check('loading a saved route restores its waypoints', (await root().getAttribute('data-route-points')) === '2')

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
    await waitForAttr('data-map-status', (v) => v === 'ready', 45000)
    await page.locator('[data-testid="map-tool-route"]').click()
    await page.waitForTimeout(200)
    check(
      'saved routes persist across reload',
      (await root().getAttribute('data-saved-routes')) === '1',
    )
    await page.locator('[data-testid="map-routes-open"]').click()
    await page.waitForTimeout(300)
    await page.locator('[data-testid="map-route-delete"]').click()
    await page.waitForTimeout(300)
    check('deleting a saved route empties the list', (await root().getAttribute('data-saved-routes')) === '0')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

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

    // ---- viewport persistence: pan, wait for the stationary capture,
    //      reload and reopen at the same spot (no unmount on reload — the
    //      stationary watcher is what survives a browser close) ----
    const lonBefore = await root().getAttribute('data-center-lon')
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(
        box.x + box.width * 0.5 - i * 30,
        box.y + box.height * 0.5 + i * 12,
      )
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    const lonAfterPan = await waitForAttr('data-center-lon', (v) => v !== lonBefore, 15000)
    check('panning updates the persisted viewpoint', lonAfterPan !== lonBefore, `lon=${lonAfterPan}`)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
    check(
      'viewport survives a reload',
      (await root().getAttribute('data-center-lon')) === lonAfterPan,
      `expected ${lonAfterPan}, got ${await root().getAttribute('data-center-lon')}`,
    )

    // ---- bookmarks: save this view, pan away, jump back, persist, delete ----
    await waitForAttr('data-map-status', (v) => v === 'ready', 45000)
    const savedLon = parseFloat(await root().getAttribute('data-center-lon'))
    await page.locator('[data-testid="map-bookmark-save"]').click()
    await page.waitForTimeout(300)
    check(
      'bookmark dialog prefills a name',
      (await page.locator('[data-testid="map-bookmark-save-name"]').inputValue()) === 'Bookmark 1',
    )
    await page.locator('[data-testid="map-bookmark-save-confirm"]').click()
    await page.waitForTimeout(300)
    check('bookmark saved', (await root().getAttribute('data-bookmarks')) === '1')

    // pan away again so the jump is observable
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + box.width * 0.5 + i * 35, box.y + box.height * 0.5 - i * 10)
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    await waitForAttr(
      'data-center-lon',
      (v) => Math.abs(parseFloat(v) - savedLon) > 0.005,
      15000,
    )

    await page.locator('[data-testid="map-bookmarks-open"]').click()
    await page.waitForTimeout(300)
    check(
      'bookmark listed',
      (await page.locator('[data-testid="map-bookmark-item"]').count()) === 1,
    )
    await page.locator('[data-testid="map-bookmark-item"]').click()
    const backLon = await waitForAttr(
      'data-center-lon',
      (v) => Math.abs(parseFloat(v) - savedLon) < 0.02,
      20000,
    )
    check(
      'loading a bookmark flies back to the saved view',
      Math.abs(parseFloat(backLon) - savedLon) < 0.02,
      `saved ${savedLon}, got ${backLon}`,
    )

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
    check(
      'bookmarks persist across reload',
      (await root().getAttribute('data-bookmarks')) === '1',
    )
    await page.locator('[data-testid="map-bookmarks-open"]').click()
    await page.waitForTimeout(300)
    await page.locator('[data-testid="map-bookmark-delete"]').click()
    await page.waitForTimeout(300)
    check('deleting a bookmark empties the list', (await root().getAttribute('data-bookmarks')) === '0')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // ---- drawing into overlay groups: markers + polygon land in the
    // active overlay ("Site A" from the offline block), a second overlay
    // collects its own shapes, visibility joins per group ----
    await page.locator('[data-testid="map-overlays-toggle"]').click()
    await page.waitForTimeout(350)
    check(
      'draw tools enabled once the view is ready',
      !(await page.locator('[data-testid="map-draw-marker"]').isDisabled()),
    )
    await page.locator('[data-testid="map-draw-marker"]').click()
    await page.waitForTimeout(200)
    check('marker mode active', (await root().getAttribute('data-draw-mode')) === 'marker')
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4)
    await waitForAttr('data-drawings', (v) => v === '1', 10000)
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.45)
    await waitForAttr('data-drawings', (v) => v === '2', 10000)
    check(
      'marker mode plants continuously',
      (await root().getAttribute('data-drawings')) === '2',
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    check('Escape ends marker mode', (await root().getAttribute('data-draw-mode')) === 'none')

    await page.locator('[data-testid="map-draw-polygon"]').click()
    await page.waitForTimeout(200)
    check('polygon mode active', (await root().getAttribute('data-draw-mode')) === 'polygon')
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.6)
    await page.waitForTimeout(300)
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.6)
    await page.waitForTimeout(300)
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7)
    await page.waitForTimeout(300)
    await page.mouse.dblclick(box.x + box.width * 0.3, box.y + box.height * 0.7)
    await waitForAttr('data-drawings', (v) => v === '3', 10000)
    check('polygon drawn and committed', (await root().getAttribute('data-drawings')) === '3')
    check(
      'polygon completion ends the mode',
      (await waitForAttr('data-draw-mode', (v) => v === 'none', 5000)) === 'none',
    )
    check(
      'shapes land in the active overlay',
      (await overlayRows.nth(0).getAttribute('data-count')) === '3' &&
        (await root().getAttribute('data-visible-drawings')) === '3',
    )

    // second overlay collects its own shapes
    await page.locator('[data-testid="map-overlay-add"]').click()
    await page.waitForTimeout(200)
    await page.locator('[data-testid="map-draw-marker"]').click()
    await page.waitForTimeout(200)
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.35)
    await waitForAttr('data-drawings', (v) => v === '4', 10000)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    check(
      'new shapes follow the newly active overlay',
      (await overlayRows.nth(1).getAttribute('data-count')) === '1' &&
        (await overlayRows.nth(0).getAttribute('data-count')) === '3',
    )

    // per-group visibility joins into the rendered set
    await overlayRows.nth(0).locator('[data-testid="map-overlay-eye"]').click()
    await page.waitForTimeout(200)
    check(
      'hiding a group hides only its shapes',
      (await root().getAttribute('data-visible-drawings')) === '1' &&
        (await root().getAttribute('data-drawings')) === '4',
    )
    await overlayRows.nth(0).locator('[data-testid="map-overlay-eye"]').click()
    await page.waitForTimeout(200)

    // expand → per-shape list + delete
    await overlayRows.nth(0).locator('[data-testid="map-overlay-expand"]').click()
    await page.waitForTimeout(300)
    check(
      'expanding lists the group shapes',
      (await page.locator('[data-testid="map-drawing-item"]').count()) === 3,
    )
    await page.locator('[data-testid="map-drawing-delete"]').first().click()
    await page.waitForTimeout(300)
    check(
      'per-shape delete removes one',
      (await root().getAttribute('data-drawings')) === '3' &&
        (await overlayRows.nth(0).getAttribute('data-count')) === '2',
    )

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="map-page"]', { timeout: 30000 })
    check(
      'grouped drawings persist across reload',
      (await root().getAttribute('data-drawings')) === '3' &&
        (await root().getAttribute('data-overlays')) === '2',
    )
    await page.locator('[data-testid="map-overlays-toggle"]').click()
    await page.waitForTimeout(350)

    // ---- edit-in-place: select overlay B's marker, drag it, commit ----
    await waitForAttr('data-map-status', (v) => v === 'ready', 45000)
    await overlayRows.nth(1).locator('[data-testid="map-overlay-expand"]').click()
    await page.waitForTimeout(300)
    const labelBefore = await page.locator('[data-testid="map-drawing-item"]').first().textContent()
    await page.locator('[data-testid="map-draw-edit"]').click()
    await page.waitForTimeout(200)
    check('edit mode active', (await root().getAttribute('data-draw-mode')) === 'edit')
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.35)
    await page.waitForTimeout(800) // selection handles appear
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.35)
    await page.mouse.down()
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        box.x + box.width * (0.55 + 0.014 * i),
        box.y + box.height * (0.35 - 0.01 * i),
      )
      await page.waitForTimeout(60)
    }
    await page.mouse.up()
    await page.waitForTimeout(400)
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.85) // commit
    await page.waitForTimeout(800)
    const labelAfter = await page.locator('[data-testid="map-drawing-item"]').first().textContent()
    check(
      'dragging a shape commits new geometry',
      labelAfter != null && labelAfter !== labelBefore &&
        (await root().getAttribute('data-drawings')) === '3',
      `${labelBefore} -> ${labelAfter}`,
    )
    await page.locator('[data-testid="map-draw-edit"]').click()
    await page.waitForTimeout(200)
    check('edit mode toggles off', (await root().getAttribute('data-draw-mode')) === 'none')

    // deleting a group with shapes confirms, and takes its shapes with it
    await overlayRows.nth(0).locator('[data-testid="map-overlay-delete"]').click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(300)
    check(
      'deleting a group removes its shapes',
      (await root().getAttribute('data-overlays')) === '1' &&
        (await root().getAttribute('data-drawings')) === '1',
    )
    await overlayRows.nth(0).locator('[data-testid="map-overlay-delete"]').click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.waitForTimeout(300)
    check(
      'map fully cleared',
      (await root().getAttribute('data-overlays')) === '0' &&
        (await root().getAttribute('data-drawings')) === '0',
    )
    await page.locator('[data-testid="map-overlays-toggle"]').click()
    await page.waitForTimeout(350)

    // ---- drone flight: plant in 3D, add waypoints, fly the animation ----
    await page.locator('[data-testid="map-mode-3d"]').click()
    const flightReady =
      (await waitForAttr('data-map-status', (v) => v === 'ready', 60000)) === 'ready'
    if (flightReady) {
      await page.locator('[data-testid="map-tool-flight"]').click()
      await page.waitForTimeout(300)
      check('flight tool activates in 3D', (await root().getAttribute('data-tool')) === 'flight')
      // Plant the drone + two waypoints (each click awaits an async ground
      // elevation sample before the point lands).
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
      await waitForAttr('data-flight-points', (v) => v === '1', 10000)
      check('first click plants the drone', (await root().getAttribute('data-flight-points')) === '1')
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4)
      await waitForAttr('data-flight-points', (v) => v === '2', 10000)
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.55)
      await waitForAttr('data-flight-points', (v) => v === '3', 10000)
      const flightKm = parseFloat((await root().getAttribute('data-flight-km')) ?? '')
      check('flight path has a length', Number.isFinite(flightKm) && flightKm > 0, `km=${flightKm}`)

      await page.locator('[data-testid="map-flight-play"]').click()
      await page.waitForTimeout(200)
      check('flight animation starts', (await root().getAttribute('data-flight-anim')) === 'playing')
      const t1 = parseFloat((await waitForAttr('data-drone-t', (v) => parseFloat(v ?? '0') > 0, 5000)) ?? '0')
      check('drone progresses along the path', t1 > 0, `t=${t1}`)
      await page.locator('[data-testid="map-flight-pause"]').click()
      await page.waitForTimeout(400)
      check('flight pauses', (await root().getAttribute('data-flight-anim')) === 'paused')
      const tPaused = (await root().getAttribute('data-drone-t')) ?? ''
      await page.waitForTimeout(500)
      check(
        'paused drone holds position',
        ((await root().getAttribute('data-drone-t')) ?? '') === tPaused,
      )
      await page.locator('[data-testid="map-flight-reset"]').click()
      await page.waitForTimeout(200)
      check(
        'reset parks the drone at the start',
        (await root().getAttribute('data-flight-anim')) === 'idle' &&
          (await root().getAttribute('data-drone-t')) === '0.000',
      )
      await page.locator('[data-testid="map-flight-clear"]').click()
      await page.waitForTimeout(200)
      check('clear empties the flight plan', (await root().getAttribute('data-flight-points')) === '0')
      // Switching to 2D releases the 3D-only tool.
      await page.locator('[data-testid="map-flight-play"]').isDisabled() // settle
      await page.locator('[data-testid="map-mode-2d"]').click()
      await page.waitForTimeout(400)
      check(
        '2D switch releases the flight tool',
        (await root().getAttribute('data-tool')) === 'none' &&
          (await page.locator('[data-testid="map-tool-flight"]').isDisabled()),
      )
    } else {
      console.log('SKIP: 3D view never settled — flight interactive checks skipped')
      await page.locator('[data-testid="map-mode-2d"]').click()
      await page.waitForTimeout(400)
    }
  } else if (online) {
    check('online but view never ready', false, 'ready wait timed out')
  } else {
    console.log('SKIP: view never settled ready offline — click-driven checks skipped')
  }
}

// ---- deep link ----
await page.goto(`${BASE_URL}map`, { waitUntil: 'networkidle' })
const deepLinkOk = (await page.locator('[data-testid="map-page"]').count()) === 1
check('deep link /map renders the page', deepLinkOk)

await finish(browser)
