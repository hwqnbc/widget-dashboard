// frak's head: faceted lime-green hood covering the face, with an orange face
// opening, green eyes and a green lower-face wrap. Cropped to a tight square
// viewBox; strokes a touch heavier for chip legibility.

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
      viewBox="70 82 100 100"
      role="img"
      aria-label="frak figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* hood back drape */}
      <path d="M88 158 L86 128 L96 104 L120 92 L144 104 L154 128 L152 158 L146 140 L140 120 L120 112 L100 120 L94 140 Z" fill={FR.hoodShade} />
      {/* faceted lime hood */}
      <path d="M120 90 L146 102 L156 130 L150 158 L120 172 L90 158 L84 130 L94 102 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2.4} />
      <path d="M120 90 L146 102 L156 130 L150 158 L120 172 Z" fill="#000" opacity={0.13} />
      <path d="M120 90 L104 100 L96 116" stroke={FR.hoodHi} strokeWidth={2.6} fill="none" opacity={0.6} />
      <path d="M120 86 L127 94 L113 94 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={1.2} />
      {/* orange face opening */}
      <path d="M107 118 L133 118 L134 140 L120 154 L106 140 Z" fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.6} />
      {/* green eyes */}
      <path d="M108 126 L119 123 L119 130 L109 132 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1.2} />
      <path d="M132 126 L121 123 L121 130 L131 132 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1.2} />
      <rect x={112} y={125} width={3} height={3} fill={FR.eyeDark} />
      <rect x={125} y={125} width={3} height={3} fill={FR.eyeDark} />
      {/* green lower-face wrap */}
      <path d="M107 135 L133 135 L134 140 L120 154 L106 140 Z" fill={FR.wrap} stroke={FR.wrapShade} strokeWidth={1.2} />
      <path d="M108 140 L132 140 M112 147 L128 147" stroke={FR.wrapShade} strokeWidth={1.2} fill="none" opacity={0.8} />
      {/* hood facet seams */}
      <path d="M94 102 L120 90 L146 102 M84 130 L107 122 M156 130 L133 122" stroke={FR.hoodShade2} strokeWidth={1.2} fill="none" opacity={0.5} />
    </svg>
  )
}
