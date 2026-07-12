// Static, pose-independent pieces of the toy minifigure, shared by ToyFigure
// (full body), SixSevenWidget (animated arms over the same body) and ToyHead
// (just the cap + face). Each returns bare SVG elements meant to be placed
// inside a `<svg viewBox="0 0 240 380">` (or, for the head, the 28 39 144 144
// crop) — they add no wrapper node, so draw order is the caller's to control.

import { TOY as T } from './toyPalette'

/** Both legs with their highlight streaks. */
export function ToyLegs() {
  return (
    <>
      <path d="M90 300 L88 358 C88 365 110 365 110 358 L112 300 Z" fill={T.leg} stroke={T.legShade} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M128 300 L130 358 C130 365 152 365 152 358 L150 300 Z" fill={T.leg} stroke={T.legShade} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M96 308 L94 352" stroke="#ffffff" strokeWidth={3} opacity={0.35} strokeLinecap="round" />
      <path d="M134 308 L133 352" stroke="#ffffff" strokeWidth={3} opacity={0.3} strokeLinecap="round" />
    </>
  )
}

/** The neck stub between head and torso. */
export function ToyNeck() {
  return <rect x={106} y={170} width={28} height={18} fill={T.skin} stroke={T.skinShade} strokeWidth={1.5} />
}

/** The flared torso with gloss/shade and the chest badge + scallop emblem. */
export function ToyTorso() {
  return (
    <>
      <path
        d="M82 184 C80 182 80 186 80 190 L70 288 C69 296 73 301 82 301 L158 301 C167 301 171 296 170 288 L160 190 C160 186 160 182 158 184 C145 182 132 187 120 187 C108 187 95 182 82 184 Z"
        fill={T.teal}
        stroke={T.tealShade}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* gloss + shade */}
      <path d="M94 196 C89 230 89 262 96 292" stroke="#ffffff" strokeWidth={6} opacity={0.22} strokeLinecap="round" fill="none" />
      <path d="M150 196 C156 230 156 262 150 292" stroke={T.tealShade} strokeWidth={8} opacity={0.3} strokeLinecap="round" fill="none" />
      {/* chest badge (generic scallop emblem, not a real logo) */}
      <rect x={104} y={250} width={32} height={13} rx={2} fill={T.badge} stroke="#9a1f19" strokeWidth={1} />
      <path d="M104 256 H136 M110 256 V263 M116 256 V263 M122 256 V263 M128 256 V263" stroke="#ffd9c0" strokeWidth={0.8} opacity={0.7} />
      <path d="M120 232 C107 232 102 244 105 250 L135 250 C138 244 133 232 120 232 Z" fill={T.shell} stroke="#b8910a" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M120 250 L113 234 M120 250 L120 232 M120 250 L127 234" stroke="#b8910a" strokeWidth={1} />
    </>
  )
}

/**
 * The head shape, cap (dome + highlight + brim), eyebrows and eyes. The mouth
 * varies per widget (smile / open / brace), so the caller draws it after this.
 * `brace` switches to the worried eyebrows used by ToyFigure's brace pose.
 */
export function ToyCapAndFace({ brace = false }: { brace?: boolean }) {
  return (
    <>
      {/* head */}
      <path d="M80 110 C78 150 84 174 120 176 C156 174 162 150 160 110 Z" fill={T.skin} stroke={T.skinShade} strokeWidth={2} />
      {/* cap dome */}
      <path d="M72 108 C70 62 94 46 120 46 C146 46 170 62 168 108 Z" fill={T.teal} stroke={T.tealShade} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M92 60 C84 70 80 86 82 100" stroke={T.tealHi} strokeWidth={6} opacity={0.6} strokeLinecap="round" fill="none" />
      {/* cap brim (sweeps to the front-left) */}
      <path d="M64 104 C40 104 30 114 42 120 C76 130 150 126 170 114 C176 110 172 104 164 104 C150 110 86 112 64 104 Z" fill={T.tealHi} stroke={T.tealShade} strokeWidth={2} strokeLinejoin="round" />
      {/* eyebrows */}
      <path d={brace ? 'M98 138 q8 -5 15 -1' : 'M100 142 q7 -3 13 0'} stroke={T.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d={brace ? 'M127 137 q7 -4 15 1' : 'M127 142 q6 -3 13 0'} stroke={T.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      {/* eyes */}
      <ellipse cx={107} cy={151} rx={3.4} ry={4.6} fill={T.line} />
      <ellipse cx={133} cy={151} rx={3.4} ry={4.6} fill={T.line} />
      <circle cx={108} cy={149} r={1.1} fill="#fff" />
      <circle cx={134} cy={149} r={1.1} fill="#fff" />
    </>
  )
}
