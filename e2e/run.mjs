/**
 * Drone Sim E2E runner: bundles the widget's pure modules (so suites can
 * compute waypoints from the real world layout), starts the Vite dev server,
 * runs each suite as its own process, and reports.
 *
 *   npm run e2e            # all suites
 *   npm run e2e crash      # suites whose filename matches "crash"
 *
 * Env: CHROMIUM_PATH (default /opt/pw-browsers/chromium), E2E_PORT (5199).
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PORT = process.env.E2E_PORT ?? '5199'
const BASE_URL = `http://localhost:${PORT}/`
const filter = process.argv[2]

// 1. Bundle the pure sim modules for the suites.
mkdirSync(join(here, '.artifacts'), { recursive: true })
const bundle = spawnSync(
  'npx',
  [
    'esbuild',
    'src/components/widgets/droneSim/flightModel.ts',
    'src/components/widgets/droneSim/worldLayout.ts',
    'src/components/widgets/droneSim/lapTimer.ts',
    '--bundle',
    '--format=esm',
    `--outdir=${join(here, '.bundle')}`,
  ],
  { cwd: root, stdio: 'inherit' },
)
if (bundle.status !== 0) process.exit(bundle.status ?? 1)

// 2. Start the dev server and wait for it.
const server = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  detached: false,
})
const serverUp = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE_URL)
      if (res.ok) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const suites = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort()

let failed = 0
try {
  if (!(await serverUp())) {
    console.error(`dev server did not come up on :${PORT}`)
    process.exit(1)
  }
  for (const suite of suites) {
    console.log(`\n=== ${suite} ===`)
    const runOnce = () =>
      spawnSync('node', [join(here, suite)], {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, E2E_BASE_URL: BASE_URL },
      })
    let run = runOnce()
    if (run.status !== 0) {
      // The closed-loop pilot's precision maneuvers (threading gates, pad
      // touchdowns, timed wall hits) have a small miss rate under software-GL
      // load; one retry with a fresh browser separates flakes from real
      // failures.
      console.log(`--- ${suite} failed, retrying once ---`)
      run = runOnce()
      if (run.status === 0) console.log(`--- ${suite} passed on retry ---`)
    }
    if (run.status !== 0) failed++
  }
} finally {
  server.kill()
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`)
process.exit(failed ? 1 : 0)
