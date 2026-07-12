import { Box } from '@mui/material'
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

/** The gripping hand + sword as one unit, placed/rotated at the guard. */
function SwordHand() {
  return (
    <>
      <Sword />
      <g transform="rotate(90 0 9)">
        <Hand cx={0} cy={9} stroke={D.gi} r={8} />
      </g>
    </>
  )
}

// Rest = swords held out (ready stance); crossed = swords brought down to the
// waist and angled up so they cross in front of the CHEST (defensive X). Each
// sword+hand tweens between its rest and crossed placement; the forearm crossfades
// between two paths (shoulder→rest-hand and shoulder→waist-hand).
const VL_REST = 'translate(52px, 190px) rotate(-30deg)'
const VL_CROSS = 'translate(110px, 250px) rotate(38deg)'
const VR_REST = 'translate(188px, 190px) rotate(30deg)'
const VR_CROSS = 'translate(130px, 250px) rotate(-38deg)'

const VL_ARM_REST = 'M90 206 C72 210 60 202 54 192'
const VL_ARM_CROSS = 'M90 206 C96 226 102 242 110 250'
const VR_ARM_REST = 'M150 206 C168 210 180 202 186 192'
const VR_ARM_CROSS = 'M150 206 C144 226 138 242 130 250'

const MOVE = '0.7s cubic-bezier(.5, 0, .2, 1)'

/**
 * "DarkArin": an amber ninja in a black mask + gold crown, dark shoulder armor and
 * a magenta dragon print, wielding two translucent ice-blue swords. At rest the
 * swords are held out to the sides (ready stance). `crossed` brings both swords
 * down to the waist and crosses them in front of the chest — a defensive X.
 * `animate=false` snaps without the transition (initial / static render).
 */
export default function TwinSwordFigure({
  crossed,
  animate = true,
}: {
  crossed: boolean
  animate?: boolean
}) {
  const swordTx = { transformBox: 'view-box' as const, transformOrigin: '0 0', transition: animate ? `transform ${MOVE}` : 'none' }
  const armTx = { transition: animate ? `opacity ${MOVE}` : 'none' }

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

      {/* ---- head: faceted (edged) black mask + gold crown + determined eyes ---- */}
      <g transform="translate(0 18)">
        {/* faceted mask / hood */}
        <path
          d="M120 94 L142 104 L150 128 L146 156 L120 182 L94 156 L90 128 L98 104 Z"
          fill={D.mask}
          stroke={D.line}
          strokeWidth={2}
        />
        {/* right shade facet */}
        <path d="M120 94 L142 104 L150 128 L146 156 L120 182 Z" fill="#000" opacity={0.22} />
        {/* facet seams */}
        <path d="M98 104 L120 94 L142 104 M90 128 L108 122 M150 128 L132 122 M94 156 L112 150 M146 156 L128 150" stroke={D.maskHi} strokeWidth={1.2} fill="none" opacity={0.5} />
        {/* determined eyes (angled inward) */}
        <path d="M101 133 L116 129 L116 137 L101 139 Z" fill={D.eye} />
        <path d="M139 133 L124 129 L124 137 L139 139 Z" fill={D.eye} />
        <path d="M101 133 L116 129" stroke={D.line} strokeWidth={2} />
        <path d="M139 133 L124 129" stroke={D.line} strokeWidth={2} />
        <rect x={109} y={133} width={2.4} height={2.4} fill={D.line} />
        <rect x={129} y={133} width={2.4} height={2.4} fill={D.line} />
        {/* gold crown headpiece */}
        <path d="M92 118 L98 100 L142 100 L148 118 L142 120 L136 106 L104 106 L98 120 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1.4} />
        <path d="M120 100 L124 92 L128 100 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1} />
        <circle cx={104} cy={110} r={3.4} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1} />
        <circle cx={120} cy={106} r={3.8} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1} />
        <circle cx={136} cy={110} r={3.4} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1} />
        <path d="M90 120 L83 116 L88 128 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1} />
        <path d="M150 120 L157 116 L152 128 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1} />
      </g>

      {/* ---- shoulder armor (dark pauldrons + collar) ---- */}
      <path d="M78 200 C86 190 104 188 112 196 L108 210 C100 204 88 205 82 212 Z" fill={D.armor} stroke={D.armorShade} strokeWidth={1.5} />
      <path d="M162 200 C154 190 136 188 128 196 L132 210 C140 204 152 205 158 212 Z" fill={D.armor} stroke={D.armorShade} strokeWidth={1.5} />
      <path d="M104 194 L136 194 L132 205 L108 205 Z" fill={D.armor} stroke={D.armorShade} strokeWidth={1.5} />
      <path d="M80 201 C88 192 103 191 110 197" stroke={D.armorHi} strokeWidth={1.4} fill="none" opacity={0.7} />
      <path d="M160 201 C152 192 137 191 130 197" stroke={D.armorHi} strokeWidth={1.4} fill="none" opacity={0.7} />

      {/* ---- viewer-left arm (figure's right hand) ---- */}
      <Box component="path" d={VL_ARM_REST} sx={{ ...armTx, opacity: crossed ? 0 : 1 }} stroke={D.gi} strokeWidth={15} strokeLinecap="round" fill="none" />
      <Box component="path" d={VL_ARM_CROSS} sx={{ ...armTx, opacity: crossed ? 1 : 0 }} stroke={D.gi} strokeWidth={15} strokeLinecap="round" fill="none" />
      <Box component="g" sx={{ ...swordTx, transform: crossed ? VL_CROSS : VL_REST }}>
        <SwordHand />
      </Box>

      {/* ---- viewer-right arm (figure's left hand) ---- */}
      <Box component="path" d={VR_ARM_REST} sx={{ ...armTx, opacity: crossed ? 0 : 1 }} stroke={D.gi} strokeWidth={15} strokeLinecap="round" fill="none" />
      <Box component="path" d={VR_ARM_CROSS} sx={{ ...armTx, opacity: crossed ? 1 : 0 }} stroke={D.gi} strokeWidth={15} strokeLinecap="round" fill="none" />
      <Box component="g" sx={{ ...swordTx, transform: crossed ? VR_CROSS : VR_REST }}>
        <SwordHand />
      </Box>
    </svg>
  )
}
