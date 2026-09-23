/**
 * One-off generator for the Car Park level pack
 * (`src/components/widgets/carPark/carParkLevels.ts`).
 *
 *   node scripts/gen-carpark-levels.mjs [perTier=10] [seed=20260923]
 *   CARPARK_TRACE=1 …   progress on stderr (the hard tiers take a while)
 *
 * Prints candidate levels per tier — paste the ones you want onto the END
 * of that tier's list (the pack is append-only: a level's number is its
 * index, and players' bests key on it). Seeded, so a run is reproducible.
 *
 * Method — "hardest state in the cluster": random placement alone makes
 * mostly trivial boards, so for each random lot we BFS its WHOLE state
 * component (slides are reversible, so it is connected both ways), then a
 * multi-source BFS back out from every solved state gives each state its
 * exact optimal distance. Any state whose distance falls inside a tier's
 * par band is a candidate for that tier; the component's farthest state is
 * the hardest puzzle that set of vehicles can pose.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(join(tmpdir(), 'carpark-'))
const built = spawnSync(
  'npx',
  [
    'esbuild',
    'src/components/widgets/carPark/carParkModel.ts',
    'src/components/widgets/carPark/carParkLevels.ts',
    '--bundle',
    '--format=esm',
    `--outdir=${out}`,
  ],
  { cwd: root, stdio: 'inherit' },
)
if (built.status !== 0) process.exit(built.status ?? 1)
const M = await import(pathToFileURL(join(out, 'carParkModel.js')).href)
const { LEVELS, TIER_BANDS, TIERS } = await import(pathToFileURL(join(out, 'carParkLevels.js')).href)

const perTier = parseInt(process.argv[2] ?? '10', 10)
let s = parseInt(process.argv[3] ?? '20260923', 10) >>> 0
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (n) => Math.floor(rand() * n)
const LETTERS = 'BCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A random lot: A on the exit row, then up to `n` vehicles dropped at
 * random free spots. No other horizontal vehicle rides the exit row — one
 * right of A could never clear, one left of A is dead weight. */
function randomBoard(n) {
  const b = Array(36).fill('o')
  const a = ri(3)
  b[M.EXIT_ROW * 6 + a] = b[M.EXIT_ROW * 6 + a + 1] = 'A'
  let placed = 0
  for (let tries = 0; tries < 200 && placed < n; tries++) {
    const horiz = rand() < 0.5
    const len = rand() < 0.72 ? 2 : 3
    const lane = ri(6)
    if (horiz && lane === M.EXIT_ROW) continue
    const off = ri(6 - len + 1)
    const cells = []
    for (let k = 0; k < len; k++) cells.push(horiz ? lane * 6 + off + k : (off + k) * 6 + lane)
    if (cells.some((c) => b[c] !== 'o')) continue
    for (const c of cells) b[c] = LETTERS[placed]
    placed++
  }
  return b.join('')
}

const keyOf = (pos) => pos.join('')
/** All states reachable from `lot.start`, plus each one's optimal distance
 * to a solved state (absent from `dist` if the component has none). Null
 * when the component is too big to be worth the time. */
function cluster(lot) {
  const states = new Map([[keyOf(lot.start), lot.start]])
  const adj = new Map()
  const queue = [lot.start]
  while (queue.length) {
    const pos = queue.pop()
    const k = keyOf(pos)
    const nbrs = []
    for (const m of M.legalMoves(lot, pos)) {
      const np = M.applyMove(pos, m)
      const nk = keyOf(np)
      nbrs.push(nk)
      if (!states.has(nk)) {
        states.set(nk, np)
        queue.push(np)
      }
    }
    adj.set(k, nbrs)
    if (states.size > 60000) return null
  }
  const dist = new Map()
  let frontier = []
  for (const [k, pos] of states) if (M.isSolved(lot, pos)) (dist.set(k, 0), frontier.push(k))
  for (let d = 1; frontier.length; d++) {
    const next = []
    for (const k of frontier) {
      for (const nk of adj.get(k)) {
        if (!dist.has(nk)) (dist.set(nk, d), next.push(nk))
      }
    }
    frontier = next
  }
  return { states, dist }
}

/** Blocker count on A's exit ray — a board with A already staring at the
 * exit reads as a freebie, so beginner picks want at least one. */
function blockersAhead(lot, pos) {
  const grid = M.occupancy(lot, pos)
  const seen = new Set()
  for (let c = pos[0] + 2; c < 6; c++) {
    const o = grid[M.EXIT_ROW * 6 + c]
    if (o >= 0) seen.add(o)
  }
  return seen.size
}

const existing = new Set(TIERS.flatMap((t) => LEVELS[t].map((l) => l.board)))
const picked = Object.fromEntries(TIERS.map((t) => [t, []]))
const trace = (...a) => process.env.CARPARK_TRACE && console.error(...a)

/** Farthest state of a cluster and its distance. */
function hardest(c) {
  let best = null
  for (const [k, d] of c.dist) if (!best || d > best.d) best = { d, k }
  return best
}

/** Take (at most) one candidate from a cluster for tier `t`: its hardest
 * state inside the band, with at least one blocker ahead of A. Sibling
 * states of one cluster are the same puzzle a few slides apart, so one per
 * cluster per tier. */
function take(t, lot, c) {
  if (picked[t].length >= perTier) return
  const [lo, hi] = TIER_BANDS[t]
  let best = null
  for (const [k, d] of c.dist) {
    if (d < lo || d > hi || (best && d <= best.d)) continue
    const pos = c.states.get(k)
    if (blockersAhead(lot, pos) === 0) continue
    best = { d, pos }
  }
  if (!best) return
  const board = M.serialize(lot, best.pos)
  if (existing.has(board)) return
  // Re-parse the canonical string (letters re-sorted) and re-solve from
  // scratch — the par printed is what the e2e sweep will re-derive.
  const par = M.solve(M.parseBoard(board)).length
  if (par !== best.d) throw new Error(`par mismatch ${par} vs ${best.d}`)
  existing.add(board)
  picked[t].push({ board, par })
  trace(`${t}: +${par}`)
}

/** Mutate a board: drop one random non-target vehicle and/or drop in a new
 * one at a random free spot. */
function mutate(board) {
  const b = board.split('')
  const ids = [...new Set(b.filter((ch) => /[B-Z]/.test(ch)))]
  const r = rand()
  if (ids.length > 4 && r < 0.66) {
    const gone = ids[ri(ids.length)]
    for (let i = 0; i < 36; i++) if (b[i] === gone) b[i] = 'o'
  }
  if (r > 0.33) {
    const free = LETTERS.split('').find((ch) => !b.includes(ch))
    for (let tries = 0; tries < 50 && free; tries++) {
      const horiz = rand() < 0.5
      const len = rand() < 0.72 ? 2 : 3
      const lane = ri(6)
      if (horiz && lane === M.EXIT_ROW) continue
      const off = ri(6 - len + 1)
      const cells = []
      for (let k = 0; k < len; k++) cells.push(horiz ? lane * 6 + off + k : (off + k) * 6 + lane)
      if (cells.some((c) => b[c] !== 'o')) continue
      for (const c of cells) b[c] = free
      break
    }
  }
  return b.join('')
}

// Easy tiers: plain random lots land in their bands often.
for (let round = 0; round < 20000 && (picked.beginner.length < perTier || picked.intermediate.length < perTier); round++) {
  const lot = M.parseBoard(randomBoard(7 + ri(7)))
  const c = cluster(lot)
  if (c) (take('beginner', lot, c), take('intermediate', lot, c))
}

// Hard tiers: hill-climb. Mutate the lot, keep the mutation when its
// cluster's hardest state is at least as far out, and offer every accepted
// cluster to the hard tiers.
for (let climb = 0; climb < 2000 && (picked.advanced.length < perTier || picked.expert.length < perTier); climb++) {
  let board = randomBoard(10 + ri(4))
  let lot = M.parseBoard(board)
  let c = cluster(lot)
  if (!c) continue
  let h = hardest(c)
  if (!h) continue
  for (let step = 0; step < 400; step++) {
    const nb = mutate(M.serialize(lot, c.states.get(h.k)))
    const nlot = M.parseBoard(nb)
    const nc = cluster(nlot)
    if (!nc) continue
    const nh = hardest(nc)
    if (!nh || nh.d < h.d) continue
    ;[board, lot, c, h] = [nb, nlot, nc, nh]
  }
  trace(`climb ${climb}: reached ${h.d}`, TIERS.map((t) => picked[t].length).join('/'))
  take('expert', lot, c)
  take('advanced', lot, c)
}

for (const t of TIERS) {
  picked[t].sort((a, b) => a.par - b.par)
  console.log(`  // ${t}`)
  for (const l of picked[t]) console.log(`    { board: '${l.board}', par: ${l.par} },`)
}
