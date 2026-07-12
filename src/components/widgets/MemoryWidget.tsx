import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useAppDispatch } from '../../app/hooks'
import { updateWidgetData } from '../../features/widgets/widgetsSlice'
import { useWidgetField } from '../../features/widgets/useWidgetField'
import type { WidgetProps } from '../../registry/widgetRegistry'
import ToyHead from './characters/toy/ToyHead'
import NinjaHead from './characters/ninja/NinjaHead'
import PlayerBadge from './PlayerBadge'
import WinnerCelebration from './WinnerCelebration'
import ConfirmDialog from './ConfirmDialog'
import TurnBanner from './TurnBanner'
import { avatarMetaById } from '../../features/avatars/avatarCatalog'
import { useSeatAvatars } from '../../features/avatars/useSeatAvatars'
import { useHandoff } from '../../hooks/useHandoff'

type Player = 'toy' | 'ninja'
type Size = 4 | 6
type Rule = 'again' | 'pass'
type Scores = { toy: number; ninja: number }

// Card-face motifs — an extensible registry; add new SVGs here to grow the pool.
const MOTIF_BY_ID: Record<string, typeof ToyHead> = { toy: ToyHead, ninja: NinjaHead }
const FACE_MOTIFS = ['toy', 'ninja']
const FACE_COLORS = [
  '#d5504b', '#e5842a', '#f2b705', '#4a9d5b', '#16b3a3',
  '#3d7edb', '#5c5fd6', '#9b59b6', '#e0559b',
]
// colour-outer, motif-inner → 18 distinct faces; a pair = same "motif:colour".
const ALL_FACES = FACE_COLORS.flatMap((c) => FACE_MOTIFS.map((m) => `${m}:${c}`))

// Stable fallbacks so useWidgetField selectors don't loop on fresh arrays.
const NO_STR: string[] = []
const NO_BOOL: boolean[] = []
const NO_NUM: number[] = []
const ZERO: Scores = { toy: 0, ninja: 0 }

function buildDeck(size: Size): string[] {
  const pairs = (size * size) / 2
  const deck = ALL_FACES.slice(0, pairs).flatMap((id) => [id, id])
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

/** A single memory card: flips (rotateY) between a neutral back and the face
 * (coloured tile + motif head). Matched cards render as a faded empty slot. */
function MemoryCard({
  faceId,
  faceUp,
  matched,
  disabled,
  onClick,
}: {
  faceId: string
  faceUp: boolean
  matched: boolean
  disabled: boolean
  onClick: () => void
}) {
  const [motifId, color] = faceId.split(':')
  const Motif = MOTIF_BY_ID[motifId] ?? ToyHead

  if (matched) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: 1.5,
          bgcolor: 'action.hover',
          opacity: 0.35,
        }}
      />
    )
  }

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={disabled ? undefined : onClick}
      sx={{
        width: '100%',
        height: '100%',
        perspective: '600px',
        cursor: disabled || faceUp ? 'default' : 'pointer',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform .35s cubic-bezier(.4,0,.2,1)',
          transform: faceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* back */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            borderRadius: 1.5,
            bgcolor: '#3a4a63',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.12)',
          }}
        >
          <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800, fontSize: '1.4rem' }}>
            ?
          </Typography>
        </Box>
        {/* face */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 1.5,
            bgcolor: color,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Box
            sx={{
              width: '62%',
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              bgcolor: 'background.paper',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ width: '88%', height: '88%' }}>
              <Motif />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default function MemoryWidget({ id }: WidgetProps) {
  const dispatch = useAppDispatch()
  const [pending, setPending] = useState<{ size?: Size; rule?: Rule } | null>(null)
  const hand = useHandoff()
  const seatAvatars = useSeatAvatars()
  const colorOf = (seat: Player) => avatarMetaById[seatAvatars[seat]].color

  const size = useWidgetField<Size>(id, 'size', 4, (v) => (v === 6 ? 6 : 4))
  const cards = useWidgetField<string[]>(id, 'cards', NO_STR, (v) =>
    Array.isArray(v) ? (v as string[]) : undefined,
  )
  const matched = useWidgetField<boolean[]>(id, 'matched', NO_BOOL, (v) =>
    Array.isArray(v) ? (v as boolean[]) : undefined,
  )
  const flipped = useWidgetField<number[]>(id, 'flipped', NO_NUM, (v) =>
    Array.isArray(v) ? (v as number[]) : undefined,
  )
  const turn = useWidgetField<Player>(id, 'turn', 'toy', (v) =>
    v === 'ninja' ? 'ninja' : 'toy',
  )
  const scores = useWidgetField<Scores>(id, 'scores', ZERO, (v) =>
    v && typeof v === 'object' &&
    typeof (v as Scores).toy === 'number' &&
    typeof (v as Scores).ninja === 'number'
      ? (v as Scores)
      : undefined,
  )
  const rule = useWidgetField<Rule>(id, 'rule', 'again', (v) =>
    v === 'pass' ? 'pass' : 'again',
  )

  const cellCount = size * size
  const dealt = cards.length === cellCount
  const gameOver = dealt && matched.length === cellCount && matched.every(Boolean)
  const other: Player = turn === 'toy' ? 'ninja' : 'toy'
  const winner: Player | null =
    scores.toy > scores.ninja ? 'toy' : scores.ninja > scores.toy ? 'ninja' : null
  const inProgress =
    !gameOver && (matched.some(Boolean) || flipped.length > 0 || scores.toy + scores.ninja > 0)

  const setGame = (
    next: Partial<{
      size: Size
      cards: string[]
      matched: boolean[]
      flipped: number[]
      turn: Player
      scores: Scores
      rule: Rule
    }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  const reset = (opts: { size?: Size; rule?: Rule } = {}) => {
    hand.clear()
    const nextSize = opts.size ?? size
    setGame({
      size: nextSize,
      cards: buildDeck(nextSize),
      matched: Array(nextSize * nextSize).fill(false),
      flipped: [],
      turn: 'toy',
      scores: { toy: 0, ninja: 0 },
      ...(opts.rule ? { rule: opts.rule } : {}),
    })
  }

  // Deal a fresh board on first mount / whenever the deck size is out of sync.
  useEffect(() => {
    if (cards.length !== cellCount) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, cellCount, size])

  // Resolve a two-card flip after a short reveal delay.
  useEffect(() => {
    if (flipped.length !== 2) return
    const [a, b] = flipped
    const isMatch = cards[a] === cards[b]
    const timer = setTimeout(
      () => {
        if (isMatch) {
          const m = matched.slice()
          m[a] = true
          m[b] = true
          setGame({
            matched: m,
            scores: { ...scores, [turn]: scores[turn] + 1 },
            flipped: [],
            turn: rule === 'again' ? turn : other,
          })
          // "always pass" hands over — unless that match ended the game.
          if (rule === 'pass' && !m.every(Boolean)) hand.announce(other)
        } else {
          setGame({ flipped: [], turn: other })
          hand.announce(other)
        }
      },
      isMatch ? 600 : 1100,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, cards, matched, scores, turn, rule])

  const flip = (i: number) => {
    if (gameOver || flipped.length >= 2 || hand.player) return
    if (matched[i] || flipped.includes(i)) return
    setGame({ flipped: [...flipped, i] })
  }

  const newGame = () => reset()
  // Grid size and match rule both start a new game (like changing difficulty),
  // guarded by a confirm while a game is in progress.
  const requestReset = (opts: { size?: Size; rule?: Rule }) => {
    if (inProgress) setPending(opts)
    else reset(opts)
  }
  const requestSize = (next: Size | null) => {
    if (next && next !== size) requestReset({ size: next })
  }
  const changeRule = (next: Rule | null) => {
    if (next && next !== rule) requestReset({ rule: next })
  }

  const resolving = flipped.length >= 2

  return (
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.5 }}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={size}
          onChange={(_, v) => requestSize(v as Size | null)}
        >
          <ToggleButton value={4} sx={{ textTransform: 'none', py: 0.25 }}>
            4×4
          </ToggleButton>
          <ToggleButton value={6} sx={{ textTransform: 'none', py: 0.25 }}>
            6×6
          </ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={rule}
          onChange={(_, v) => changeRule(v as Rule | null)}
        >
          <ToggleButton value="again" sx={{ textTransform: 'none', py: 0.25 }}>
            Match: go again
          </ToggleButton>
          <ToggleButton value="pass" sx={{ textTransform: 'none', py: 0.25 }}>
            Always pass
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
        {(['toy', 'ninja'] as const).map((p) => {
          const active = !gameOver && turn === p
          return (
            <Box
              key={p}
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                border: '2px solid',
                borderColor: active ? colorOf(p) : 'transparent',
                bgcolor: active ? `${colorOf(p)}22` : 'transparent',
              }}
            >
              <PlayerBadge mark={p} label={`${scores[p]}`} pulse={active} />
            </Box>
          )
        })}
      </Stack>

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
            width: 'min(100cqmin, 460px)',
            height: 'min(100cqmin, 460px)',
            display: 'grid',
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
            gap: '3%',
          }}
        >
          {cards.map((faceId, i) => (
            <Box
              key={i}
              data-testid={`mem-card-${i}`}
              data-face={faceId}
              data-state={matched[i] ? 'matched' : flipped.includes(i) ? 'up' : 'down'}
              sx={{ minWidth: 0, minHeight: 0 }}
            >
              <MemoryCard
                faceId={faceId}
                faceUp={flipped.includes(i) || matched[i]}
                matched={matched[i]}
                disabled={resolving || gameOver}
                onClick={() => flip(i)}
              />
            </Box>
          ))}
        </Box>

        {hand.player && !gameOver && (
          <TurnBanner player={hand.player} onSkip={hand.clear} />
        )}

        {gameOver && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
              bgcolor: 'rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }}
          >
            {winner ? (
              <WinnerCelebration winner={winner} />
            ) : (
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700 }}>
                Draw!
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
        {gameOver ? (
          winner ? (
            <PlayerBadge mark={winner} label="wins!" />
          ) : (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Draw!
            </Typography>
          )
        ) : (
          <Typography variant="body2" color="text.secondary">
            Flip two cards
          </Typography>
        )}
        <Button size="small" onClick={newGame}>
          New game
        </Button>
      </Stack>

      <ConfirmDialog
        open={pending !== null}
        title="Restart game?"
        message="This starts a new game and reshuffles the board."
        onConfirm={() => {
          if (pending) reset(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
  )
}
