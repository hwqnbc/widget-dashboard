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
      <path d="M90 158 L88 128 L97 104 L120 92 L143 104 L152 128 L150 158 L145 140 L139 120 L120 112 L101 120 L95 140 Z" fill={FR.hoodShade} />
      {/* faceted lime hood — slim rim */}
      <path d="M120 90 L143 102 L151 130 L146 156 L120 168 L94 156 L89 130 L97 102 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={2.4} />
      <path d="M120 90 L143 102 L151 130 L146 156 L120 168 Z" fill="#000" opacity={0.13} />
      <path d="M120 90 L106 99 L99 114" stroke={FR.hoodHi} strokeWidth={2.6} fill="none" opacity={0.6} />
      <path d="M120 86 L127 94 L113 94 Z" fill={FR.hood} stroke={FR.hoodShade2} strokeWidth={1.2} />
      {/* wide orange face opening */}
      <path d="M100 112 L140 112 L141 140 L120 158 L99 140 Z" fill={FR.skin} stroke={FR.skinShade} strokeWidth={1.6} />
      {/* green eyes (wider apart) */}
      <path d="M102 122 L118 118 L118 127 L103 130 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1.2} />
      <path d="M138 122 L122 118 L122 127 L137 130 Z" fill={FR.eye} stroke={FR.eyeDark} strokeWidth={1.2} />
      <rect x={106} y={123} width={3.2} height={3.2} fill={FR.eyeDark} />
      <rect x={131} y={123} width={3.2} height={3.2} fill={FR.eyeDark} />
      {/* big green lower-face mask */}
      <path d="M99 132 L141 132 L141 140 L120 158 L99 140 Z" fill={FR.wrap} stroke={FR.wrapShade} strokeWidth={1.2} />
      <path d="M101 138 L139 138 M108 147 L132 147" stroke={FR.wrapShade} strokeWidth={1.2} fill="none" opacity={0.8} />
      {/* hood facet seams */}
      <path d="M97 102 L120 90 L143 102 M89 130 L99 124 M151 130 L141 124" stroke={FR.hoodShade2} strokeWidth={1.2} fill="none" opacity={0.5} />
    </svg>
  )
}
