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

/** A katana in local coords: hilt at (0,0), blade pointing up (−y). */
function Katana() {
  return (
    <g>
      {/* blade body */}
      <path
        d="M-3.6 -4 L-3.6 -92 L0 -101 L3.6 -92 L3.6 -4 Z"
        fill={N.blade}
        stroke={N.bladeShade}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* fuller groove + edge highlight */}
      <path d="M0 -10 L0 -93" stroke={N.bladeShade} strokeWidth={0.9} opacity={0.7} />
      <path d="M-1.8 -10 L-1.8 -90 L0 -96" stroke={N.bladeHi} strokeWidth={1.3} opacity={0.9} strokeLinecap="round" fill="none" />
      {/* diamond tsuba (guard) */}
      <path d="M0 -9 L11 -3 L0 3 L-11 -3 Z" fill={N.guard} stroke={N.line} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={0} cy={-3} r={2} fill={N.hiltWrap} />
      {/* wrapped handle (ito criss-cross) */}
      <rect x={-3.4} y={2} width={6.8} height={22} rx={2.5} fill={N.hilt} stroke={N.line} strokeWidth={1} />
      <path
        d="M-3.4 5 L3.4 9 M3.4 5 L-3.4 9 M-3.4 12 L3.4 16 M3.4 12 L-3.4 16 M-3.4 19 L3.4 22 M3.4 19 L-3.4 22"
        stroke={N.hiltWrap}
        strokeWidth={0.9}
        opacity={0.8}
      />
      {/* pommel cap */}
      <rect x={-4} y={23} width={8} height={4} rx={1.5} fill={N.guard} stroke={N.line} strokeWidth={0.8} />
    </g>
  )
}

/** Open C-grip hand centred at (cx, cy). */
function Hand({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <path
        d={`M${cx - 7} ${cy + 5} A 8 8 0 1 1 ${cx + 7} ${cy + 5}`}
        fill="none"
        stroke={N.robe}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d={`M${cx - 7} ${cy + 5} A 8 8 0 1 1 ${cx + 7} ${cy + 5}`}
        fill="none"
        stroke={N.robeShade2}
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={0.6}
      />
    </>
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
      <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }}>
        {/* ===== crossed katanas on the back (behind the body) ===== */}
        <g transform="translate(90 222) rotate(46)">
          <Katana />
        </g>
        <g transform="translate(150 222) rotate(-46)" opacity={backTwin ? 1 : 0}>
          <Katana />
        </g>

        {/* ===== legs ===== */}
        <path d="M100 296 L98 356 C98 361 104 362 108 362 L108 296 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M110 296 L110 362 C114 362 118 361 118 356 L118 296 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M132 296 L132 362 C136 362 140 361 140 356 L140 296 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M122 296 L122 356 C122 361 128 362 132 362 L132 296 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} strokeLinejoin="round" />
        {/* knee seams + ice cuffs + feet */}
        <path d="M100 326 H118 M122 326 H140" stroke={N.robeShade} strokeWidth={2} opacity={0.7} />
        <path d="M98 348 H118 M122 348 H142" stroke={N.iceMid} strokeWidth={5} strokeLinecap="round" opacity={0.9} />
        <path d="M96 360 q8 6 24 0 M124 360 q8 6 24 0" stroke={N.robeShade2} strokeWidth={4} strokeLinecap="round" fill="none" />

        {/* ===== left arm (static) ===== */}
        <path d="M95 198 C80 212 76 240 82 262" stroke={N.robe} strokeWidth={17} strokeLinecap="round" fill="none" />
        <path d="M92 206 C82 220 80 240 84 256" stroke={N.robeShade} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.7} />
        <path d="M78 250 l10 4" stroke={N.iceMid} strokeWidth={4} strokeLinecap="round" />
        <Hand cx={84} cy={266} />

        {/* ===== torso ===== */}
        <path
          d="M88 190 C86 186 86 190 86 194 L80 286 C79 294 84 298 92 298 L148 298 C156 298 161 294 160 286 L154 194 C154 190 154 186 152 190 C140 188 130 193 120 193 C110 193 100 188 88 190 Z"
          fill={N.ice}
          stroke={N.iceDeep}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* layered gi crossover + collar V */}
        <path d="M120 193 L92 262 L108 280 L120 214 Z" fill={N.robe} opacity={0.96} />
        <path d="M120 193 L150 260 L134 282 L120 214 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={1} opacity={0.9} />
        <path d="M108 196 L120 210 L132 196" fill="none" stroke={N.iceDeep} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M120 210 L120 262" stroke={N.iceLine} strokeWidth={1.5} opacity={0.6} />
        {/* geometric ice-crystal accents */}
        <path d="M96 232 l4 -6 l4 6 l-4 6 Z M140 238 l4 -6 l4 6 l-4 6 Z" fill={N.iceMid} opacity={0.75} />
        {/* side shading */}
        <path d="M150 200 C156 236 156 264 150 288" stroke={N.iceDeep} strokeWidth={6} opacity={0.3} strokeLinecap="round" fill="none" />
        <path d="M88 200 C84 232 84 262 90 286" stroke={N.bladeHi} strokeWidth={3} opacity={0.4} strokeLinecap="round" fill="none" />

        {/* obi belt + knot + hanging sash */}
        <rect x={90} y={262} width={60} height={11} rx={2.5} fill={N.gold} stroke={N.goldShade} strokeWidth={1} />
        <path d="M90 264 H150" stroke={N.bladeHi} strokeWidth={1.2} opacity={0.5} />
        <rect x={112} y={260} width={16} height={15} rx={2} fill={N.gold} stroke={N.goldShade} strokeWidth={1} />
        <path d="M116 275 l-3 12 l6 -3 l6 3 l-3 -12 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} strokeLinejoin="round" />

        {/* generic medallion (concentric rings + 6-point motif, not a real logo) */}
        <circle cx={120} cy={228} r={11} fill={N.robe} stroke={N.gold} strokeWidth={2.5} />
        <circle cx={120} cy={228} r={6} fill="none" stroke={N.iceDeep} strokeWidth={1.5} />
        <path
          d="M120 219 L120 237 M112 223.5 L128 232.5 M128 223.5 L112 232.5"
          stroke={N.iceDeep}
          strokeWidth={1.4}
          strokeLinecap="round"
        />

        {/* ===== shoulder armor (right) — stacked plates + strap + rivets ===== */}
        <path d="M136 200 L110 250" stroke={N.robeShade} strokeWidth={6} strokeLinecap="round" opacity={0.85} />
        <path d="M136 186 C150 176 170 180 172 196 C172 205 156 208 145 203 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} strokeLinejoin="round" />
        <path d="M138 192 C150 185 166 188 169 198" fill="none" stroke={N.bladeHi} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
        <circle cx={150} cy={192} r={1.5} fill={N.robeShade2} />
        <circle cx={160} cy={194} r={1.5} fill={N.robeShade2} />

        {/* ===== neck ===== */}
        <rect x={110} y={172} width={20} height={16} fill={N.robeShade2} />

        {/* ===== hooded head (faceted) ===== */}
        {/* back / shade panel */}
        <path d="M84 120 C82 86 100 66 120 66 C140 66 158 86 156 120 C156 150 146 172 120 174 C94 172 84 150 84 120 Z" fill={N.robeShade} stroke={N.robeShade2} strokeWidth={2.5} strokeLinejoin="round" />
        {/* front lit facet */}
        <path d="M88 116 C88 88 102 70 120 69 C132 70 140 82 138 104 C138 140 132 166 118 172 C98 168 90 146 88 116 Z" fill={N.robe} />
        {/* crown facet + rim light */}
        <path d="M104 74 C114 70 128 72 134 82 C124 78 112 78 104 88 Z" fill={N.bladeHi} opacity={0.7} />
        <path d="M90 108 C90 90 100 78 112 74" fill="none" stroke={N.bladeHi} strokeWidth={2} opacity={0.5} strokeLinecap="round" />
        {/* hood side wrap fold */}
        <path d="M96 150 C104 162 112 168 120 170" fill="none" stroke={N.robeShade2} strokeWidth={2} opacity={0.7} />
        {/* back knot */}
        <path d="M150 106 C168 100 172 120 158 128 C150 125 148 114 150 106 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} strokeLinejoin="round" />
        <path d="M156 112 C162 112 164 120 159 124" fill="none" stroke={N.robeShade2} strokeWidth={1.4} opacity={0.7} />

        {/* face: visor recess + brow + robotic ice eyes + breather */}
        <path d="M90 116 C104 109 136 109 150 116 C149 135 139 148 120 149 C101 148 91 135 90 116 Z" fill={N.line} />
        <path d="M92 114 C106 108 134 108 148 114" fill="none" stroke={N.robeShade2} strokeWidth={2} opacity={0.5} />
        {/* brows */}
        <path d="M99 120 L116 122 M124 122 L141 120" stroke={N.iceDeep} strokeWidth={2} strokeLinecap="round" opacity={0.9} />
        {/* glowing ice eye slits */}
        <path d="M100 128 L117 125" stroke={N.iceMid} strokeWidth={4.5} strokeLinecap="round" />
        <path d="M123 125 L140 128" stroke={N.iceMid} strokeWidth={4.5} strokeLinecap="round" />
        <circle cx={109} cy={126.5} r={2} fill={N.bladeHi} />
        <circle cx={131} cy={126.5} r={2} fill={N.bladeHi} />
        {/* breather / mouth guard */}
        <path d="M112 140 H128" stroke={N.iceDeep} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
        <path d="M116 137 V143 M120 137 V143 M124 137 V143" stroke={N.iceDeep} strokeWidth={1} opacity={0.6} />

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
          <path d="M150 198 C166 210 172 236 166 258" stroke={N.robe} strokeWidth={17} strokeLinecap="round" fill="none" />
          <path d="M154 206 C166 218 170 238 165 254" stroke={N.robeShade} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.7} />
          <path d="M170 248 l-10 4" stroke={N.iceMid} strokeWidth={4} strokeLinecap="round" />
          <Hand cx={166} cy={262} />
        </Box>
      </svg>
    </Box>
  )
}
