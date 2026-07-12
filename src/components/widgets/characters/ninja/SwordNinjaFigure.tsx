import { useEffect, useState } from 'react'
import { Box, keyframes } from '@mui/material'
import { N } from './ninjaPalette'
import Hand from '../shared/Hand'

/** A katana in local coords: hilt at (0,0), blade pointing up (−y). Hard edges. */
function Katana() {
  return (
    <g strokeLinejoin="miter">
      <path d="M-3.4 -4 L-3.4 -94 L0 -102 L3.4 -94 L3.4 -4 Z" fill={N.blade} stroke={N.bladeShade} strokeWidth={1} />
      <path d="M0 -8 L0 -94" stroke={N.bladeShade} strokeWidth={0.9} opacity={0.7} />
      <path d="M-1.7 -8 L-1.7 -92" stroke={N.bladeHi} strokeWidth={1.3} opacity={0.9} />
      <path d="M0 -10 L12 -3 L0 4 L-12 -3 Z" fill={N.guard} stroke={N.line} strokeWidth={1} />
      <rect x={-2} y={-5} width={4} height={4} fill={N.hiltWrap} />
      <path d="M-3.4 4 L3.4 4 L3.4 24 L-3.4 24 Z" fill={N.hilt} stroke={N.line} strokeWidth={1} />
      <path d="M-3.4 6 L3.4 10 M3.4 6 L-3.4 10 M-3.4 13 L3.4 17 M3.4 13 L-3.4 17 M-3.4 20 L3.4 24 M3.4 20 L-3.4 24" stroke={N.hiltWrap} strokeWidth={0.9} opacity={0.85} />
      <path d="M-4.2 24 L4.2 24 L3.4 28 L-3.4 28 Z" fill={N.guard} stroke={N.line} strokeWidth={0.8} />
    </g>
  )
}

// Cross-body draw: pull the blade up/out to the upper-left, then sweep across
// the front into a raised guard on the right. Rotation is about the hilt.
const drawSword = keyframes`
  0%   { transform: translate(0px, 0px) rotate(0deg); }
  24%  { transform: translate(-20px, -30px) rotate(6deg); }
  68%  { transform: translate(47px, 102px) rotate(-175deg); }
  100% { transform: translate(51px, 111px) rotate(-157deg); }
`
const sheatheSword = keyframes`
  0%   { transform: translate(51px, 111px) rotate(-157deg); }
  44%  { transform: translate(-20px, -30px) rotate(6deg); }
  100% { transform: translate(0px, 0px) rotate(0deg); }
`
// Sword arm reaches across to the opposite shoulder hilt, then into a guard.
// Rotation ONLY, about the shoulder, so the joint stays anchored.
const drawArm = keyframes`
  0%   { transform: rotate(0deg); }
  32%  { transform: rotate(133deg); }
  70%  { transform: rotate(44deg); }
  100% { transform: rotate(30deg); }
`
const sheatheArm = keyframes`
  0%   { transform: rotate(30deg); }
  56%  { transform: rotate(133deg); }
  100% { transform: rotate(0deg); }
`

const DUR = '0.85s'
const EASE = 'cubic-bezier(.5, 0, .2, 1)'

/**
 * A stylized white ninja with two katanas crossed on its back. `drawn` toggles
 * between sheathed and a raised defensive guard, playing the cross-body draw /
 * sheathe. `animate=false` snaps without animating (e.g. the initial state).
 * Presentational — the parent supplies the sized container.
 */
export default function SwordNinjaFigure({
  drawn,
  animate = true,
}: {
  drawn: boolean
  animate?: boolean
}) {
  const [backTwin, setBackTwin] = useState(true)

  // Hide the sheathed twin as soon as the draw starts.
  useEffect(() => {
    if (drawn) setBackTwin(false)
  }, [drawn])

  const activeVisible = drawn || !backTwin
  const swordAnim = !animate
    ? 'none'
    : `${drawn ? drawSword : sheatheSword} ${DUR} ${EASE} forwards`
  const armAnim = !animate
    ? 'none'
    : `${drawn ? drawArm : sheatheArm} ${DUR} ${EASE} forwards`

  return (
    <svg
      viewBox="0 0 240 380"
      width="100%"
      height="100%"
      style={{ overflow: 'visible' }}
      strokeLinejoin="miter"
    >
      {/* crossed katanas on the back (hilts up over the shoulders) */}
      <g transform="translate(162 150) rotate(215)">
        <Katana />
      </g>
      <g transform="translate(78 150) rotate(145)" opacity={backTwin ? 1 : 0}>
        <Katana />
      </g>

      {/* legs */}
      <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
      <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
      <path d="M113 298 L118 298 L118 356 L113 356 Z" fill={N.robeShade} opacity={0.6} />
      <path d="M136 298 L141 298 L141 356 L136 356 Z" fill={N.robeShade} opacity={0.6} />
      <path d="M99 328 L118 328 M122 328 L141 328" stroke={N.robeShade2} strokeWidth={1.5} opacity={0.8} />
      <path d="M99 346 L118 346 M122 346 L141 346" stroke={N.iceMid} strokeWidth={5} />
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={N.robeShade} stroke={N.robeShade2} strokeWidth={2} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={N.robeShade} stroke={N.robeShade2} strokeWidth={2} />

      {/* left arm (static) */}
      <path d="M95 198 C80 212 76 240 82 262" stroke={N.robe} strokeWidth={16} strokeLinecap="round" fill="none" />
      <path d="M74 250 L86 254" stroke={N.iceMid} strokeWidth={4} />
      <Hand cx={84} cy={266} stroke={N.robe} r={8} />

      {/* torso */}
      <path d="M90 190 L150 190 L160 296 L80 296 Z" fill={N.ice} stroke={N.iceDeep} strokeWidth={2.5} />
      <path d="M120 192 L92 260 L110 286 L120 214 Z" fill={N.robe} />
      <path d="M120 192 L150 260 L132 286 L120 214 Z" fill={N.robe} stroke={N.robeShade} strokeWidth={1} />
      <path d="M106 195 L120 212 L134 195" fill="none" stroke={N.iceDeep} strokeWidth={2.5} />
      <path d="M120 212 L120 260" stroke={N.iceLine} strokeWidth={1.4} opacity={0.6} />
      <path d="M95 234 L99 227 L103 234 L99 241 Z M141 240 L145 233 L149 240 L145 247 Z" fill={N.iceMid} opacity={0.8} />
      <path d="M150 192 L160 296" stroke={N.iceDeep} strokeWidth={5} opacity={0.3} />
      <path d="M90 192 L80 296" stroke={N.bladeHi} strokeWidth={3} opacity={0.4} />

      {/* obi belt + knot + sash */}
      <path d="M89 262 L151 262 L153 274 L87 274 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} />
      <path d="M88 264 L152 264" stroke={N.bladeHi} strokeWidth={1.1} opacity={0.5} />
      <path d="M112 260 L128 260 L128 276 L112 276 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} />
      <path d="M114 276 L126 276 L122 290 L120 285 L118 290 Z" fill={N.gold} stroke={N.goldShade} strokeWidth={1} />

      {/* hexagonal medallion */}
      <path d="M120 217 L129.5 222.5 L129.5 233.5 L120 239 L110.5 233.5 L110.5 222.5 Z" fill={N.robe} stroke={N.gold} strokeWidth={2.5} />
      <path d="M120 222 L125 224.8 L125 231.2 L120 234 L115 231.2 L115 224.8 Z" fill="none" stroke={N.iceDeep} strokeWidth={1.3} />
      <path d="M120 217 L120 239 M110.5 222.5 L129.5 233.5 M129.5 222.5 L110.5 233.5" stroke={N.iceDeep} strokeWidth={1.1} opacity={0.85} />

      {/* right shoulder armor */}
      <path d="M134 202 L112 248" stroke={N.robeShade} strokeWidth={5} strokeLinecap="round" opacity={0.85} />
      <path d="M135 184 L172 179 L177 197 L151 206 L137 200 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
      <path d="M139 190 L169 186" stroke={N.bladeHi} strokeWidth={2} opacity={0.7} />
      <rect x={149} y={190} width={3} height={3} fill={N.robeShade2} />
      <rect x={160} y={191} width={3} height={3} fill={N.robeShade2} />

      {/* neck */}
      <path d="M110 170 L130 170 L130 188 L110 188 Z" fill={N.robeShade2} />

      {/* hooded head */}
      <path d="M120 64 L149 78 L157 112 L150 150 L120 178 L90 150 L83 112 L91 78 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} />
      <path d="M120 64 L149 78 L157 112 L150 150 L120 178 Z" fill={N.robeShade} opacity={0.9} />
      <path d="M120 64 L91 78 L110 88 L120 74 Z" fill={N.bladeHi} opacity={0.75} />
      <path d="M91 78 L108 118 L90 150 M149 78 L132 118 L150 150 M120 74 L120 110" stroke={N.robeShade2} strokeWidth={1.4} opacity={0.7} fill="none" />
      <path d="M150 98 L169 94 L167 120 L151 126 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2} />
      <path d="M155 104 L163 104 L162 118 L156 120 Z" fill={N.robeShade} opacity={0.7} />

      {/* face */}
      <path d="M92 114 L120 108 L148 114 L146 140 L120 150 L94 140 Z" fill={N.line} />
      <path d="M99 121 L117 124 M123 124 L141 121" stroke={N.iceDeep} strokeWidth={2} />
      <path d="M100 132 L118 127 L118 131 L100 136 Z" fill={N.iceMid} />
      <path d="M140 132 L122 127 L122 131 L140 136 Z" fill={N.iceMid} />
      <rect x={107} y={129} width={3} height={3} fill={N.bladeHi} />
      <rect x={130} y={129} width={3} height={3} fill={N.bladeHi} />
      <path d="M112 143 L128 143 M116 140 L116 146 M120 140 L120 146 M124 140 L124 146" stroke={N.iceDeep} strokeWidth={1.4} opacity={0.75} />

      {/* active (drawable) katana — in front */}
      <Box
        component="g"
        onAnimationEnd={() => {
          if (!drawn) setBackTwin(true)
        }}
        sx={{
          transformBox: 'view-box',
          transformOrigin: '78px 150px',
          animation: swordAnim,
          opacity: activeVisible ? 1 : 0,
        }}
      >
        <g transform="translate(78 150) rotate(145)">
          <Katana />
        </g>
      </Box>

      {/* right arm (sword arm) — raises to the guard */}
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
        <Hand cx={166} cy={262} stroke={N.robe} r={8} />
      </Box>
    </svg>
  )
}
