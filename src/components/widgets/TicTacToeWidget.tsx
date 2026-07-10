import { useEffect } from 'react'
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
import { TOY } from './characters/toyPalette'
import NinjaHead from './characters/NinjaHead'
import { N } from './characters/ninjaPalette'
import WinnerCelebration from './WinnerCelebration'
import PlayerBadge from './PlayerBadge'

/** The two players are the toy head and the ninja head instead of X / O. */
type Mark = 'toy' | 'ninja'
type Cell = Mark | null
type Mode = 'pvp' | 'ai'
type Difficulty = 'easy' | 'hard'

/** Stable references so the AI effect doesn't loop on a fresh fallback array. */
const EMPTY_BOARD: Cell[] = Array(9).fill(null)

/** Random delay (ms) before the computer commits its move, to simulate
 * thinking rather than replying instantly. */
const THINK_MIN = 400
const THINK_MAX = 1200

const LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

function Mark({ mark }: { mark: Mark }) {
  return mark === 'toy' ? <ToyHead /> : <NinjaHead />
}

/** Winner + the three cell indices forming the line, or null. */
function calcWin(board: Cell[]): { winner: Mark; line: [number, number, number] } | null {
  for (const line of LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Mark, line }
    }
  }
  return null
}

/** `first` opens the game; parity of filled cells then gives the current turn. */
function turnOf(board: Cell[], first: Mark): Mark {
  const filled = board.filter(Boolean).length
  const other: Mark = first === 'toy' ? 'ninja' : 'toy'
  return filled % 2 === 0 ? first : other
}

/** Minimax value of `board` with `next` to move; ninja maximizes. Depth
 * biases toward faster wins and slower losses. */
function minimax(board: Cell[], next: Mark, depth: number): number {
  const win = calcWin(board)
  if (win) return win.winner === 'ninja' ? 10 - depth : depth - 10
  const avail = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
  if (avail.length === 0) return 0

  if (next === 'ninja') {
    let best = -Infinity
    for (const i of avail) {
      const b = board.slice()
      b[i] = 'ninja'
      best = Math.max(best, minimax(b, 'toy', depth + 1))
    }
    return best
  }
  let best = Infinity
  for (const i of avail) {
    const b = board.slice()
    b[i] = 'toy'
    best = Math.min(best, minimax(b, 'ninja', depth + 1))
  }
  return best
}

/** Unbeatable move for the ninja (the AI). */
function bestMove(board: Cell[]): number {
  let best = -Infinity
  let move = -1
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue
    const b = board.slice()
    b[i] = 'ninja'
    const score = minimax(b, 'toy', 1)
    if (score > best) {
      best = score
      move = i
    }
  }
  return move
}

/** A uniformly random empty cell, or -1 if the board is full. */
function randomMove(board: Cell[]): number {
  const avail = board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
  if (avail.length === 0) return -1
  return avail[Math.floor(Math.random() * avail.length)]
}

/** An empty cell that immediately makes `mark` win, or -1 if none. */
function winningMove(board: Cell[], mark: Mark): number {
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue
    const b = board.slice()
    b[i] = mark
    if (calcWin(b)?.winner === mark) return i
  }
  return -1
}

/** Easy: a casual-but-sane player — take an immediate win, else block the
 * human's immediate win, else play randomly. No lookahead, so it can still be
 * beaten with a fork, but it never ignores an obvious win/block. */
function easyMove(board: Cell[]): number {
  const win = winningMove(board, 'ninja')
  if (win >= 0) return win
  const block = winningMove(board, 'toy')
  if (block >= 0) return block
  return randomMove(board)
}

/** Pulsing glow on the three marks that make the winning line. */
const winGlow = keyframes`
  0%, 100% { filter: drop-shadow(0 0 4px currentColor); transform: scale(1); }
  50%      { filter: drop-shadow(0 0 16px currentColor) drop-shadow(0 0 6px currentColor); transform: scale(1.14); }
`

/** Pulsing ring + tint on the winning cells, so the whole line lights up. */
const cellGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 currentColor, 0 0 6px 0 currentColor; }
  50%      { box-shadow: inset 0 0 0 2px currentColor, 0 0 16px 3px currentColor; }
`

export default function TicTacToeWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()

  const board = useWidgetField<Cell[]>(id, 'board', EMPTY_BOARD, (b) =>
    Array.isArray(b) && b.length === 9 ? (b as Cell[]) : undefined,
  )
  const mode = useWidgetField<Mode>(id, 'mode', 'pvp', (v) =>
    v === 'ai' ? 'ai' : 'pvp',
  )
  const difficulty = useWidgetField<Difficulty>(id, 'difficulty', 'easy', (v) =>
    v === 'hard' ? 'hard' : 'easy',
  )
  const first = useWidgetField<Mark>(id, 'first', 'toy', (v) =>
    v === 'ninja' ? 'ninja' : 'toy',
  )

  const result = calcWin(board)
  const winner = result?.winner ?? null
  const isDraw = !winner && board.every(Boolean)
  const turn = turnOf(board, first)
  const boardEmpty = board.every((c) => !c)
  // In Computer mode, before any move, the human may pass so the ninja opens.
  const canPass = mode === 'ai' && boardEmpty && !winner && turn === 'toy'

  const setGame = (
    next: Partial<{
      board: Cell[]
      mode: Mode
      difficulty: Difficulty
      first: Mark
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  // Vs-computer: let the ninja (AI) answer once it's its turn, after a short
  // random "thinking" pause. The timer is cleared if the game state changes
  // (New game, mode/difficulty toggle, Pass) so no stale move lands.
  useEffect(() => {
    if (mode !== 'ai' || winner || isDraw || turn !== 'ninja') return
    const delay = THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN)
    const timer = setTimeout(() => {
      const move = difficulty === 'hard' ? bestMove(board) : easyMove(board)
      if (move < 0) return
      const b = board.slice()
      b[move] = 'ninja'
      setGame({ board: b })
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, mode, difficulty, winner, isDraw, turn])

  const play = (i: number) => {
    if (board[i] || winner || isDraw) return
    if (mode === 'ai' && turn === 'ninja') return // AI's move — ignore taps
    const b = board.slice()
    b[i] = turn
    setGame({ board: b })
  }

  const newGame = () => setGame({ board: Array(9).fill(null), first: 'toy' })
  const changeMode = (next: Mode | null) => {
    if (!next || next === mode) return
    setGame({ mode: next, board: Array(9).fill(null), first: 'toy' })
  }
  const changeDifficulty = () =>
    setGame({
      difficulty: difficulty === 'easy' ? 'hard' : 'easy',
      board: Array(9).fill(null),
      first: 'toy',
    })
  // Hand the opening move to the ninja; the AI effect then plays it.
  const passTurn = () => setGame({ first: 'ninja' })

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 0.5,
      }}
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
        <Button
          className="widget-no-drag"
          size="small"
          variant="outlined"
          onClick={changeDifficulty}
          sx={{ textTransform: 'none', alignSelf: 'center', py: 0.25 }}
        >
          Difficulty: {difficulty === 'easy' ? 'Easy' : 'Hard'}
        </Button>
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
          sx={{
            width: 'min(100cqmin, 340px)',
            height: 'min(100cqmin, 340px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: '4px',
            bgcolor: 'divider',
            border: '4px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          {board.map((cell, i) => {
            const isWin = result?.line.includes(i) ?? false
            const winColor = winner === 'toy' ? TOY.teal : N.iceDeep
            return (
              <Box
                key={i}
                data-testid={`ttt-cell-${i}`}
                onClick={() => play(i)}
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  overflow: 'hidden',
                  bgcolor: 'background.paper',
                  borderRadius: 0.5,
                  display: 'grid',
                  placeItems: 'center',
                  cursor:
                    cell || winner || isDraw ? 'default' : 'pointer',
                  transition: 'background-color 120ms',
                  '&:hover':
                    !cell && !winner && !isDraw
                      ? { bgcolor: 'action.hover' }
                      : undefined,
                  ...(isWin && {
                    color: winColor,
                    bgcolor: `${winColor}22`,
                    animation: `${cellGlow} 1s ease-in-out infinite`,
                  }),
                }}
              >
                {cell && (
                  <Box
                    sx={{
                      width: '82%',
                      height: '82%',
                      color: cell === 'toy' ? TOY.teal : N.iceDeep,
                      animation: isWin
                        ? `${winGlow} 1s ease-in-out infinite`
                        : undefined,
                    }}
                  >
                    <Mark mark={cell} />
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>

        {winner && (
          <Box
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
    </Box>
  )
}
