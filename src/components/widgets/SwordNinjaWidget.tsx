import { useRef, useState } from 'react'
import { Box, keyframes } from '@mui/material'

/** Stylized white ice-ninja palette (original, not a real logo/print). */
const N = {
  robe: '#f4f6f8',
  robeShade: '#d5dde3',
  ice: '#bfe6f5',
  iceMid: '#7fc9e8',
  iceDeep: '#4aa6d0',
  gold: '#d9b23a',
  blade: '#c8ced6',
  bladeHi: '#eef2f6',
  bladeShade: '#9aa4b0',
  hilt: '#454e58',
  guard: '#7a828c',
  line: '#2a3138',
}

/** A katana in local coords: hilt at (0,0), blade pointing up (−y). */
function Katana() {
  return (
    <g>
      <path
        d="M-3.5 -4 L-3.5 -92 L0 -101 L3.5 -92 L3.5 -4 Z"
        fill={N.blade}
        stroke={N.bladeShade}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <path d="M-1.2 -8 L-1.2 -90" stroke={N.bladeHi} strokeWidth={1.4} opacity={0.85} strokeLinecap="round" />
      {/* guard (tsuba) */}
      <rect x={-9} y={-5} width={18} height={5} rx={1.5} fill={N.guard} stroke={N.line} strokeWidth={1} />
      {/* wrapped handle */}
      <rect x={-3.5} y={0} width={7} height={22} rx={3} fill={N.hilt} stroke={N.line} strokeWidth={1} />
      <path d="M-3.5 5 H3.5 M-3.5 10 H3.5 M-3.5 15 H3.5" stroke={N.line} strokeWidth={0.8} opacity={0.6} />
      <circle cx={0} cy={24} r={3} fill={N.guard} stroke={N.line} strokeWidth={0.8} />
    </g>
  )
}

/** Open C-grip hand centred at (cx, cy). */
function Hand({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={`M${cx - 7} ${cy + 5} A 8 8 0 1 1 ${cx + 7} ${cy + 5}`}
      fill="none"
      stroke={N.robe}
      strokeWidth={7}
      strokeLinecap="round"
    />
  )
}

// Active katana: swing off the back, parry across, settle into a raised guard.
// The additional rotate is on top of the sheathed base rotation (-46deg).
const drawSword = keyframes`
  0%   { transform: translate(0px, 0px) rotate(0deg); }
  60%  { transform: translate(0px, 44px) rotate(101deg); }
  100% { transform: translate(0px, 40px) rotate(74deg); }
`
const sheatheSword = keyframes`
  0%   { transform: translate(0px, 40px) rotate(74deg); }
  100% { transform: translate(0px, 0px) rotate(0deg); }
`
// Sword arm raises to meet the hilt at guard.
const drawArm = keyframes`
  0%   { transform: rotate(0deg); }
  60%  { transform: rotate(18deg); }
  100% { transform: rotate(14deg); }
`
const sheatheArm = keyframes`
  0%   { transform: rotate(14deg); }
  100% { transform: rotate(0deg); }
`

const DUR = '0.85s'
const EASE = 'cubic-bezier(.5, 0, .2, 1)'

/**
 * A stylized white ninja with two katanas crossed on its back. Tap to draw one
 * katana and swing it into a defensive guard; tap again to sheathe it.
 */
export default function SwordNinjaWidget() {
  const [drawn, setDrawn] = useState(false)
  // The sheathed twin on the back hides while its katana is drawn.
  const [backTwin, setBackTwin] = useState(true)
  const interacted = useRef(false)

  const toggle = () => {
    interacted.current = true
    setDrawn((d) => {
      if (!d) setBackTwin(false) // drawing: the katana leaves the back now
      return !d
    })
  }

  // Active (front) katana is visible while drawn or mid-sheathe.
  const activeVisible = drawn || !backTwin
  const swordAnim = !interacted.current
    ? 'none'
    : `${drawn ? drawSword : sheatheSword} ${DUR} ${EASE} forwards`
  const armAnim = !interacted.current
    ? 'none'
    : `${drawn ? drawArm : sheatheArm} ${DUR} ${EASE} forwards`

  return (
    <Box
      component="button"
      type="button"
      onClick={toggle}
      aria-label={drawn ? 'Sheathe the sword' : 'Draw the sword'}
      sx={{
        height: '100%',
        width: '100%',
        p: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '& svg': { maxHeight: '100%', width: 'auto' },
      }}
    >
      <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }}>
        {/* ===== crossed katanas on the back (behind the body) ===== */}
        {/* left twin: always sheathed */}
        <g transform="translate(90 222) rotate(46)">
          <Katana />
        </g>
        {/* right twin: hidden once its katana is drawn */}
        <g transform="translate(150 222) rotate(-46)" opacity={backTwin ? 1 : 0}>
          <Katana />
        </g>

        {/* ===== legs ===== */}
        <path d="M100 296 L98 358 C98 365 118 365 118 358 L118 296 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M122 296 L122 358 C122 365 142 365 142 358 L140 296 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M98 348 H118 M122 348 H142" stroke={N.iceMid} strokeWidth={5} strokeLinecap="round" opacity={0.9} />

        {/* ===== left arm (static) ===== */}
        <path d="M95 198 C80 212 76 240 82 262" stroke={N.robe} strokeWidth={17} strokeLinecap="round" fill="none" />
        <Hand cx={84} cy={266} />

        {/* ===== torso ===== */}
        <path
          d="M88 190 C86 186 86 190 86 194 L80 286 C79 294 84 298 92 298 L148 298 C156 298 161 294 160 286 L154 194 C154 190 154 186 152 190 C140 188 130 193 120 193 C110 193 100 188 88 190 Z"
          fill={N.ice}
          stroke={N.iceDeep}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* white crossed wrap */}
        <path d="M96 198 L150 260 M144 198 L92 262" stroke={N.robe} strokeWidth={10} strokeLinecap="round" opacity={0.95} />
        {/* gold belt + generic emblem (not a real logo) */}
        <rect x={92} y={264} width={56} height={9} rx={2} fill={N.gold} stroke="#a8811f" strokeWidth={1} />
        <circle cx={120} cy={224} r={9} fill="none" stroke={N.gold} strokeWidth={2.5} />
        <path d="M116 220 l8 8 M124 220 l-8 8" stroke={N.gold} strokeWidth={2} strokeLinecap="round" />
        <path d="M150 200 C156 236 156 264 150 288" stroke={N.iceDeep} strokeWidth={6} opacity={0.3} strokeLinecap="round" fill="none" />

        {/* ===== shoulder guard (right) ===== */}
        <path d="M138 186 C150 178 168 182 170 196 C170 204 156 206 146 202 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={2} strokeLinejoin="round" />

        {/* ===== neck ===== */}
        <rect x={110} y={172} width={20} height={16} fill={N.robeShade} />

        {/* ===== hooded head ===== */}
        <path d="M84 120 C82 86 100 66 120 66 C140 66 158 86 156 120 C156 150 146 172 120 174 C94 172 84 150 84 120 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M150 108 C166 104 168 120 156 126 C150 124 149 116 150 108 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={2} strokeLinejoin="round" />
        {/* visor band + ice eye slit */}
        <path d="M88 118 C104 112 136 112 152 118 C150 134 140 146 120 147 C100 146 90 134 88 118 Z" fill={N.line} />
        <path d="M100 126 L118 124 M122 124 L140 126" stroke={N.iceMid} strokeWidth={4} strokeLinecap="round" />
        <circle cx={110} cy={126} r={2.4} fill={N.bladeHi} />
        <circle cx={132} cy={126} r={2.4} fill={N.bladeHi} />

        {/* ===== active (drawable) katana — in front ===== */}
        <Box
          component="g"
          onAnimationEnd={() => {
            if (!drawn) setBackTwin(true) // sheathe finished: twin returns to back
          }}
          sx={{
            transformBox: 'view-box',
            transformOrigin: '150px 222px',
            animation: swordAnim,
            opacity: activeVisible ? 1 : 0,
          }}
        >
          <g transform="translate(150 222) rotate(-46)">
            <Katana />
          </g>
        </Box>

        {/* ===== right arm (sword arm) — raises to the guard ===== */}
        <Box
          component="g"
          sx={{
            transformBox: 'view-box',
            transformOrigin: '150px 196px',
            animation: armAnim,
          }}
        >
          <path d="M150 198 C166 210 172 236 166 258" stroke={N.robe} strokeWidth={17} strokeLinecap="round" fill="none" />
          <Hand cx={166} cy={262} />
        </Box>
      </svg>
    </Box>
  )
}
