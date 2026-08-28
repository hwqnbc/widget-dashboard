/**
 * Maze Runner suite.
 *
 * The pure half runs first, against `e2e/.bundle/mazeModel.js`: a maze is
 * worth very little if it is not deterministic, not solvable, or not actually
 * a maze, and none of those are pleasant to check through a rendered board.
 * The spanning-tree invariant (`cols * rows - 1` passages) is the strongest
 * single assertion available — it fails loudly if the carve ever leaves a cell
 * unvisited or opens a cycle.
 *
 * The live half then drives the real widget. Because the suite has the same
 * generator the widget does, it can read the widget's own seed and dimensions,
 * compute the ACTUAL solution, and walk it — which is how the win, the timer
 * and the duel hand-off get asserted end to end rather than approximated.
 */
import { addMazeWidget, launch, reporter, swipeMaze } from './helpers.mjs'
import {
  DEFAULT_MAZE_SEED,
  MAZE_DIMS,
  generateMaze,
  isOpen,
  mazeDims,
  neighbour,
  passageCount,
  pathToDirs,
  reachableWithin,
  solve,
  stepMove,
  mirrorMaze,
  wallSegments,
} from './.bundle/mazeModel.js'

const { check, finish } = reporter('maze')

// ------------------------------------------------------------ 1. generation

const maze = generateMaze(DEFAULT_MAZE_SEED, 13, 17)
check('maze has the requested dimensions', maze.cols === 13 && maze.rows === 17)
check('start is top-left, goal is bottom-right', maze.start === 0 && maze.goal === 13 * 17 - 1)

const again = generateMaze(DEFAULT_MAZE_SEED, 13, 17)
check(
  'same seed and size give a byte-identical maze',
  maze.walls.every((w, i) => w === again.walls[i]),
)
const other = generateMaze(DEFAULT_MAZE_SEED + 1, 13, 17)
check(
  'a different seed gives a different maze',
  !maze.walls.every((w, i) => w === other.walls[i]),
)

// The spanning-tree invariant, over every size and a spread of seeds.
let perfect = true
let solvable = true
for (const size of ['small', 'medium', 'large']) {
  for (const orientation of ['portrait', 'landscape']) {
    const { cols, rows } = mazeDims(size, orientation)
    for (let seed = 1; seed <= 25; seed++) {
      const m = generateMaze(seed * 7919, cols, rows)
      if (passageCount(m) !== cols * rows - 1) perfect = false
      const path = solve(m, m.start, m.goal)
      if (path.length === 0 || path[0] !== m.start || path[path.length - 1] !== m.goal) {
        solvable = false
      }
    }
  }
}
check('every maze is perfect (cols*rows-1 passages, no cycles, no islands)', perfect)
check('every maze is solvable start → goal', solvable)

check(
  'portrait is tall and landscape is wide',
  mazeDims('medium', 'portrait').rows > mazeDims('medium', 'portrait').cols &&
    mazeDims('medium', 'landscape').cols > mazeDims('medium', 'landscape').rows,
)
check(
  'sizes grow small → medium → large',
  MAZE_DIMS.small.long < MAZE_DIMS.medium.long &&
    MAZE_DIMS.medium.long < MAZE_DIMS.large.long,
)

// The outer boundary is never carved through.
let sealed = true
for (let c = 0; c < maze.cols; c++) {
  if (isOpen(maze, c, 'n')) sealed = false
  if (isOpen(maze, (maze.rows - 1) * maze.cols + c, 's')) sealed = false
}
for (let r = 0; r < maze.rows; r++) {
  if (isOpen(maze, r * maze.cols, 'w')) sealed = false
  if (isOpen(maze, r * maze.cols + maze.cols - 1, 'e')) sealed = false
}
check('the outer wall is sealed on all four sides', sealed)

// --------------------------------------------------------------- 2. moving

// Walls block: every direction with a wall must refuse to move, and every
// direction without one must move exactly one cell under the 'cell' rule.
let blocksAgree = true
let cellRuleExact = true
for (let cell = 0; cell < maze.walls.length; cell++) {
  for (const dir of ['n', 'e', 's', 'w']) {
    const moved = stepMove(maze, cell, dir, 'cell')
    if (isOpen(maze, cell, dir)) {
      if (moved.length !== 1 || moved[0] !== neighbour(maze, cell, dir)) cellRuleExact = false
    } else if (moved.length !== 0) {
      blocksAgree = false
    }
  }
}
check('a wall always blocks the move', blocksAgree)
check("the 'cell' rule always moves exactly one cell", cellRuleExact)

// The junction rule follows a corridor round its bends and stops only where a
// decision is actually needed. Every intermediate cell must therefore have had
// exactly one way onward, or the slide skipped a choice.
let junctionLegal = true
let slidPastChoice = false
let longest = 0
let totalJunction = 0
let totalCell = 0
let moves = 0
for (let cell = 0; cell < maze.walls.length; cell++) {
  for (const dir of ['n', 'e', 's', 'w']) {
    const path = stepMove(maze, cell, dir, 'junction')
    if (path.length === 0) continue
    moves++
    longest = Math.max(longest, path.length)
    totalJunction += path.length
    totalCell += stepMove(maze, cell, dir, 'cell').length

    // Every hop must be through an open wall between adjacent cells.
    let at = cell
    for (const next of path) {
      const via = ['n', 'e', 's', 'w'].find((d) => neighbour(maze, at, d) === next)
      if (!via || !isOpen(maze, at, via)) junctionLegal = false
      at = next
    }
    // Cells passed THROUGH (not the one stopped on) must have been plain
    // corridor: exactly one exit besides the one entered by.
    let from = cell
    path.slice(0, -1).forEach((passed, i) => {
      const entered = ['n', 'e', 's', 'w'].find((d) => neighbour(maze, from, d) === passed)
      const back = { n: 's', s: 'n', e: 'w', w: 'e' }[entered]
      const onward = ['n', 'e', 's', 'w'].filter((d) => d !== back && isOpen(maze, passed, d))
      if (onward.length !== 1) slidPastChoice = true
      if (passed === maze.goal) slidPastChoice = true
      from = path[i]
    })
  }
}
check('the junction rule never crosses a wall', junctionLegal)
check('the junction rule never slides past a junction, a dead end or the goal', !slidPastChoice)
check(
  `the junction rule really runs corridors (avg ${(totalJunction / moves).toFixed(2)} cells, max ${longest})`,
  totalJunction / moves > 3 && longest > 8,
  `vs ${(totalCell / moves).toFixed(2)} for the one-cell rule`,
)

// A mirrored maze is the same puzzle reflected: identical difficulty, but not
// memorisable from watching the original solved.
const flipped = mirrorMaze(maze)
check('a mirror has the same number of passages', passageCount(flipped) === passageCount(maze))
check(
  'a mirror has the same solution length',
  solve(flipped, flipped.start, flipped.goal).length ===
    solve(maze, maze.start, maze.goal).length,
)
check(
  'a mirror moves start and goal to the opposite corners',
  flipped.start === maze.cols - 1 && flipped.goal === (maze.rows - 1) * maze.cols,
)
check('mirroring twice is the identity', mirrorMaze(flipped).walls.every((w, i) => w === maze.walls[i]))

// Wall segments must be emitted once each — walking all four sides of every
// cell would draw every interior wall twice.
const segments = wallSegments(maze)
const unique = new Set(segments.map((g) => `${g.x1},${g.y1},${g.x2},${g.y2}`))
check('no wall segment is emitted twice', unique.size === segments.length)
// Every grid edge is either a wall or a passage, so the two must add up.
const gridEdges = maze.cols * (maze.rows + 1) + maze.rows * (maze.cols + 1)
check(
  'walls + passages account for every grid edge',
  segments.length + passageCount(maze) === gridEdges,
  `${segments.length} walls + ${passageCount(maze)} passages = ${gridEdges}`,
)

// ---------------------------------------------------------- 3. search + fog

const route = solve(maze, maze.start, maze.goal)
const dirs = pathToDirs(maze, route)
check('a solved route converts to one direction per hop', dirs.length === route.length - 1)
let walkable = true
let at = maze.start
for (const dir of dirs) {
  if (!isOpen(maze, at, dir)) walkable = false
  at = neighbour(maze, at, dir)
}
check('walking those directions arrives at the goal', walkable && at === maze.goal)

check('fog at depth 0 shows only the current cell', reachableWithin(maze, 0, 0).size === 1)
const near = reachableWithin(maze, maze.start, 3)
check('fog at depth 3 includes the start', near.has(maze.start))
check(
  'fog at depth 3 stays within 3 passages',
  [...near].every((cell) => solve(maze, maze.start, cell).length - 1 <= 3),
)
check(
  'fog grows with depth but never exceeds the board',
  reachableWithin(maze, maze.start, 6).size > near.size &&
    reachableWithin(maze, maze.start, 9999).size === maze.cols * maze.rows,
)

// ------------------------------------------------------------- 4. the widget

const { browser, context, page } = await launch()
await addMazeWidget(page)

const root = page.locator('[data-testid="maze-root"]')
const timerChip = page.locator('[data-testid="maze-timer"]')
const attr = (name) => root.getAttribute(name)
const num = async (name) => parseInt(await attr(name), 10)
const timerNum = async (name) => parseInt(await timerChip.getAttribute(name), 10)

check('defaults to solo', (await attr('data-mode')) === 'solo')
check('defaults to the medium size', (await attr('data-size')) === 'medium')
check('defaults to the one-step rule', (await attr('data-rule')) === 'cell')
check('the mirror defaults on', (await attr('data-mirror')) === 'on')
check('defaults to the breadcrumb trail', (await attr('data-aid')) === 'trail')
check('starts ready, at the start cell', (await attr('data-state')) === 'ready')
check('marker begins on the start cell', (await num('data-pos')) === 0)

// The widget's own maze, rebuilt here from the contract it publishes.
const liveMaze = generateMaze(await num('data-seed'), await num('data-cols'), await num('data-rows'))
check(
  'the board reports a maze this suite can rebuild',
  liveMaze.cols > 0 && liveMaze.rows > 0 && (await num('data-goal')) === liveMaze.goal,
)

// Keys move, and a wall refuses.
const firstDir = ['e', 's', 'n', 'w'].find((d) => isOpen(liveMaze, 0, d))
const blockedDir = ['n', 'e', 's', 'w'].find((d) => !isOpen(liveMaze, 0, d))
const KEY = { n: 'ArrowUp', e: 'ArrowRight', s: 'ArrowDown', w: 'ArrowLeft' }

await page.keyboard.press(KEY[blockedDir])
await page.waitForTimeout(120)
check('a wall refuses the move', (await num('data-pos')) === 0)
check('a refused move does not start the clock', (await attr('data-state')) === 'ready')

await page.keyboard.press(KEY[firstDir])
await page.waitForTimeout(150)
const afterKey = await num('data-pos')
check('an arrow key moves the marker', afterKey !== 0)
check(
  'the default one-step rule moves exactly one cell',
  afterKey === neighbour(liveMaze, 0, firstDir),
)
check('the first move starts the run', (await attr('data-state')) === 'running')
check('the trail records where we have been', (await num('data-trail')) >= 2)

// Everything below runs under the Run rule: a corridor-following press eats
// several cells at once, which keeps the solution walk to a handful of presses
// instead of one per cell.
await root.locator('[data-testid="maze-rule-junction"]').click()
await page.waitForTimeout(150)
check('the corridor-running rule can be selected', (await attr('data-rule')) === 'junction')

// A swipe moves it too. The destination is deliberately not asserted: under
// the junction rule a swipe runs the corridor, so "back the way you came"
// legitimately overshoots the cell you started from.
const beforeSwipe = await num('data-pos')
const swipeDir = ['n', 'e', 's', 'w'].find((d) => isOpen(liveMaze, beforeSwipe, d))
await swipeMaze(page, context, swipeDir)
await page.waitForFunction(
  (was) => document.querySelector('[data-testid="maze-root"]')?.dataset.pos !== String(was),
  beforeSwipe,
  { timeout: 3000 },
)
check('a swipe moves the marker', (await num('data-pos')) !== beforeSwipe)

// Walk the real solution to the goal — CLOSED-LOOP. One press under the
// junction rule consumes several cells of the route, so replaying a
// precomputed direction list open-loop would desync immediately: after every
// press the suite reads where the runner actually ended up and re-solves from
// there.
let guard = 0
while ((await num('data-pos')) !== liveMaze.goal && guard++ < 200) {
  const at = await num('data-pos')
  const next = pathToDirs(liveMaze, solve(liveMaze, at, liveMaze.goal))[0]
  if (!next) break
  await page.keyboard.press(KEY[next])
  await page.waitForFunction(
    (was) => document.querySelector('[data-testid="maze-root"]')?.dataset.pos !== String(was),
    at,
    { timeout: 3000 },
  )
}
check('the walk converged without hitting the guard', guard < 200)
check('walking the real solution wins', (await attr('data-state')) === 'won')
check('the marker finishes on the goal', (await num('data-pos')) === liveMaze.goal)
check('the clock ran', (await timerNum('data-ms')) > 0)
check('a best time is recorded', (await timerNum('data-best-ms')) > 0)
check(
  'the best time equals the run just finished',
  (await timerNum('data-best-ms')) === (await timerNum('data-ms')),
)
check(
  'the winner celebration appears',
  (await page.locator('[data-testid="maze-celebration"]').count()) === 1,
)

// New maze re-rolls the seed.
const oldSeed = await num('data-seed')
await root.getByRole('button', { name: 'New maze' }).click()
await page.waitForTimeout(200)
check('New maze changes the seed', (await num('data-seed')) !== oldSeed)
check('New maze returns to the start', (await num('data-pos')) === 0)
check('New maze clears the win', (await attr('data-state')) === 'ready')

// --------------------------------------------------- 5. settings + guards

// Aid and rule switch live in solo (no run is destroyed by looking at the
// board differently).
await root.locator('[data-testid="maze-aid-fog"]').click()
await page.waitForTimeout(150)
check('fog can be selected', (await attr('data-aid')) === 'fog')

// Put a real move on the board: the reload probe below is only meaningful if
// there is a position to preserve, and the size-change guard after it only
// fires while a run is in progress.
const midMaze = generateMaze(await num('data-seed'), await num('data-cols'), await num('data-rows'))
const midDir = ['s', 'e', 'n', 'w'].find((d) => isOpen(midMaze, 0, d))
await page.keyboard.press(KEY[midDir])
await page.waitForFunction(
  () => document.querySelector('[data-testid="maze-root"]')?.dataset.pos !== '0',
  null,
  { timeout: 3000 },
)
check('the board is mid-run again', (await attr('data-state')) === 'running')

// Both probes are deliberately NON-default values ('trail' and 'cell' are what
// a fresh widget has), so surviving a reload proves something was stored.
// Settings and the maze itself survive it; so does the trail.
const keptSeed = await num('data-seed')
const keptPos = await num('data-pos')
// Wait for redux-persist to have actually WRITTEN that position before
// reloading. Its writes are debounced (lesson #12), so a reload issued
// straight after a move can beat the store to disk and the runner reappears
// where it was two moves ago — a flake that predates this suite's netplay
// work and reproduces on main.
await page.waitForFunction(
  (want) => {
    try {
      const raw = window.localStorage.getItem('persist:testsite')
      if (!raw) return false
      return JSON.parse(JSON.parse(raw).widgets ?? '{}')
        .instances?.some((w) => w.data?.pos === want)
    } catch {
      return false
    }
  },
  keptPos,
  { timeout: 5000 },
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="maze-board"]')
check('the maze survives a reload', (await num('data-seed')) === keptSeed)
check('the runner stays where it was', (await num('data-pos')) === keptPos)
check(
  'non-default settings survive a reload',
  (await attr('data-aid')) === 'fog' && (await attr('data-rule')) === 'junction',
)

// Changing the size mid-run is confirm-guarded (lessons #16).
await root.locator('[data-testid="maze-size-small"]').click()
await page.waitForSelector('.MuiDialog-root')
check('changing size mid-run asks first', (await attr('data-size')) === 'medium')
await page.getByRole('button', { name: 'Keep playing' }).click()
await page.waitForTimeout(250)
check('declining keeps the medium maze', (await attr('data-size')) === 'medium')
await root.locator('[data-testid="maze-size-small"]').click()
await page.waitForSelector('.MuiDialog-root')
await page.getByRole('button', { name: 'Restart' }).click()
await page.waitForTimeout(250)
check('confirming switches to the small maze', (await attr('data-size')) === 'small')
check('the new size resets the runner', (await num('data-pos')) === 0)

// ------------------------------------------------------------ 6. hot seat

await root.locator('[data-testid="maze-rule-junction"]').click()
await root.locator('[data-testid="maze-aid-trail"]').click()
await page.waitForTimeout(150)
await root.locator('[data-testid="maze-mode-duel"]').click()
await page.waitForTimeout(250)
check('2 Players mode engages', (await attr('data-mode')) === 'duel')
check('player 1 runs first', (await attr('data-turn')) === 'toy')

const duelMaze = generateMaze(await num('data-seed'), await num('data-cols'), await num('data-rows'))

/**
 * Walk `m` toward `goal` until `done()`.
 *
 * The stop condition is a predicate rather than "pos === goal" because in a
 * duel the widget hands over in the SAME tick that player 1 finishes — it
 * moves the runner straight to player 2's starting corner, so `data-pos` never
 * once reads as player 1's goal.
 */
const walkUntil = async (m, goal, done) => {
  let steps = 0
  while (!(await done()) && steps++ < 200) {
    const at = await num('data-pos')
    const dir = pathToDirs(m, solve(m, at, goal))[0]
    if (!dir) break
    await page.keyboard.press(KEY[dir])
    await page.waitForFunction(
      (was) => document.querySelector('[data-testid="maze-root"]')?.dataset.pos !== String(was),
      at,
      { timeout: 3000 },
    )
  }
  return steps < 200
}
check(
  'player 1 reaches the goal',
  await walkUntil(duelMaze, duelMaze.goal, async () => (await attr('data-turn')) === 'ninja'),
)

// The hand-off banner appears, and — the part a pointer-blocking overlay does
// NOT give you for free — the window key listener must be inert behind it.
await page.waitForSelector('[data-testid="turn-banner"]')
check('the hand-off banner names player 2', (await page.locator('[data-testid="turn-banner"]').getAttribute('data-player')) === 'ninja')
const mirrored = mirrorMaze(duelMaze)
check('player 2 starts from the mirrored maze corner', (await num('data-pos')) === mirrored.start)
check('the turn passed to player 2', (await attr('data-turn')) === 'ninja')
const behindBanner = await num('data-pos')
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(120)
check('keys are inert while the hand-off banner is up', (await num('data-pos')) === behindBanner)
check("player 2's clock has not started", (await timerNum('data-ms')) === 0)

await page.locator('[data-testid="turn-banner"]').click()
await page.waitForSelector('[data-testid="turn-banner"]', { state: 'detached' })
check(
  'player 2 reaches the goal',
  await walkUntil(mirrored, mirrored.goal, async () => (await attr('data-state')) === 'won'),
)
await page.waitForFunction(
  () => document.querySelector('[data-testid="maze-celebration"]') !== null,
  null,
  { timeout: 5000 },
)
check('the duel ends with a celebration', (await page.locator('[data-testid="maze-celebration"]').count()) === 1)
check('a duel records a best time', (await timerNum('data-best-ms')) > 0)

// ------------------------------------------------------- 7. mirror toggle

// Turning the mirror off is a change to the maze itself, so with times on the
// board it restarts behind the confirm dialog like every other setting.
await root.locator('[data-testid="maze-mirror-off"]').click()
await page.waitForSelector('.MuiDialog-root')
check('turning the mirror off asks first', (await attr('data-mirror')) === 'on')
await page.getByRole('button', { name: 'Restart' }).click()
await page.waitForTimeout(300)
check('the mirror can be turned off', (await attr('data-mirror')) === 'off')
check('turning it off restarts the duel', (await attr('data-turn')) === 'toy' && (await num('data-pos')) === 0)

// With it off, player 2 runs the IDENTICAL maze — same corner, same walls —
// rather than the reflection.
const sameMaze = generateMaze(await num('data-seed'), await num('data-cols'), await num('data-rows'))
check(
  'player 1 reaches the goal again',
  await walkUntil(sameMaze, sameMaze.goal, async () => (await attr('data-turn')) === 'ninja'),
)
await page.waitForSelector('[data-testid="turn-banner"]')
check('player 2 starts from the SAME corner when the mirror is off', (await num('data-pos')) === sameMaze.start)
check('player 2 aims at the same goal', (await num('data-goal')) === sameMaze.goal)

// The Mirror/Same group is a two-player concern only.
await page.locator('[data-testid="turn-banner"]').click()
await page.waitForSelector('[data-testid="turn-banner"]', { state: 'detached' })
await root.locator('[data-testid="maze-mode-solo"]').click()
await page.waitForSelector('.MuiDialog-root')
await page.getByRole('button', { name: 'Restart' }).click()
await page.waitForTimeout(250)
check('solo hides the mirror toggle', (await root.locator('[data-testid="maze-mirror-on"]').count()) === 0)
check('the mirror setting is still published in solo', (await attr('data-mirror')) === 'off')

await finish(browser)
