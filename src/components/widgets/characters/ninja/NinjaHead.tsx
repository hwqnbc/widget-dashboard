// The Sword Ninja's hooded head (hood + faceted mask/face), cropped to a tight
// square viewBox. The asymmetric back-knot is dropped for a symmetric mark and
// the thin face strokes are thickened so they read at small size. Shared by
// widgets that need just the ninja head (e.g. the Tic-Tac-Toe "ninja" mark).

import { N } from './ninjaPalette'

/**
 * Just the ninja's head. `size` sets the svg width/height — pass a number for a
 * fixed pixel size or leave the default `'100%'` to fill the parent (e.g. a
 * tic-tac-toe cell).
 */
export default function NinjaHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="80 58 82 124"
      role="img"
      aria-label="Ninja figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* hood base */}
      <path d="M120 64 L149 78 L157 112 L150 150 L120 178 L90 150 L83 112 L91 78 Z" fill={N.robe} stroke={N.robeShade2} strokeWidth={2.5} />
      {/* right shade facet */}
      <path d="M120 64 L149 78 L157 112 L150 150 L120 178 Z" fill={N.robeShade} opacity={0.9} />
      {/* crown lit facet */}
      <path d="M120 64 L91 78 L110 88 L120 74 Z" fill={N.bladeHi} opacity={0.75} />
      {/* facet seams */}
      <path d="M91 78 L108 118 L90 150 M149 78 L132 118 L150 150 M120 74 L120 110" stroke={N.robeShade2} strokeWidth={2} opacity={0.7} fill="none" />
      {/* visor recess */}
      <path d="M92 114 L120 108 L148 114 L146 140 L120 150 L94 140 Z" fill={N.line} />
      {/* brows */}
      <path d="M99 121 L117 124 M123 124 L141 121" stroke={N.iceDeep} strokeWidth={3} />
      {/* glowing ice eye slits */}
      <path d="M100 132 L118 127 L118 131 L100 136 Z" fill={N.iceMid} />
      <path d="M140 132 L122 127 L122 131 L140 136 Z" fill={N.iceMid} />
      <rect x={107} y={129} width={3} height={3} fill={N.bladeHi} />
      <rect x={130} y={129} width={3} height={3} fill={N.bladeHi} />
      {/* breather / mouth guard */}
      <path d="M112 143 L128 143 M116 140 L116 146 M120 140 L120 146 M124 140 L124 146" stroke={N.iceDeep} strokeWidth={2.2} opacity={0.8} />
    </svg>
  )
}
