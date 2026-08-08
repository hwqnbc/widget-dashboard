import { Box, keyframes } from '@mui/material'
import { LL } from './lloydPalette'

/**
 * The golden scimitar in local coords: pistol-ish grip at (0,0) — the fist
 * closes over the handle there — pommel ring + hanging bell tassel BELOW
 * (+y), flared guard just above, and the curved blade sweeping UP and
 * slightly left to its tip near (−34, −108). Rotating the arm group aims it.
 * (The source art's oversized C-hand and sideways-horizontal blade were
 * normalised into this grip.)
 */
function GoldenSword() {
  return (
    <g strokeLinejoin="round">
      {/* curved scimitar blade (up, tip left) */}
      <path
        d="M -6,-16 C -11,-58 -19,-88 -34,-108 C -21,-101 -5,-76 2,-40 C 5,-27 6,-20 6,-16 Z"
        fill="url(#lloyd-gold-grad)"
        stroke={LL.goldLine}
        strokeWidth={2}
      />
      <path d="M -5,-20 C -10,-56 -17,-84 -30,-102 C -19,-95 -6,-72 0,-40 C 2,-30 3,-24 3,-20 Z" fill="url(#lloyd-gold-light)" opacity={0.8} />
      <path d="M -2,-20 C -6,-52 -13,-80 -26,-99" fill="none" stroke="#fff" strokeWidth={1.6} opacity={0.7} />
      {/* guard flare */}
      <path d="M -12,-12 C -16,-25 16,-25 12,-12 C 5,-17 -5,-17 -12,-12 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={1.5} />
      {/* handle shaft through the fist */}
      <rect x={-5} y={-14} width={10} height={40} rx={5} fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={1.2} />
      {/* pommel ring */}
      <circle cx={0} cy={34} r={9} fill="none" stroke="url(#lloyd-gold-grad)" strokeWidth={4} />
      <circle cx={0} cy={34} r={9} fill="none" stroke={LL.goldLine} strokeWidth={1.2} />
      {/* hanging bell tassel */}
      <path d="M 0,43 L 0,49" fill="none" stroke="url(#lloyd-gold-grad)" strokeWidth={3} />
      <path d="M -6,49 C -6,45 6,45 6,49 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={1} />
      <path d="M -6,49 C -9,62 -14,70 -18,74 C -8,76 8,76 18,74 C 14,70 9,62 6,49 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={1.4} />
      <path d="M -3,49 C -4,60 -8,69 -12,73 M 0,49 C 0,60 0,69 0,74 M 3,49 C 4,60 8,69 12,73" fill="none" stroke={LL.goldLine} strokeWidth={1} />
      <ellipse cx={0} cy={74} rx={16} ry={2.5} fill="url(#lloyd-gold-light)" stroke={LL.goldLine} strokeWidth={1} />
    </g>
  )
}

// The whole sword arm pivots at the SHOULDER for a full-body chop: wind the
// blade up-and-over to face height (the imperium arc lesson — go as high as
// the face), hold a beat, then whip it down through a wide left-side slash
// before easing back to the carry. A gold slash-arc flash marks the impact
// zone; it lives at base opacity 0 so the resting figure never shows it
// (lesson #74).
const RAISE = 100
const CHOP = -35
const chop = keyframes`
  0%   { transform: rotate(0deg); }
  30%  { transform: rotate(${RAISE}deg); }
  42%  { transform: rotate(${RAISE}deg); }
  56%  { transform: rotate(${CHOP}deg); }
  72%  { transform: rotate(${CHOP}deg); }
  100% { transform: rotate(0deg); }
`
const slashFlash = keyframes`
  0%, 46% { opacity: 0; }
  56%     { opacity: 0.85; }
  72%     { opacity: 0; }
  100%    { opacity: 0; }
`
const DUR = '1.7s'
const SHOULDER = '165px 252px' // sword-arm shoulder pivot

/**
 * "Lloyd": a dragon-form green ninja — lime scale-row torso with a gold
 * chest emblem, gold pauldrons, dragon wings + tail, gold-trimmed legs with
 * claw toes, a spiked helmet crown, and the golden scimitar (pommel ring +
 * bell tassel) in the right fist. `chopping` runs the looping overhead
 * sword chop pivoting at the shoulder. (The source art's display stand is
 * dropped — it's a showcase base, not part of the character.)
 */
export default function ChopFigure({ chopping = false }: { chopping?: boolean }) {
  const armSx = chopping ? { animation: `${chop} ${DUR} ease-in-out infinite` } : { transform: 'rotate(0deg)' }

  return (
    <svg viewBox="0 40 500 545" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lloyd-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={LL.goldHi} />
          <stop offset="40%" stopColor={LL.gold} />
          <stop offset="80%" stopColor={LL.goldMid} />
          <stop offset="100%" stopColor={LL.goldDeep} />
        </linearGradient>
        <linearGradient id="lloyd-gold-light" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={LL.goldLight} />
          <stop offset="100%" stopColor={LL.gold} />
        </linearGradient>
        <linearGradient id="lloyd-green-lime" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={LL.lime} />
          <stop offset="100%" stopColor={LL.green} />
        </linearGradient>
        <linearGradient id="lloyd-green-mid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={LL.mid} />
          <stop offset="100%" stopColor={LL.midDeep} />
        </linearGradient>
        {/* one lime torso scale, stamped in rows below */}
        <g id="lloyd-scale">
          <path d="M -12,0 C -12,10 0,14 0,14 C 0,14 12,10 12,0 C 6,3 -6,3 -12,0 Z" fill={LL.green} stroke={LL.line} strokeWidth={1.5} />
          <path d="M -8,2 C -8,8 0,11 0,11 C 0,11 8,8 8,2 C 4,4 -4,4 -8,2 Z" fill={LL.lime} opacity={0.6} />
        </g>
      </defs>

      {/* ---- dragon wings ---- */}
      <g transform="translate(140 220) rotate(-10) scale(0.9 0.9)">
        <path d="M 0,0 C -40,-60 -100,-80 -150,-40 C -140,-10 -110,0 -120,30 C -100,20 -70,30 -80,70 C -60,60 -30,70 -40,110 C -20,80 0,60 0,0 Z" fill="url(#lloyd-green-lime)" stroke={LL.line} strokeWidth={3} />
        <path d="M 0,0 C -50,-30 -120,-30 -150,-40" fill="none" stroke={LL.green} strokeWidth={4} />
        <path d="M 0,0 C -60,-10 -100,0 -120,30" fill="none" stroke={LL.green} strokeWidth={3} />
        <path d="M 0,0 C -50,20 -70,30 -80,70" fill="none" stroke={LL.green} strokeWidth={3} />
        <path d="M 0,0 C -30,40 -35,70 -40,110" fill="none" stroke={LL.green} strokeWidth={3} />
      </g>
      <g transform="translate(360 220) scale(-0.9 0.9) rotate(-10)">
        <path d="M 0,0 C -40,-60 -100,-80 -150,-40 C -140,-10 -110,0 -120,30 C -100,20 -70,30 -80,70 C -60,60 -30,70 -40,110 C -20,80 0,60 0,0 Z" fill="url(#lloyd-green-lime)" stroke={LL.line} strokeWidth={3} />
        <path d="M 0,0 C -50,-30 -120,-30 -150,-40" fill="none" stroke={LL.green} strokeWidth={4} />
        <path d="M 0,0 C -60,-10 -100,0 -120,30" fill="none" stroke={LL.green} strokeWidth={3} />
        <path d="M 0,0 C -50,20 -70,30 -80,70" fill="none" stroke={LL.green} strokeWidth={3} />
        <path d="M 0,0 C -30,40 -35,70 -40,110" fill="none" stroke={LL.green} strokeWidth={3} />
      </g>

      {/* ---- dragon tail ---- */}
      <path d="M 170,500 C 100,520 60,460 80,420 C 100,380 40,360 20,400 C 0,440 60,560 160,550 Z" fill="url(#lloyd-green-mid)" stroke={LL.line} strokeWidth={3} />
      <path d="M 70,430 Q 60,420 75,410 Q 85,420 70,430 Z" fill="url(#lloyd-green-lime)" />
      <path d="M 50,420 Q 40,400 55,395 Q 65,405 50,420 Z" fill="url(#lloyd-green-lime)" />

      {/* ---- legs with gold trim + claw toes ---- */}
      <rect x={160} y={440} width={80} height={140} fill="url(#lloyd-green-mid)" stroke={LL.line} strokeWidth={3} />
      <rect x={260} y={440} width={80} height={140} fill="url(#lloyd-green-mid)" stroke={LL.line} strokeWidth={3} />
      <path d="M 165,510 L 235,510 L 235,530 C 235,530 200,545 165,530 Z" fill={LL.deepest} />
      <path d="M 170,450 L 230,450 L 230,490 L 170,490 Z" fill="none" stroke="url(#lloyd-gold-grad)" strokeWidth={3} />
      <path d="M 175,460 C 175,460 200,450 225,460 C 225,475 200,485 175,460 Z" fill="url(#lloyd-gold-grad)" />
      <path d="M 175,515 C 175,515 200,505 225,515 C 225,530 200,540 175,515 Z" fill="url(#lloyd-gold-grad)" />
      <path d="M 265,510 L 335,510 L 335,530 C 335,530 300,545 265,530 Z" fill={LL.deepest} />
      <path d="M 270,450 L 330,450 L 330,490 L 270,490 Z" fill="none" stroke="url(#lloyd-gold-grad)" strokeWidth={3} />
      <path d="M 275,460 C 275,460 300,450 325,460 C 325,475 300,485 275,460 Z" fill="url(#lloyd-gold-grad)" />
      <path d="M 275,515 C 275,515 300,505 325,515 C 325,530 300,540 275,515 Z" fill="url(#lloyd-gold-grad)" />
      <path d="M 170,550 L 182,530 L 194,550 Z" fill="url(#lloyd-gold-grad)" stroke={LL.line} />
      <path d="M 194,550 L 206,530 L 218,550 Z" fill="url(#lloyd-gold-grad)" stroke={LL.line} />
      <path d="M 218,550 L 230,530 L 242,550 Z" fill="url(#lloyd-gold-grad)" stroke={LL.line} />
      <path d="M 270,550 L 282,530 L 294,550 Z" fill="url(#lloyd-gold-grad)" stroke={LL.line} />
      <path d="M 294,550 L 306,530 L 318,550 Z" fill="url(#lloyd-gold-grad)" stroke={LL.line} />
      <path d="M 318,550 L 330,530 L 342,550 Z" fill="url(#lloyd-gold-grad)" stroke={LL.line} />

      {/* ---- resting left arm (viewer-right) + minifig hand ---- */}
      <path d="M 335,245 C 370,248 395,275 388,325 C 382,355 358,368 335,355 L 350,305 L 325,255 Z" fill="url(#lloyd-green-lime)" stroke={LL.line} strokeWidth={2.5} />
      <path d="M 352,260 C 375,278 380,305 374,332" fill="none" stroke={LL.green} strokeWidth={3} />
      <path d="M 345,350 C 335,348 322,360 330,375 C 340,388 360,378 355,360 Z" fill={LL.hand} stroke="#000" strokeWidth={2.5} />

      {/* ---- torso: green field, dark centre panels, scale rows ---- */}
      <polygon points="170,240 330,240 350,440 150,440" fill="url(#lloyd-green-mid)" stroke={LL.line} strokeWidth={3} />
      <polygon points="210,240 290,240 310,440 190,440" fill={LL.darkGreen} />
      <polygon points="230,240 270,240 280,440 220,440" fill={LL.deepest} />
      <use href="#lloyd-scale" x={250} y={290} />
      <use href="#lloyd-scale" x={228} y={310} />
      <use href="#lloyd-scale" x={272} y={310} />
      <use href="#lloyd-scale" x={206} y={330} />
      <use href="#lloyd-scale" x={250} y={330} />
      <use href="#lloyd-scale" x={294} y={330} />
      <use href="#lloyd-scale" x={228} y={350} />
      <use href="#lloyd-scale" x={272} y={350} />
      <use href="#lloyd-scale" x={250} y={370} />

      {/* gold chest emblem on the red field */}
      <g transform="translate(250 275)">
        <path d="M -35,-20 L 35,-20 L 25,25 L 0,45 L -25,25 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={2} />
        <path d="M -25,-15 L 25,-15 L 18,20 L 0,35 L -18,20 Z" fill={LL.emblemRed} />
        <path d="M -10,-10 L 10,-10 L 12,0 L -12,0 Z" fill="url(#lloyd-gold-light)" />
        <path d="M -8,5 L 8,5 L 0,25 Z" fill="url(#lloyd-gold-light)" />
        <line x1={0} y1={-10} x2={0} y2={25} stroke={LL.gold} strokeWidth={2} />
        <line x1={-12} y1={0} x2={12} y2={0} stroke={LL.gold} strokeWidth={2} />
      </g>

      {/* belt + gold buckle */}
      <rect x={150} y={420} width={200} height={20} fill={LL.belt} />
      <path d="M 230,420 L 270,420 L 265,440 L 235,440 Z" fill="url(#lloyd-gold-grad)" />

      {/* ---- gold pauldrons (over the shoulder joints — the right one also
             hides the chop pivot seam) ---- */}
      <g transform="translate(158 232) scale(1.08)">
        <path d="M -10,0 L -50,-15 L -60,5 L -30,25 L 10,15 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={2} />
        <path d="M -5,-8 L -40,-22 L -50,-5 L -20,15 Z" fill="url(#lloyd-gold-light)" />
        <path d="M -10,10 L -45,0 L -35,20 Z" fill={LL.goldDull} />
      </g>
      <g transform="translate(342 232) scale(-1.08 1.08)">
        <path d="M -10,0 L -50,-15 L -60,5 L -30,25 L 10,15 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={2} />
        <path d="M -5,-8 L -40,-22 L -50,-5 L -20,15 Z" fill="url(#lloyd-gold-light)" />
        <path d="M -10,10 L -45,0 L -35,20 Z" fill={LL.goldDull} />
      </g>

      {/* ---- head group ---- */}
      <rect x={200} y={125} width={100} height={85} rx={25} fill={LL.lime} />
      <polygon points="190,130 310,130 300,185 200,185" fill={LL.black} />
      <g transform="translate(250 155)">
        <path d="M -50,-20 C -70,-30 -85,-10 -75,10 C -65,30 -55,10 -50,5 Z" fill={LL.green} stroke={LL.line} strokeWidth={1} />
        <path d="M -50,5 C -60,15 -70,10 -70,0 C -70,-10 -60,-15 -50,-20 Z" fill={LL.lime} stroke={LL.line} strokeWidth={1} />
        <g transform="scale(-1 1)">
          <path d="M -50,-20 C -70,-30 -85,-10 -75,10 C -65,30 -55,10 -50,5 Z" fill={LL.green} stroke={LL.line} strokeWidth={1} />
          <path d="M -50,5 C -60,15 -70,10 -70,0 C -70,-10 -60,-15 -50,-20 Z" fill={LL.lime} stroke={LL.line} strokeWidth={1} />
        </g>
      </g>
      <path d="M 210,155 Q 230,135 245,155 Q 230,165 210,155 Z" fill={LL.eyeWhite} />
      <path d="M 213,155 Q 230,138 242,155 Q 230,163 213,155 Z" fill={LL.eyeYellow} />
      <polygon points="215,152 240,152 232,158 220,156" fill="#000" />
      <path d="M 208,145 L 246,152 L 244,148 L 210,140 Z" fill="#000" />
      <path d="M 290,155 Q 270,135 255,155 Q 270,165 290,155 Z" fill={LL.eyeWhite} />
      <path d="M 287,155 Q 270,138 258,155 Q 270,163 287,155 Z" fill={LL.eyeYellow} />
      <polygon points="285,152 260,152 268,158 280,156" fill="#000" />
      <path d="M 292,145 L 254,152 L 256,148 L 290,140 Z" fill="#000" />
      <path d="M 195,165 L 250,185 L 305,165 L 310,210 C 310,230 280,245 250,245 C 220,245 190,230 190,210 Z" fill="url(#lloyd-green-mid)" stroke={LL.line} strokeWidth={2.5} />
      <path d="M 210,172 L 250,190 L 290,172 L 295,200 C 295,200 270,220 250,220 C 230,220 205,200 205,200 Z" fill="url(#lloyd-green-lime)" />
      <path d="M 180,140 C 170,100 200,70 210,65 C 210,65 220,85 230,85 C 240,85 245,50 250,45 C 255,50 260,85 270,85 C 280,85 290,65 290,65 C 300,70 330,100 320,140 C 300,125 280,135 250,120 C 220,135 200,125 180,140 Z" fill="url(#lloyd-green-lime)" stroke={LL.line} strokeWidth={3} />
      <path d="M 250,45 L 258,90 L 250,120 L 242,90 Z" fill={LL.limeHi} stroke={LL.line} strokeWidth={1.5} />
      <path d="M 210,65 L 230,95 L 205,125 Z" fill={LL.green} stroke={LL.line} strokeWidth={1.5} />
      <path d="M 290,65 L 270,95 L 295,125 Z" fill="#8CE019" stroke={LL.line} strokeWidth={1.5} />
      <path d="M 235,100 L 250,85 L 265,100 L 250,115 Z" fill="url(#lloyd-gold-grad)" stroke={LL.goldLine} strokeWidth={1.5} />

      {/* ---- impact slash-arc flash (left side, base opacity 0 — #74) ---- */}
      <Box
        component="path"
        d="M 48,185 C 12,255 12,330 60,392 C 32,325 35,252 70,196 Z"
        fill="url(#lloyd-gold-light)"
        stroke={LL.goldHi}
        strokeWidth={2}
        sx={{ opacity: 0, ...(chopping ? { animation: `${slashFlash} ${DUR} linear infinite` } : {}) }}
      />

      {/* ---- sword arm: the whole arm + scimitar pivots at the shoulder ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: SHOULDER, ...armSx }}>
        <path d="M 165,245 C 130,248 105,275 112,325 C 118,355 142,368 165,355 L 150,305 L 175,255 Z" fill="url(#lloyd-green-lime)" stroke={LL.line} strokeWidth={2.5} />
        <path d="M 148,260 C 125,278 120,305 126,332" fill="none" stroke={LL.green} strokeWidth={3} />
        <g transform="translate(138 362) scale(1.5)">
          <GoldenSword />
        </g>
        {/* normal-size gripping fist over the handle */}
        <circle cx={138} cy={362} r={9} fill={LL.hand} stroke="#000" strokeWidth={2.5} />
        <path d="M 131,356 C 135,353 141,353 145,356" fill="none" stroke={LL.handHi} strokeWidth={1.6} />
      </Box>
    </svg>
  )
}
