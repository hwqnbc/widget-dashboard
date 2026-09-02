/**
 * The basemap gallery's catalog — every option is free and needs no API key.
 *
 * PURE module (no ArcGIS imports): bundled standalone by e2e/run.mjs so the
 * resolver can be unit-checked offline. Construction of the actual Basemap
 * objects (Basemap.fromId / WebTileLayer) lives in MapPageBody.
 *
 * Two families:
 * - Esri "legacy" basemaps (`esriId`, via `Basemap.fromId`) — free without a
 *   key; they sunset in 2028/2029.
 * - CARTO raster styles (`cartoUrl`, via `WebTileLayer`) — free OSM-derived
 *   tiles under CARTO's fair-use policy; they also outlive the Esri sunset,
 *   so the gallery doubles as the migration path.
 */

export interface BasemapDef {
  id: string
  label: string
  /** Two CSS gradient stops for the gallery tile swatch (no network images
   * — the gallery must render offline). */
  swatch: [string, string]
  /** Esri legacy basemap id for `Basemap.fromId`. */
  esriId?: string
  /** CARTO raster tile URL template for `WebTileLayer` ({subDomain} a–d). */
  cartoUrl?: string
}

/** The theme-follow pair used by the "Auto" choice (and as the fallback for
 * unknown persisted values). */
export const BASEMAP_BY_MODE = {
  light: 'gray-vector',
  dark: 'dark-gray-vector',
} as const

const carto = (style: string) =>
  `https://{subDomain}.basemaps.cartocdn.com/rastertiles/${style}/{level}/{col}/{row}.png`

export const CARTO_COPYRIGHT = '© OpenStreetMap contributors, © CARTO'

/** Gallery entries, in display order ("Auto" is rendered separately). */
export const BASEMAP_DEFS: BasemapDef[] = [
  { id: 'gray-vector', label: 'Light Gray', esriId: 'gray-vector', swatch: ['#e8e8e6', '#cfcfcb'] },
  { id: 'dark-gray-vector', label: 'Dark Gray', esriId: 'dark-gray-vector', swatch: ['#3b3b3b', '#1e1e1e'] },
  { id: 'osm', label: 'OpenStreetMap', esriId: 'osm', swatch: ['#cde8b5', '#f3efe2'] },
  { id: 'streets-vector', label: 'Streets', esriId: 'streets-vector', swatch: ['#f7f3e9', '#ffd98e'] },
  { id: 'streets-night-vector', label: 'Streets Night', esriId: 'streets-night-vector', swatch: ['#12233c', '#274b74'] },
  { id: 'topo-vector', label: 'Topographic', esriId: 'topo-vector', swatch: ['#dfe8d8', '#b5c9a8'] },
  { id: 'satellite', label: 'Imagery', esriId: 'satellite', swatch: ['#2e4a33', '#6b7d4f'] },
  { id: 'hybrid', label: 'Imagery Hybrid', esriId: 'hybrid', swatch: ['#33523f', '#8a9a5b'] },
  { id: 'carto-voyager', label: 'CARTO Voyager', cartoUrl: carto('voyager'), swatch: ['#d5eaf5', '#fbe8c9'] },
  { id: 'carto-light', label: 'CARTO Light', cartoUrl: carto('light_all'), swatch: ['#f4f4f2', '#d9dbd8'] },
  { id: 'carto-dark', label: 'CARTO Dark', cartoUrl: carto('dark_all'), swatch: ['#25292c', '#0e1113'] },
]

export const basemapDefById: Record<string, BasemapDef> = Object.fromEntries(
  BASEMAP_DEFS.map((d) => [d.id, d]),
)

export function isKnownBasemap(id: string): boolean {
  return id in basemapDefById
}

/**
 * The persisted choice → the effective basemap id. `'auto'` follows the app
 * theme; an unknown or malformed persisted value (old builds, hand-edited
 * storage) also falls back to the theme pair — never crash the render.
 */
export function resolveBasemapId(choice: unknown, themeMode: 'light' | 'dark'): string {
  if (typeof choice === 'string' && choice !== 'auto' && isKnownBasemap(choice)) return choice
  return BASEMAP_BY_MODE[themeMode]
}

/**
 * Sample tile URLs for the basemap health check. Template-based layers
 * (CARTO WebTileLayer, the `osm` raster) "load" without ever touching the
 * network — their metadata is client-side — so a health check must probe an
 * actual tile (no-cors fetch: rejection = host blocked/unreachable). Esri
 * vector/tiled basemaps return [] because `Basemap.load()` already fetches
 * their style/metadata from the CDN and rejects when it is unreachable.
 */
export function probeTileUrls(id: string): string[] {
  if (id === 'osm') return ['https://a.tile.openstreetmap.org/3/4/3.png']
  const def = basemapDefById[id]
  if (def?.cartoUrl) {
    return [
      def.cartoUrl
        .replace('{subDomain}', 'a')
        .replace('{level}', '3')
        .replace('{col}', '4')
        .replace('{row}', '3'),
    ]
  }
  return []
}

/**
 * The tile-failure fallback ladder: three INDEPENDENT providers, so a
 * device that blocks one tile CDN (content blocker, private DNS) still gets
 * a map — OSMF's own tile servers, CARTO's CDN, Esri's CDN. Returns the
 * next candidate that isn't the failing basemap and hasn't been tried, or
 * null when every provider is exhausted.
 */
const FALLBACK_LADDER = ['osm', 'carto-voyager', 'gray-vector']
export function nextBasemapFallback(effectiveId: string, tried: string[]): string | null {
  for (const id of FALLBACK_LADDER) {
    if (id !== effectiveId && !tried.includes(id)) return id
  }
  return null
}
