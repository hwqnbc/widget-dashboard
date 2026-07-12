// The fire ninja's head (dark tousled spiky hair + LEGO-yellow face with an
// eyebrow scar), cropped to a tight square viewBox with a hint of neck + black
// gi collar so it reads as connected, not floating. Face strokes are thickened
// vs the full figure so they read at small chip size (e.g. the Settings picker
// / a game mark). Mirrors NinjaHead's role for the hooded ninja.

import { F } from './fireNinjaPalette'

/**
 * Just the fire ninja's head. `size` sets the svg width/height — pass a number
 * for a fixed pixel size or leave the default `'100%'` to fill the parent.
 */
export default function FireNinjaHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="68 64 104 104"
      role="img"
      aria-label="Fire ninja figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* neck + black collar hint (grounds the head) */}
      <path d="M110 150 L130 150 L130 168 L110 168 Z" fill={F.skin} />
      <path d="M104 160 L136 160 L138 168 L102 168 Z" fill={F.sash} />
      {/* face — short, squashed minifig head */}
      <path
        d="M99 116 C99 106 107 104 120 104 C133 104 141 106 141 116 L141 146 C141 156 133 160 120 160 C107 160 99 156 99 146 Z"
        fill={F.skin}
        stroke={F.skinLine}
        strokeWidth={2}
      />
      <path d="M120 104 C133 104 141 106 141 116 L141 146 C141 156 133 160 120 160 Z" fill={F.skinShade} opacity={0.3} />
      <path d="M99 126 C94 126 94 135 99 137 Z" fill={F.skin} stroke={F.skinLine} strokeWidth={1.2} />
      <path d="M141 126 C146 126 146 135 141 137 Z" fill={F.skin} stroke={F.skinLine} strokeWidth={1.2} />
      {/* hair: flat-sided, blunt-tipped clumps (Kai-style) with layered strands */}
      <path
        d="M99 150 L96 98 L101 96 L104 68 L108 70 L111 95 L114 94 L117 60 L121 62 L124 93 L127 95 L130 58 L134 60 L137 94 L140 95 L143 66 L147 68 L150 97 L152 99 L150 150 L143 138 L140 122 C134 114 126 113 121 117 L120 114 L119 117 C113 113 107 114 101 122 L97 138 Z"
        fill={F.hair}
        strokeLinejoin="round"
      />
      <path d="M105 93 L106 70 M119 91 L120 62 M132 92 L133 60 M145 93 L145 68" stroke={F.hairHi} strokeWidth={1.4} opacity={0.5} fill="none" />
      <path d="M111 94 L112 76 M124 92 L125 72 M138 93 L138 72" stroke={F.hairShade} strokeWidth={1.3} opacity={0.55} fill="none" />
      <path d="M99 100 C97 116 97 130 100 144" stroke={F.hairShade} strokeWidth={1.4} opacity={0.5} fill="none" />
      {/* short thick angry brows */}
      <path d="M107 125 L116 128" stroke={F.hair} strokeWidth={4} strokeLinecap="round" />
      <path d="M133 125 L124 128" stroke={F.hair} strokeWidth={4} strokeLinecap="round" />
      {/* eyes */}
      <ellipse cx={113} cy={133} rx={2.9} ry={3.6} fill={F.line} />
      <ellipse cx={127} cy={133} rx={2.9} ry={3.6} fill={F.line} />
      <rect x={112} y={130.5} width={2} height={2} fill={F.steelHi} opacity={0.9} />
      <rect x={126} y={130.5} width={2} height={2} fill={F.steelHi} opacity={0.9} />
      {/* eyebrow scar */}
      <path d="M133 120 L136 129" stroke={F.skinLine} strokeWidth={1.9} strokeLinecap="round" />
      {/* nose hint + small open smile (minifig-style) */}
      <path d="M121 137 L119 143 L123 143" fill="none" stroke={F.skinLine} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M112 146 C116 149 124 149 128 146 C126 152 122 154 120 154 C118 154 114 152 112 146 Z" fill={F.line} />
    </svg>
  )
}
