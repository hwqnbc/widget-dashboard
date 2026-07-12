// DarkArin's head: black mask + gold studded crown + determined eyes, cropped to
// a tight square viewBox. Strokes are a touch heavier than the full figure so it
// reads at small chip size (e.g. the Settings picker / a game mark).

import { D } from './darkArinPalette'

/**
 * Just DarkArin's head. `size` sets the svg width/height — pass a number for a
 * fixed pixel size or leave the default `'100%'` to fill the parent.
 */
export default function DarkArinHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="72 88 96 96"
      role="img"
      aria-label="DarkArin figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* mask / hood */}
      <path
        d="M120 96 C100 96 89 111 89 134 C89 159 104 180 120 180 C136 180 151 159 151 134 C151 111 140 96 120 96 Z"
        fill={D.mask}
        stroke={D.line}
        strokeWidth={2.5}
      />
      <path d="M120 96 C140 96 151 111 151 134 C151 159 136 180 120 180 Z" fill="#000" opacity={0.22} />
      <path d="M97 150 C108 162 132 162 143 150" stroke={D.maskHi} strokeWidth={1.6} fill="none" opacity={0.6} />
      {/* determined eyes */}
      <path d="M100 133 L116 128 L116 138 L100 140 Z" fill={D.eye} />
      <path d="M140 133 L124 128 L124 138 L140 140 Z" fill={D.eye} />
      <path d="M100 133 L116 128" stroke={D.line} strokeWidth={2.4} />
      <path d="M140 133 L124 128" stroke={D.line} strokeWidth={2.4} />
      <rect x={108} y={133} width={3} height={3} fill={D.line} />
      <rect x={129} y={133} width={3} height={3} fill={D.line} />
      {/* gold crown headpiece */}
      <path
        d="M92 118 C98 99 142 99 148 118 L142 120 C136 105 104 105 98 120 Z"
        fill={D.crown}
        stroke={D.crownShade}
        strokeWidth={1.6}
      />
      <path d="M120 99 L124 90 L128 99 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1.2} />
      <circle cx={104} cy={110} r={3.8} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1.1} />
      <circle cx={120} cy={105} r={4.2} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1.1} />
      <circle cx={136} cy={110} r={3.8} fill={D.crownHi} stroke={D.crownShade} strokeWidth={1.1} />
      <path d="M90 120 L83 115 L88 127 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1.1} />
      <path d="M150 120 L157 115 L152 127 Z" fill={D.crown} stroke={D.crownShade} strokeWidth={1.1} />
    </svg>
  )
}
