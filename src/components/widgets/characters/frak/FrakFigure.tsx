import { Box, keyframes } from '@mui/material'
import { FR } from './frakPalette'

/** A pearl-gold blade in local coords: hilt at (0,0), blade up to the tip at
 * (0,-92). Straight sword with a small guard + wrapped grip. */
function GoldSword() {
  return (
    <g strokeLinejoin="round">
      <path d="M-3 -6 L-3.2 -64 L-1.2 -88 L0 -92 L1.2 -88 L3.2 -64 L3 -6 Z" fill={FR.gold} stroke={FR.goldShade} strokeWidth={1} />
      <path d="M-1 -10 L-1.2 -64 L0 -84 L1.2 -64 L1 -10 Z" fill={FR.goldHi} opacity={0.85} />
      <path d="M-7 -7 L7 -7 L7 -3 L-7 -3 Z" fill={FR.gold} stroke={FR.goldShade} strokeWidth={1} />
      <path d="M-2.4 -3 L2.4 -3 L2 14 L-2 14 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1} />
    </g>
  )
}

/** A hand + gold sword as one unit; the hand (black glove) grips the hilt. */
function SwordHand() {
  return (
    <>
      <GoldSword />
      <path d="M-5 2 A 6 6 0 1 1 5 2" fill="none" stroke={FR.glove} strokeWidth={6} strokeLinecap="round" transform="rotate(90)" />
    </>
  )
}

// A chop swings the arm (forearm + blade, drawn collinear) about the shoulder from
// raised (blade up/out) down to a strike (blade down/out) on its own side. The two
// arms run the cycle half a beat apart so they alternate: one up while one down.
const CHOP = 132
const chopL = keyframes`
  0%, 100% { transform: rotate(0deg); }
  50%      { transform: rotate(-${CHOP}deg); }
`
const chopR = keyframes`
  0%, 100% { transform: rotate(${CHOP}deg); }
  50%      { transform: rotate(0deg); }
`
const DUR = '0.9s'

// Shoulder pivots (viewer-left / viewer-right arm).
const RS = '90px 206px'
const LS = '150px 206px'

/**
 * "frak": a lime-hooded assassin with orange skin + green eyes, a gunmetal torso
 * with lime/green tech armor and two pearl-gold blades. At rest one blade is
 * raised and the other lowered (ready stance). `chopping` runs an alternating
 * up/down chop with the two swords (each arm half a beat out of phase).
 */
export default function FrakFigure({ chopping = false }: { chopping?: boolean }) {
  const leftSx = chopping
    ? { animation: `${chopL} ${DUR} ease-in-out infinite` }
    : { transform: 'rotate(0deg)' }
  const rightSx = chopping
    ? { animation: `${chopR} ${DUR} ease-in-out infinite` }
    : { transform: `rotate(${CHOP}deg)` }

  return (
    <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }} strokeLinejoin="miter">
      {/* ---- legs (grey, green/lime print) ---- */}
      <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={FR.legs} stroke={FR.legShade} strokeWidth={2} />
      <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={FR.legs} stroke={FR.legShade} strokeWidth={2} />
      <path d="M113 298 L118 298 L118 356 L113 356 Z" fill={FR.legShade} opacity={0.6} />
      <path d="M136 298 L141 298 L141 356 L136 356 Z" fill={FR.legShade} opacity={0.6} />
      {/* knee pad + strap prints */}
      <path d="M103 312 L114 312 L112 322 L105 322 Z" fill={FR.lime} opacity={0.9} />
      <path d="M124 306 L138 316 M126 320 L136 328" stroke={FR.green} strokeWidth={2.2} opacity={0.9} />
      <path d="M100 336 L118 336 M122 336 L141 336" stroke={FR.legShade} strokeWidth={2} />
      {/* boots */}
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1.5} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1.5} />

      {/* ---- torso (gunmetal + lime/green tech armor) ---- */}
      <path d="M86 196 L154 196 L162 296 L78 296 Z" fill={FR.torso} stroke={FR.torsoShade} strokeWidth={2.5} />
      <path d="M120 196 L154 196 L162 296 L120 296 Z" fill={FR.torsoShade} opacity={0.4} />
      <path d="M86 196 L98 196 L90 296 L78 296 Z" fill={FR.torsoHi} opacity={0.35} />
      {/* central chest-plate print */}
      <path d="M120 210 L140 220 L136 250 L120 262 L104 250 L100 220 Z" fill={FR.lime} stroke={FR.green} strokeWidth={2} />
      <path d="M120 218 L131 224 L128 244 L120 252 L112 244 L109 224 Z" fill={FR.torso} opacity={0.55} />
      <path d="M120 224 L126 228 L124 240 L120 244 L116 240 L114 228 Z" fill={FR.green} opacity={0.8} />
      {/* white slash accents + stitched hem */}
      <path d="M96 214 L100 236 M144 214 L140 236" stroke={FR.white} strokeWidth={2} opacity={0.85} />
      <path d="M92 268 L148 268" stroke={FR.white} strokeWidth={2} strokeDasharray="3 3" opacity={0.7} />
      <path d="M104 278 L136 278" stroke={FR.lime} strokeWidth={4} opacity={0.85} />

      {/* ---- head: lime hood + orange face + green wrap + green eyes ---- */}
      <g transform="translate(0 14)">
        {/* hood back drape behind the head */}
        <path d="M84 150 L82 120 C82 78 100 58 120 58 C140 58 158 78 158 120 L156 150 L146 138 L140 118 C136 96 104 96 100 118 L94 138 Z" fill={FR.hoodShade} />
        {/* orange face */}
        <path d="M104 108 C104 100 111 96 120 96 C129 96 136 100 136 108 L136 150 C136 160 129 166 120 166 C111 166 104 160 104 150 Z" fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.5} />
        <path d="M120 96 C129 96 136 100 136 108 L136 150 C136 160 129 166 120 166 Z" fill={FR.skinShade} opacity={0.28} />
        {/* green eyes (angled, fierce) */}
        <path d="M106 120 L118 116 L118 124 L107 127 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1} />
        <path d="M134 120 L122 116 L122 124 L133 127 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1} />
        <rect x={111} y={119} width={2.6} height={2.6} fill={FR.eyeDark} />
        <rect x={126} y={119} width={2.6} height={2.6} fill={FR.eyeDark} />
        <path d="M106 114 L118 113 M134 114 L122 113" stroke={FR.skinShade} strokeWidth={2} />
        {/* green lower-face wrap (mask over nose + mouth) */}
        <path d="M104 133 C112 130 128 130 136 133 L136 150 C136 160 129 166 120 166 C111 166 104 160 104 150 Z" fill={FR.wrap} stroke={FR.wrapShade} strokeWidth={1.2} />
        <path d="M104 138 C114 135 126 135 136 138 M108 148 C114 146 126 146 132 148" stroke={FR.wrapShade} strokeWidth={1.2} fill="none" opacity={0.8} />
        <path d="M118 132 L122 132 L121 150 L119 150 Z" fill={FR.wrapShade} opacity={0.5} />
        {/* hood — glossy lime, pointed crown + side flaps framing the face */}
        <path d="M120 56 C98 56 80 78 80 118 L82 150 L96 132 L100 116 C104 98 112 92 120 92 L120 56 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2} />
        <path d="M120 56 C142 56 160 78 160 118 L158 150 L144 132 L140 116 C136 98 128 92 120 92 L120 56 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2} />
        <path d="M120 56 C110 56 100 64 94 78 L104 84 C110 74 116 70 120 70 Z" fill={FR.hoodHi} opacity={0.7} />
        <path d="M158 118 L152 150 L144 132 Z" fill={FR.hoodShade} opacity={0.8} />
        <path d="M120 56 L120 92 M84 116 C88 96 100 92 108 96 M156 116 C152 96 140 92 132 96" stroke={FR.hoodShade2} strokeWidth={1.2} fill="none" opacity={0.55} />
      </g>

      {/* static orange shoulder caps hide the arm pivots */}
      <circle cx={92} cy={205} r={12} fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.5} />
      <circle cx={148} cy={205} r={12} fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.5} />

      {/* ---- viewer-left arm (orange, black glove) + gold sword — raised by default ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: RS, ...leftSx }}>
        <path d="M90 206 L66 152" stroke={FR.skin} strokeWidth={15} strokeLinecap="round" fill="none" />
        <g transform="translate(64 150) rotate(-22)">
          <SwordHand />
        </g>
      </Box>

      {/* ---- viewer-right arm (orange, black glove) + gold sword — lowered by default ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: LS, ...rightSx }}>
        <path d="M150 206 L174 152" stroke={FR.skin} strokeWidth={15} strokeLinecap="round" fill="none" />
        <g transform="translate(176 150) rotate(22)">
          <SwordHand />
        </g>
      </Box>
    </svg>
  )
}
