import { Box, Button, alpha } from '@mui/material'
import type { AssistLevel } from './assists'
import type { FailReason, MissionOutcome, PlayMode } from './missions'
import { failWords, isMission, missionById } from './missions'
import { Stars } from './MissionMenu'

/** What the panel renders — a plain copy of the run (React state stays
 * immutable; the rig snapshots it when `missionSeq` bumps). */
export interface MissionSnapshot {
  mode: PlayMode
  outcome: MissionOutcome
  fail: FailReason
  motorOut: boolean
  score: number
  stars: 0 | 1 | 2 | 3
  badge: AssistLevel
  chain: number
  bestChain: number
  chainBreak: 'weak' | 'grass' | 'crash' | 'stop' | null
  landing: { spot: number; centre: number; smooth: number; alongM: number; acrossM: number; score: number; sink: number } | null
}

const ASSIST_NAME: Record<AssistLevel, string> = { trainer: 'Trainer', normal: 'Normal', acro: 'Acro' }

/**
 * The post-landing scorecard (Round 1b): the one score, its three parts,
 * the stars and the assist badge, or the fail reason; Retry / Next / Menu.
 * Touch and go shows the chain instead of stars.
 */
export default function ScorecardPanel({
  run,
  recordBestChain,
  nextOpen,
  onRetry,
  onNext,
  onMenu,
}: {
  run: MissionSnapshot
  recordBestChain: number
  /** The next mission exists and is unlocked (Next button). */
  nextOpen: boolean
  onRetry: () => void
  onNext: () => void
  onMenu: () => void
}) {
  const touchgo = run.mode === 'touchgo'
  const title = touchgo ? 'Touch and go' : isMission(run.mode) ? missionById(run.mode).title : 'Free flight'
  const passed = run.outcome === 'done'
  const l = run.landing
  return (
    <Box
      data-testid="wingflyer-scorecard"
      data-outcome={run.outcome}
      data-score={run.score}
      data-stars={run.stars}
      data-badge={run.badge}
      data-fail={run.fail ?? 'none'}
      data-chain={run.bestChain}
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 1.5,
        bgcolor: alpha('#000', 0.55),
        color: '#fff',
        textAlign: 'center',
        minWidth: 220,
      }}
    >
      <Box sx={{ fontSize: 12, opacity: 0.75, fontWeight: 600, letterSpacing: 0.5 }}>{title}</Box>
      {touchgo ? (
        <>
          <Box sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>Chain ×{run.bestChain}</Box>
          <Box sx={{ fontSize: 12, opacity: 0.85 }}>
            {run.chainBreak === 'crash'
              ? 'Crashed — chain over'
              : run.chainBreak === 'weak'
                ? 'A weak landing broke the chain'
                : run.chainBreak === 'grass'
                  ? 'Grass — the runway counts'
                  : 'Stopped — chain over'}
            {' · '}best ×{Math.max(recordBestChain, run.bestChain)}
          </Box>
        </>
      ) : passed ? (
        <>
          <Box sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{run.score}</Box>
          <Stars stars={run.stars} badge={run.badge} size={20} />
          <Box sx={{ fontSize: 11, opacity: 0.8, mt: 0.25 }}>
            {run.stars === 0 ? 'Landed — 40 for a star' : `${'★'.repeat(run.stars)} · ${ASSIST_NAME[run.badge]}`}
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2, color: '#ff8a80' }}>{run.fail === 'crash' ? 'Crashed' : 'Not yet'}</Box>
          <Box sx={{ fontSize: 12, opacity: 0.85 }}>{failWords(run.fail, run.mode)}</Box>
        </>
      )}
      {l && (
        <Box
          data-testid="wingflyer-scorecard-parts"
          sx={{ display: 'flex', justifyContent: 'center', gap: 1.25, mt: 0.5, fontSize: 11, fontFamily: 'monospace', opacity: 0.85 }}
        >
          <span>spot {l.spot}</span>
          <span>line {l.centre}</span>
          <span>×{l.smooth.toFixed(2)}</span>
          <span>{l.sink.toFixed(1)} m/s</span>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', mt: 1 }}>
        <Button data-testid="wingflyer-retry" size="small" variant="contained" onClick={onRetry} sx={{ fontWeight: 700 }}>
          Retry
        </Button>
        {passed && !touchgo && nextOpen && (
          <Button data-testid="wingflyer-next" size="small" variant="contained" color="success" onClick={onNext} sx={{ fontWeight: 700 }}>
            Next
          </Button>
        )}
        <Button data-testid="wingflyer-menu-button" size="small" variant="outlined" onClick={onMenu} sx={{ fontWeight: 700, color: '#fff', borderColor: alpha('#fff', 0.5) }}>
          Menu
        </Button>
      </Box>
    </Box>
  )
}
