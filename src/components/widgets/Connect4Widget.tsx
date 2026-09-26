import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  keyframes,
} from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import { avatarMetaById } from '../../features/avatars/avatarCatalog'
import {
  SeatAvatarsOverride,
  useSeatAvatars,
  useSeatVisual,
} from '../../features/avatars/useSeatAvatars'
import WinnerCelebration from './WinnerCelebration'
import PlayerBadge from './PlayerBadge'
import ConfirmDialog from './ConfirmDialog'
import TurnBanner from './TurnBanner'
import { useHandoff } from '../../hooks/useHandoff'
import { useNetGame } from '../../features/netplay/useNetGame'
import NetplayChip from '../netplay/NetplayChip'
import { lazyWithReload } from '../../utils/lazyWithReload'

/** The pairing UI pulls in a QR encoder and decoder — kept out of the main
 * bundle, since most sessions never open it. */
const NetplayDialog = lazyWithReload(
  () => import('../netplay/NetplayDialog'),
  'netplay-dialog',
)

/** The two players are the Toy and Ninja heads instead of red / yellow discs. */
type Mark = 'toy' | 'ninja'
type Cell = Mark | null
/** `online` is 2-player split across two devices on the same wifi. */
type Mode = 'pvp' | 'ai' | 'online'
type Difficulty = 'easy' | 'medium' | 'hard'

const COLS = 7
const ROWS = 6
const SIZE = COLS * ROWS

/** Stable fallback so the AI effect doesn't loop on a fresh array. */
const EMPTY_BOARD: Cell[] = Array(SIZE).fill(null)

/** A board is only accepted — from storage or from the other device — when
 * every cell is one of the three legal values. Persisted data and a network
 * peer are both outside this component's control. */
const coerceBoard = (value: unknown): Cell[] | undefined =>
  Array.isArray(value) &&
  value.length === SIZE &&
  value.every((c) => c === null || c === 'toy' || c === 'ninja')
    ? (value as Cell[])
    : undefined

/** Random delay (ms) before the computer drops, to simulate thinking. */
const THINK_MIN = 400
const THINK_MAX = 1200

/** Search depth per difficulty (easy uses the win/block/random heuristic). */
const DEPTH: Record<Difficulty, number> = { easy: 0, medium: 3, hard: 6 }

const C4_FRAME = '#1c66d6'

// Every 4-in-a-row window (horizontal, vertical, both diagonals) as index sets.
const WINDOWS: number[][] = (() => {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]
  const out: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const rr = r + 3 * dr
        const cc = c + 3 * dc
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          out.push([0, 1, 2, 3].map((k) => (r + k * dr) * COLS + (c + k * dc)))
        }
      }
    }
  }
  return out
})()

/** Winner + the 4 indices forming the connect, or null. */
function calcWin(board: Cell[]): { winner: Mark; line: number[] } | null {
  for (const w of WINDOWS) {
    const a = board[w[0]]
    if (a && board[w[1]] === a && board[w[2]] === a && board[w[3]] === a) {
      return { winner: a, line: w }
    }
  }
  return null
}

/** `first` opens the game; parity of filled cells gives the current turn. */
function turnOf(board: Cell[], first: Mark): Mark {
  const filled = board.filter(Boolean).length
  const other: Mark = first === 'toy' ? 'ninja' : 'toy'
  return filled % 2 === 0 ? first : other
}

/** Lowest empty row in a column, or -1 if the column is full. */
function landingRow(board: Cell[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r * COLS + col]) return r
  return -1
}

/** Columns that still have room. */
function legalCols(board: Cell[]): number[] {
  const cols: number[] = []
  for (let c = 0; c < COLS; c++) if (!board[c]) cols.push(c)
  return cols
}

/** Drop `mark` into `col`; returns the new board + landing index, or null. */
function dropInto(
  board: Cell[],
  col: number,
  mark: Mark,
): { board: Cell[]; index: number } | null {
  const r = landingRow(board, col)
  if (r < 0) return null
  const index = r * COLS + col
  const next = board.slice()
  next[index] = mark
  return { board: next, index }
}

/** Centre-first ordering makes alpha-beta prune far more. */
function orderedCols(board: Cell[]): number[] {
  return legalCols(board).sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b))
}

/** A column that immediately wins for `mark`, or -1. */
function winningCol(board: Cell[], mark: Mark): number {
  for (const c of legalCols(board)) {
    const res = dropInto(board, c, mark)
    if (res && calcWin(res.board)?.winner === mark) return c
  }
  return -1
}

/** Heuristic board score; ninja maximises. Scores every 4-window + centre. */
function evaluate(board: Cell[]): number {
  let score = 0
  for (const w of WINDOWS) {
    let ninja = 0
    let toy = 0
    for (const i of w) {
      if (board[i] === 'ninja') ninja++
      else if (board[i] === 'toy') toy++
    }
    if (ninja && toy) continue // blocked window, no value
    if (ninja === 3) score += 100
    else if (ninja === 2) score += 10
    else if (ninja === 1) score += 1
    else if (toy === 3) score -= 120 // weight blocking a bit higher
    else if (toy === 2) score -= 10
    else if (toy === 1) score -= 1
  }
  // centre-column preference
  for (let r = 0; r < ROWS; r++) {
    const cell = board[r * COLS + 3]
    if (cell === 'ninja') score += 3
    else if (cell === 'toy') score -= 3
  }
  return score
}

/** Alpha-beta value of `board` with `toMove` to play. Ninja maximises. */
function search(
  board: Cell[],
  depth: number,
  alpha: number,
  beta: number,
  toMove: Mark,
): number {
  const win = calcWin(board)
  if (win) return win.winner === 'ninja' ? 100000 + depth : -100000 - depth
  const cols = orderedCols(board)
  if (depth === 0 || cols.length === 0) return evaluate(board)

  if (toMove === 'ninja') {
    let best = -Infinity
    for (const c of cols) {
      const nb = dropInto(board, c, 'ninja')!.board
      best = Math.max(best, search(nb, depth - 1, alpha, beta, 'toy'))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const c of cols) {
    const nb = dropInto(board, c, 'toy')!.board
    best = Math.min(best, search(nb, depth - 1, alpha, beta, 'ninja'))
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

/** Best column for the ninja via depth-limited alpha-beta. */
function searchMove(board: Cell[], depth: number): number {
  let best = -Infinity
  let move = -1
  for (const c of orderedCols(board)) {
    const nb = dropInto(board, c, 'ninja')!.board
    const win = calcWin(nb)
    const score = win
      ? 100000 + depth
      : search(nb, depth - 1, -Infinity, Infinity, 'toy')
    if (score > best) {
      best = score
      move = c
    }
  }
  return move
}

/** Easy: take an immediate win, else block the human's, else a random column. */
function easyMove(board: Cell[]): number {
  const win = winningCol(board, 'ninja')
  if (win >= 0) return win
  const block = winningCol(board, 'toy')
  if (block >= 0) return block
  const cols = legalCols(board)
  return cols.length ? cols[Math.floor(Math.random() * cols.length)] : -1
}

/** The column the computer (ninja) plays for the given difficulty. */
function aiMove(board: Cell[], difficulty: Difficulty): number {
  return difficulty === 'easy' ? easyMove(board) : searchMove(board, DEPTH[difficulty])
}

const prefersReducedMotion = () =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** How long a disc landing on `row` takes to fall and settle (ms). Grows like
 * sqrt(distance), as under gravity: ≈0.65 s for the top row, ≈1 s for the
 * bottom — slow enough to follow the disc all the way down. */
const dropDuration = (row: number) => 420 + 240 * Math.sqrt(row + 1)

/**
 * The disc falls down the WHOLE column, BEHIND the frame — as in the real
 * game it is only seen through the holes it passes. It starts above the top
 * hole (hidden by the frame's top edge), drops past every empty slot to its
 * landing slot, then bounces once. Distances are measured off the rendered
 * slots (the board is container-query sized, so there is no fixed pitch to
 * hard-code) and the fall time grows like sqrt(distance), as under gravity.
 *
 * "Behind" without restructuring the board: the React-owned disc is hidden
 * for the fall and a visual CLONE falls on a board-sized layer whose
 * `clip-path` is the union of that column's holes. The layer never moves, so
 * the clip stays on the holes while the clone slides under it.
 */
function animateDrop(
  boardEl: HTMLElement,
  index: number,
  onLanded: () => void,
): (() => void) | null {
  const disc = boardEl.querySelector<HTMLElement>(`[data-c4-disc="${index}"]`)
  const hole = disc?.parentElement
  if (!disc || !hole || prefersReducedMotion()) {
    onLanded() // nothing to wait for — never leave the game waiting on a fall
    return null
  }
  const col = index % COLS
  const row = Math.floor(index / COLS)
  const board = boardEl.getBoundingClientRect()
  const landing = disc.getBoundingClientRect()
  const holeRect = hole.getBoundingClientRect()
  const face = getComputedStyle(hole).backgroundColor
  // The column's holes from the top down to the landing one, board-relative.
  const circles: string[] = []
  for (let r = 0; r <= row; r++) {
    const h = boardEl
      .querySelector<HTMLElement>(`[data-testid="c4-slot-${r * COLS + col}"]`)
      ?.firstElementChild?.getBoundingClientRect()
    if (!h) continue
    const rad = h.width / 2
    const cx = h.left - board.left + rad
    const cy = h.top - board.top + h.height / 2
    circles.push(
      `M ${cx - rad} ${cy} a ${rad} ${rad} 0 1 0 ${2 * rad} 0 a ${rad} ${rad} 0 1 0 ${-2 * rad} 0 Z`,
    )
  }
  const layer = document.createElement('div')
  layer.dataset.testid = 'c4-drop-layer'
  layer.dataset.holes = String(circles.length)
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '1',
    clipPath: `path('${circles.join(' ')}')`,
  })
  // The clone wears the filled look: the white disc face (background + a rim
  // shadow out to the hole's edge) with the head on top.
  const clone = disc.cloneNode(true) as HTMLElement
  clone.removeAttribute('data-c4-disc')
  clone.dataset.c4Falling = String(index)
  const rim = Math.max(0, (holeRect.width - landing.width) / 2)
  Object.assign(clone.style, {
    position: 'absolute',
    left: `${landing.left - board.left}px`,
    top: `${landing.top - board.top}px`,
    width: `${landing.width}px`,
    height: `${landing.height}px`,
    animation: 'none',
    backgroundColor: face,
    borderRadius: '50%',
    boxShadow: `0 0 0 ${rim}px ${face}`,
  })
  layer.appendChild(clone)
  boardEl.appendChild(layer)
  // The landing hole stays an empty hole, and its own disc hidden, until the
  // clone gets there — otherwise the destination lights up early.
  hole.style.backgroundColor = 'rgba(0,0,0,0.28)'
  hole.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.35)'
  disc.style.visibility = 'hidden'

  // From a full hole above the top hole's centre — wholly behind the frame.
  const top = boardEl
    .querySelector<HTMLElement>(`[data-testid="c4-slot-${col}"]`)!
    .getBoundingClientRect()
  const fromY = top.top - top.height / 2 - (landing.top + landing.height / 2)
  const duration = dropDuration(row)
  const fall = clone.animate(
    [
      // Mild ease-in: it gathers speed without idling at the top and then
      // flashing through the column in the last few frames.
      { transform: `translateY(${fromY}px)`, easing: 'cubic-bezier(.35,0,.75,.55)' },
      { offset: 0.78, transform: 'translateY(0)', easing: 'ease-out' },
      { offset: 0.89, transform: 'translateY(-9%)', easing: 'ease-in' },
      { transform: 'translateY(0)' },
    ],
    { duration },
  )
  const restore = () => {
    layer.remove()
    hole.style.backgroundColor = ''
    hole.style.boxShadow = ''
    disc.style.visibility = ''
  }
  fall.onfinish = () => {
    restore()
    onLanded()
  }
  // Interrupted (a reset, the next move, a StrictMode re-run): restore NOW —
  // an async cancel event could land after a newer drop started.
  return () => {
    fall.onfinish = null
    fall.cancel()
    restore()
  }
}
/** Pulsing glow on the winning discs. */
const winGlow = keyframes`
  0%, 100% { filter: drop-shadow(0 0 3px currentColor); transform: scale(1); }
  50%      { filter: drop-shadow(0 0 14px currentColor) drop-shadow(0 0 5px currentColor); transform: scale(1.1); }
`
/** Pulsing ring on the winning slots. */
const cellGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 currentColor, 0 0 6px 0 currentColor; }
  50%      { box-shadow: inset 0 0 0 2px currentColor, 0 0 14px 3px currentColor; }
`

function Disc({ mark }: { mark: Mark }) {
  const { Head } = useSeatVisual(mark)
  return <Head />
}

export default function Connect4Widget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const [lastDrop, setLastDrop] = useState<number | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  // The last drop whose fall has finished. While `lastDrop` is still falling,
  // everything that would cover or cut short the fall waits for it: the
  // 2-player hand-off banner, the win overlay and the computer's reply.
  const [landed, setLanded] = useState<number | null>(null)
  const falling = lastDrop !== null && landed !== lastDrop
  /** The 2-player hand-off to announce once the current disc lands. */
  const pendingHandRef = useRef<Mark | null>(null)
  const [pending, setPending] = useState<
    { mode?: Mode; difficulty?: Difficulty } | null
  >(null)
  const hand = useHandoff()
  // Before paint, so the disc never flashes at rest in its slot first.
  useLayoutEffect(() => {
    if (lastDrop === null || !boardRef.current) return
    return (
      animateDrop(boardRef.current, lastDrop, () => {
        setLanded(lastDrop)
        const next = pendingHandRef.current
        pendingHandRef.current = null
        if (next) hand.announce(next)
      }) ?? undefined
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDrop])

  const board = useWidgetField<Cell[]>(id, 'board', EMPTY_BOARD, coerceBoard)
  const mode = useWidgetField<Mode>(id, 'mode', 'pvp', (v) =>
    v === 'ai' || v === 'online' ? v : 'pvp',
  )
  const difficulty = useWidgetField<Difficulty>(id, 'difficulty', 'medium', (v) =>
    v === 'easy' || v === 'hard' ? v : 'medium',
  )
  const first = useWidgetField<Mark>(id, 'first', 'toy', (v) =>
    v === 'ninja' ? 'ninja' : 'toy',
  )

  const result = calcWin(board)
  const winner = result?.winner ?? null
  const isDraw = !winner && board.every(Boolean)
  const turn = turnOf(board, first)
  const boardEmpty = board.every((c) => !c)
  const canPass = mode === 'ai' && boardEmpty && !winner && turn === 'toy'
  const seatAvatars = useSeatAvatars()

  const setGame = (
    next: Partial<{
      board: Cell[]
      mode: Mode
      difficulty: Difficulty
      first: Mark
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  // ---------------------------------------------------------------- netplay
  const online = mode === 'online'
  const net = useNetGame<Cell[]>({
    online,
    board,
    first,
    turn,
    ply: board.filter(Boolean).length,
    // The only Connect-4-specific part of two-device play: a move is a column,
    // and a disc falls to the lowest free slot in it.
    applyMove: (current, col, seat) => dropInto(current, col, seat)?.board ?? null,
    coerceBoard,
    newBoard: () => Array(SIZE).fill(null),
    onReplace: () => {
      hand.clear()
      setLastDrop(null)
    },
    setGame,
  })
  const { link } = net

  // Both screens must show the same characters, so a connected guest wears the
  // HOST's avatar picks — as a costume via `SeatAvatarsOverride`, never as a
  // settings write, and only while the link is up. The body's own colour
  // lookups use the same effective map the provider hands the subtree.
  const avatarOverride = online ? net.peerAvatars : null
  const effectiveAvatars = avatarOverride ?? seatAvatars
  const colorOf = (seat: Mark) => avatarMetaById[effectiveAvatars[seat]].color
  const winColor = winner ? colorOf(winner) : undefined

  // Vs-computer: the ninja answers on its turn, after a short "thinking" pause.
  useEffect(() => {
    if (mode !== 'ai' || winner || isDraw || turn !== 'ninja' || falling) return
    const delay = THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN)
    const timer = setTimeout(() => {
      const col = aiMove(board, difficulty)
      const res = col >= 0 ? dropInto(board, col, 'ninja') : null
      if (!res) return
      setLastDrop(res.index)
      setGame({ board: res.board })
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, mode, difficulty, winner, isDraw, turn, falling])

  const playCol = (col: number) => {
    if (winner || isDraw || hand.player) return
    if (mode === 'pvp' && falling) return // the hand-off banner is still to come
    if (mode === 'ai' && turn === 'ninja') return // AI's move
    if (net.blocked) return // not paired yet, or the other device's turn
    const res = dropInto(board, col, turn)
    if (!res) return // column full
    setLastDrop(res.index)
    setGame({ board: res.board })
    if (online) net.sendMove(col)
    // 2-player hand-off: announce the next player unless this move ended it.
    // Online needs none — each device only ever shows its own turn.
    // It waits for the disc to land — shown at once it would hide the fall.
    if (mode === 'pvp' && !calcWin(res.board) && legalCols(res.board).length > 0) {
      pendingHandRef.current = turn === 'toy' ? 'ninja' : 'toy'
    }
  }

  const reset = (extra: Partial<{ mode: Mode; difficulty: Difficulty }> = {}) => {
    hand.clear()
    pendingHandRef.current = null
    setLastDrop(null)
    setGame({ board: Array(SIZE).fill(null), first: 'toy', ...extra })
  }
  // A move has been made and the game isn't over — a restart would lose it.
  const inProgress = !boardEmpty && !winner && !isDraw
  const requestReset = (extra: { mode?: Mode; difficulty?: Difficulty }) => {
    if (inProgress) setPending(extra)
    else reset(extra)
  }

  const newGame = () => {
    reset()
    // Either side may restart; the other applies the same opening.
    if (online) net.sendNew('toy')
  }
  const changeMode = (next: Mode | null) => {
    if (next && next !== mode) requestReset({ mode: next })
  }
  const changeDifficulty = (next: Difficulty | null) => {
    if (next && next !== difficulty) requestReset({ difficulty: next })
  }
  const passTurn = () => {
    setLastDrop(null)
    setGame({ first: 'ninja' })
  }

  const locked = !!winner || isDraw || (mode === 'ai' && turn === 'ninja') || net.blocked

  return (
    <SeatAvatarsOverride.Provider value={avatarOverride}>
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      data-testid="connect4-root"
      data-mode={mode}
      data-net={online ? link.status : 'off'}
      data-seat={link.seat ?? ''}
      data-turn={turn}
      data-ply={board.filter(Boolean).length}
      data-falling={falling ? 'true' : 'false'}
      data-winner={winner ?? ''}
      data-avatar-toy={effectiveAvatars.toy}
      data-avatar-ninja={effectiveAvatars.ninja}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 0.5 }}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={mode}
        onChange={(_, v) => changeMode(v as Mode | null)}
        sx={{ alignSelf: 'center' }}
      >
        <ToggleButton value="pvp" sx={{ textTransform: 'none', py: 0.25 }}>
          2-Player
        </ToggleButton>
        <ToggleButton value="ai" sx={{ textTransform: 'none', py: 0.25 }}>
          vs Computer
        </ToggleButton>
        <ToggleButton
          value="online"
          data-testid="connect4-mode-online"
          sx={{ textTransform: 'none', py: 0.25 }}
        >
          2 Devices
        </ToggleButton>
      </ToggleButtonGroup>

      {online && (
        <NetplayChip
          link={link}
          testId="connect4-link"
          onOpen={() => net.setLinkOpen(true)}
        />
      )}

      {mode === 'ai' && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={difficulty}
          onChange={(_, v) => changeDifficulty(v as Difficulty | null)}
          sx={{ alignSelf: 'center' }}
        >
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <ToggleButton key={d} value={d} sx={{ textTransform: 'capitalize', py: 0.25 }}>
              {d}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          containerType: 'size',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Box
          ref={boardRef}
          sx={{
            position: 'relative',
            width: 'min(100cqw, calc(100cqh * 7 / 6))',
            maxWidth: '100%',
            aspectRatio: '7 / 6',
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            gap: '2%',
            p: '2%',
            bgcolor: C4_FRAME,
            borderRadius: 2,
          }}
        >
          {board.map((cell, i) => {
            const col = i % COLS
            const isWin = result?.line.includes(i) ?? false
            const playable = !locked && !board[col]
            return (
              <Box
                key={i}
                data-testid={`c4-slot-${i}`}
                data-col={col}
                onClick={() => playCol(col)}
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: playable ? 'pointer' : 'default',
                }}
              >
                {/* The hole / disc — a true circle sized off the cell's smaller
                    dimension so heads always sit centred. */}
                <Box
                  sx={{
                    width: '86%',
                    aspectRatio: '1 / 1',
                    maxHeight: '86%',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: cell ? 'background.paper' : 'rgba(0,0,0,0.28)',
                    boxShadow: cell ? 'none' : 'inset 0 2px 4px rgba(0,0,0,0.35)',
                    ...(isWin && {
                      color: winColor,
                      animation: `${cellGlow} 1s ease-in-out infinite`,
                    }),
                  }}
                >
                  {cell && (
                    <Box
                      data-c4-disc={i}
                      sx={{
                        width: '80%',
                        height: '80%',
                        display: 'grid',
                        placeItems: 'center',
                        color: colorOf(cell),
                        animation: isWin ? `${winGlow} 1s ease-in-out infinite` : undefined,
                      }}
                    >
                      <Disc mark={cell} />
                    </Box>
                  )}
                </Box>
              </Box>
            )
          })}
        </Box>

        {winner && !falling && (
          <Box
            data-testid="c4-win-overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.38)',
              pointerEvents: 'none',
            }}
          >
            <WinnerCelebration winner={winner} />
          </Box>
        )}

        {hand.player && !winner && !isDraw && (
          <TurnBanner player={hand.player} onSkip={hand.clear} />
        )}
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}
      >
        {winner ? (
          <PlayerBadge mark={winner} label="wins!" />
        ) : isDraw ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Draw!
          </Typography>
        ) : canPass ? (
          <Button
            className="widget-no-drag"
            size="small"
            onClick={passTurn}
            sx={{ textTransform: 'none' }}
          >
            Pass — let Ninja start
          </Button>
        ) : (
          <PlayerBadge
            mark={turn}
            label={mode === 'ai' && turn === 'ninja' ? 'thinking…' : 'to move'}
            pulse={mode === 'ai' && turn === 'ninja'}
          />
        )}
        <Button size="small" onClick={newGame}>
          New game
        </Button>
      </Stack>

      {online && net.linkOpen && (
        <Suspense fallback={null}>
          <NetplayDialog open onClose={() => net.setLinkOpen(false)} link={link} />
        </Suspense>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Restart game?"
        message="Changing this starts a new game and clears the current board."
        onConfirm={() => {
          if (pending) reset(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
    </SeatAvatarsOverride.Provider>
  )
}
