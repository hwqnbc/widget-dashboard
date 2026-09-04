import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// On GitHub Pages the project is served from /widget-dashboard/, so the
// production build needs that base path. Dev keeps serving from root.
export default defineConfig(({ command, mode }) => ({
  base: command === 'build' ? '/widget-dashboard/' : '/',
  // Some deps (e.g. redux-persist) read `process.env.NODE_ENV`, which is
  // undefined in the browser. Statically replace it so no `process` reference
  // survives at runtime ("process is not defined").
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    // Build timestamp shown on the Settings page — baked in when the bundle
    // is built (dev-server start time in dev), so it identifies the deploy.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Pre-bundle the deep @arcgis/core entries the Map page imports. They sit
  // behind a lazy route chunk, so without this the first /map visit makes the
  // dev server discover them late and force a full page reload ("new
  // dependencies optimized") — which flakes the e2e suites mid-run.
  optimizeDeps: {
    include: [
      '@arcgis/core/Map',
      '@arcgis/core/Basemap',
      '@arcgis/core/Camera',
      '@arcgis/core/layers/WebTileLayer',
      '@arcgis/core/Graphic',
      '@arcgis/core/views/MapView',
      '@arcgis/core/views/SceneView',
      '@arcgis/core/layers/GraphicsLayer',
      '@arcgis/core/geometry/Point',
      '@arcgis/core/geometry/Polyline',
      '@arcgis/core/symbols/SimpleMarkerSymbol',
      '@arcgis/core/symbols/SimpleLineSymbol',
      '@arcgis/core/symbols/SimpleFillSymbol',
      '@arcgis/core/symbols/PointSymbol3D',
      '@arcgis/core/symbols/ObjectSymbol3DLayer',
      '@arcgis/core/geometry/Polygon',
      '@arcgis/core/geometry/support/webMercatorUtils',
      '@arcgis/core/widgets/Sketch/SketchViewModel',
      '@arcgis/core/widgets/DistanceMeasurement2D',
      '@arcgis/core/widgets/AreaMeasurement2D',
      '@arcgis/core/widgets/DirectLineMeasurement3D',
      '@arcgis/core/widgets/AreaMeasurement3D',
    ],
  },
  plugins: [react()],
}))
