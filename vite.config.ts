import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// On GitHub Pages the project is served from /widget-dashboard/, so the
// production build needs that base path. Dev keeps serving from root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/widget-dashboard/' : '/',
  plugins: [react()],
}))
