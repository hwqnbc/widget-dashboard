// frak's head: lime-green hood + orange face + green lower-face wrap + green eyes,
// cropped to a tight square viewBox. Strokes a touch heavier for chip legibility.

import { FR } from './frakPalette'

/**
 * Just frak's head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function FrakHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="66 52 108 108"
      role="img"
      aria-label="frak figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* hood back drape */}
      <path d="M84 150 L82 120 C82 78 100 58 120 58 C140 58 158 78 158 120 L156 150 L146 138 L140 118 C136 96 104 96 100 118 L94 138 Z" fill={FR.hoodShade} />
      {/* orange face */}
      <path d="M104 108 C104 100 111 96 120 96 C129 96 136 100 136 108 L136 150 C136 160 129 166 120 166 C111 166 104 160 104 150 Z" fill={FR.skin} stroke={FR.skinShade} strokeWidth={2} />
      <path d="M120 96 C129 96 136 100 136 108 L136 150 C136 160 129 166 120 166 Z" fill={FR.skinShade} opacity={0.28} />
      {/* green eyes */}
      <path d="M106 120 L118 116 L118 124 L107 127 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1.2} />
      <path d="M134 120 L122 116 L122 124 L133 127 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1.2} />
      <rect x={111} y={119} width={3} height={3} fill={FR.eyeDark} />
      <rect x={126} y={119} width={3} height={3} fill={FR.eyeDark} />
      <path d="M106 114 L118 113 M134 114 L122 113" stroke={FR.skinShade} strokeWidth={2.2} />
      {/* green lower-face wrap */}
      <path d="M104 133 C112 130 128 130 136 133 L136 150 C136 160 129 166 120 166 C111 166 104 160 104 150 Z" fill={FR.wrap} stroke={FR.wrapShade} strokeWidth={1.4} />
      <path d="M104 138 C114 135 126 135 136 138 M108 148 C114 146 126 146 132 148" stroke={FR.wrapShade} strokeWidth={1.3} fill="none" opacity={0.8} />
      {/* glossy lime hood */}
      <path d="M120 56 C98 56 80 78 80 118 L82 150 L96 132 L100 116 C104 98 112 92 120 92 L120 56 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2.2} />
      <path d="M120 56 C142 56 160 78 160 118 L158 150 L144 132 L140 116 C136 98 128 92 120 92 L120 56 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2.2} />
      <path d="M120 56 C110 56 100 64 94 78 L104 84 C110 74 116 70 120 70 Z" fill={FR.hoodHi} opacity={0.7} />
      <path d="M158 118 L152 150 L144 132 Z" fill={FR.hoodShade} opacity={0.8} />
    </svg>
  )
}
