import { useRef, useState } from 'react'
import { Box, keyframes } from '@mui/material'

/** Stylized white ice-ninja palette (original, not a real logo/print). */
const N = {
  robe: '#f4f6f8',
  robeShade: '#dbe3ea',
  robeShade2: '#c2cdd8',
  ice: '#bfe6f5',
  iceMid: '#7fc9e8',
  iceDeep: '#4aa6d0',
  iceLine: '#2f7ba1',
  gold: '#e0bb45',
  goldShade: '#a8811f',
  blade: '#ccd2da',
  bladeHi: '#f2f6fa',
  bladeShade: '#8b95a2',
  hilt: '#3f4852',
  hiltWrap: '#2a3138',
  guard: '#6f7883',
  line: '#232a31',
}

/** A katana in local coords: hilt at (0,0), blade pointing up (−y). Hard edges. */
function Katana() {
  return (
    <g strokeLinejoin="miter">
      {/* blade body — straight edges, sharp point */}
      <path d="M-3.4 -4 L-3.4 -94 L0 -102 L3.4 -94 L3.4 -4 Z" fill={N.blade} stroke={N.bladeShade} strokeWidth={1} />
      {/* fuller groove + lit edge */}
      <path d="M0 -8 L0 -94" stroke={N.bladeShade} strokeWidth={0.9} opacity={0.7} />
      <path d="M-1.7 -8 L-1.7 -92" stroke={N.bladeHi} strokeWidth={1.3} opacity={0.9} />
      {/* diamond tsuba (guard) */}
      <path d="M0 -10 L12 -3 L0 4 L-12 -3 Z" fill={N.guard} stroke={N.line} strokeWidth={1} />
      <rect x={-2} y={-5} width={4} height={4} fill={N.hiltWrap} />
      {/* wrapped handle (ito criss-cross) */}
      <path d="M-3.4 4 L3.4 4 L3.4 24 L-3.4 24 Z" fill={N.hilt} stroke={N.line} strokeWidth={1} />
      <path d="M-3.4 6 L3.4 10 M3.4 6 L-3.4 10 M-3.4 13 L3.4 17 M3.4 13 L-3.4 17 M-3.4 20 L3.4 24 M3.4 20 L-3.4 24" stroke={N.hiltWrap} strokeWidth={0.9} opacity={0.85} />
      {/* pommel cap */}
      <path d="M-4.2 24 L4.2 24 L3.4 28 L-3.4 28 Z" fill={N.guard} stroke={N.line} strokeWidth={0.8} />
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
const drawSword = keyframes`
  0%   { transform: translate(0px, 0px) rotate(0deg); }
  60%  { transform: translate(0px, 44px) rotate(101deg); }
  100% { transform: translate(0px, 40px) rotate(74deg); }
`
const sheatheSword = keyframes`
  0%   { transform: translate(0px, 40px) rotate(74deg); }
  100% { transform: translate(0px, 0px) rotate(0deg); }
`
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
  const [backTwin, setBackTwin] = useState(true)
  const interacted = useRef(false)

  const toggle = () => {
    interacted.current = true
    setDrawn((d) => {
      if (!d) setBackTwin(false)
      return !d
    })
  }

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
      <svg
        viewBox="0 0 240 380"
        width="100%"
        height="100%"
        style={{ overflow: 'visible' }}
        strokeLinejoin="miter"
      >
        {/* ===== crossed katanas on the back (behind the body) ===== */}
        <g transform="translate(90 222) rotate(46)">
          <Katana />
        </g>
        <g transform="translate(150 222) rotate(-46)" opacity={backTwin ? 1 : 0}>
          <Katana />
        </g>

        {/* ===== legs (crisp) ===== */}
        <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
        <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
        {/* inner shade */}
        <path d="M113 298 L118 298 L118 356 L113 356 Z" fill={N.robeShade} opacity={0.6} />
        <path d="M136 298 L141 298 L141 356 L136 356 Z" fill={N.robeShade} opacity={0.6} />
        {/* knee seams */}
        <path d="M99 328 L118 328 M122 328 L141 328" stroke={N.robeShade2} strokeWidth={1.5} opacity={0.8} />
        {/* ice cuffs */}
        <path d="M99 346 L118 346 M122 346 L141 346" stroke={N.iceMid} strokeWidth={5} />
        {/* feet */}
        <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={N.robeShade} stroke={N.robeShade2} strokeWidth={2} />
        <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={N.robeShade} stroke={N.robeShade2} strokeWidth={2} />

        {/* ===== left arm (static) ===== */}
        <path d="M95 198 C80 212 76 240 82 262" stroke={N.robe} strokeWidth={16} strokeLinecap="round" fill="none" />
        <path d="M74 250 L86 254" stroke={N.iceMid} strokeWidth={4} />
        <Hand cx={84} cy={266} />

        {/* ===== torso (crisp trapezoid) ===== */}
        <path d="M90 190 L150 190 L160 296 L80 296 Z" fill={N.ice} stroke={N.iceDeep} strokeWidth={2.5} />
        {/* layered gi crossover — straight panels */}
        <path d="M120 192 L92 260 L110 286 L120 214 Z" fill={N.robe} />
        <path d="M120 192 L150 260 L132 286 L120 214 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={1} />
        {/* collar V + center seam */}
        <path d="M106 195 L120 212 L134 195" fill="none" stroke={N.iceDeep} strokeWidth={2.5} />
        <path d="M120 212 L120 260" stroke={N.iceLine} strokeWidth={1.4} opacity={0.6} />
        {/* geometric ice-crystal accents */}
        <path d="M95 234 L99 227 L103 234 L99 241 Z M141 240 L145 233 L149 240 L145 247 Z" fill={N.iceMid} opacity={0.8} />
        {/* side shading */}
        <path d="M150 192 L160 296" stroke={N.iceDeep} strokeWidth={5} opacity={0.3} />
        <path d="M90 192 L80 296" stroke={N.bladeHi} strokeWidth={3} opacity={0.4} />

        {/* obi belt + knot + hanging sash (crisp) */}
        <path d="M89 262 L151 262 L153 274 L87 274 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} />
        <path d="M88 264 L152 264" stroke={N.bladeHi} strokeWidth={1.1} opacity={0.5} />
        <path d="M112 260 L128 260 L128 276 L112 276 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} />
        <path d="M114 276 L126 276 L122 290 L120 285 L118 290 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} />

        {/* generic hexagonal medallion (not a real logo) */}
        <path d="M120 217 L129.5 222.5 L129.5 233.5 L120 239 L110.5 233.5 L110.5 222.5 Z" fill={N.robe} stroke={N.gold} strokeWidth={2.5} />
        <path d="M120 222 L125 224.8 L125 231.2 L120 234 L115 231.2 L115 224.8 Z" fill="none" stroke={N.iceDeep} strokeWidth={1.3} />
        <path d="M120 217 L120 239 M110.5 222.5 L129.5 233.5 M129.5 222.5 L110.5 233.5" stroke={N.iceDeep} strokeWidth={1.1} opacity={0.85} />

        {/* ===== shoulder armor (right) — angular plate ===== */}
        <path d="M134 202 L112 248" stroke={N.robeShade} strokeWidth={5} strokeLinecap="round" opacity={0.85} />
        <path d="M135 184 L172 179 L177 197 L151 206 L137 200 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
        <path d="M139 190 L169 186" stroke={N.bladeHi} strokeWidth={2} opacity={0.7} />
        <rect x={149} y={190} width={3} height={3} fill={N.robeShade2} />
        <rect x={160} y={191} width={3} height={3} fill={N.robeShade2} />

        {/* ===== neck ===== */}
        <path d="M110 170 L130 170 L130 188 L110 188 Z" fill={N.robeShade2} />

        {/* ===== hooded head (faceted, hard edges) ===== */}
        {/* base */}
        <path d="M120 64 L149 78 L157 112 L150 150 L120 178 L90 150 L83 112 L91 78 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} />
        {/* right shade facet */}
        <path d="M120 64 L149 78 L157 112 L150 150 L120 178 Z" fill={N.robeShade} opacity={0.9} />
        {/* crown lit facet */}
        <path d="M120 64 L91 78 L110 88 L120 74 Z" fill={N.bladeHi} opacity={0.75} />
        {/* facet seams */}
        <path d="M91 78 L108 118 L90 150 M149 78 L132 118 L150 150 M120 74 L120 110" stroke={N.robeShade2} strokeWidth={1.4} opacity={0.7} fill="none" />
        {/* angular back knot */}
        <path d="M150 98 L169 94 L167 120 L151 126 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
        <path d="M155 104 L163 104 L162 118 L156 120 Z" fill={N.robeShade} opacity={0.7} />

        {/* face: angular visor recess + brows + ice eyes + breather */}
        <path d="M92 114 L120 108 L148 114 L146 140 L120 150 L94 140 Z" fill={N.line} />
        {/* brows */}
        <path d="M99 121 L117 124 M123 124 L141 121" stroke={N.iceDeep} strokeWidth={2} />
        {/* angular glowing ice eye slits */}
        <path d="M100 132 L118 127 L118 131 L100 136 Z" fill={N.iceMid} />
        <path d="M140 132 L122 127 L122 131 L140 136 Z" fill={N.iceMid} />
        <rect x={107} y={129} width={3} height={3} fill={N.bladeHi} />
        <rect x={130} y={129} width={3} height={3} fill={N.bladeHi} />
        {/* breather / mouth guard */}
        <path d="M112 143 L128 143 M116 140 L116 146 M120 140 L120 146 M124 140 L124 146" stroke={N.iceDeep} strokeWidth={1.4} opacity={0.75} />

        {/* ===== active (drawable) katana — in front ===== */}
        <Box
          component="g"
          onAnimationEnd={() => {
            if (!drawn) setBackTwin(true)
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
          <path d="M150 198 C166 210 172 236 166 258" stroke={N.robe} strokeWidth={16} strokeLinecap="round" fill="none" />
          <path d="M172 248 L160 252" stroke={N.iceMid} strokeWidth={4} />
          <Hand cx={166} cy={262} />
        </Box>
      </svg>
    </Box>
  )
}
