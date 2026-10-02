import { Suspense, useEffect, useRef, useState, type ComponentType } from 'react'
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
import PlayerBadge from './PlayerBadge'
import WinnerCelebration from './WinnerCelebration'
import ConfirmDialog from './ConfirmDialog'
import TurnBanner from './TurnBanner'
import { avatarMetaById } from '../../features/avatars/avatarCatalog'
import { AVATAR_IDS } from '../../features/avatars/types'
import { avatarVisualById } from '../../registry/avatarRegistry'
import { usePresentation } from '../fullscreen/presentation'
import {
  SeatAvatarsOverride,
  useSeatAvatars,
} from '../../features/avatars/useSeatAvatars'
import { useHandoff } from '../../hooks/useHandoff'
import { useNetGame } from '../../features/netplay/useNetGame'
import NetplayChip from '../netplay/NetplayChip'
import { lazyWithReload } from '../../utils/lazyWithReload'
import {
  MATCH_MS,
  MISS_MS,
  coerceMemState,
  emptyGame,
  flipCard,
  freshGame,
  isPairMatch,
  resolvePair,
  type MemRule as Rule,
  type MemSeat as Player,
  type MemSize as Size,
  type MemState,
  type MemScores as Scores,
} from './memoryModel'

/** The pairing UI pulls in a QR encoder and decoder — kept out of the main
 * bundle, since most sessions never open it. */
const NetplayDialog = lazyWithReload(
  () => import('../netplay/NetplayDialog'),
  'netplay-dialog',
)

type Mode = 'local' | 'online'

// Card-face motifs — every registered avatar's head, pulled straight from the
// avatar registry, so adding an avatar grows the pool automatically. (The
// face IDs themselves live in memoryModel, which the deck is built from.)
type HeadComponent = ComponentType<{ size?: number | string }>
const MOTIF_BY_ID: Record<string, HeadComponent> = Object.fromEntries(
  AVATAR_IDS.map((av) => [av, avatarVisualById[av].Head]),
)
const FALLBACK_HEAD: HeadComponent = avatarVisualById.toy.Head

// Stable fallbacks so useWidgetField selectors don't loop on fresh arrays.
const NO_STR: string[] = []
const NO_BOOL: boolean[] = []
const NO_NUM: number[] = []
const ZERO: Scores = { toy: 0, ninja: 0 }

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
  const Motif = MOTIF_BY_ID[motifId] ?? FALLBACK_HEAD

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
  const [pending, setPending] = useState<
    { size?: Size; rule?: Rule; mode?: Mode } | null
  >(null)
  const hand = useHandoff()
  const seatAvatars = useSeatAvatars()
  const { fullscreen } = usePresentation()
  // Fullscreen relaxes the fixed px cap so the board fills the larger space.
  const boardMax = fullscreen ? 'min(100cqmin, 92vmin)' : 'min(100cqmin, 460px)'

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
  const mode = useWidgetField<Mode>(id, 'mode', 'local', (v) =>
    v === 'online' ? 'online' : 'local',
  )
  /** Flips played so far — the wire's replay guard. Counts every accepted
   * flip (never reset by pair resolution), so two flips by the same seat
   * cross with different ply values. */
  const ply = useWidgetField<number>(id, 'ply', 0, (v) =>
    Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined,
  )

  const cellCount = size * size
  const dealt = cards.length === cellCount
  const gameOver = dealt && matched.length === cellCount && matched.every(Boolean)
  const winner: Player | null =
    scores.toy > scores.ninja ? 'toy' : scores.ninja > scores.toy ? 'ninja' : null
  const inProgress =
    !gameOver && (matched.some(Boolean) || flipped.length > 0 || scores.toy + scores.ninja > 0)

  const setGame = (
    next: Partial<MemState & { mode: Mode }>,
  ) => dispatch(updateWidgetData({ id, data: next }))

  /** The whole position as one object — what the netplay seam syncs and what
   * the pure rules run on. */
  const board: MemState = { size, rule, cards, matched, flipped, turn, scores, ply }
  // The ref lets the reveal timer read the LIVE position when it fires — its
  // closure may be a whole throttled-tab nap stale.
  const boardRef = useRef(board)
  boardRef.current = board

  /** Whose move the position is really waiting on. While two cards sit
   * revealed, resolution is already determined — a miss has, in truth,
   * passed the turn even though the reveal timer hasn't flipped the cards
   * back yet. The netplay seam gates incoming moves on this, so a peer's
   * next flip isn't dropped by a device whose timer lags (throttled
   * background tab). */
  const netTurn: Player = flipped.length === 2 ? resolvePair(board).turn : turn

  // ---------------------------------------------------------------- netplay
  const online = mode === 'online'
  const net = useNetGame<MemState>({
    online,
    board,
    first: 'toy',
    turn: netTurn,
    ply,
    // The Memory-specific part of two-device play: a move is a card index,
    // and a still-revealed pair resolves synchronously first — the same pure
    // resolution the reveal timer applies, so both orders converge.
    applyMove: (current, i, seat) => {
      const s = current.flipped.length >= 2 ? resolvePair(current) : current
      if (s.turn !== seat) return null
      return flipCard(s, i)
    },
    coerceBoard: coerceMemState,
    newBoard: () => emptyGame(size, rule),
    onReplace: () => hand.clear(),
    setGame: (next) => {
      // The hook speaks in one `board` object; this widget persists flat
      // fields — spread it back out.
      if ('board' in next) {
        const { board: b, ...rest } = next
        setGame({ ...(b as MemState), ...rest })
      } else {
        setGame(next)
      }
    },
  })
  const { link } = net
  const isGuest = online && link.role === 'guest'

  // Both screens must show the same characters, so a connected guest wears the
  // HOST's avatar picks — as a costume via `SeatAvatarsOverride`, never as a
  // settings write, and only while the link is up.
  const avatarOverride = online ? net.peerAvatars : null
  const effectiveAvatars = avatarOverride ?? seatAvatars
  const colorOf = (seat: Player) => avatarMetaById[effectiveAvatars[seat]].color

  const reset = (opts: { size?: Size; rule?: Rule; mode?: Mode } = {}) => {
    hand.clear()
    const fresh = freshGame(opts.size ?? size, opts.rule ?? rule)
    setGame({ ...fresh, ...(opts.mode ? { mode: opts.mode } : {}) })
    return fresh
  }

  // Deal a fresh board on first mount / whenever the deck size is out of sync.
  // A connected (or connecting) guest never deals its own: the host's board
  // arrives whole in the pairing `sync`.
  useEffect(() => {
    if (isGuest) return
    if (cards.length !== cellCount) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, cellCount, size, isGuest])

  // Resolve a two-card flip after a short reveal delay. Online, BOTH devices
  // run this timer and apply the same pure resolution — nothing crosses the
  // wire for it. The timer re-reads the live board and re-checks the pair it
  // was armed for: a remote flip may have landed first and resolved it
  // synchronously (applyMove above), and blindly applying a stale closure
  // here would clobber that flip.
  useEffect(() => {
    if (flipped.length !== 2) return
    const [a, b] = flipped
    const timer = setTimeout(
      () => {
        const live = boardRef.current
        if (live.flipped.length !== 2 || live.flipped[0] !== a || live.flipped[1] !== b)
          return
        const next = resolvePair(live)
        setGame({
          matched: next.matched,
          scores: next.scores,
          flipped: [],
          turn: next.turn,
        })
        // Hand-over banner, pass-and-play only — online the other player is
        // on their own device. Announce whenever the turn moved on and the
        // game isn't over (a miss always, a match under "always pass").
        if (!online && next.turn !== live.turn && !next.matched.every(Boolean)) {
          hand.announce(next.turn)
        }
      },
      isPairMatch(board) ? MATCH_MS : MISS_MS,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, cards, matched, scores, turn, rule, online])

  const flip = (i: number) => {
    if (gameOver || flipped.length >= 2 || hand.player) return
    if (net.blocked) return // not paired yet, or the other device's turn
    if (matched[i] || flipped.includes(i)) return
    setGame({ flipped: [...flipped, i], ply: ply + 1 })
    if (online) net.sendMove(i)
  }

  /** Restart (optionally with new settings) and, online, ship exactly what
   * was dealt: a fresh deck is fresh RANDOMNESS, which `new` cannot carry —
   * so an online restart is a whole-position sync, from either side (the
   * Archery precedent). A mode change never syncs: entering online has no
   * link yet, and leaving should not reshuffle the peer on the way out. */
  const doReset = (opts: { size?: Size; rule?: Rule; mode?: Mode } = {}) => {
    const fresh = reset(opts)
    if (online && !opts.mode) net.sendSync(fresh, 'toy')
  }

  const newGame = () => doReset()
  // Grid size and match rule both start a new game (like changing difficulty),
  // guarded by a confirm while a game is in progress.
  const requestReset = (opts: { size?: Size; rule?: Rule; mode?: Mode }) => {
    if (inProgress) setPending(opts)
    else doReset(opts)
  }
  const requestSize = (next: Size | null) => {
    if (next && next !== size) requestReset({ size: next })
  }
  const changeRule = (next: Rule | null) => {
    if (next && next !== rule) requestReset({ rule: next })
  }
  const changeMode = (next: Mode | null) => {
    if (next && next !== mode) requestReset({ mode: next })
  }

  const resolving = flipped.length >= 2

  return (
    <SeatAvatarsOverride.Provider value={avatarOverride}>
    <Box
      className="widget-no-drag"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      data-testid="memory-root"
      data-mode={mode}
      data-net={online ? link.status : 'off'}
      data-seat={link.seat ?? ''}
      data-turn={turn}
      data-ply={ply}
      data-size={size}
      data-rule={rule}
      data-dealt={dealt ? '1' : '0'}
      data-winner={gameOver ? (winner ?? 'draw') : ''}
      data-score-toy={scores.toy}
      data-score-ninja={scores.ninja}
      data-avatar-toy={effectiveAvatars.toy}
      data-avatar-ninja={effectiveAvatars.ninja}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.5 }}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, v) => changeMode(v as Mode | null)}
        >
          <ToggleButton value="local" sx={{ textTransform: 'none', py: 0.25 }}>
            Pass &amp; play
          </ToggleButton>
          <ToggleButton
            value="online"
            data-testid="memory-mode-online"
            sx={{ textTransform: 'none', py: 0.25 }}
          >
            2 Devices
          </ToggleButton>
        </ToggleButtonGroup>
        {/* The host's board (and settings) win online, so a guest's size and
            rule switches are disabled rather than silently overwritten. */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={size}
          disabled={isGuest}
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
          disabled={isGuest}
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

      {online && (
        <NetplayChip
          link={link}
          testId="memory-link"
          onOpen={() => net.setLinkOpen(true)}
        />
      )}

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
            width: boardMax,
            height: boardMax,
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

      {online && net.linkOpen && (
        <Suspense fallback={null}>
          <NetplayDialog open onClose={() => net.setLinkOpen(false)} link={link} />
        </Suspense>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Restart game?"
        message="This starts a new game and reshuffles the board."
        onConfirm={() => {
          if (pending) doReset(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Box>
    </SeatAvatarsOverride.Provider>
  )
}
