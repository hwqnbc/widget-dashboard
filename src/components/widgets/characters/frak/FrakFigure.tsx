import { Box } from '@mui/material'
import { FR } from './frakPalette'

/** A pearl-gold blade in local coords: hilt at (0,0), blade up to the tip at
 * (0,-72). Straight short-sword with a small guard + wrapped grip. */
function GoldSword() {
  return (
    <g strokeLinejoin="round">
      <path d="M-3 -6 L-3.2 -50 L-1.2 -68 L0 -72 L1.2 -68 L3.2 -50 L3 -6 Z" fill={FR.gold} stroke={FR.goldShade} strokeWidth={1} />
      <path d="M-1 -10 L-1.2 -50 L0 -66 L1.2 -50 L1 -10 Z" fill={FR.goldHi} opacity={0.85} />
      <path d="M-7 -7 L7 -7 L7 -3 L-7 -3 Z" fill={FR.gold} stroke={FR.goldShade} strokeWidth={1} />
      <path d="M-2.4 -3 L2.4 -3 L2 14 L-2 14 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1} />
    </g>
  )
}

/** A hand (black glove) gripping the hilt + the gold sword, as one unit. */
function SwordHand() {
  return (
    <>
      <GoldSword />
      <path d="M-5 2 A 6 6 0 1 1 5 2" fill="none" stroke={FR.glove} strokeWidth={6} strokeLinecap="round" transform="rotate(90)" />
    </>
  )
}

// He faces forward, so the chop strikes DOWN IN FRONT (not a sideways sweep): each
// sword tweens between a raised windup (blade up) and a forward strike (hand in
// front of the chest, blade driven down toward the centre). The forearm crossfades
// between its two paths, so the motion reads as a smooth forward chop (the tween /
// crossfade idiom from DarkArin). The two arms alternate — one strikes as the other
// winds up.
const RAISED_L = 'translate(80px, 148px) rotate(-8deg)'
const STRUCK_L = 'translate(112px, 214px) rotate(150deg)'
const RAISED_R = 'translate(160px, 148px) rotate(8deg)'
const STRUCK_R = 'translate(128px, 214px) rotate(-150deg)'

const FA_L_RAISED = 'M92 206 C84 186 80 168 80 150'
const FA_L_STRUCK = 'M92 206 C96 220 104 216 112 214'
const FA_R_RAISED = 'M148 206 C156 186 160 168 160 150'
const FA_R_STRUCK = 'M148 206 C144 220 136 216 128 214'

const MOVE = '0.5s cubic-bezier(.4, 0, .2, 1)'

/**
 * "frak": a lime-hooded assassin (faceted hood covering the face), orange skin,
 * green eyes + green face-wrap, a gunmetal torso with lime/green tech armor, and
 * two pearl-gold blades. `phase` selects which sword is struck forward vs raised
 * (0 = left raised / right struck — the default one-up-one-down stance; 1 swaps
 * them). `animate` tweens between phases (the celebration toggles `phase` on an
 * interval, giving an alternating forward chop).
 */
export default function FrakFigure({
  phase = 0,
  animate = false,
}: {
  phase?: 0 | 1
  animate?: boolean
}) {
  const leftStruck = phase === 1
  const rightStruck = phase === 0
  const swordTx = { transformBox: 'view-box' as const, transformOrigin: '0 0', transition: animate ? `transform ${MOVE}` : 'none' }
  const faTx = { transition: animate ? `opacity ${MOVE}` : 'none' }

  return (
    <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }} strokeLinejoin="miter">
      {/* ---- legs (grey, green/lime print) ---- */}
      <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={FR.legs} stroke={FR.legShade} strokeWidth={2} />
      <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={FR.legs} stroke={FR.legShade} strokeWidth={2} />
      <path d="M113 298 L118 298 L118 356 L113 356 Z" fill={FR.legShade} opacity={0.6} />
      <path d="M136 298 L141 298 L141 356 L136 356 Z" fill={FR.legShade} opacity={0.6} />
      <path d="M103 312 L114 312 L112 322 L105 322 Z" fill={FR.lime} opacity={0.9} />
      <path d="M124 306 L138 316 M126 320 L136 328" stroke={FR.green} strokeWidth={2.2} opacity={0.9} />
      <path d="M100 336 L118 336 M122 336 L141 336" stroke={FR.legShade} strokeWidth={2} />
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1.5} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1.5} />

      {/* ---- torso (gunmetal + lime/green tech armor) ---- */}
      <path d="M86 196 L154 196 L162 296 L78 296 Z" fill={FR.torso} stroke={FR.torsoShade} strokeWidth={2.5} />
      <path d="M120 196 L154 196 L162 296 L120 296 Z" fill={FR.torsoShade} opacity={0.4} />
      <path d="M86 196 L98 196 L90 296 L78 296 Z" fill={FR.torsoHi} opacity={0.35} />
      {/* collar around the neck base */}
      <path d="M104 196 L120 206 L136 196 L142 202 L120 214 L98 202 Z" fill={FR.torsoShade} stroke={FR.torso} strokeWidth={1} />
      {/* central chest-plate print */}
      <path d="M120 214 L140 224 L136 252 L120 264 L104 252 L100 224 Z" fill={FR.lime} stroke={FR.green} strokeWidth={2} />
      <path d="M120 222 L131 228 L128 246 L120 254 L112 246 L109 228 Z" fill={FR.torso} opacity={0.55} />
      <path d="M120 228 L126 232 L124 244 L120 248 L116 244 L114 232 Z" fill={FR.green} opacity={0.8} />
      <path d="M96 216 L100 238 M144 216 L140 238" stroke={FR.white} strokeWidth={2} opacity={0.85} />
      <path d="M92 270 L148 270" stroke={FR.white} strokeWidth={2} strokeDasharray="3 3" opacity={0.7} />
      <path d="M104 280 L136 280" stroke={FR.lime} strokeWidth={4} opacity={0.85} />

      {/* ---- head: faceted lime hood covering the face; dropped low so the hood
             base meets the torso (no visible neck). Orange face opening + eyes + wrap ---- */}
      <g transform="translate(0 32)">
        <path d="M90 158 L88 128 L97 104 L120 92 L143 104 L152 128 L150 158 L145 140 L139 120 L120 112 L101 120 L95 140 Z" fill={FR.hoodShade} />
        <path d="M120 90 L143 102 L151 130 L146 156 L120 168 L94 156 L89 130 L97 102 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2} />
        <path d="M120 90 L143 102 L151 130 L146 156 L120 168 Z" fill="#000" opacity={0.13} />
        <path d="M120 90 L106 99 L99 114" stroke={FR.hoodHi} strokeWidth={2.2} fill="none" opacity={0.6} />
        <path d="M120 86 L127 94 L113 94 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={1} />
        <path d="M100 112 L140 112 L141 140 L120 158 L99 140 Z" fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.4} />
        <path d="M102 122 L118 118 L118 127 L103 130 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1} />
        <path d="M138 122 L122 118 L122 127 L137 130 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1} />
        <rect x={106} y={123} width={3} height={3} fill={FR.eyeDark} />
        <rect x={131} y={123} width={3} height={3} fill={FR.eyeDark} />
        <path d="M99 132 L141 132 L141 140 L120 158 L99 140 Z" fill={FR.wrap} stroke={FR.wrapShade} strokeWidth={1.2} />
        <path d="M101 138 L139 138 M108 147 L132 147" stroke={FR.wrapShade} strokeWidth={1.2} fill="none" opacity={0.8} />
        <path d="M97 102 L120 90 L143 102 M89 130 L99 124 M151 130 L141 124" stroke={FR.hoodShade2} strokeWidth={1.1} fill="none" opacity={0.5} />
      </g>

      {/* ---- shoulder caps ---- */}
      <circle cx={92} cy={207} r={8} fill={FR.skin} />
      <circle cx={148} cy={207} r={8} fill={FR.skin} />

      {/* ---- viewer-left forearm (crossfaded raised/struck) + sword ---- */}
      <Box component="path" d={FA_L_RAISED} sx={{ ...faTx, opacity: leftStruck ? 0 : 1 }} stroke={FR.skin} strokeWidth={13} strokeLinecap="round" fill="none" />
      <Box component="path" d={FA_L_STRUCK} sx={{ ...faTx, opacity: leftStruck ? 1 : 0 }} stroke={FR.skin} strokeWidth={13} strokeLinecap="round" fill="none" />
      <Box component="g" sx={{ ...swordTx, transform: leftStruck ? STRUCK_L : RAISED_L }}>
        <SwordHand />
      </Box>

      {/* ---- viewer-right forearm (crossfaded raised/struck) + sword ---- */}
      <Box component="path" d={FA_R_RAISED} sx={{ ...faTx, opacity: rightStruck ? 0 : 1 }} stroke={FR.skin} strokeWidth={13} strokeLinecap="round" fill="none" />
      <Box component="path" d={FA_R_STRUCK} sx={{ ...faTx, opacity: rightStruck ? 1 : 0 }} stroke={FR.skin} strokeWidth={13} strokeLinecap="round" fill="none" />
      <Box component="g" sx={{ ...swordTx, transform: rightStruck ? STRUCK_R : RAISED_R }}>
        <SwordHand />
      </Box>
    </svg>
  )
}
