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
- **Route distance** (`osrm.ts`, `useOsrmRoute.ts`, `RouteControl.tsx`):
  two map clicks pick A→B, profile toggle walks/bikes/drives, and the
  **FOSSGIS public OSRM server** (`routing.openstreetmap.de/routed-{car,bike,foot}`,
  free, no key, CORS-open) returns the route, drawn as a polyline with a
  km/min chip. Fair-use policy: attribution + ≤1 req/s — we fetch once per
  picked pair with abort-on-change. Esri's own routing service needs an API
  key, hence OSRM.

## Test contract & offline-tolerant e2e

The page root (`data-testid="map-page"`) publishes: `data-map-status`
(`loading|ready|error` — driven by `view.when()`, **never** networkidle,
which is meaningless against tile servers), `data-basemap`
(**render-computed from the theme**, so the theme-follow assertion holds even
with no network), `data-view-mode`, `data-tool`, `data-pin-count` and
`data-route-status/-km/-profile`.

Suite `e2e/130-map.test.mjs` probes ArcGIS-CDN reachability **in the page**
(what the browser sees is what matters) and branches: structural checks,
chunk isolation (no arcgis resources until the Map page is visited),
theme-follow, 2D/3D toggle + persistence and tool activation assert
unconditionally; view-ready, attribution/zoom UI, click-driven pins/route/
measure checks run only when the CDN is reachable. OSRM is **always mocked**
via `page.route()` so the route contract never depends on the live service.
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
- **Bookmarks** — save the current viewpoint to the map slice, jump list.
- **Coordinate readout** — pointer-move → lon/lat chip with copy.
- **Swipe compare** — ArcGIS `Swipe` widget between two free basemaps.
- **Heatmap renderer** — over the earthquake feed or a bundled CSV
  (`CSVLayer`).
- **Fullscreen** — reuse `FullscreenProvider` for a chrome-less map view.
- **Screenshot export** — `view.takeScreenshot()` → download.
- **Elevation profile (3D)** — sketch a line, sample `ground` elevation.
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
