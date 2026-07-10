// The toy minifigure's capped head (face + cap), cropped to a tight square
// viewBox lifted from ToyFigure. Shared by widgets that need just the head —
// the Round Clock's orbiting figure and the Tic-Tac-Toe "toy" mark.

import { TOY } from './toyPalette'

/**
 * Just the toy's head. `size` sets the svg width/height — pass a number for a
 * fixed pixel size (e.g. the orbiting clock head) or leave the default `'100%'`
 * to fill the parent (e.g. a tic-tac-toe cell).
 */
export default function ToyHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="28 39 144 144"
      role="img"
      aria-label="Toy figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* head */}
      <path
        d="M80 110 C78 150 84 174 120 176 C156 174 162 150 160 110 Z"
        fill={TOY.skin}
        stroke={TOY.skinShade}
        strokeWidth={2}
      />
      {/* cap dome */}
      <path
        d="M72 108 C70 62 94 46 120 46 C146 46 170 62 168 108 Z"
        fill={TOY.teal}
        stroke={TOY.tealShade}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M92 60 C84 70 80 86 82 100"
        stroke={TOY.tealHi}
        strokeWidth={6}
        opacity={0.6}
        strokeLinecap="round"
        fill="none"
      />
      {/* cap brim */}
      <path
        d="M64 104 C40 104 30 114 42 120 C76 130 150 126 170 114 C176 110 172 104 164 104 C150 110 86 112 64 104 Z"
        fill={TOY.tealHi}
        stroke={TOY.tealShade}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* eyebrows */}
      <path d="M100 142 q7 -3 13 0" stroke={TOY.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M127 142 q6 -3 13 0" stroke={TOY.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      {/* eyes */}
      <ellipse cx={107} cy={151} rx={3.4} ry={4.6} fill={TOY.line} />
      <ellipse cx={133} cy={151} rx={3.4} ry={4.6} fill={TOY.line} />
      <circle cx={108} cy={149} r={1.1} fill="#fff" />
      <circle cx={134} cy={149} r={1.1} fill="#fff" />
      {/* mouth */}
      <path d="M108 162 Q120 173 132 162" stroke={TOY.line} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </svg>
  )
}
