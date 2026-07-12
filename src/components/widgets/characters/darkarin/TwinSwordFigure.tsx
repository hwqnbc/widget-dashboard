import { Box, keyframes } from '@mui/material'
import { D } from './darkArinPalette'
import Hand from '../shared/Hand'

/**
 * A translucent ice-blue sword in local coords: guard at (0,0), grip pointing
 * down (+y), blade pointing up (−y) to the tip at (0,-104). Drawn with opacity so
 * it reads as a see-through energy blade.
 */
function Sword() {
  return (
    <g strokeLinejoin="round">
      {/* blade — slightly tapered saber, translucent */}
      <path
        d="M-3.2 -6 L-3.4 -70 L-1.4 -100 L0 -104 L1.4 -100 L3.4 -70 L3.2 -6 Z"
        fill={D.blade}
        opacity={0.68}
        stroke={D.bladeEdge}
        strokeWidth={1}
      />
      {/* inner glossy core */}
      <path d="M-1 -10 L-1.2 -70 L0 -96 L1.2 -70 L1 -10 Z" fill={D.bladeHi} opacity={0.85} />
      <path d="M0 -12 L0 -94" stroke="#ffffff" strokeWidth={0.8} opacity={0.7} />
      {/* guard */}
      <path d="M-8 -7 L8 -7 L8 -3 L-8 -3 Z" fill={D.steel} stroke={D.steelShade} strokeWidth={1} />
      {/* grip */}
      <path d="M-2.6 -3 L2.6 -3 L2.2 15 L-2.2 15 Z" fill={D.mask} stroke={D.line} strokeWidth={1} />
      <path d="M-4 15 L4 15 L3 19 L-3 19 Z" fill={D.steel} stroke={D.steelShade} strokeWidth={0.8} />
    </g>
  )
}

// Both arms swing inward about their shoulders so the two blades cross in front of
// the body (a defensive X). Viewer-left arm rotates clockwise (+), viewer-right
// counter-clockwise (−), so each blade sweeps toward the opposite side.
const CROSS_L = -64 // viewer-right arm (rotates counter-clockwise)
const CROSS_R = 64 // viewer-left arm (rotates clockwise)

const crossLeft = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(${CROSS_L}deg); }
`
const uncrossLeft = keyframes`
  from { transform: rotate(${CROSS_L}deg); }
  to   { transform: rotate(0deg); }
`
const crossRight = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(${CROSS_R}deg); }
`
const uncrossRight = keyframes`
  from { transform: rotate(${CROSS_R}deg); }
  to   { transform: rotate(0deg); }
`

const DUR = '0.7s'
const EASE = 'cubic-bezier(.5, 0, .2, 1)'

// Shoulder pivots (viewer-left = figure's right hand; viewer-right = figure's left).
const LSHOULDER = '150px 204px' // viewer-right arm
const RSHOULDER = '90px 204px' // viewer-left arm

/**
 * "DarkArin": an amber ninja in a black mask + gold crown, dark shoulder armor and
 * a magenta dragon print, wielding two translucent ice-blue swords. At rest the
 * swords are held out to the sides (ready stance). `crossed` swings both arms in
 * so the blades cross in front of the chest — a defensive X guard. `animate=false`
 * snaps without the transition (initial / static render). Presentational.
 */
export default function TwinSwordFigure({
  crossed,
  animate = true,
}: {
  crossed: boolean
  animate?: boolean
}) {
  const leftAnim = !animate
    ? 'none'
    : `${crossed ? crossLeft : uncrossLeft} ${DUR} ${EASE} forwards`
  const rightAnim = !animate
    ? 'none'
    : `${crossed ? crossRight : uncrossRight} ${DUR} ${EASE} forwards`

  // Static rest transform (used when not animating) — snap to the crossed or open pose.
  const leftStatic = `rotate(${crossed ? CROSS_L : 0}deg)`
  const rightStatic = `rotate(${crossed ? CROSS_R : 0}deg)`

  return (
    <svg
      viewBox="0 0 240 380"
      width="100%"
      height="100%"
      style={{ overflow: 'visible' }}
      strokeLinejoin="miter"
    >
      {/* ---- legs (amber gi, black wraps) ---- */}
      <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={D.gi} stroke={D.giShade2} strokeWidth={2} />
      <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={D.gi} stroke={D.giShade2} strokeWidth={2} />
      <path d="M113 298 L118 298 L118 356 L113 356 Z" fill={D.giShade} opacity={0.6} />
      <path d="M136 298 L141 298 L141 356 L136 356 Z" fill={D.giShade} opacity={0.6} />
      <path d="M99 330 L118 330 M122 330 L141 330" stroke={D.mask} strokeWidth={4} />
      <path d="M99 344 L118 344 M122 344 L141 344" stroke={D.mask} strokeWidth={3} />
      {/* boots */}
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={D.mask} stroke={D.line} strokeWidth={1.5} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={D.mask} stroke={D.line} strokeWidth={1.5} />

      {/* ---- torso (amber gi) ---- */}
      <path d="M88 196 L152 196 L160 296 L80 296 Z" fill={D.gi} stroke={D.giShade2} strokeWidth={2.5} />
      <path d="M120 196 L152 196 L160 296 L120 296 Z" fill={D.giShade} opacity={0.4} />
      <path d="M88 196 L100 196 L92 296 L80 296 Z" fill={D.giHi} opacity={0.35} />
      {/* magenta dragon print (stylized) */}
      <path
        d="M120 214 C132 216 138 226 133 236 C142 232 145 244 137 250 C144 252 141 264 131 262 C124 261 120 254 121 247 C116 254 108 253 106 246 C104 239 110 234 117 235 C110 230 112 220 120 214 Z"
        fill={D.dragon}
        opacity={0.9}
      />
      <path d="M120 220 C127 222 129 229 125 234 M124 244 C129 246 129 253 123 253" stroke={D.dragonHi} strokeWidth={1.4} fill="none" opacity={0.8} />
      <circle cx={128} cy={230} r={1.3} fill={D.dragonHi} />
      {/* obi belt */}
      <path d="M84 268 L156 268 L158 282 L82 282 Z" fill={D.mask} stroke={D.line} strokeWidth={1} />
      <path d="M83 270 L157 270" stroke={D.maskHi} strokeWidth={1.1} opacity={0.6} />
      <path d="M112 266 L128 266 L128 284 L112 284 Z" fill={D.mask} stroke={D.line} strokeWidth={1} />

      {/* ---- very short neck ---- */}
      <path d="M111 178 L129 178 L129 196 L111 196 Z" fill={D.mask} />

      {/* ---- head: black mask + gold crown + determined eyes (dropped for a short neck) ---- */}
      <g transform="translate(0 18)">
        {/* mask / hood */}
        <path
          d="M120 96 C100 96 89 111 89 134 C89 159 104 180 120 180 C136 180 151 159 151 134 C151 111 140 96 120 96 Z"
          fill={D.mask}
          stroke={D.line}
          strokeWidth={2}
        />
        <path d="M120 96 C140 96 151 111 151 134 C151 159 136 180 120 180 Z" fill="#000" opacity={0.22} />
        {/* cheek / jaw wrap seam */}
        <path d="M97 150 C108 162 132 162 143 150" stroke={D.maskHi} strokeWidth={1.4} fill="none" opacity={0.6} />
        {/* determined eyes (angled inward) */}
        <path d="M101 133 L116 129 L116 137 L101 139 Z" fill={D.eye} />
        <path d="M139 133 L124 129 L124 137 L139 139 Z" fill={D.eye} />
        <path d="M101 133 L116 129" stroke={D.line} strokeWidth={2} />
        <path d="M139 133 L124 129" stroke={D.line} strokeWidth={2} />
        <rect x={109} y={133} width={2.4} height={2.4} fill={D.line} />
        <rect x={129} y={133} width={2.4} height={2.4} fill={D.line} />
        {/* gold crown headpiece */}
        <path
          d="M92 118 C98 100 142 100 148 118 L142 120 C136 106 104 106 98 120 Z"
          fill={D.crown}
          stroke={D.crownShade}
          strokeWidth={1.4}
        />
        <path d="M120 100 L124 92 L128 100 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1} />
        <circle cx={104} cy={110} r={3.4} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1} />
        <circle cx={120} cy={106} r={3.8} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1} />
        <circle cx={136} cy={110} r={3.4} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1} />
        {/* side flares of the crown */}
        <path d="M90 120 L84 116 L88 126 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1} />
        <path d="M150 120 L156 116 L152 126 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1} />
      </g>

      {/* ---- shoulder armor (dark pauldrons + collar), over the torso/neck ---- */}
      <path d="M78 200 C86 190 104 188 112 196 L108 210 C100 204 88 205 82 212 Z" fill={D.armor} stroke={D.armorShade} strokeWidth={1.5} />
      <path d="M162 200 C154 190 136 188 128 196 L132 210 C140 204 152 205 158 212 Z" fill={D.armor} stroke={D.armorShade} strokeWidth={1.5} />
      <path d="M104 194 L136 194 L132 205 L108 205 Z" fill={D.armor} stroke={D.armorShade} strokeWidth={1.5} />
      <path d="M80 201 C88 192 103 191 110 197" stroke={D.armorHi} strokeWidth={1.4} fill="none" opacity={0.7} />
      <path d="M160 201 C152 192 137 191 130 197" stroke={D.armorHi} strokeWidth={1.4} fill="none" opacity={0.7} />

      {/* ---- viewer-left arm (figure's right hand): sword out up-left; swings in to cross ---- */}
      <Box
        component="g"
        sx={{
          transformBox: 'view-box',
          transformOrigin: RSHOULDER,
          transform: rightStatic,
          animation: rightAnim,
        }}
      >
        <path d="M90 206 C72 210 60 202 54 192" stroke={D.gi} strokeWidth={15} strokeLinecap="round" fill="none" />
        <path d="M74 205 C64 205 58 200 55 194" stroke={D.giShade} strokeWidth={4} fill="none" opacity={0.6} />
        <g transform="translate(52 190) rotate(-30)">
          <Sword />
        </g>
        <g transform="rotate(-30 52 190)">
          <Hand cx={52} cy={190} stroke={D.gi} r={8} />
        </g>
      </Box>

      {/* ---- viewer-right arm (figure's left hand): sword out up-right; swings in to cross ---- */}
      <Box
        component="g"
        sx={{
          transformBox: 'view-box',
          transformOrigin: LSHOULDER,
          transform: leftStatic,
          animation: leftAnim,
        }}
      >
        <path d="M150 206 C168 210 180 202 186 192" stroke={D.gi} strokeWidth={15} strokeLinecap="round" fill="none" />
        <path d="M166 205 C176 205 182 200 185 194" stroke={D.giShade} strokeWidth={4} fill="none" opacity={0.6} />
        <g transform="translate(188 190) rotate(30)">
          <Sword />
        </g>
        <g transform="rotate(30 188 190)">
          <Hand cx={188} cy={190} stroke={D.gi} r={8} />
        </g>
      </Box>
    </svg>
  )
}
