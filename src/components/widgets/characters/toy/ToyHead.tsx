// The toy minifigure's capped head (cap + face), cropped to a tight square
// viewBox lifted from ToyFigure. Shared by widgets that need just the head —
// the Round Clock's orbiting figure and the Tic-Tac-Toe "toy" mark. The cap +
// face come from the shared ToyCapAndFace; only the smile mouth is added here.

import { TOY } from './toyPalette'
import { ToyCapAndFace } from './toyParts'

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
      <ToyCapAndFace />
      {/* mouth */}
      <path d="M108 162 Q120 173 132 162" stroke={TOY.line} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </svg>
  )
}
