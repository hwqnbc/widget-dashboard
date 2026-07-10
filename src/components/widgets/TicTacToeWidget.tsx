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
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import type { WidgetProps } from '../../registry/widgetRegistry'

/** The two players are the toy head and the ninja head instead of X / O. */
type Mark = 'toy' | 'ninja'
type Cell = Mark | null
type Mode = 'pvp' | 'ai'
type Difficulty = 'easy' | 'hard'

/** On Easy, the fraction of ninja turns played as a random (imperfect) move
 * rather than the optimal one — enough to give the human real openings while
 * the AI can still win by chance. */
const EASY_RANDOM = 0.6

/** Stable references so the AI effect doesn't loop on a fresh fallback array. */
const EMPTY_BOARD: Cell[] = Array(9).fill(null)

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

/** Toy-figure palette (matches ToyFigure / RoundClock). */
const TOY = {
  teal: '#16b3a3',
  tealShade: '#0d897c',
  tealHi: '#67dccf',
  skin: '#efb188',
  skinShade: '#d4895f',
  line: '#1f3f3b',
}

/** White ice-ninja palette (subset used by the head, from SwordNinjaWidget). */
const N = {
  robe: '#f4f6f8',
  robeShade: '#dbe3ea',
  robeShade2: '#c2cdd8',
  bladeHi: '#f2f6fa',
  iceMid: '#7fc9e8',
  iceDeep: '#4aa6d0',
  line: '#232a31',
}

/** The toy minifigure's capped head, cropped square — reused as one mark. */
function ToyHead() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="28 39 144 144"
      role="img"
      aria-label="Toy"
      style={{ display: 'block' }}
    >
      {/* head */}
      <path d="M80 110 C78 150 84 174 120 176 C156 174 162 150 160 110 Z" fill={TOY.skin} stroke={TOY.skinShade} strokeWidth={2} />
      {/* cap dome */}
      <path d="M72 108 C70 62 94 46 120 46 C146 46 170 62 168 108 Z" fill={TOY.teal} stroke={TOY.tealShade} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M92 60 C84 70 80 86 82 100" stroke={TOY.tealHi} strokeWidth={6} opacity={0.6} strokeLinecap="round" fill="none" />
      {/* cap brim */}
      <path d="M64 104 C40 104 30 114 42 120 C76 130 150 126 170 114 C176 110 172 104 164 104 C150 110 86 112 64 104 Z" fill={TOY.tealHi} stroke={TOY.tealShade} strokeWidth={2} strokeLinejoin="round" />
      {/* eyebrows */}
      <path d="M100 142 q7 -3 13 0" stroke={TOY.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M127 142 q6 -3 13 0" stroke={TOY.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      {/* eyes */}
      <ellipse cx={107} cy={151} rx={3.4} ry={4.6} fill={TOY.line} />
      <ellipse cx={133} cy={151} rx={3.4} ry={4.6} fill={TOY.line} />
      <circle cx={108} cy={149} r={1.1} fill="#fff" />
      <circle cx={134} cy={149} r={1.1} fill="#fff" />
      {/* mouth */}
      <path d="M108 162 Q120 173 132 162" stroke={TOY.line} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </svg>
  )
}

/**
 * The Sword Ninja's hooded head, cropped square. The asymmetric back-knot is
 * dropped for a symmetric mark and the thin face strokes are thickened so they
 * still read at cell size.
 */
function NinjaHead() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="80 58 82 124"
      role="img"
      aria-label="Ninja"
      style={{ display: 'block' }}
    >
      {/* hood base */}
      <path d="M120 64 L149 78 L157 112 L150 150 L120 178 L90 150 L83 112 L91 78 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} />
      {/* right shade facet */}
      <path d="M120 64 L149 78 L157 112 L150 150 L120 178 Z" fill={N.robeShade} opacity={0.9} />
      {/* crown lit facet */}
      <path d="M120 64 L91 78 L110 88 L120 74 Z" fill={N.bladeHi} opacity={0.75} />
      {/* facet seams */}
      <path d="M91 78 L108 118 L90 150 M149 78 L132 118 L150 150 M120 74 L120 110" stroke={N.robeShade2} strokeWidth={2} opacity={0.7} fill="none" />
      {/* visor recess */}
      <path d="M92 114 L120 108 L148 114 L146 140 L120 150 L94 140 Z" fill={N.line} />
      {/* brows */}
      <path d="M99 121 L117 124 M123 124 L141 121" stroke={N.iceDeep} strokeWidth={3} />
      {/* glowing ice eye slits */}
      <path d="M100 132 L118 127 L118 131 L100 136 Z" fill={N.iceMid} />
      <path d="M140 132 L122 127 L122 131 L140 136 Z" fill={N.iceMid} />
      <rect x={107} y={129} width={3} height={3} fill={N.bladeHi} />
      <rect x={130} y={129} width={3} height={3} fill={N.bladeHi} />
      {/* breather / mouth guard */}
      <path d="M112 143 L128 143 M116 140 L116 146 M120 140 L120 146 M124 140 L124 146" stroke={N.iceDeep} strokeWidth={2.2} opacity={0.8} />
    </svg>
  )
}

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

/** Easy: mostly random (imperfect) play, sometimes optimal — beatable but the
 * AI never deliberately loses and can still win by chance. */
function easyMove(board: Cell[]): number {
  return Math.random() < EASY_RANDOM ? randomMove(board) : bestMove(board)
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

  const board = useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    const b = inst?.data.board
    return Array.isArray(b) && b.length === 9 ? (b as Cell[]) : EMPTY_BOARD
  })
  const mode = useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    return inst?.data.mode === 'ai' ? 'ai' : 'pvp'
  }) as Mode
  const difficulty = useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    return inst?.data.difficulty === 'hard' ? 'hard' : 'easy'
  }) as Difficulty
  const first = useAppSelector((state) => {
    const inst = state.widgets.instances.find((w) => w.id === id)
    return inst?.data.first === 'ninja' ? 'ninja' : 'toy'
  }) as Mark

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

  // Vs-computer: let the ninja (AI) answer once it's its turn.
  useEffect(() => {
    if (mode !== 'ai' || winner || isDraw || turn !== 'ninja') return
    const move = difficulty === 'hard' ? bestMove(board) : easyMove(board)
    if (move < 0) return
    const b = board.slice()
    b[move] = 'ninja'
    setGame({ board: b })
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

  const status = winner
    ? `${winner === 'toy' ? 'Toy' : 'Ninja'} wins!`
    : isDraw
      ? 'Draw!'
      : mode === 'ai' && turn === 'ninja'
        ? 'Ninja thinking…'
        : `${turn === 'toy' ? 'Toy' : 'Ninja'} to move`

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
