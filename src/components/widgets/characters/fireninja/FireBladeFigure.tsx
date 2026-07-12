import { Box, keyframes } from '@mui/material'
import { F } from './fireNinjaPalette'
import Hand from '../shared/Hand'

/**
 * The sword handle in local coords: guard at (0,0), grip pointing down (+y),
 * blade emerges upward (−y). Gold guard + pommel, wrapped grip. Hard edges.
 */
function Hilt() {
  return (
    <g strokeLinejoin="miter">
      {/* guard (tsuba) */}
      <path d="M-12 -1 L12 -1 L12 4 L-12 4 Z" fill={F.guard} stroke={F.guardShade} strokeWidth={1.4} />
      <path d="M-12 -1 L12 -1" stroke={F.steelHi} strokeWidth={1} opacity={0.5} />
      {/* grip */}
      <path d="M-4 4 L4 4 L3.4 26 L-3.4 26 Z" fill={F.hilt} stroke={F.line} strokeWidth={1.2} />
      {/* wrap diamonds */}
      <path
        d="M-4 7 L4 11 M4 7 L-4 11 M-3.6 14 L3.6 18 M3.6 14 L-3.6 18 M-3.2 21 L3.2 25 M3.2 21 L-3.2 25"
        stroke={F.hiltWrap}
        strokeWidth={1.1}
        opacity={0.95}
      />
      {/* pommel */}
      <path d="M-4.6 26 L4.6 26 L3.6 31 L-3.6 31 Z" fill={F.guard} stroke={F.guardShade} strokeWidth={1.2} />
    </g>
  )
}

/**
 * A flaming sword blade, rooted at the guard (0,0) and rising to the tip at
 * (0,-148). A bright sword-shaped core is wrapped in wavy tongues of deeper
 * fire, with a white-hot centre and stray sparks — it reads as a blade *made
 * of* fire. `currentColor` carries the glow hue for the parent's drop-shadow.
 */
function FireBlade() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* outer fiery aura — wavy flame tongues licking off the blade */}
      <path
        d="M-12 4 C-17 -22 -9 -34 -13 -58 C-6 -46 -9 -56 -5 -82 C-10 -98 -3 -112 -7 -138 C-2 -124 -4 -134 0 -148 C4 -134 2 -124 7 -138 C3 -112 10 -98 5 -82 C9 -56 6 -46 13 -58 C9 -34 17 -22 12 4 Z"
        fill={F.flameDeep}
      />
      {/* mid orange body */}
      <path
        d="M-8.5 3 C-13 -20 -6 -32 -9 -54 C-4 -44 -6 -52 -3.5 -78 C-7 -94 -2 -106 -4.5 -132 C-1.5 -120 -2.5 -128 0 -142 C2.5 -128 1.5 -120 4.5 -132 C2 -106 7 -94 3.5 -78 C6 -52 4 -44 9 -54 C6 -32 13 -20 8.5 3 Z"
        fill={F.flame}
      />
      {/* bright sword-shaped core */}
      <path d="M-4.5 2 L-5 -66 L-2.5 -118 L0 -148 L2.5 -118 L5 -66 L4.5 2 Z" fill={F.flameCore} />
      {/* white-hot centre line */}
      <path d="M-1.8 0 L-2 -66 L0 -136 L2 -66 L1.8 0 Z" fill={F.flameHi} opacity={0.95} />
      {/* stray sparks */}
      <circle cx={10} cy={-40} r={1.6} fill={F.flameCore} />
      <circle cx={-9} cy={-70} r={1.4} fill={F.flameCore} opacity={0.85} />
      <circle cx={6} cy={-100} r={1.2} fill={F.flameHi} />
      <circle cx={-5} cy={-126} r={1} fill={F.flameHi} opacity={0.9} />
    </g>
  )
}

// Ignite: the blade shoots up out of the hilt, overshoots, settles.
const ignite = keyframes`
  0%   { transform: scaleY(0.02); opacity: 0; }
  55%  { transform: scaleY(1.12); opacity: 1; }
  100% { transform: scaleY(1);    opacity: 1; }
`
const extinguish = keyframes`
  0%   { transform: scaleY(1);    opacity: 1; }
  100% { transform: scaleY(0.02); opacity: 0; }
`
// Living flame: gentle vertical breathe + skew flicker + a pulsing glow while lit.
const flicker = keyframes`
  0%   { transform: scaleY(1)    skewX(0deg);    filter: drop-shadow(0 0 6px currentColor); }
  28%  { transform: scaleY(1.05) skewX(2.5deg);  filter: drop-shadow(0 0 16px currentColor) drop-shadow(0 0 6px currentColor); }
  52%  { transform: scaleY(0.98) skewX(-2deg);   filter: drop-shadow(0 0 9px currentColor); }
  76%  { transform: scaleY(1.03) skewX(1.5deg);  filter: drop-shadow(0 0 18px currentColor) drop-shadow(0 0 8px currentColor); }
  100% { transform: scaleY(1)    skewX(0deg);    filter: drop-shadow(0 0 6px currentColor); }
`

// After igniting, the whole sword arm swings about the shoulder: wind the blade
// back, slash forward, settle. Amplitude is kept moderate so the long blade
// stays within the viewBox (no card clipping / scrollbars).
const swing = keyframes`
  0%   { transform: rotate(0deg); }
  24%  { transform: rotate(-22deg); }
  56%  { transform: rotate(18deg); }
  78%  { transform: rotate(-4deg); }
  100% { transform: rotate(0deg); }
`

const DUR = '0.5s'
const EASE = 'cubic-bezier(.3, .8, .3, 1)'
// Shoulder pivot for the sword arm + the delay before the swing begins (so it
// starts only once the blade has finished igniting).
const SHOULDER = '150px 200px'
const IGNITE_MS = 500

// Where the hilt sits in the raised sword hand (guard origin, blade points up).
const HILT_X = 176
const HILT_Y = 150

/**
 * A stylized fire ninja standing at the ready, holding a sword handle in its
 * raised right hand. `lit` ignites a flaming sword blade out of the hilt (and
 * holds it, flickering + glowing); unlit shows the bare handle. `animate=false`
 * snaps without the ignite transition (initial / static render — avoids the
 * mount flash). Presentational — the parent supplies the sized container.
 */
export default function FireBladeFigure({
  lit,
  animate = true,
}: {
  lit: boolean
  animate?: boolean
}) {
  const bladeAnim = !animate
    ? 'none'
    : `${lit ? ignite : extinguish} ${DUR} ${EASE} forwards`

  return (
    <svg
      viewBox="0 0 240 380"
      width="100%"
      height="100%"
      style={{ overflow: 'visible' }}
      strokeLinejoin="miter"
    >
      {/* ---- legs ---- */}
      <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={F.gi} stroke={F.giShade2} strokeWidth={2} />
      <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={F.gi} stroke={F.giShade2} strokeWidth={2} />
      <path d="M113 298 L118 298 L118 356 L113 356 Z" fill={F.giShade} opacity={0.6} />
      <path d="M136 298 L141 298 L141 356 L136 356 Z" fill={F.giShade} opacity={0.6} />
      {/* black leg wraps */}
      <path d="M99 300 L118 300 M122 300 L141 300" stroke={F.sash} strokeWidth={5} />
      <path d="M99 344 L118 344 M122 344 L141 344" stroke={F.sash} strokeWidth={4} />
      {/* boots */}
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={F.sash} stroke={F.line} strokeWidth={1.5} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={F.sash} stroke={F.line} strokeWidth={1.5} />

      {/* ---- left arm (static, at side) ---- */}
      <path d="M92 200 C77 214 74 242 82 266" stroke={F.gi} strokeWidth={16} strokeLinecap="round" fill="none" />
      <path d="M75 236 C72 248 74 258 80 266" stroke={F.giShade} strokeWidth={4} fill="none" opacity={0.7} />
      <Hand cx={84} cy={270} stroke={F.skin} r={8} />

      {/* ---- torso (red gi) ---- */}
      <path d="M88 196 L152 196 L160 296 L80 296 Z" fill={F.gi} stroke={F.giShade2} strokeWidth={2.5} />
      {/* lit / shade facets */}
      <path d="M120 196 L152 196 L160 296 L120 296 Z" fill={F.giShade} opacity={0.5} />
      <path d="M88 196 L100 196 L92 296 L80 296 Z" fill={F.giHi} opacity={0.38} />
      {/* red collar rising to the neck + black neckband (connects head to body) */}
      <path d="M100 194 L120 208 L140 194 L146 200 L120 216 L94 200 Z" fill={F.gi} stroke={F.giShade2} strokeWidth={1.5} />
      <path d="M105 184 L135 184 L134 197 L106 197 Z" fill={F.sash} />
      {/* crossed black sashes (X over the chest) */}
      <path d="M92 200 L150 266 L138 278 L84 208 Z" fill={F.sash} />
      <path d="M148 200 L90 266 L102 278 L156 208 Z" fill={F.sash} />
      <path d="M94 204 L146 262 M146 204 L94 262" stroke={F.sashHi} strokeWidth={1.2} opacity={0.5} />
      {/* obi belt + knot */}
      <path d="M84 268 L156 268 L158 282 L82 282 Z" fill={F.sash} stroke={F.line} strokeWidth={1} />
      <path d="M83 270 L157 270" stroke={F.sashHi} strokeWidth={1.1} opacity={0.5} />
      <path d="M112 266 L128 266 L128 284 L112 284 Z" fill={F.sash} stroke={F.line} strokeWidth={1} />
      <path d="M114 284 L126 284 L122 298 L120 292 L118 298 Z" fill={F.sash} stroke={F.line} strokeWidth={1} />
      {/* silver hexagonal emblem */}
      <path d="M120 222 L131 228.5 L131 241.5 L120 248 L109 241.5 L109 228.5 Z" fill={F.steel} stroke={F.steelShade} strokeWidth={2} />
      <path d="M120 227 L126 230.5 L126 239.5 L120 243 L114 239.5 L114 230.5 Z" fill="none" stroke={F.giShade2} strokeWidth={1.3} />
      <path d="M120 222 L120 248 M109 228.5 L131 241.5 M131 228.5 L109 241.5" stroke={F.steelShade} strokeWidth={1} opacity={0.8} />

      {/* ---- very short neck (yellow), mostly hidden by chin + collar ---- */}
      <path d="M111 176 L129 176 L129 196 L111 196 Z" fill={F.skin} />
      <path d="M111 187 L129 187 L129 196 L111 196 Z" fill={F.skinShade} opacity={0.45} />

      {/* ---- head: dropped down so the chin sits just above the collar (minifig
             proportions — almost no neck). Face + hair + features move as one. ---- */}
      <g transform="translate(0 20)">
        {/* face (LEGO-yellow): short, squashed minifig head, chin overlaps the neck */}
        <path
          d="M99 116 C99 106 107 104 120 104 C133 104 141 106 141 116 L141 146 C141 156 133 160 120 160 C107 160 99 156 99 146 Z"
          fill={F.skin}
          stroke={F.skinLine}
          strokeWidth={1.5}
        />
        {/* jaw shade */}
        <path d="M120 104 C133 104 141 106 141 116 L141 146 C141 156 133 160 120 160 Z" fill={F.skinShade} opacity={0.3} />
        {/* ears */}
        <path d="M99 126 C94 126 94 135 99 137 Z" fill={F.skin} stroke={F.skinLine} strokeWidth={1} />
        <path d="M141 126 C146 126 146 135 141 137 Z" fill={F.skin} stroke={F.skinLine} strokeWidth={1} />

        {/* hair: flat-sided, blunt-tipped clumps (Kai-style) with sideburns +
            a forehead hairline; layered strands for detail */}
        <path
          d="M99 150 L96 98 L101 96 L104 68 L108 70 L111 95 L114 94 L117 60 L121 62 L124 93 L127 95 L130 58 L134 60 L137 94 L140 95 L143 66 L147 68 L150 97 L152 99 L150 150 L143 138 L140 122 C134 114 126 113 121 117 L120 114 L119 117 C113 113 107 114 101 122 L97 138 Z"
          fill={F.hair}
          strokeLinejoin="round"
        />
        {/* lit sheen along the clumps */}
        <path d="M105 93 L106 70 M119 91 L120 62 M132 92 L133 60 M145 93 L145 68" stroke={F.hairHi} strokeWidth={1.3} opacity={0.5} fill="none" />
        {/* darker strand separations */}
        <path d="M111 94 L112 76 M124 92 L125 72 M138 93 L138 72" stroke={F.hairShade} strokeWidth={1.2} opacity={0.55} fill="none" />
        {/* side shade + crown highlight sweep */}
        <path d="M99 100 C97 116 97 130 100 144" stroke={F.hairShade} strokeWidth={1.4} opacity={0.5} fill="none" />
        <path d="M101 104 C105 108 111 110 117 110" stroke={F.hairHi} strokeWidth={1.2} opacity={0.4} fill="none" />

        {/* short thick angry brows */}
        <path d="M107 125 L116 128" stroke={F.hair} strokeWidth={3.6} strokeLinecap="round" />
        <path d="M133 125 L124 128" stroke={F.hair} strokeWidth={3.6} strokeLinecap="round" />
        {/* eyes */}
        <ellipse cx={113} cy={133} rx={2.6} ry={3.3} fill={F.line} />
        <ellipse cx={127} cy={133} rx={2.6} ry={3.3} fill={F.line} />
        <rect x={112} y={130.5} width={1.8} height={1.8} fill={F.steelHi} opacity={0.85} />
        <rect x={126} y={130.5} width={1.8} height={1.8} fill={F.steelHi} opacity={0.85} />
        {/* eyebrow scar over the right eye */}
        <path d="M133 121 L136 129" stroke={F.skinLine} strokeWidth={1.6} strokeLinecap="round" />
        {/* nose hint + small open smile (minifig-style) */}
        <path d="M121 137 L119 143 L123 143" fill="none" stroke={F.skinLine} strokeWidth={1.1} strokeLinecap="round" />
        <path d="M113 146 C116 149 124 149 127 146 C126 151 122 153 120 153 C118 153 114 151 113 146 Z" fill={F.line} />
      </g>

      {/* ---- sword arm assembly: arm + blade + hilt + hand, swinging as one
             about the shoulder once the blade is lit ---- */}
      <Box
        component="g"
        sx={{
          transformBox: 'view-box',
          transformOrigin: SHOULDER,
          animation: lit && animate ? `${swing} 1.15s ease-in-out ${IGNITE_MS}ms infinite` : 'none',
        }}
      >
        {/* right arm (sword arm), raised holding the hilt */}
        <path d="M150 200 C168 194 182 178 180 156" stroke={F.gi} strokeWidth={16} strokeLinecap="round" fill="none" />
        <path d="M164 194 C174 188 180 174 179 158" stroke={F.giShade} strokeWidth={4} fill="none" opacity={0.7} />

        {/* flaming sword blade (behind the hand, so the grip reads as held) */}
        <Box
          component="g"
          aria-hidden
          sx={{
            transformBox: 'view-box',
            transformOrigin: `${HILT_X}px ${HILT_Y}px`,
            color: F.flame,
            filter: !animate && lit ? 'drop-shadow(0 0 7px currentColor)' : 'none',
            animation: bladeAnim,
            // When animating, the ignite/extinguish keyframes own opacity (they end
            // `forwards`); when snapping, set it directly from `lit`.
            opacity: animate ? 1 : lit ? 1 : 0,
          }}
        >
          <Box
            component="g"
            sx={{
              transformBox: 'view-box',
              transformOrigin: `${HILT_X}px ${HILT_Y}px`,
              animation: lit && animate ? `${flicker} 0.9s ease-in-out ${IGNITE_MS}ms infinite` : 'none',
            }}
          >
            <g transform={`translate(${HILT_X} ${HILT_Y})`}>
              <FireBlade />
            </g>
          </Box>
        </Box>

        {/* the hilt in the hand */}
        <g transform={`translate(${HILT_X} ${HILT_Y})`}>
          <Hilt />
        </g>
        <Hand cx={HILT_X - 1} cy={HILT_Y + 14} stroke={F.skin} r={8} />
      </Box>
    </svg>
  )
}
