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
  },
  plugins: [react()],
}))
