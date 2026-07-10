import { useState } from 'react'
import { Box, keyframes } from '@mui/material'
import { TOY as T } from './characters/toyPalette'
import Hand from './characters/Hand'
import { ToyLegs, ToyNeck, ToyTorso, ToyCapAndFace } from './characters/toyParts'
import TapStage from './TapStage'

// The forearm hinges at the elbow so the hand bobs up and down; the upper arm
// stays put. The two forearms share this cycle, and mirror geometry makes the
// hands alternate (one up while the other drops) — the "six… seven" weigh.
const flex = keyframes`
  0%   { transform: rotate(-38deg); }
  50%  { transform: rotate(38deg); }
  100% { transform: rotate(-38deg); }
`
// The flanking numbers pop in and gently bob while playing.
const popL = keyframes`
  0%   { transform: translateY(6px); }
  50%  { transform: translateY(-6px); }
  100% { transform: translateY(6px); }
`
const popR = keyframes`
  0%   { transform: translateY(-6px); }
  50%  { transform: translateY(6px); }
  100% { transform: translateY(-6px); }
`

const CYCLE = '0.5s'

/**
 * The toy minifigure doing the "6 7" meme: tap to make its hands bounce up and
 * down in alternation while a big 6 and 7 pop in at its sides. Tap again to
 * stop. Reuses ToyFigure's static body (via toyParts) with independently
 * animatable arms.
 */
export default function SixSevenWidget() {
  const [playing, setPlaying] = useState(false)

  // Applied to a forearm+hand group; it hinges about the elbow (originX, 246).
  const forearmSx = (originX: number) => ({
    transformBox: 'view-box' as const,
    transformOrigin: `${originX}px 246px`,
    animation: playing ? `${flex} ${CYCLE} ease-in-out infinite` : 'none',
  })

  const numberSx = (kf: string) => ({
    transformBox: 'view-box' as const,
    transformOrigin: 'center',
    opacity: playing ? 1 : 0,
    transform: playing ? 'scale(1)' : 'scale(0.4)',
    transition: 'opacity .25s ease, transform .25s cubic-bezier(.34,1.56,.64,1)',
    animation: playing ? `${kf} ${CYCLE} ease-in-out infinite` : 'none',
  })

  return (
    <TapStage
      onClick={() => setPlaying((p) => !p)}
      ariaLabel={playing ? 'Stop the 6 7' : 'Start the 6 7'}
    >
      <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <ToyLegs />

        {/* ---- arms (behind torso): fixed upper arm + elbow-hinged forearm ---- */}
        {/* left upper arm: shoulder (84,200) -> elbow (66,246), static */}
        <path d="M84 200 C76 216 70 232 66 246" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
        {/* left forearm + hand: hinges about the elbow so the hand bobs */}
        <Box component="g" sx={forearmSx(66)}>
          <path d="M66 246 C56 256 48 266 42 274" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
          <Hand cx={40} cy={280} stroke={T.teal} />
        </Box>
        {/* right upper arm: shoulder (156,200) -> elbow (174,246), static */}
        <path d="M156 200 C164 216 170 232 174 246" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
        {/* right forearm + hand: hinges about the elbow (mirror -> alternates) */}
        <Box component="g" sx={forearmSx(174)}>
          <path d="M174 246 C184 256 192 266 198 274" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
          <Hand cx={200} cy={280} stroke={T.teal} />
        </Box>

        <ToyNeck />
        <ToyTorso />
        <ToyCapAndFace />
        {/* mouth (open, hyped) */}
        <ellipse cx={120} cy={165} rx={6} ry={5} fill="#7a3b34" stroke={T.line} strokeWidth={1.2} />

        {/* ---- flanking "6" and "7" ---- */}
        <Box
          component="text"
          x={30}
          y={276}
          sx={numberSx(popL)}
          textAnchor="middle"
          fontSize={54}
          fontWeight={800}
          fontFamily="system-ui, sans-serif"
          fill={T.badge}
          stroke="#ffffff"
          strokeWidth={2}
          paintOrder="stroke"
        >
          6
        </Box>
        <Box
          component="text"
          x={210}
          y={276}
          sx={numberSx(popR)}
          textAnchor="middle"
          fontSize={54}
          fontWeight={800}
          fontFamily="system-ui, sans-serif"
          fill={T.badge}
          stroke="#ffffff"
          strokeWidth={2}
          paintOrder="stroke"
        >
          7
        </Box>
      </svg>
    </TapStage>
  )
}
