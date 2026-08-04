// Bazooka Joe's head: black cap (crown + band + down-angled visor) over the
// sunglasses and cocky smirk — split out of the full figure and cropped to a
// tight square viewBox so it reads as a chip/mark. Strokes a touch heavier
// for chip legibility.

import { BJ } from './bazookaJoePalette'

/**
 * Just the head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function BazookaJoeHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="184 66 132 132"
      role="img"
      aria-label="Bazooka Joe figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* head block */}
      <rect x={212} y={100} width={76} height={92} rx={20} fill={BJ.skin} stroke={BJ.skinLine} strokeWidth={2.2} />
      <path d="M 250 100 L 268 100 A20 20 0 0 1 288 120 L 288 172 A20 20 0 0 1 268 192 L 250 192 Z" fill={BJ.skinShade} opacity={0.35} />
      {/* smirk + hook + dimple */}
      <path d="M 235,165 Q 248,162 262,158" fill="none" stroke={BJ.smirk} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M 262,158 Q 268,154 266,163" fill="none" stroke={BJ.smirk} strokeWidth={2.8} strokeLinecap="round" />
      <path d="M 255,167 Q 260,166 263,164" fill="none" stroke={BJ.dimple} strokeWidth={1.6} />
      {/* sunglasses */}
      <path d="M 214,124 L 286,124 L 282,143 C 280,148 260,152 253,143 L 247,143 C 240,152 220,148 218,143 Z" fill={BJ.lens} stroke={BJ.lensFrame} strokeWidth={2.2} />
      <polygon points="220,127 240,127 232,144 220,140" fill="#ffffff" opacity={0.25} />
      <polygon points="224,127 230,127 225,138 221,138" fill="#ffffff" opacity={0.4} />
      <polygon points="256,127 276,127 272,140 260,144" fill="#ffffff" opacity={0.25} />
      <polygon points="260,127 266,127 263,138 259,138" fill="#ffffff" opacity={0.4} />
      <rect x={247} y={125} width={6} height={3} fill={BJ.plasticHi} />
      {/* cap: crown, band, visor with edge highlight */}
      <path d="M 208,108 C 206,75 220,68 250,68 C 280,68 294,75 292,108 Z" fill={BJ.plastic} stroke={BJ.plasticShade} strokeWidth={2.2} />
      <path d="M 250 68 C 280 68 294 75 292 108 L 250 108 Z" fill="#000" opacity={0.25} />
      <path d="M 206,105 L 294,105 L 294,115 L 206,115 Z" fill={BJ.capBand} />
      <path d="M 200,112 C 210,112 240,120 250,120 C 260,120 290,112 300,112 C 304,118 290,127 250,128 C 210,127 196,118 200,112 Z" fill={BJ.visor} stroke={BJ.visorEdge} strokeWidth={1.6} />
      <path d="M 202,115 C 220,121 250,124 288,115" fill="none" stroke={BJ.visorHi} strokeWidth={1.6} opacity={0.6} />
    </svg>
  )
}
