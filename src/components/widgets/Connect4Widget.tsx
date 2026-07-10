import { useEffect, useState } from 'react'
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
import ToyHead from './characters/ToyHead'
import NinjaHead from './characters/NinjaHead'
import { TOY } from './characters/toyPalette'
import { N } from './characters/ninjaPalette'

/** The two players are the Toy and Ninja heads instead of red / yellow discs. */
type Mark = 'toy' | 'ninja'
type Cell = Mark | null
type Mode = 'pvp' | 'ai'
type Difficulty = 'easy' | 'medium' | 'hard'

const COLS = 7
const ROWS = 6
const SIZE = COLS * ROWS

/** Stable fallback so the AI effect doesn't loop on a fresh array. */
const EMPTY_BOARD: Cell[] = Array(SIZE).fill(null)

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

/** The disc falls from the top of the column into its slot. */
const dropAnim = keyframes`
  0%   { transform: translateY(-750%); }
  70%  { transform: translateY(0); }
  82%  { transform: translateY(-9%); }
  100% { transform: translateY(0); }
`
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
  return mark === 'toy' ? <ToyHead /> : <NinjaHead />
}

export default function Connect4Widget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const [lastDrop, setLastDrop] = useState<number | null>(null)

  const board = useWidgetField<Cell[]>(id, 'board', EMPTY_BOARD, (b) =>
    Array.isArray(b) && b.length === SIZE ? (b as Cell[]) : undefined,
  )
  const mode = useWidgetField<Mode>(id, 'mode', 'pvp', (v) =>
    v === 'ai' ? 'ai' : 'pvp',
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
  const winColor = winner === 'toy' ? TOY.teal : N.iceDeep

  const setGame = (
    next: Partial<{
      board: Cell[]
      mode: Mode
      difficulty: Difficulty
      first: Mark
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  // Vs-computer: the ninja answers on its turn, after a short "thinking" pause.
  useEffect(() => {
    if (mode !== 'ai' || winner || isDraw || turn !== 'ninja') return
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
  }, [board, mode, difficulty, winner, isDraw, turn])

  const playCol = (col: number) => {
    if (winner || isDraw) return
    if (mode === 'ai' && turn === 'ninja') return // AI's move
    const res = dropInto(board, col, turn)
    if (!res) return // column full
    setLastDrop(res.index)
    setGame({ board: res.board })
  }

  const reset = (extra: Partial<{ mode: Mode; difficulty: Difficulty }> = {}) => {
    setLastDrop(null)
    setGame({ board: Array(SIZE).fill(null), first: 'toy', ...extra })
  }
  const newGame = () => reset()
  const changeMode = (next: Mode | null) => {
    if (next && next !== mode) reset({ mode: next })
  }
  const changeDifficulty = (next: Difficulty | null) => {
    if (next && next !== difficulty) reset({ difficulty: next })
  }
  const passTurn = () => {
    setLastDrop(null)
    setGame({ first: 'ninja' })
  }

  const status = winner
    ? `${winner === 'toy' ? 'Toy' : 'Ninja'} wins!`
    : isDraw
      ? 'Draw!'
      : mode === 'ai' && turn === 'ninja'
        ? 'Ninja thinking…'
        : `${turn === 'toy' ? 'Toy' : 'Ninja'} to move`

  const locked = !!winner || isDraw || (mode === 'ai' && turn === 'ninja')

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
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
      </ToggleButtonGroup>

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
          containerType: 'size',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Box
          sx={{
            width: 'min(100cqw, calc(100cqh * 7 / 6))',
            maxWidth: '100%',
            aspectRatio: '7 / 6',
            display: 'flex',
            gap: '3%',
            p: '2.4%',
            bgcolor: C4_FRAME,
            borderRadius: 2,
          }}
        >
          {Array.from({ length: COLS }, (_, c) => {
            const colPlayable = !locked && !board[c]
            return (
              <Box
                key={c}
                component="button"
                type="button"
                data-testid={`c4-col-${c}`}
                className="widget-no-drag"
                onClick={() => playCol(c)}
                disabled={locked || !!board[c]}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8%',
                  p: 0,
                  border: 'none',
                  background: 'none',
                  cursor: colPlayable ? 'pointer' : 'default',
                  '&:not(:disabled):hover': { filter: 'brightness(1.12)' },
                }}
              >
                {Array.from({ length: ROWS }, (_, r) => {
                  const i = r * COLS + c
                  const cell = board[i]
                  const isWin = result?.line.includes(i) ?? false
                  return (
                    <Box
                      key={r}
                      data-testid={`c4-slot-${i}`}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 0,
                        aspectRatio: '1 / 1',
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
                          sx={{
                            width: '86%',
                            height: '86%',
                            color: cell === 'toy' ? TOY.teal : N.iceDeep,
                            animation: [
                              i === lastDrop ? `${dropAnim} 0.45s cubic-bezier(.3,.1,.3,1)` : '',
                              isWin ? `${winGlow} 1s ease-in-out infinite` : '',
                            ]
                              .filter(Boolean)
                              .join(', ') || undefined,
                          }}
                        >
                          <Disc mark={cell} />
                        </Box>
                      )}
                    </Box>
                  )
                })}
              </Box>
            )
          })}
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}
      >
        {canPass ? (
          <Button
            className="widget-no-drag"
            size="small"
            onClick={passTurn}
            sx={{ textTransform: 'none' }}
          >
            Pass — let Ninja start
          </Button>
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {status}
          </Typography>
        )}
        <Button size="small" onClick={newGame}>
          New game
        </Button>
      </Stack>
    </Box>
  )
}
