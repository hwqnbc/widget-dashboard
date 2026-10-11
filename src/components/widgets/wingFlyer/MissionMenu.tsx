import { Box, Button, Chip, alpha } from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import type { WingFlyerRecords } from '../../../features/records/recordsSlice'
import type { MissionId, PlayMode } from './missions'
import { BADGE_LETTER, GAME_MODES, MISSIONS, missionUnlocked } from './missions'

/** ★ row for a mission: earned stars bright, the rest dim, + the badge. */
export function Stars({ stars, badge, size = 13 }: { stars: number; badge?: string; size?: number }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: size, lineHeight: 1 }}>
      {[1, 2, 3].map((n) => (
        <Box key={n} component="span" sx={{ color: n <= stars ? '#ffd54f' : alpha('#fff', 0.25) }}>
          ★
        </Box>
      ))}
      {badge && stars > 0 && (
        <Box
          component="span"
          data-testid="wingflyer-badge"
          data-badge={badge}
          sx={{
            ml: 0.25,
            px: 0.4,
            borderRadius: 0.5,
            bgcolor: alpha('#fff', 0.18),
            color: '#fff',
            fontSize: size - 3,
            fontWeight: 700,
            fontFamily: 'monospace',
          }}
        >
          {BADGE_LETTER[badge as keyof typeof BADGE_LETTER] ?? badge}
        </Box>
      )}
    </Box>
  )
}

/**
 * The start screen (decided: a card over the scene, not a settings
 * dropdown — stars have to live where a new player looks): the four game
 * modes as tiles (Rings / Soaring / Combat greyed "Soon"), then the
 * Landing list — Free flight, the five missions with their stars and
 * badge (locked until the previous one has a star, unless "Unlock all
 * missions" is on in settings), and Touch and go with its best chain.
 * Picking a row starts that mode in the pilot's hand.
 */
export default function MissionMenu({
  mode,
  records,
  unlockAll,
  onPick,
}: {
  mode: PlayMode
  records: WingFlyerRecords
  unlockAll: boolean
  onPick: (mode: PlayMode) => void
}) {
  const row = (
    key: PlayMode,
    title: string,
    sub: string,
    right: React.ReactNode,
    locked = false,
    index?: number,
  ) => (
    <Button
      key={key}
      data-testid={`wingflyer-mode-${key}`}
      data-locked={locked ? 'true' : 'false'}
      disabled={locked}
      onClick={() => onPick(key)}
      sx={{
        justifyContent: 'space-between',
        textTransform: 'none',
        textAlign: 'left',
        color: '#fff',
        px: 1.25,
        py: 0.5,
        borderRadius: 1,
        bgcolor: alpha('#fff', key === mode ? 0.18 : 0.06),
        '&:hover': { bgcolor: alpha('#fff', 0.24) },
        '&.Mui-disabled': { color: alpha('#fff', 0.4) },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {index !== undefined && (
          <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, opacity: 0.7, width: 14 }}>
            {index}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{title}</Box>
          <Box sx={{ fontSize: 11, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1, flexShrink: 0 }}>
        {locked ? <LockIcon sx={{ fontSize: 16, opacity: 0.6 }} /> : right}
      </Box>
    </Button>
  )
  return (
    <Box
      data-testid="wingflyer-menu"
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: alpha('#000', 0.3),
        zIndex: 3,
      }}
    >
      <Box
        sx={{
          width: 'min(92%, 360px)',
          maxHeight: '92%',
          overflowY: 'auto',
          p: 1.25,
          borderRadius: 2,
          bgcolor: alpha('#102030', 0.9),
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
        }}
      >
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
          {GAME_MODES.map((g) => (
            <Chip
              key={g.id}
              data-testid={`wingflyer-game-${g.id}`}
              data-ready={g.ready ? 'true' : 'false'}
              label={g.ready ? g.label : `${g.label} · Soon`}
              size="small"
              disabled={!g.ready}
              color={g.ready ? 'primary' : 'default'}
              sx={{ fontWeight: 700, '&.Mui-disabled': { opacity: 0.45, color: '#fff' } }}
            />
          ))}
        </Box>
        {row('free', 'Free flight', 'The open island — take off, fly out, land', null)}
        {MISSIONS.map((m, i) => {
          const locked = !missionUnlocked(i, records.stars, unlockAll)
          return row(
            m.id as MissionId,
            m.title,
            m.blurb,
            <Stars stars={records.stars[m.id] ?? 0} badge={records.badge[m.id]} />,
            locked,
            i + 1,
          )
        })}
        {row(
          'touchgo',
          'Touch and go',
          'Land, keep rolling, take off again — how long a chain?',
          <Box component="span" data-testid="wingflyer-best-chain" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
            best ×{records.bestChain}
          </Box>,
        )}
      </Box>
    </Box>
  )
}
