/**
 * Map page suite. Asserts the page's data-* contract, not tile pixels —
 * the basemap comes from the ArcGIS CDN, which this environment may block.
 * A reachability probe (run in the page, so it measures what the browser
 * actually sees) picks between the online and offline branches:
 *  - always: nav link, lazy-chunk isolation (no @arcgis code until the Map
 *    page is visited), theme-follow (data-basemap + injected ArcGIS CSS flip
 *    with the app toggle — render-computed, works offline), 2D/3D toggle +
 *    persistence, tool toggles, pure routeGeometry unit checks (bundled
 *    module: insert index, nearest-distance, tap threshold), undo-disabled
 *    state, deep-link render.
 *  - online only: data-map-status reaches "ready" (from view.when, never
 *    networkidle), attribution + zoom UI present, click-driven pins with
 *    reload persistence, and the waypoint-editing flow against an ECHO OSRM
 *    mock (returns a line through the requested coords): A→B distance,
 *    insert by clicking the line, remove by clicking a marker, undo of
 *    remove/insert/clear, drag-to-move a marker (re-routes with the moved
 *    coordinate), and saved routes (save dialog, load from the menu,
 *    persistence across reload, delete).
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

// ---- 2D/3D toggle + persistence, 3D buildings toggle ----
check('starts in 2D', (await root().getAttribute('data-view-mode')) === '2d')
check(
  'buildings toggle hidden in 2D',
  (await page.locator('[data-testid="map-buildings"]').count()) === 0,
)
await page.locator('[data-testid="map-mode-3d"]').click()
await page.waitForTimeout(500)
check('3D mode selected', (await root().getAttribute('data-view-mode')) === '3d')
if (online) {
  const status3d = await waitForAttr('data-map-status', (v) => v === 'ready', 60000)
  check('scene view becomes ready', status3d === 'ready', `status=${status3d}`)
}
check(
  'buildings toggle appears in 3D, on by default',
  (await page.locator('[data-testid="map-buildings"]').count()) === 1 &&
    (await root().getAttribute('data-buildings')) === 'on',
)
await page.locator('[data-testid="map-buildings"]').click()
await page.waitForTimeout(300)
check('buildings toggle off', (await root().getAttribute('data-buildings')) === 'off')
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
await page.locator('[data-testid="map-buildings"]').click()
await page.waitForTimeout(300)
check('buildings back on', (await root().getAttribute('data-buildings')) === 'on')
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

if (online) {
  // ---- route: two map clicks → mocked OSRM → distance chip ----
  if (await waitForAttr('data-map-status', (v) => v === 'ready', 45000) === 'ready') {
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
