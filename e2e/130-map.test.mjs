/**
 * Map page suite. Asserts the page's data-* contract, not tile pixels —
 * the basemap comes from the ArcGIS CDN, which this environment may block.
 * A reachability probe (run in the page, so it measures what the browser
 * actually sees) picks between the online and offline branches:
 *  - always: nav link, lazy-chunk isolation (no @arcgis code until the Map
 *    page is visited), theme-follow (data-basemap + injected ArcGIS CSS flip
 *    with the app toggle — render-computed, works offline), the basemap
 *    gallery (12 tiles, explicit pick beats the theme, CARTO WebTileLayer
 *    path, persistence, back to Auto + pure resolver units), the basemap
 *    health watchdog (offline: fallback ladder exhausts → failed + banner;
 *    online: ok, no banner), 2D/3D toggle +
 *    persistence, tool toggles, pure routeGeometry unit checks (bundled
 *    module: insert index, nearest-distance, tap threshold), pure
 *    flightPathModel checks (3D lengths, sampling, heading, done), pure
 *    flightPlanModel checks (OSM parsing, geometry, climb/detour/blocked
 *    decisions) + the flight tool's 3D-only enable, contract and settings
 *    defaults, undo-disabled state, deep-link render.
 *  - online only: data-map-status reaches "ready" (from view.when, never
 *    networkidle), attribution + zoom UI present, click-driven pins with
 *    reload persistence, and the waypoint-editing flow against an ECHO OSRM
 *    mock (returns a line through the requested coords): A→B distance,
 *    insert by clicking the line, remove by clicking a marker, undo of
 *    remove/insert/clear, drag-to-move a marker (re-routes with the moved
 *    coordinate), saved routes (save dialog, load from the menu,
 *    persistence across reload, delete), and the drone flight flow in 3D
 *    (plant + waypoints via clicks, the bbox-driven Overpass mock's
 *    building making legs climb — and detour once climbing is disallowed —
 *    saved flight plans (save dialog, clear, load restores waypoints +
 *    altitudes + settings, delete), play/pause/reset animation, clear,
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
import {
  BASEMAP_DEFS,
  nextBasemapFallback,
  probeTileUrls,
  resolveBasemapId,
} from './.bundle/basemapCatalog.js'
import { buildFlightPath, chaseCamera, sampleFlight } from './.bundle/flightPathModel.js'
import {
  estimateHeight,
  inflateRing,
  parseOverpassBuildings,
  planFlight,
  segmentThroughPolygon,
} from './.bundle/flightPlanModel.js'

const { check, finish } = reporter('map')
const { browser, context, page } = await launch()

const root = () => page.locator('[data-testid="map-page"]')

// Regression guard for the 4.x footgun (lesson #124): view.destroy()
// destroys view.map unless the map is detached first. If any view swap
// leaks ArcGIS's "map is already destroyed" warning, the shared map died
// and every later view renders blank.
const destroyedMapWarnings = []
page.on('console', (m) => {
  if (m.text().includes('map is already destroyed')) destroyedMapWarnings.push(m.text())
})

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

// Mock Overpass the same way: the flight planner's building data must be
// deterministic wherever the clicks land. The mock reads the requested bbox
// out of the query and answers with ONE large square building centered in
// it (40% of the bbox span), so at least one leg of any 3-point plan
// crosses it. Height is suite-controlled.
const mockBuildingHeight = 80
await page.route('**overpass-api.de/**', (route) => {
  const body = decodeURIComponent(route.request().postData() ?? '')
  const m = body.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/)
  if (!m) return route.fulfill({ status: 400, body: 'bad query' })
  const [s, w, n, e] = m.slice(1).map(Number)
  const cy = (s + n) / 2
  const cx = (w + e) / 2
  const hy = (n - s) * 0.2
  const hx = (e - w) * 0.2
  const corners = [
    [cy - hy, cx - hx],
    [cy - hy, cx + hx],
    [cy + hy, cx + hx],
    [cy + hy, cx - hx],
    [cy - hy, cx - hx],
  ]
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { building: 'yes', height: String(mockBuildingHeight) },
          geometry: corners.map(([lat, lon]) => ({ lat, lon })),
        },
      ],
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
  check(
    'probeTileUrls: template layers get a tile probe, esri styles none',
    probeTileUrls('osm')[0] === 'https://a.tile.openstreetmap.org/3/4/3.png' &&
      probeTileUrls('carto-voyager')[0] ===
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/4/3.png' &&
      probeTileUrls('gray-vector').length === 0 &&
      probeTileUrls('satellite').length === 0,
  )
  check(
    'nextBasemapFallback walks the provider ladder',
    nextBasemapFallback('gray-vector', []) === 'osm' &&
      nextBasemapFallback('osm', []) === 'carto-voyager' &&
      nextBasemapFallback('gray-vector', ['gray-vector', 'osm']) === 'carto-voyager' &&
      nextBasemapFallback('gray-vector', ['gray-vector', 'osm', 'carto-voyager']) === null,
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

    // Chase camera: behind along the travel heading, above, aimed down.
    {
      const northbound = { lon: 103.8, lat: 1.35, z: 60, headingDeg: 0, done: false }
      const cam = chaseCamera(northbound)
      check(
        'chase cam sits 80 m south of a northbound drone, 40 m above',
        cam.lat < northbound.lat &&
          Math.abs((northbound.lat - cam.lat) * 111320 - 80) < 0.5 &&
          Math.abs(cam.lon - northbound.lon) < 1e-9 &&
          cam.z === 100 &&
          cam.headingDeg === 0,
        JSON.stringify(cam),
      )
      check(
        'chase cam tilt aims at the drone (atan2(back, up))',
        Math.abs(cam.tiltDeg - (Math.atan2(80, 40) * 180) / Math.PI) < 1e-9,
      )
      const eastbound = chaseCamera({ lon: 103.8, lat: 0, z: 60, headingDeg: 90, done: false }, 100, 50)
      check(
        'chase cam sits west of an eastbound drone with custom back/up',
        eastbound.lon < 103.8 &&
          Math.abs((103.8 - eastbound.lon) * 111320 - 100) < 0.5 &&
          eastbound.z === 110,
        JSON.stringify(eastbound),
      )
    }
  }

  // Flight planner: OSM parsing + the climb / detour / blocked decisions.
  {
    check(
      'estimateHeight: tag, levels ×3, default',
      estimateHeight({ height: '25 m' }) === 25 &&
        estimateHeight({ height: '12,5' }) === 12.5 &&
        estimateHeight({ 'building:levels': '10' }) === 30 &&
        estimateHeight({}) === 10 &&
        estimateHeight(undefined) === 10,
    )
    const parsed = parseOverpassBuildings({
      elements: [
        {
          type: 'way',
          tags: { height: '50' },
          geometry: [
            { lat: 1, lon: 2 },
            { lat: 1.001, lon: 2 },
            { lat: 1.001, lon: 2.001 },
          ],
        },
        { type: 'way', tags: {} }, // no geometry — dropped
        { type: 'node' },
      ],
    })
    check('parseOverpassBuildings keeps valid ways only', parsed.length === 1 && parsed[0].height === 50)
    check('parseOverpassBuildings survives junk', parseOverpassBuildings(null).length === 0 && parseOverpassBuildings({ elements: 'x' }).length === 0)

    const squareXY = [
      [40, -10],
      [60, -10],
      [60, 10],
      [40, 10],
    ]
    const through = segmentThroughPolygon([0, 0], [100, 0], squareXY)
    check(
      'segment through a square reports the crossing interval',
      through != null && Math.abs(through[0] - 0.4) < 1e-9 && Math.abs(through[1] - 0.6) < 1e-9,
      JSON.stringify(through),
    )
    check(
      'segment missing the square reports null',
      segmentThroughPolygon([0, 20], [100, 20], squareXY) === null,
    )
    check(
      'endpoint inside the square counts from t=0',
      segmentThroughPolygon([50, 0], [200, 0], squareXY)?.[0] === 0,
    )
    const inflated = inflateRing(squareXY, 5)
    check(
      'inflateRing pushes corners outward by the clearance',
      Math.hypot(inflated[0][0] - 50, inflated[0][1]) > Math.hypot(squareXY[0][0] - 50, squareXY[0][1]) + 4,
    )

    // A 222 m northward leg with a ~110 m square building astride its middle.
    const A = { lon: 103.8, lat: 1.35, ground: 0 }
    const B = { lon: 103.8, lat: 1.352, ground: 0 }
    const building = (height) => ({
      height,
      ring: [
        [103.7995, 1.3505],
        [103.8005, 1.3505],
        [103.8005, 1.3515],
        [103.7995, 1.3515],
      ],
    })
    const opts = { cruise: 60, allowClimb: true, ceiling: 120 }

    const low = planFlight([A, B], [building(30)], opts)
    check('leg over a low building flies direct', low.legs[0].mode === 'direct' && low.climbs === 0)

    const over = planFlight([A, B], [building(100)], opts)
    check(
      'tall building climbs to top + clearance',
      over.legs[0].mode === 'climb' &&
        over.climbs === 1 &&
        Math.max(...over.legs[0].path.map((p) => p.z)) === 105,
      JSON.stringify(over.legs[0].path),
    )

    const overCeiling = planFlight([A, B], [building(200)], opts)
    check(
      'ceiling overflow falls back to a detour',
      overCeiling.legs[0].mode === 'detour' && overCeiling.detours === 1,
    )

    const noClimb = planFlight([A, B], [building(100)], { ...opts, allowClimb: false })
    check(
      'climb disallowed detours at cruise height',
      noClimb.legs[0].mode === 'detour' &&
        noClimb.legs[0].path.length > 2 &&
        noClimb.legs[0].path.every((p) => p.z === 60),
      JSON.stringify(noClimb.legs[0].path.map((p) => p.z)),
    )
    // The detour must actually clear the footprint: no sub-segment may pass
    // through the (uninflated) building ring.
    {
      const M = 111320
      const cos = Math.cos((1.35 * Math.PI) / 180)
      const ringXY = building(100).ring.map(([lon, lat]) => [lon * M * cos, lat * M])
      const pathXY = noClimb.legs[0].path.map((p) => [p.lon * M * cos, p.lat * M])
      let crosses = false
      for (let i = 0; i < pathXY.length - 1; i++) {
        if (segmentThroughPolygon(pathXY[i], pathXY[i + 1], ringXY) != null) crosses = true
      }
      check('detour path clears the building footprint', !crosses)
    }

    // Start point surrounded by a building it cannot out-climb: blocked.
    const trap = {
      height: 500,
      ring: [
        [103.798, 1.348],
        [103.802, 1.348],
        [103.802, 1.3515],
        [103.798, 1.3515],
      ],
    }
    const blockedPlan = planFlight([A, B], [trap], { ...opts, allowClimb: false })
    check(
      'inescapable start reports a blocked leg and no flyable path',
      blockedPlan.legs[0].mode === 'blocked' && blockedPlan.blocked === 1 && blockedPlan.path.length === 0,
    )

    const mixed = planFlight([A, B, { lon: 103.8, lat: 1.354, ground: 0 }], [building(100)], opts)
    check(
      'multi-leg plan counts modes per leg',
      mixed.legs.length === 2 && mixed.legs[0].mode === 'climb' && mixed.legs[1].mode === 'direct',
    )

    // Per-waypoint altitude: an explicit high altitude at B slopes the leg
    // clear over the building — no climb decision needed, and the endpoint
    // z values honour alt (B) vs cruise (A).
    const highB = planFlight([A, { ...B, alt: 300 }], [building(100)], opts)
    check(
      'per-waypoint altitude slopes the leg direct over the building',
      highB.legs[0].mode === 'direct' &&
        highB.legs[0].path[0].z === 60 &&
        highB.legs[0].path[1].z === 300,
      JSON.stringify(highB.legs[0]),
    )
    // A LOW override at B keeps the leg obstructed → still climbs.
    const lowB = planFlight([A, { ...B, alt: 20 }], [building(100)], opts)
    check(
      'low per-waypoint altitude still climbs over the building',
      lowB.legs[0].mode === 'climb' &&
        lowB.legs[0].path[lowB.legs[0].path.length - 1].z === 20,
    )

    // ---- exhaustive detour: blocked must mean ENCLOSED, never "search gave
    // up early". Fixtures in meter offsets around A. ----
    {
      const M = 111320
      const cosB = Math.cos((1.35 * Math.PI) / 180)
      const at = (xm, ym) => [103.8 + xm / (M * cosB), 1.35 + ym / M]
      const rect = (cx, cy, w, h) => ({
        height: 200,
        ring: [
          at(cx - w / 2, cy - h / 2),
          at(cx + w / 2, cy - h / 2),
          at(cx + w / 2, cy + h / 2),
          at(cx - w / 2, cy + h / 2),
        ],
      })
      const start = { lon: 103.8, lat: 1.35, ground: 0 }
      const goal = { lon: 103.8, lat: 1.35 + 600 / M, ground: 0 } // 600 m north
      const noClimb = { cruise: 60, allowClimb: false, ceiling: 120 }
      const clearsAll = (leg, rects) => {
        const toXY = ([lon, lat]) => [lon * M * cosB, lat * M]
        const pathXY = leg.path.map((p) => toXY([p.lon, p.lat]))
        for (let i = 0; i < pathXY.length - 1; i++) {
          for (const r of rects) {
            if (segmentThroughPolygon(pathXY[i], pathXY[i + 1], r.ring.map(toXY)) != null) {
              return false
            }
          }
        }
        return true
      }

      // A 1.5 km wall across the leg: its ends are ~750 m out — far beyond
      // the old 400 m corner corridor, which mislabeled this "blocked".
      const wall = [rect(0, 300, 1500, 20)]
      const wide = planFlight([start, goal], wall, noClimb)
      check(
        'long wall gets a wide detour, not blocked',
        wide.legs[0].mode === 'detour' && clearsAll(wide.legs[0], wall),
        wide.legs[0].mode,
      )

      // Courtyard walls sealing the start on all four sides: truly blocked.
      const courtyard = [
        rect(0, 100, 220, 20),
        rect(0, -100, 220, 20),
        rect(100, 0, 20, 220),
        rect(-100, 0, 20, 220),
      ]
      const sealed = planFlight([start, goal], courtyard, noClimb)
      check(
        'sealed courtyard is genuinely blocked',
        sealed.legs[0].mode === 'blocked' && sealed.path.length === 0,
      )

      // Same courtyard, but the EAST wall has a 70 m opening — off the
      // leg's own line (the north wall still blocks straight ahead), so the
      // ONLY way out is threading that side gap.
      const gapped = [
        rect(0, 100, 220, 20),
        rect(0, -100, 220, 20),
        rect(100, -72.5, 20, 75),
        rect(100, 72.5, 20, 75),
        rect(-100, 0, 20, 220),
      ]
      const escape = planFlight([start, goal], gapped, noClimb)
      check(
        'courtyard with a wide gap detours through it',
        escape.legs[0].mode === 'detour' && clearsAll(escape.legs[0], gapped),
        escape.legs[0].mode,
      )

      // An 8 m opening is narrower than 2×clearance (10 m): the inflated
      // footprints seal it — blocked is the CORRECT verdict.
      const slit = [
        rect(0, 100, 220, 20),
        rect(0, -100, 220, 20),
        rect(100, -57, 20, 106),
        rect(100, 57, 20, 106),
        rect(-100, 0, 20, 220),
      ]
      const tooNarrow = planFlight([start, goal], slit, noClimb)
      check(
        'gap narrower than 2×clearance stays blocked',
        tooNarrow.legs[0].mode === 'blocked',
        tooNarrow.legs[0].mode,
      )
    }
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
  // OSMF tile servers (the watchdog's first fallback probe).
  await page.route('**://*.tile.openstreetmap.org/**', (r) => r.abort())
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

// ---- basemap health watchdog: view-ready says nothing about tiles, so the
// page checks the basemap itself and falls back across providers ----
if (online) {
  const health = await waitForAttr('data-basemap-health', (v) => v === 'ok', 30000)
  check('basemap health reaches ok online', health === 'ok', `health=${health}`)
  check(
    'no basemap warning online',
    (await page.locator('[data-testid="map-basemap-warning"]').count()) === 0,
  )
  check(
    'active basemap matches the choice',
    (await root().getAttribute('data-basemap-active')) ===
      (await root().getAttribute('data-basemap')),
  )
} else {
  // Every tile provider is abort-routed: the watchdog must walk the ladder
  // and end on fallback/failed with the warning banner up — while the
  // choice-derived contract attr stays untouched.
  const health = await waitForAttr(
    'data-basemap-health',
    (v) => v === 'fallback' || v === 'failed',
    40000,
  )
  check(
    'offline: watchdog reports fallback/failed',
    health === 'fallback' || health === 'failed',
    `health=${health}`,
  )
  check(
    'offline: basemap warning banner shows',
    (await page.locator('[data-testid="map-basemap-warning"]').count()) === 1,
  )
  check(
    'offline: data-basemap contract unchanged by fallback',
    (await root().getAttribute('data-basemap')) === 'gray-vector',
  )
}

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
check(
  'flight plan defaults (idle, no climbs/detours/blocked)',
  (await root().getAttribute('data-flight-status')) === 'idle' &&
    (await root().getAttribute('data-flight-climbs')) === '0' &&
    (await root().getAttribute('data-flight-detours')) === '0' &&
    (await root().getAttribute('data-flight-blocked')) === '0',
)
await page.locator('[data-testid="map-mode-3d"]').click()
await page.waitForTimeout(500)
check('3D mode selected', (await root().getAttribute('data-view-mode')) === '3d')
check(
  'flight tool enables in 3D',
  !(await page.locator('[data-testid="map-tool-flight"]').isDisabled()),
)
// The settings render with their defaults (activating the tool is pure
// state — no view readiness needed).
await page.locator('[data-testid="map-tool-flight"]').click()
await page.waitForTimeout(200)
check(
  'flight settings render (climb on, ceiling 120)',
  (await page.locator('[data-testid="map-flight-climb"] input').isChecked()) &&
    (await page.locator('[data-testid="map-flight-ceiling"]').inputValue()) === '120',
)
await page.locator('[data-testid="map-flight-climb"]').click()
await page.waitForTimeout(200)
check(
  'ceiling input hides when climbing is off',
  (await page.locator('[data-testid="map-flight-ceiling"]').count()) === 0,
)
await page.locator('[data-testid="map-flight-climb"]').click()
await page.waitForTimeout(200)
// Camera follow: renders, defaults off, toggles the contract attr.
check(
  'follow toggle renders defaulted off',
  (await page.locator('[data-testid="map-flight-follow"]').count()) === 1 &&
    (await root().getAttribute('data-flight-follow')) === 'off',
)
await page.locator('[data-testid="map-flight-follow"]').click()
await page.waitForTimeout(200)
check('follow toggles on', (await root().getAttribute('data-flight-follow')) === 'on')
await page.locator('[data-testid="map-flight-follow"]').click()
await page.waitForTimeout(200)
check('follow toggles back off', (await root().getAttribute('data-flight-follow')) === 'off')
check(
  'waypoint-altitudes button disabled with no points',
  (await page.locator('[data-testid="map-flight-waypoints"]').isDisabled()) &&
    (await root().getAttribute('data-flight-alts')) === '',
)
// Saved flight plans: both buttons render, disabled while there is nothing
// to save (< 2 points) and nothing saved.
check(
  'flight save/load disabled when empty',
  (await page.locator('[data-testid="map-flight-save"]').isDisabled()) &&
    (await page.locator('[data-testid="map-flights-open"]').isDisabled()) &&
    (await root().getAttribute('data-saved-flights')) === '0',
)
await page.locator('[data-testid="map-tool-flight"]').click() // release the tool
await page.waitForTimeout(200)
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
check(
  'view swaps never destroy the shared map',
  destroyedMapWarnings.length === 0,
  destroyedMapWarnings[0] ?? '',
)

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
  // ONLINE-gated: since the detach-before-destroy fix (lesson #124) the
  // view reliably reaches ready offline too — which unmasked that several
  // click-driven flows (insert-on-line thresholds off view.scale, SketchVM
  // drawing) genuinely need the online environment. The branch was always
  // documented online-only; the readiness wait guards flaky networks.
  const interactive =
    online &&
    (await waitForAttr('data-map-status', (v) => v === 'ready', 45000)) === 'ready'
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

      // The mocked Overpass building (80 m, astride the plan's center) makes
      // at least one leg climb under the default 120 m ceiling.
      await waitForAttr('data-flight-status', (v) => v === 'ready', 15000)
      const climbs = parseInt((await root().getAttribute('data-flight-climbs')) ?? '0', 10)
      check(
        'plan climbs over the mocked building',
        (await root().getAttribute('data-flight-status')) === 'ready' &&
          climbs >= 1 &&
          (await root().getAttribute('data-flight-blocked')) === '0',
        `climbs=${climbs}`,
      )

      // Per-waypoint altitude: set an override on waypoint 1 through the
      // popover, watch the contract attr, clear it back to cruise. (Path-
      // length deltas are meters against multi-km legs — not assertable
      // through the 2-decimal km attr; the pure checks own the z math.)
      await page.locator('[data-testid="map-flight-waypoints"]').click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="map-flight-wp-alt"]').nth(1).fill('150')
      await page.waitForTimeout(200)
      check(
        'altitude override lands in the contract',
        (await root().getAttribute('data-flight-alts')) === ',150,',
      )
      await page.locator('[data-testid="map-flight-wp-alt"]').nth(1).fill('')
      await page.waitForTimeout(200)
      check(
        'clearing the override returns the waypoint to cruise',
        (await root().getAttribute('data-flight-alts')) === ',,',
      )
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await waitForAttr('data-flight-status', (v) => v === 'ready', 15000)

      // Saved flight plans: re-apply the waypoint-1 override so the full
      // waypoint shape (alt included) round-trips through save → clear →
      // load, then delete the entry through the menu.
      await page.locator('[data-testid="map-flight-waypoints"]').click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="map-flight-wp-alt"]').nth(1).fill('150')
      await page.waitForTimeout(200)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      await waitForAttr('data-flight-status', (v) => v === 'ready', 15000)
      const kmBeforeSave = (await root().getAttribute('data-flight-km')) ?? ''
      await page.locator('[data-testid="map-flight-save"]').click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="map-flight-save-name"]').fill('Test flight')
      await page.locator('[data-testid="map-flight-save-confirm"]').click()
      await page.waitForTimeout(300)
      check('flight saved', (await root().getAttribute('data-saved-flights')) === '1')
      await page.locator('[data-testid="map-flight-clear"]').click()
      await page.waitForTimeout(200)
      check(
        'cleared flight leaves the saved one loadable',
        (await root().getAttribute('data-flight-points')) === '0' &&
          (await page.locator('[data-testid="map-flight-save"]').isDisabled()) &&
          !(await page.locator('[data-testid="map-flights-open"]').isDisabled()),
      )
      await page.locator('[data-testid="map-flights-open"]').click()
      await page.waitForTimeout(300)
      check(
        'saved flight listed by name',
        ((await page.locator('[data-testid="map-flight-item"]').textContent()) ?? '').includes(
          'Test flight',
        ),
      )
      await page.locator('[data-testid="map-flight-item"]').click()
      await page.waitForTimeout(600) // past the replan debounce
      await waitForAttr('data-flight-status', (v) => v === 'ready', 15000)
      check(
        'loading restores waypoints, altitudes, settings and length',
        (await root().getAttribute('data-flight-points')) === '3' &&
          (await root().getAttribute('data-flight-alts')) === ',150,' &&
          (await root().getAttribute('data-flight-cruise')) === '60' &&
          ((await root().getAttribute('data-flight-km')) ?? '') === kmBeforeSave,
        `km=${await root().getAttribute('data-flight-km')} saved=${kmBeforeSave}`,
      )
      await page.locator('[data-testid="map-flights-open"]').click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="map-flight-delete"]').click()
      await page.waitForTimeout(300)
      check(
        'deleting the saved flight empties the list',
        (await root().getAttribute('data-saved-flights')) === '0' &&
          (await page.locator('[data-testid="map-flights-open"]').isDisabled()),
      )
      // Back to the no-override plan for the follow/play checks below.
      await page.locator('[data-testid="map-flight-waypoints"]').click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="map-flight-wp-alt"]').nth(1).fill('')
      await page.waitForTimeout(200)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      await waitForAttr('data-flight-status', (v) => v === 'ready', 15000)

      // Fly under the chase camera — its per-tick camera writes must not
      // break the loop (the camera pose itself has no data-attr contract;
      // the pure chaseCamera checks cover the math).
      await page.locator('[data-testid="map-flight-follow"]').click()
      await page.waitForTimeout(200)
      check('follow on for the flight', (await root().getAttribute('data-flight-follow')) === 'on')

      // A manual pan gesture must auto-release the chase-cam.
      await page.mouse.move(box.x + box.width * 0.47, box.y + box.height * 0.65)
      await page.mouse.down()
      for (let i = 1; i <= 5; i++) {
        await page.mouse.move(
          box.x + box.width * (0.47 + 0.01 * i),
          box.y + box.height * (0.65 + 0.008 * i),
        )
        await page.waitForTimeout(50)
      }
      await page.mouse.up()
      await waitForAttr('data-flight-follow', (v) => v === 'off', 5000)
      check(
        'manual pan releases the follow cam',
        (await root().getAttribute('data-flight-follow')) === 'off',
      )
      await page.locator('[data-testid="map-flight-follow"]').click()
      await page.waitForTimeout(200)
      check('follow re-enabled for the flight', (await root().getAttribute('data-flight-follow')) === 'on')

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

      // Disallow climbing: the same legs must re-plan as detours (the 80 m
      // building still stands, so nothing may stay a climb).
      await page.locator('[data-testid="map-flight-climb"]').click()
      await waitForAttr('data-flight-climbs', (v) => v === '0', 15000)
      const detours = parseInt((await root().getAttribute('data-flight-detours')) ?? '0', 10)
      const blockedCount = parseInt((await root().getAttribute('data-flight-blocked')) ?? '0', 10)
      check(
        'climb off re-plans the legs as detours',
        (await root().getAttribute('data-flight-climbs')) === '0' && detours + blockedCount >= 1,
        `detours=${detours} blocked=${blockedCount}`,
      )
      await page.locator('[data-testid="map-flight-climb"]').click()
      await waitForAttr('data-flight-climbs', (v) => parseInt(v ?? '0', 10) >= 1, 15000)
      check(
        'climb back on restores the climbing plan',
        parseInt((await root().getAttribute('data-flight-climbs')) ?? '0', 10) >= 1,
      )

      await page.locator('[data-testid="map-flight-clear"]').click()
      await page.waitForTimeout(200)
      check('clear empties the flight plan', (await root().getAttribute('data-flight-points')) === '0')
      // follow is persisted — leave it off
      await page.locator('[data-testid="map-flight-follow"]').click()
      await page.waitForTimeout(200)
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
    console.log('SKIP: offline — click-driven checks are online-only')
  }
}

// ---- deep link ----
await page.goto(`${BASE_URL}map`, { waitUntil: 'networkidle' })
const deepLinkOk = (await page.locator('[data-testid="map-page"]').count()) === 1
check('deep link /map renders the page', deepLinkOk)

// Every view swap in the whole suite (toggle section, flight branch,
// reloads) must have left the shared map alive.
check(
  'no destroyed-map warnings across the whole suite',
  destroyedMapWarnings.length === 0,
  destroyedMapWarnings[0] ?? '',
)

await finish(browser)
