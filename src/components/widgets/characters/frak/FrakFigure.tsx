import { Box, keyframes } from '@mui/material'
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

// The chop pivots the FOREARM about the ELBOW (the upper arm + shoulder stay put):
// raised (blade up/out) ↔ struck (blade down/forward). The two forearms run the
// cycle half a beat apart, so they alternate — one up while the other is down.
const CHOP = 122
const chopL = keyframes`
  0%, 100% { transform: rotate(0deg); }
  50%      { transform: rotate(${CHOP}deg); }
`
const chopR = keyframes`
  0%, 100% { transform: rotate(${CHOP}deg); }
  50%      { transform: rotate(0deg); }
`
const DUR = '0.9s'
// Elbow pivots (viewer-left / viewer-right forearm).
const LE = '86px 234px'
const RE = '154px 234px'

/**
 * "frak": a lime-hooded assassin (faceted hood covering the face), orange skin,
 * green eyes + green face-wrap, a gunmetal torso with lime/green tech armor, and
 * two pearl-gold blades. At rest one blade is raised and the other lowered.
 * `chopping` runs an alternating up/down chop, each forearm pivoting at its elbow.
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
      <path d="M103 312 L114 312 L112 322 L105 322 Z" fill={FR.lime} opacity={0.9} />
      <path d="M124 306 L138 316 M126 320 L136 328" stroke={FR.green} strokeWidth={2.2} opacity={0.9} />
      <path d="M100 336 L118 336 M122 336 L141 336" stroke={FR.legShade} strokeWidth={2} />
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1.5} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={FR.glove} stroke={FR.line} strokeWidth={1.5} />

      {/* ---- torso (gunmetal + lime/green tech armor) ---- */}
      <path d="M86 196 L154 196 L162 296 L78 296 Z" fill={FR.torso} stroke={FR.torsoShade} strokeWidth={2.5} />
      <path d="M120 196 L154 196 L162 296 L120 296 Z" fill={FR.torsoShade} opacity={0.4} />
      <path d="M86 196 L98 196 L90 296 L78 296 Z" fill={FR.torsoHi} opacity={0.35} />
      {/* collar around the neck base (helps the head sit connected) */}
      <path d="M104 196 L120 206 L136 196 L142 202 L120 214 L98 202 Z" fill={FR.torsoShade} stroke={FR.torso} strokeWidth={1} />
      {/* central chest-plate print */}
      <path d="M120 214 L140 224 L136 252 L120 264 L104 252 L100 224 Z" fill={FR.lime} stroke={FR.green} strokeWidth={2} />
      <path d="M120 222 L131 228 L128 246 L120 254 L112 246 L109 228 Z" fill={FR.torso} opacity={0.55} />
      <path d="M120 228 L126 232 L124 244 L120 248 L116 244 L114 232 Z" fill={FR.green} opacity={0.8} />
      <path d="M96 216 L100 238 M144 216 L140 238" stroke={FR.white} strokeWidth={2} opacity={0.85} />
      <path d="M92 270 L148 270" stroke={FR.white} strokeWidth={2} strokeDasharray="3 3" opacity={0.7} />
      <path d="M104 280 L136 280" stroke={FR.lime} strokeWidth={4} opacity={0.85} />

      {/* ---- short neck (orange), tucked under the hood + behind the collar ---- */}
      <path d="M112 182 L128 182 L128 200 L112 200 Z" fill={FR.skin} />

      {/* ---- head: faceted lime hood covering the face; dropped so the chin meets
             the collar (near-zero neck). Orange face opening + green eyes + wrap ---- */}
      <g transform="translate(0 22)">
        {/* hood back drape */}
        <path d="M88 158 L86 128 L96 104 L120 92 L144 104 L154 128 L152 158 L146 140 L140 120 L120 112 L100 120 L94 140 Z" fill={FR.hoodShade} />
        {/* faceted lime hood (covers crown, sides, jaw) */}
        <path d="M120 90 L146 102 L156 130 L150 158 L120 172 L90 158 L84 130 L94 102 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2} />
        {/* right shade facet + top-left gloss */}
        <path d="M120 90 L146 102 L156 130 L150 158 L120 172 Z" fill="#000" opacity={0.13} />
        <path d="M120 90 L104 100 L96 116" stroke={FR.hoodHi} strokeWidth={2.4} fill="none" opacity={0.6} />
        {/* small crown point */}
        <path d="M120 86 L127 94 L113 94 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={1} />
        {/* face opening (orange), inset lower-centre */}
        <path d="M107 118 L133 118 L134 140 L120 154 L106 140 Z" fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.4} />
        {/* green eyes (angled, fierce) */}
        <path d="M108 126 L119 123 L119 130 L109 132 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1} />
        <path d="M132 126 L121 123 L121 130 L131 132 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1} />
        <rect x={112} y={125} width={2.6} height={2.6} fill={FR.eyeDark} />
        <rect x={125} y={125} width={2.6} height={2.6} fill={FR.eyeDark} />
        {/* green lower-face wrap */}
        <path d="M107 135 L133 135 L134 140 L120 154 L106 140 Z" fill={FR.wrap} stroke={FR.wrapShade} strokeWidth={1} />
        <path d="M108 140 L132 140 M112 147 L128 147" stroke={FR.wrapShade} strokeWidth={1.1} fill="none" opacity={0.8} />
        {/* hood facet seams */}
        <path d="M94 102 L120 90 L146 102 M84 130 L107 122 M156 130 L133 122 M90 158 L110 150 M150 158 L130 150" stroke={FR.hoodShade2} strokeWidth={1.1} fill="none" opacity={0.5} />
      </g>

      {/* ---- upper arms (static, shoulder→elbow) + shoulder caps ---- */}
      <path d="M92 206 L86 234" stroke={FR.skin} strokeWidth={16} strokeLinecap="round" fill="none" />
      <path d="M148 206 L154 234" stroke={FR.skin} strokeWidth={16} strokeLinecap="round" fill="none" />
      <circle cx={92} cy={206} r={12} fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.5} />
      <circle cx={148} cy={206} r={12} fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.5} />

      {/* ---- viewer-left forearm + gold sword — raised by default, pivots at elbow ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: LE, ...leftSx }}>
        <path d="M86 234 L70 176" stroke={FR.skin} strokeWidth={14} strokeLinecap="round" fill="none" />
        <g transform="translate(66 172) rotate(-16)">
          <SwordHand />
        </g>
      </Box>

      {/* ---- viewer-right forearm + gold sword — lowered by default, pivots at elbow ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: RE, ...rightSx }}>
        <path d="M154 234 L170 176" stroke={FR.skin} strokeWidth={14} strokeLinecap="round" fill="none" />
        <g transform="translate(174 172) rotate(16)">
          <SwordHand />
        </g>
      </Box>

      {/* elbow caps (over the forearm pivots) */}
      <circle cx={86} cy={234} r={9} fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.2} />
      <circle cx={154} cy={234} r={9} fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.2} />
    </svg>
  )
}
