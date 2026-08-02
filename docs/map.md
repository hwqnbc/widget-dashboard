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

## Basemap & theme follow

- `BASEMAP_BY_MODE` (`MapPageBody.tsx`) maps the MUI palette mode to Esri's
  **legacy basemaps `gray-vector` / `dark-gray-vector` — free, no API key**
  (modern `arcgis/*` basemap styles require one). The theme effect swaps
  `map.basemap = Basemap.fromId(...)` in place; no view re-create. Esri
  sunsets legacy basemaps in Mar 2028 / Dec 2029 — when that lands, swap the
  constant for `osm` (raster OSM) or CARTO `light_all`/`dark_all` via
  `WebTileLayer`, all key-free.
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
- **The live view never enters React state or props** (lessons.md #67):
  ArcGIS `Accessor` objects are getter minefields, and React 19's dev-mode
  render instrumentation deep-walks changed props — reading `zoom` on a
  destroyed `SceneView` throws inside React's commit and unmounts the whole
  app ("Should not already be working"). Children receive
  `viewRef` + a `viewRevision` number instead. Every ArcGIS
  construct/destroy path is also wrapped (`safeDestroy`, try/catch around
  creation): with its CDN unreachable ArcGIS constructors and teardown really
  do throw.
- **3D buildings** — a toggle (visible in 3D mode, persisted, default on)
  adds Esri's public Living Atlas **"OpenStreetMap 3D Buildings"** scene
  layer (portal item `ca0470dbbddb4db28bad74ed39949e25`) — free, **no API
  key**, global extruded OSM footprints, updated monthly. The `SceneLayer`
  is created lazily on first 3D use (try/catch — offline it degrades
  silently), lives on the shared map (the 2D MapView just doesn't render
  scene layers) and is driven by `visible` afterwards. Contract:
  `data-buildings` on the root.
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

## Future work (enhancement backlog)

- **Basemap gallery** — a small picker over the free options (`gray-vector`,
  `dark-gray-vector`, `osm`, CARTO `light_all`/`dark_all`/`voyager` via
  `WebTileLayer`); builds on `BASEMAP_BY_MODE` becoming a catalog.
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
- **Bookmarks** — save the current viewpoint to the map slice, jump list.
- **Coordinate readout** — pointer-move → lon/lat chip with copy.
- **Swipe compare** — ArcGIS `Swipe` widget between two free basemaps.
- **Heatmap renderer** — over the earthquake feed or a bundled CSV
  (`CSVLayer`).
- **Fullscreen** — reuse `FullscreenProvider` for a chrome-less map view.
- **Screenshot export** — `view.takeScreenshot()` → download.
- **Elevation profile (3D)** — sketch a line, sample `ground` elevation.
- **OSM 3D Trees** — the sibling Living Atlas scene layers (thematic /
  realistic), same no-key family as the buildings layer; a second toggle or
  bundled with it.
- **Terrain enhancements** — terrain elevation is already live in 3D (the
  free `world-elevation` ground); build on it with a **terrain exaggeration**
  setting and/or a **hillshade** basemap option for visible relief in 2D.
- **@arcgis/core 5.x migration** — new major; re-verify free basemaps + CDN
  asset defaults before crossing.
- **Legacy-basemap sunset migration** (before Mar 2028) — swap
  `BASEMAP_BY_MODE` to `osm`/CARTO, drop `world-elevation` if it goes
  key-gated (3D degrades to a flat globe).

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
