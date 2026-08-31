import { Suspense, useEffect, useRef, useState } from 'react'
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
import {
  CELLS,
  SIZE,
  applyMove,
  counts,
  flipsFor,
  initialPosition,
  isOver,
  legalMoves,
  otherMark,
  winnerOf,
  aiMove,
  type Cell,
  type Difficulty,
  type Mark,
  type Position,
} from './othelloModel'

/** The pairing UI pulls in a QR encoder and decoder — kept out of the main
 * bundle, since most sessions never open it. */
const NetplayDialog = lazyWithReload(
  () => import('../netplay/NetplayDialog'),
  'netplay-dialog',
)

type Mode = 'pvp' | 'ai' | 'online'

/** Stable fallback so effects never loop on a fresh object (lessons.md #10). */
const INITIAL: Position = initialPosition('toy')

/** A position is only accepted — from storage or from the other device — when
 * it is exactly the shape the rules speak: 64 tri-state cells and a mover.
 * Turn is stored INSIDE the position because Othello's forced pass breaks
 * parity — see othelloModel. */
const coercePosition = (value: unknown): Position | undefined => {
  const p = value as { cells?: unknown; turn?: unknown } | null
  return typeof p === 'object' &&
    p !== null &&
    Array.isArray(p.cells) &&
    p.cells.length === CELLS &&
    p.cells.every((c: unknown) => c === null || c === 'toy' || c === 'ninja') &&
    (p.turn === 'toy' || p.turn === 'ninja')
    ? (value as Position)
    : undefined
}

/** Random delay (ms) before the computer replies, to simulate thinking. */
const THINK_MIN = 400
const THINK_MAX = 1200

/** How long a finger must rest on a legal cell before the capture preview
 * appears. Long enough that an ordinary tap never flashes it, short enough
 * that a curious hold feels answered. */
const HOLD_MS = 200

const BOARD_FRAME = '#1b5e20'
const CELL_FELT = '#2e7d32'

/** A freshly flipped disc squashes through its edge and back — the disc
 * already wears its new owner, the squash is what sells the turn-over. */
const flipAnim = keyframes`
  0%   { transform: scaleX(1); }
  50%  { transform: scaleX(0.08); }
  100% { transform: scaleX(1); }
`
/** A newly placed disc pops in. */
const popAnim = keyframes`
  0%   { transform: scale(0); }
  70%  { transform: scale(1.12); }
  100% { transform: scale(1); }
`
/** Pulsing ring on discs the held move would capture. */
const previewGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px currentColor, 0 0 6px 1px currentColor; }
  50%      { box-shadow: 0 0 0 4px currentColor, 0 0 14px 3px currentColor; }
`

function Disc({ mark }: { mark: Mark }) {
  const { Head } = useSeatVisual(mark)
  return <Head />
}

export default function OthelloWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  /** Transient move dressing: the placed cell pops, the flipped set squashes,
   * and `passed` names a seat that was skipped for want of a legal move. */
  const [lastPlaced, setLastPlaced] = useState<number | null>(null)
  const [flipped, setFlipped] = useState<number[]>([])
  const [passed, setPassed] = useState<Mark | null>(null)
  /** Press-hold capture preview: the held cell and the discs the move would
   * flip. Purely a visual — the commit stays on the ordinary tap/click, and
   * dragging off the cell before release aborts both. */
  const [preview, setPreview] = useState<{ cell: number; flips: number[] } | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pending, setPending] = useState<
    { mode?: Mode; difficulty?: Difficulty } | null
  >(null)
  const hand = useHandoff()

  const position = useWidgetField<Position>(id, 'board', INITIAL, coercePosition)
  const mode = useWidgetField<Mode>(id, 'mode', 'pvp', (v) =>
    v === 'ai' || v === 'online' ? v : 'pvp',
  )
  const difficulty = useWidgetField<Difficulty>(id, 'difficulty', 'medium', (v) =>
    v === 'easy' || v === 'hard' ? v : 'medium',
  )
  const first = useWidgetField<Mark>(id, 'first', 'toy', (v) =>
    v === 'ninja' ? 'ninja' : 'toy',
  )

  const turn = position.turn
  const over = isOver(position)
  const outcome = winnerOf(position)
  const winner: Mark | null = outcome === 'toy' || outcome === 'ninja' ? outcome : null
  const isDraw = outcome === 'draw'
  const score = counts(position.cells)
  const legal = legalMoves(position)
  /** Moves played so far — every move adds exactly one disc, passes add none,
   * so the wire's ply check works untouched. */
  const ply = score.toy + score.ninja - 4
  const canPass = mode === 'ai' && ply === 0 && !over && turn === 'toy'
  const seatAvatars = useSeatAvatars()

  const setGame = (
    next: Partial<{
      board: Position
      mode: Mode
      difficulty: Difficulty
      first: Mark
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  /** Commit a resolved move: dress it, then persist it. Shared by the local
   * tap, the AI reply and the remote relay so a pass reads the same however
   * the move arrived. */
  const commit = (idx: number, res: { pos: Position; flipped: number[] }, mover: Mark) => {
    setLastPlaced(idx)
    setFlipped(res.flipped)
    setPassed(res.pos.turn === mover && !isOver(res.pos) ? otherMark(mover) : null)
  }

  // ---------------------------------------------------------------- netplay
  const online = mode === 'online'
  const net = useNetGame<Position>({
    online,
    board: position,
    first,
    turn,
    ply,
    // The Othello-specific part of two-device play: a move is a cell, and the
    // flips AND the pass-aware next turn come out of the same pure applyMove
    // both devices run — a forced pass never needs to cross the wire.
    applyMove: (current, cell, seat) => {
      if (current.turn !== seat) return null
      const res = applyMove(current, cell)
      if (!res) return null
      commit(cell, res, seat)
      return res.pos
    },
    coerceBoard: coercePosition,
    newBoard: () => initialPosition('toy'),
    onReplace: () => {
      hand.clear()
      setLastPlaced(null)
      setFlipped([])
      setPassed(null)
      setPreview(null)
    },
    setGame,
  })
  const { link } = net

  // Both screens must show the same characters, so a connected guest wears the
  // HOST's avatar picks — as a costume via `SeatAvatarsOverride`, never as a
  // settings write, and only while the link is up.
  const avatarOverride = online ? net.peerAvatars : null
  const effectiveAvatars = avatarOverride ?? seatAvatars
  const colorOf = (seat: Mark) => avatarMetaById[effectiveAvatars[seat]].color

  // Vs-computer: the ninja answers on its turn, after a short "thinking"
  // pause. A forced pass hands the turn straight back to it, and this effect
  // simply fires again on the new board.
  useEffect(() => {
    if (mode !== 'ai' || over || turn !== 'ninja') return
    const delay = THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN)
    const timer = setTimeout(() => {
      const cell = aiMove(position, difficulty)
      const res = cell >= 0 ? applyMove(position, cell) : null
      if (!res) return
      commit(cell, res, 'ninja')
      setGame({ board: res.pos })
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, mode, difficulty, over, turn])

  /** End any press-hold: the pending timer and the preview itself. */
  const clearHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setPreview(null)
  }
  useEffect(
    () => () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    },
    [],
  )

  /** Press-hold on a legal cell arms the capture preview. The flips can't go
   * stale while held: it is this player's turn, so neither the AI nor the
   * other device can change the position under the finger. */
  const startHold = (idx: number) => {
    if (over || hand.player) return
    if (mode === 'ai' && turn === 'ninja') return
    if (net.blocked) return
    const flips = flipsFor(position.cells, idx, turn)
    if (flips.length === 0) return
    if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      setPreview({ cell: idx, flips })
    }, HOLD_MS)
  }

  const playCell = (idx: number) => {
    clearHold()
    if (over || hand.player) return
    if (mode === 'ai' && turn === 'ninja') return // AI's move
    if (net.blocked) return // not paired yet, or the other device's turn
    const res = applyMove(position, idx)
    if (!res) return // occupied, or flips nothing
    commit(idx, res, turn)
    setGame({ board: res.pos })
    if (online) net.sendMove(idx)
    // 2-player hand-off: announce whoever moves next — after a pass that is
    // the same player again, and the banner says so honestly.
    if (mode === 'pvp' && !isOver(res.pos)) {
      hand.announce(res.pos.turn)
    }
  }

  const reset = (extra: Partial<{ mode: Mode; difficulty: Difficulty }> = {}) => {
    hand.clear()
    clearHold()
    setLastPlaced(null)
    setFlipped([])
    setPassed(null)
    setGame({ board: initialPosition('toy'), first: 'toy', ...extra })
  }
  // A move has been made and the game isn't over — a restart would lose it.
  const inProgress = ply > 0 && !over
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
  const passOpening = () => {
    setLastPlaced(null)
    setFlipped([])
    setGame({ board: initialPosition('ninja'), first: 'ninja' })
  }

  const locked = over || (mode === 'ai' && turn === 'ninja') || net.blocked

  return (
    <SeatAvatarsOverride.Provider value={avatarOverride}>
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      data-testid="othello-root"
      data-mode={mode}
      data-net={online ? link.status : 'off'}
      data-seat={link.seat ?? ''}
      data-turn={turn}
      data-ply={ply}
      data-legal={legal.length}
      data-preview={preview?.cell ?? ''}
      data-pass={passed ?? ''}
      data-winner={winner ?? (isDraw ? 'draw' : '')}
      data-score-toy={score.toy}
      data-score-ninja={score.ninja}
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
          data-testid="othello-mode-online"
          sx={{ textTransform: 'none', py: 0.25 }}
        >
          2 Devices
        </ToggleButton>
      </ToggleButtonGroup>

      {online && (
        <NetplayChip
          link={link}
          testId="othello-link"
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
          sx={{
            width: 'min(100cqw, 100cqh)',
            maxWidth: '100%',
            aspectRatio: '1 / 1',
            display: 'grid',
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${SIZE}, 1fr)`,
            gap: '1%',
            p: '1.5%',
            bgcolor: BOARD_FRAME,
            borderRadius: 2,
            // A held finger must preview, not select text or pop a callout.
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'manipulation',
          }}
        >
          {position.cells.map((cell: Cell, i: number) => {
            const hint = !locked && legal.includes(i)
            const previewFlip = preview?.flips.includes(i) ?? false
            return (
              <Box
                key={i}
                data-testid={`oth-cell-${i}`}
                data-disc={cell ?? ''}
                data-hint={hint ? '1' : '0'}
                data-preview-flip={previewFlip ? '1' : '0'}
                onClick={() => playCell(i)}
                onPointerDown={() => startHold(i)}
                onPointerUp={clearHold}
                onPointerLeave={clearHold}
                onPointerCancel={clearHold}
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: CELL_FELT,
                  borderRadius: '12%',
                  cursor: hint ? 'pointer' : 'default',
                  // The would-be captures ring in the MOVER's colour: these
                  // discs are about to become theirs.
                  ...(previewFlip && {
                    color: colorOf(turn),
                    animation: `${previewGlow} 0.8s ease-in-out infinite`,
                  }),
                }}
              >
                {cell ? (
                  <Box
                    sx={{
                      width: '84%',
                      aspectRatio: '1 / 1',
                      maxHeight: '84%',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'background.paper',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                      color: colorOf(cell),
                      animation:
                        i === lastPlaced
                          ? `${popAnim} 0.35s ease-out`
                          : flipped.includes(i)
                            ? `${flipAnim} 0.45s ease-in-out`
                            : undefined,
                    }}
                  >
                    <Box sx={{ width: '78%', height: '78%' }}>
                      <Disc mark={cell} />
                    </Box>
                  </Box>
                ) : preview?.cell === i ? (
                  // A ghost of the disc the hold would place.
                  <Box
                    sx={{
                      width: '84%',
                      aspectRatio: '1 / 1',
                      maxHeight: '84%',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'background.paper',
                      opacity: 0.55,
                      color: colorOf(turn),
                    }}
                  >
                    <Box sx={{ width: '78%', height: '78%' }}>
                      <Disc mark={turn} />
                    </Box>
                  </Box>
                ) : (
                  hint && (
                    <Box
                      sx={{
                        width: '26%',
                        aspectRatio: '1 / 1',
                        borderRadius: '50%',
                        bgcolor: 'rgba(255,255,255,0.35)',
                      }}
                    />
                  )
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

        {hand.player && !over && <TurnBanner player={hand.player} onSkip={hand.clear} />}
      </Box>

      {passed && !over && (
        <Typography
          variant="caption"
          data-testid="othello-pass-note"
          sx={{ alignSelf: 'center', fontWeight: 600 }}
        >
          {`${avatarMetaById[effectiveAvatars[passed]].name} has no move — skipped!`}
        </Typography>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <PlayerBadge mark="toy" label={String(score.toy)} />
          <PlayerBadge mark="ninja" label={String(score.ninja)} />
        </Stack>
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
            onClick={passOpening}
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
