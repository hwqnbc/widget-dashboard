# Map page — design notes

The Map page (`/map`) is the app's first page-level heavy feature: an ArcGIS
map built on the `@arcgis/core` npm package with a **free, no-API-key
basemap** that follows the app's dark/light theme toggle, a 2D map / 3D globe
view switch, and a strip of client-side tools (locate-me, persisted pins,
measure, walk/bike/drive route distance). The map's eventual purpose is
undecided — the page is a foundation plus an enhancement backlog, everything
on it works without a backend server or API key.

## Route, nav & chunk isolation

- `src/pages/MapPage.tsx` is a thin `lazy(() => import('./map/MapPageBody'))`
  + `<Suspense>` wrapper (the DroneSimWidget pattern); the route is added in
  `src/App.tsx` and the nav item in `AppLayout`'s `NAV_ITEMS`.
- **@arcgis/core enters the bundle only through `src/pages/map/MapPageBody.tsx`.**
  No `manualChunks` needed: the single dynamic-import boundary lets Vite
  auto-split (verify in `vite build` output — the entry chunk must not grow,
  `MapPageBody-*.js` carries the ~1.8 MB ArcGIS core, and ArcGIS's own lazy
  imports fan out into many small chunks). Never barrel-re-export anything
  from `src/pages/map/` (lessons.md #57).
- The pinned dependency is `@arcgis/core@~4.34.8`. npm's `latest` is the
  **5.x major** — don't cross it casually; the free-basemap + CDN-asset
  behaviour here is verified on 4.x (upgrade is a backlog item).

## Basemap & theme follow — and the gallery

- The basemap **gallery** lives at the top of the overlays panel: a grid of
  swatch tiles (CSS gradients, no network thumbnails — renders offline) over
  every free, key-free option. The catalog is the PURE module
  `src/pages/map/basemapCatalog.ts` (e2e-bundled): eight Esri **legacy**
  basemaps via `Basemap.fromId` (`gray-vector`, `dark-gray-vector`, `osm`,
  `streets-vector`, `streets-night-vector`, `topo-vector`, `satellite`,
  `hybrid` — modern `arcgis/*` styles require an API key, these don't) plus
  three **CARTO** raster styles (`voyager`, `light_all`, `dark_all`) built as
  `WebTileLayer` basemaps with the OSM/CARTO attribution (fair-use tiles, no
  key).
- The persisted choice (`map.basemap`, plain string, default **`'auto'`**)
  resolves through the pure `resolveBasemapId(choice, themeMode)`: `'auto'`
  follows the app theme via `BASEMAP_BY_MODE` (light → `gray-vector`, dark →
  `dark-gray-vector`) — the original behaviour — while an explicit pick wins
  over the theme toggle; unknown/malformed persisted values fall back to the
  theme pair (never crash the render). The swap effect assigns
  `map.basemap = createBasemap(id)` in place; no view re-create. Esri
  sunsets the legacy styles in Mar 2028 / Dec 2029 — the CARTO entries in
  this same catalog are the migration path (flip what `'auto'` maps to).
- **Basemap health watchdog** (from a real phone report: tiles silently
  never drew). `view.when` resolving says NOTHING about the basemap — a
  dead one still yields `data-map-status='ready'` over an empty map — and
  template-based layers (CARTO `WebTileLayer`, the `osm` raster) even
  "load" without touching the network. So after every basemap apply the
  page verifies it can actually draw: `basemap.load()` **plus loading every
  base layer** (a vector/tiled layer fetches its style/metadata there and
  rejects when its CDN is blocked) plus, for template providers, a no-cors
  fetch of a sample tile from `probeTileUrls(id)` (pure, in the catalog) —
  each step raced against an 8 s timeout. On failure it walks
  `nextBasemapFallback`'s provider-diverse ladder (`osm` → OSMF servers,
  `carto-voyager` → CARTO CDN, `gray-vector` → Esri CDN) so a device whose
  content blocker / private DNS filters one tile host still gets a map, and
  shows a dismissible banner naming what failed and what it is showing
  instead. The persisted choice and `data-basemap` never change — the live
  state is published as `data-basemap-active` + `data-basemap-health`
  (`checking|ok|fallback|failed`), and an epoch counter discards stale
  async results when the choice or theme changes mid-check.
- ArcGIS widget chrome CSS ships as two separate stylesheets. Both are
  imported **`?inline`** (strings, typed by the `*.css?inline` shim in
  `src/vite-env.d.ts`) and the matching one is held in a single swapped
  `<style id="arcgis-theme">` element — no global CSS file enters the
  project, no fetch on toggle, and the CSS rides inside the lazy chunk.

## The view lifecycle (2D/3D) — and keeping ArcGIS out of React

- One shared `EsriMap` (basemap + `ground: 'world-elevation'` + three
  GraphicsLayers: route, pins, locate) lives in a ref for the whole mount.
  The view-creation effect keys on the persisted `viewMode` and builds a
  `MapView` (2D) or `SceneView` (3D globe; world-elevation is also a free
  legacy service) **over the same map and container**, carrying the camera
  across via a saved `viewpoint` — pins and route lines survive the toggle
  because they live on the map, not the view. StrictMode's dev double-mount
  (create → destroy → create) is the supported ArcGIS pattern.
  **Detach before destroy** (lesson #124): `view.destroy()` destroys
  `view.map` in 4.x, so the swap cleanup sets `view.map = null` first —
  without it the first toggle killed the shared map and every later view
  rendered blank ("tiles don't load"). `ensureMap` also self-heals by
  rebuilding if it ever finds the map destroyed, and suite 130 fails on any
  "map is already destroyed" console warning.
- **The live view never enters React state or props** (lessons.md #67):
  ArcGIS `Accessor` objects are getter minefields, and React 19's dev-mode
  render instrumentation deep-walks changed props — reading `zoom` on a
  destroyed `SceneView` throws inside React's commit and unmounts the whole
  app ("Should not already be working"). Children receive
  `viewRef` + a `viewRevision` number instead. Every ArcGIS
  construct/destroy path is also wrapped (`safeDestroy`, try/catch around
  creation): with its CDN unreachable ArcGIS constructors and teardown really
  do throw.
- **Overlays panel** (`OverlaysPanel.tsx`) — a Layers button floating at the
  map's right edge slides out a panel (absolute inside the map wrapper, so
  it works in fullscreen; `translateX` transition; transient open state,
  `data-panel`). It hosts the basemap gallery (see the basemap section),
  the overlay visibility switches (3D buildings, 3D trees — 3D mode only —
  plus Pins and Drawings layer visibility, `showPins`/`showDrawings` in the
  slice), the drawing tools and the drawings list.
- **Drawing into overlay groups** (`SketchBinding.tsx` + the panel's "My
  overlays" list) — an **overlay** is a named group of shapes
  (`MapOverlay {id, name, visible}`); the **active** overlay (highlighted,
  `activeOverlayId`, persisted) receives new shapes, and the panel manages
  the groups: add ("+ New", auto-created on first draw if none exist),
  rename (dialog), per-group show/hide (eye — the drawings mirror joins
  visibility, rendering only shapes of visible groups), delete
  (confirm-guarded when the group has shapes, removes them too), expand →
  per-shape list with delete. Marker and Polygon modes bind ArcGIS's
  client-side `SketchViewModel` (no key) to a transient **scratch layer**;
  completed sketches convert to WGS84 (`webMercatorUtils`) and dispatch into
  the persisted `drawings` list (`MapDrawing` with `overlayId`), mirrored
  onto the **drawings layer** — redux is the single source of truth, same
  as pins. Markers plant continuously until Esc/toggle-off; polygons finish
  on double-click; draw modes and the strip tools are mutually exclusive
  click claimants. **Edit mode** (third draw toggle) binds an update-mode
  `SketchViewModel` to the mirrored drawings layer (`updateOnGraphicClick`
  + reshape/move tools): tap a shape → drag its vertices (polygons) or the
  whole shape (markers), click elsewhere to commit — the new geometry
  round-trips through `updateDrawingGeometry` (id/overlay preserved) and
  the mirror rebuilds — Esc reverts (aborted updates are not committed;
  update-cancel does not exit edit mode). Shapes from before groups existed
  are swept into an "Imported" overlay by `adoptOrphanDrawings` on mount. Contract:
  `data-draw-mode`, `data-drawings`, `data-overlays`, `data-active-overlay`,
  `data-visible-drawings`, `data-pins-visible` + per-row
  `data-active/-visible/-count` on `map-overlay-item`.
- **3D buildings & trees** — two independent switches **in the overlays
  panel** (3D mode, persisted, default on) add Esri's public Living Atlas
  scene layers:
  **"OpenStreetMap 3D Buildings"** (portal item
  `ca0470dbbddb4db28bad74ed39949e25`) and **"OpenStreetMap 3D Trees
  (Thematic)"** (`f75fef56b2d944fe92ef9f7737b4f953`; the Realistic variant
  `33383da8a75f4d24b4b6a0d0532abe6e` is a one-line swap — Thematic's
  stylized shapes match the untextured buildings and stream lighter) —
  free, **no API key**, global OSM-derived, updated monthly. Each
  `SceneLayer` is created lazily on first 3D use (try/catch — offline it
  degrades silently), lives on the shared map (the 2D MapView just doesn't
  render scene layers) and is driven by `visible` afterwards. Contract:
  `data-buildings` / `data-trees` on the root.
- **Fullscreen** — a strip button (`data-testid="map-fullscreen"`, Escape or
  the button exits) fixes the page root over the viewport (`position: fixed;
  inset: 0` at modal z-index) plus best-effort native `requestFullscreen`.
  Deliberately **not** the widgets' `FullscreenProvider`: its portaled
  Dialog remounts its child, which would destroy and rebuild the live
  ArcGIS view — the map instead restyles **in place** and the view just
  resizes with its container (lessons.md #72). Transient state, never
  persisted; `data-fullscreen` on the root.
- **The viewport persists.** A `stationary` watcher snapshots the camera as
  plain numbers (`SavedViewpoint` in `mapSlice`: lon/lat/scale + 3D
  camera extras) into redux whenever the map comes to rest — writing
  as-you-go is what survives a **browser close**, where no unmount cleanup
  ever runs (the unmount path also saves, covering in-app navigation).
  On open, precedence is: in-session 2D/3D carry-over viewpoint → persisted
  `SavedViewpoint` → the **Singapore default** (`DEFAULT_VIEW`, city-wide
  scale). A 2D-saved viewpoint restores in 3D via center+scale; a 3D-saved
  one restores its full camera (position/heading/tilt).
- Runtime assets (workers, fonts, widget locale bundles) come from the ArcGIS
  CDN in production (the 4.x default — also sidesteps the `/widget-dashboard/`
  GitHub Pages base path). **In dev they're served from
  `/node_modules/@arcgis/core/assets`** (`esriConfig.assetsPath`, gated on
  `import.meta.env.DEV`) so the page — and the e2e suite — work on a
  CDN-blocked network. Basemap *tiles* always need the network; the page
  shows a warning `Alert` and `data-map-status="error"`/`"loading"` instead
  of crashing. Self-hosting assets in production (copy
  `node_modules/@arcgis/core/assets` into `public/`) remains the documented
  fallback if the CDN ever becomes a problem.

## Tools (all client-side, no keys)

- **Locate** (`LocateControl.tsx`): browser geolocation → `view.goTo` + a
  marker graphic. Works without tiles.
- **Pins** (`mapSlice.ts` + sync effect in `MapPageBody`): pin tool on → map
  click adds a pin, clicking an existing pin (hitTest) removes it, clear-all
  behind the shared `ConfirmDialog`. Pins are `{id, lon, lat}` in the new
  persisted `map` slice (registered in `app/store.ts`, rides the existing
  `testsite` localStorage key) and are mirrored to a GraphicsLayer.
- **Bookmarks** (`BookmarksControl.tsx`): star buttons in the strip save the
  current camera as a named `MapBookmark` (`{ name, viewpoint }` — the same
  `SavedViewpoint` shape as the viewport memory, so a 3D bookmark keeps its
  full camera) into the persisted slice; the jump menu lists them
  (`2D/3D · lat, lon` secondary), flies back via `view.goTo` (camera target
  in 3D, center+scale otherwise) and deletes per item. Save is gated on the
  view being ready. Contract: `data-bookmarks` on the root.
- **Coordinate readout** (`CoordinateReadout.tsx`): a monospace chip over
  the map's bottom-right showing `lat, lon` (5 dp ≈ 1 m) under the pointer
  (time-throttled `pointer-move` → `view.toMap` — NOT rAF-throttled: an
  idle page may schedule no frames, wedging an rAF gate shut, lessons.md
  #73), falling back to the view
  center on `stationary` for touch devices; click copies with a brief
  "Copied" swap. All updates write straight to the DOM node — zero React
  re-renders per mousemove, and React must never re-create the node (it
  holds the value). Notably `toMap` needs only the view transform, not
  tiles, so the whole contract (`data-lat`/`data-lon` on the chip) asserts
  in the e2e suite's offline branch, clipboard included.
- **Measure** (`MeasureControls.tsx`): mounts the ArcGIS measurement widget
  matching tool + view dimension (`DistanceMeasurement2D`/`AreaMeasurement2D`
  vs `DirectLineMeasurement3D`/`AreaMeasurement3D`) into the view UI,
  destroyed on tool change.
- **Route distance with waypoints** (`osrm.ts`, `routeGeometry.ts`,
  `useOsrmRoute.ts`, `RouteControl.tsx`): map clicks build a waypoint list
  (numbered markers — start green, end red, intermediates orange; capped at
  25 for public-server politeness), profile toggle walks/bikes/drives, and
  the **FOSSGIS public OSRM server**
  (`routing.openstreetmap.de/routed-{car,bike,foot}`, free, no key,
  CORS-open — takes N `;`-separated coordinates per request) returns the
  route, drawn as a polyline with a km/min/pts chip. Editing semantics, in
  click-dispatch order: tap a **marker** to remove that waypoint (hitTest on
  `waypointIndex`, same pattern as pins), tap **on the line** to insert into
  that leg, tap **anywhere else** to append a new destination. Insert
  position is pure math (`routeGeometry.ts` — no ArcGIS imports, bundled by
  `e2e/run.mjs` for offline unit checks): project the click and OSRM's
  road-snapped waypoints onto the route polyline's monotonic measure and
  splice between the bracketing pair; "on the line" is a 12-px tolerance
  derived from `view.scale` (present on both MapView and SceneView, unlike
  `resolution`). Markers can also be **dragged to move** a waypoint: a
  `pointer-down` hitTest pre-arms the drag (hitTest is async, but the drag
  event's `stopPropagation` — which stops the map panning — must be called
  synchronously), `drag` moves the marker graphics live via `view.toMap`,
  and the drag **end step commits** one re-route — the event-ordering rules
  (pointer-up can outrace drag end; toMap can be null at release) live in
  the pure `dragModel.ts` state machine, unit-tested offline by the e2e
  bundle (lessons.md #71). An **Undo** button unwinds
  add/remove/insert/move/clear through a history stack (capped at 20).
  The result chip is clickable once routed: a popover lists the **per-leg
  breakdown** ("1 → 2 · km · min" rows matching the numbered markers, plus
  the total) — OSRM's `legs` array comes free in the response we already
  fetch, no extra request.
  **Saved routes**: the bookmark-add button names and saves the current
  waypoints + profile to the persisted `map` slice (`SavedRoute[]`); the
  bookmarks menu lists them with load (restores points + profile — undoable —
  and flies to the route's extent) and per-item delete. One fetch per edit
  with abort-on-change — well inside the fair-use policy (attribution +
  ≤1 req/s). Esri's own routing service needs an API key, hence OSRM.
- **Drone flight** (`FlightBinding.tsx` + `FlightControl.tsx` + the pure
  `flightPathModel.ts`) — a **3D-only** tool (the strip button disables in
  2D; switching to 2D releases the tool, pauses the animation and hides the
  layer). First click **plants the drone** ("D" marker), further clicks add
  numbered waypoints (cap 12); clicking a marker removes it. Each point
  samples ground elevation via `map.ground.queryElevation` (free
  world-elevation; 3s-raced, offline falls back to 0) and flies at a
  settable **cruise height above ground** (persisted `map.flightCruise`,
  default 60 m). Graphics live on the map's one
  `elevationInfo: absolute-height` GraphicsLayer: ground-tether dashes,
  billboard markers, the hasZ path polyline, and the drone — a quadcopter
  composed from `ObjectSymbol3DLayer` primitives (body puck + four rotor
  spheres + beacon), deliberately **rotation-symmetric so the animation
  never re-assigns a symbol** (symbols are immutable; per-tick symbol swaps
  would rebuild WebGL resources — only `graphic.geometry` moves). The
  Play/Pause/Reset transport drives a 33 ms interval advancing wall-clock
  `dt × 20 m/s` through the pure `sampleFlight` (never rAF-gated,
  lessons.md #73); progress reaches React only via a 250 ms-throttled
  callback (`data-drone-t`) and the terminal `done`. Path length is pure
  math (`buildFlightPath`, 3D distances), so `data-flight-km` asserts
  offline.
  **Building-aware routing** (round 2): the pure `flightPlanModel.ts` plans
  every leg against building footprints + heights fetched by `overpass.ts`
  (free Overpass API, `way["building"]` over the plan's bbox — the same OSM
  source the visual 3D buildings layer is built from; one cached corridor
  per session, ≥1 s between requests, `out geom qt 400` cap). Heights are
  estimates when untagged (`height` tag → `building:levels`×3 m → 10 m),
  and building tops sit on the leg's interpolated ground line (flat-terrain
  approximation). Per leg, in order: **direct** (nothing tall crosses),
  **climb** — only when the "Climb" switch allows raising the flight height
  and top+5 m clearance fits under the **Max (m)** AGL ceiling (persisted
  `flightAllowClimb`/`flightCeiling`, defaults on/120) — a trapezoid
  profile up/over/down; else **detour** — Dijkstra over a visibility graph
  of clearance-inflated footprint corners in the leg corridor, flown at
  cruise; else **blocked** — drawn dashed red, Play disabled until the user
  allows climbing, raises the ceiling, or moves a waypoint. Legs render
  color-coded (blue/green/orange/red), the drone animates over the planned
  path unchanged (`sampleFlight`), and `useFlightPlan.ts` debounces
  re-plans (400 ms, abort-on-change) — when Overpass is unreachable the
  plan falls back to direct legs with `data-flight-status='error'` and the
  control saying so. The e2e Overpass mock is bbox-driven: it reads the
  requested bbox and answers with one large square building centered in
  it, deterministic wherever the 3D clicks land.

## Test contract & offline-tolerant e2e

The page root (`data-testid="map-page"`) publishes: `data-map-status`
(`loading|ready|error` — driven by `view.when()`, **never** networkidle,
which is meaningless against tile servers), `data-basemap`
(**render-computed from the theme**, so the theme-follow assertion holds even
with no network), `data-view-mode`, `data-tool`, `data-pin-count`,
`data-route-status/-km/-points/-profile`, and the persisted-viewport mirror
`data-center-lon/-lat` + `data-scale` (render-computed from the redux
viewpoint or the Singapore default — the offline branch asserts the default,
the online branch pans and asserts reload persistence).

Suite `e2e/130-map.test.mjs` probes ArcGIS-CDN reachability **in the page**
(what the browser sees is what matters) and branches: structural checks,
chunk isolation (no arcgis resources until the Map page is visited),
theme-follow, 2D/3D toggle + persistence, tool activation and the
`routeGeometry` **pure unit checks** (bundled like the game widgets' pure
modules) assert unconditionally; view-ready, attribution/zoom UI,
click-driven pins and the waypoint-editing flow (insert on line, remove on
marker, undo of remove/insert/clear) run only when the CDN is reachable.
OSRM is **always mocked** via `page.route()` — as an **echo mock** returning
a line through the requested coordinates, so the drawn route lies exactly
where the suite clicked and insert-on-line is deterministic.
On this project's sandboxed dev environment the ArcGIS hosts
(`js.arcgis.com`, `basemaps.arcgis.com`) are proxy-blocked, so the suite runs
its offline branch there; the online branch runs on a normal network. Full
visual verification happens on the GitHub Pages deploy.

### The overlays-panel geometry assertion, and why it was flaky

The suite checks that the panel's right edge lands within 3px of the map
container's after the overlays panel opens. That assertion used to fail
roughly half the time; it is fixed, and the cause is worth keeping because the
obvious repairs are both wrong.

`map-container` and `OverlaysPanel` are siblings inside the same
`position: relative` wrapper (`MapPageBody.tsx:1003-1027`); the container is
`width: 100%` of it and the panel is `position: absolute; right: 0`, with a
**200ms transform transition** (`OverlaysPanel.tsx`). Once settled they are
flush by construction.

**Measured, not guessed.** Sampling the computed transform and all three
boxes from the moment of the click:

```
t=0     transform matrix(…308…)   panelRight 1564  contRight 1256  wrapRight 1256
t=200   transform matrix(…308…)   panelRight 1564  contRight 1256  wrapRight 1256
t=300   transform matrix(…182…)   panelRight 1438  contRight 1256  wrapRight 1256
t=350   transform matrix(…60.9…)  panelRight 1317  contRight 1256  wrapRight 1256
settled transform none            panelRight 1256  contRight 1256  wrapRight 1256
```

Two things fall out. **The container is never the problem** — `contRight` and
`wrapRight` are 1256 in every sample, including before the click. (An earlier
version of this note claimed a second, container-width failure mode; that was
wrong, and the measurement above is what disproved it.) And **the transition
does not start until ~260ms after the click** — React's re-render plus MUI's
style recalculation — so the old flat `waitForTimeout(350)` was sampling a
panel that was still moving, at right edge 1317 against a settled 1256. Every
observed failure was this one mode.

**The fix** waits for the computed transform to become exactly `none`. That is
unambiguous: it is a matrix throughout the animation and `none` only once the
panel has settled open. It waits on the *animation* and still asserts the
*geometry*, so the check is strengthened rather than relaxed.

The tempting alternative — "wait until the position stops changing" — is
**wrong here**, and was tried: for the first ~260ms the panel is perfectly
still at its closed position, so a stability check latches onto that and
resolves before the slide has even begun. It fixed 5 of 6 attempts, which is
exactly the kind of nearly-working that hides a bug.

Verified over 10 consecutive runs, from a baseline of roughly one failure in
two.

## Future work (enhancement backlog)

- ~~Basemap gallery~~ — shipped (panel tile grid over 11 free basemaps +
  Auto, see the basemap section above).
- ~~De-flake the overlays-panel geometry assertion~~ — shipped; the wait is now
  on the transform settling to `none` (see the test-contract section above).
- ~~Drone flight round 2: building-aware routing~~ — shipped (Overpass
  footprints + climb/detour/blocked planner, see the drone flight bullet).
- **Drone flight extras** — speed setting, camera follow mode (chase the
  drone via `view.goTo` per tick), per-waypoint altitudes, saved flight
  plans (the `SavedRoute` pattern).
- **Live USGS earthquakes overlay** — `GeoJSONLayer` on the public CORS feed
  (`earthquake.usgs.gov/.../all_day.geojson`), magnitude-scaled renderer +
  popups; toggle in the control strip.
- **Day/night terminator** — client-computed solar position polygon on a
  GraphicsLayer, refreshed each minute.
- **Bundled GeoJSON overlays** — country borders / timezones / plate
  boundaries shipped in the repo, no network.
- **Client-side search** — bundled gazetteer (top ~1k cities) + MUI
  Autocomplete → `view.goTo`; avoids the key-gated Esri geocoder.
- **Named/labelled pins** — pin titles, popups, a pin list panel; extends the
  `map` slice.
- ~~Drag-to-move waypoints~~ — shipped (pointer-down-armed drag, see the
  route bullet above).
- ~~Persisted / named routes~~ — shipped (save dialog + bookmarks menu, see
  the route bullet above).
- ~~Per-leg breakdown~~ — shipped (clickable result chip → legs popover, see
  the route bullet above).
- ~~Bookmarks~~ — shipped (star save + jump menu, see the tools section).
- ~~Coordinate readout~~ — shipped (pointer-tracking chip with copy, see the
  tools section).
- **More draw tools** — polyline/freehand modes (SketchViewModel supports
  them), polygon area/perimeter labels (`geometryEngine.geodesicArea`),
  naming/renaming drawings, per-drawing colors; all extend `MapDrawing` and
  the panel list.
- ~~Edit drawings in place~~ — shipped (Edit draw mode, see the drawing
  bullet above).
- **Swipe compare** — ArcGIS `Swipe` widget between two free basemaps.
- **Heatmap renderer** — over the earthquake feed or a bundled CSV
  (`CSVLayer`).
- ~~Fullscreen~~ — shipped (in-place CSS fullscreen, see the bullet above —
  the widgets' `FullscreenProvider` was deliberately not reused).
- **Screenshot export** — `view.takeScreenshot()` → download.
- **Elevation profile (3D)** — sketch a line, sample `ground` elevation.
- ~~OSM 3D Trees~~ — shipped (thematic variant, independent toggle — see
  the 3D buildings & trees bullet above).
- **Terrain enhancements** — terrain elevation is already live in 3D (the
  free `world-elevation` ground); build on it with a **terrain exaggeration**
  setting and/or a **hillshade** basemap option for visible relief in 2D.
- **@arcgis/core 5.x migration** — new major; re-verify free basemaps + CDN
  asset defaults before crossing.
- **Legacy-basemap sunset migration** (before Mar 2028) — repoint
  `BASEMAP_BY_MODE` (now in `basemapCatalog.ts`) at the CARTO entries and
  drop the retired Esri tiles from the gallery; drop `world-elevation` if it
  goes key-gated (3D degrades to a flat globe).

## Error recovery

A route-level `ErrorBoundary` (`src/components/ErrorBoundary.tsx`, wrapped
around the `<Outlet/>` in `AppLayout`, keyed by pathname so navigation
resets it) converts any page crash into a visible card naming the error —
never a blank page — with **Try again** (re-render) and **Reset map data**
(drops the persisted `map` slice from localStorage and reloads; because
persisted state rehydrates on every load, a crash caused by poisoned state
is otherwise permanent). Render paths that read persisted map data
(drawing/bookmark labels, the viewport focus, the drawings mirror) are
additionally guarded with `Number.isFinite`/shape checks so malformed
entries degrade instead of throwing.

**Stale-deploy chunks** (the user-reported blank page's root cause): hashed
chunk filenames change every deploy, so a cached `index.html` or an
already-open tab requests a chunk that no longer exists — the dynamic
import rejects (Safari: "Importing a module script failed").
`src/utils/lazyWithReload.ts` wraps the MapPage lazy import: a failure
triggers one automatic page reload (fetching the fresh `index.html`), and a
failure in the *reloaded* document falls through to the boundary, which
detects chunk-load errors and swaps its copy + primary button for
**Reload page**.

Three details do the real work, each of them a bug we hit (suite
`142-chunk-recovery` pins all of them):

- **The reload is the retry.** Re-calling the failed dynamic import inside
  the same document issues no request at all — the browser's module map
  remembers the failure for the document's lifetime. Only a fresh document
  can retry.
- **The reload is cache-busted** (`?_rv=<now>`, via `location.replace`, and
  the parameter is stripped from the address bar on the way back up). Pages
  serves `index.html` with `max-age=600`, so a plain `location.reload()` can
  be answered from cache — returning the same stale document with the same
  dead chunk names, and burning the one reload we allow.
- **The latch is keyed per chunk AND per build** (`chunk-reload:<key>:<build
  time>`) and stores a timestamp, not a bare flag. The original one-shot
  flag was a poison pill: once a tab had failed twice (a phone can hold a
  tab open for weeks), every later failure — including on a brand-new
  deploy — skipped the reload and went straight to the error card. Latches
  from other builds are swept, and one older than the 60 s episode window is
  treated as a new episode, so a second bad-connection drop minutes later
  still gets its reload.

The flag lives in sessionStorage (no loops) and clears on
the next successful load. The helper is adopted by **every lazy chunk in the
app**: the MapPage body, the Drone Sim / Drone Strike / Tank Battle /
Model Viewer widget bodies, the in-game lazy models (soldiers, jet
troopers, Lloyd craft — sharing their widget's key) and the avatar
registry's `Figure3D`/`Model3D` fields (one shared `avatar3d` key — one
reload attempt covers the whole family).

## Verifying

- `npm run build` — type-checks; entry chunk unchanged, `MapPageBody-*.js`
  carries ArcGIS (big-chunk warnings for it are expected).
- `npm run lint`.
- `npm run e2e 130` — offline branch on the sandbox (19 checks), full branch
  on a normal network. `npm run e2e 122` re-guards the app bar after the nav
  addition.
- Manual: `/map` — toggle the theme (basemap + widget chrome swap), 2D↔3D,
  drop/remove/clear pins (reload persists), measure in both modes, route with
  each profile. On a CDN-blocked network the page shows the basemap warning
  instead of tiles; that's the designed degradation.
