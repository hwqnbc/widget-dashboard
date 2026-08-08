// Lloyd's head: lime head block under the spiked green helmet crown with the
// gold diamond gem, black visor band with fierce yellow serpent eyes, side
// mask straps, and the green lower face mask. Cropped to a tight square
// viewBox; flat fills stand in for the figure's gradients at chip size.

import { LL } from './lloydPalette'

/**
 * Just the head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function LloydHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="150 45 200 200"
      role="img"
      aria-label="Lloyd figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* lime head block + black visor band */}
      <rect x={200} y={125} width={100} height={85} rx={25} fill={LL.lime} />
      <polygon points="190,130 310,130 300,185 200,185" fill={LL.black} />

      {/* side mask straps (mirrored pair) */}
      <g transform="translate(250 155)">
        <path d="M -50,-20 C -70,-30 -85,-10 -75,10 C -65,30 -55,10 -50,5 Z" fill={LL.green} stroke={LL.line} strokeWidth={1} />
        <path d="M -50,5 C -60,15 -70,10 -70,0 C -70,-10 -60,-15 -50,-20 Z" fill={LL.lime} stroke={LL.line} strokeWidth={1} />
        <g transform="scale(-1 1)">
          <path d="M -50,-20 C -70,-30 -85,-10 -75,10 C -65,30 -55,10 -50,5 Z" fill={LL.green} stroke={LL.line} strokeWidth={1} />
          <path d="M -50,5 C -60,15 -70,10 -70,0 C -70,-10 -60,-15 -50,-20 Z" fill={LL.lime} stroke={LL.line} strokeWidth={1} />
        </g>
      </g>

      {/* fierce serpent eyes: white sclera, yellow iris, black pupil + brow */}
      <path d="M 210,155 Q 230,135 245,155 Q 230,165 210,155 Z" fill={LL.eyeWhite} />
      <path d="M 213,155 Q 230,138 242,155 Q 230,163 213,155 Z" fill={LL.eyeYellow} />
      <polygon points="215,152 240,152 232,158 220,156" fill="#000" />
      <path d="M 208,145 L 246,152 L 244,148 L 210,140 Z" fill="#000" />
      <path d="M 290,155 Q 270,135 255,155 Q 270,165 290,155 Z" fill={LL.eyeWhite} />
      <path d="M 287,155 Q 270,138 258,155 Q 270,163 287,155 Z" fill={LL.eyeYellow} />
      <polygon points="285,152 260,152 268,158 280,156" fill="#000" />
      <path d="M 292,145 L 254,152 L 256,148 L 290,140 Z" fill="#000" />

      {/* lower face mask */}
      <path d="M 195,165 L 250,185 L 305,165 L 310,210 C 310,230 280,245 250,245 C 220,245 190,230 190,210 Z" fill={LL.mid} stroke={LL.line} strokeWidth={2.5} />
      <path d="M 210,172 L 250,190 L 290,172 L 295,200 C 295,200 270,220 250,220 C 230,220 205,200 205,200 Z" fill={LL.lime} />

      {/* helmet crown with side spikes, centre blade + gold diamond gem */}
      <path d="M 180,140 C 170,100 200,70 210,65 C 210,65 220,85 230,85 C 240,85 245,50 250,45 C 255,50 260,85 270,85 C 280,85 290,65 290,65 C 300,70 330,100 320,140 C 300,125 280,135 250,120 C 220,135 200,125 180,140 Z" fill={LL.lime} stroke={LL.line} strokeWidth={3} />
      <path d="M 250,45 L 258,90 L 250,120 L 242,90 Z" fill={LL.limeHi} stroke={LL.line} strokeWidth={1.5} />
      <path d="M 210,65 L 230,95 L 205,125 Z" fill={LL.green} stroke={LL.line} strokeWidth={1.5} />
      <path d="M 290,65 L 270,95 L 295,125 Z" fill="#8CE019" stroke={LL.line} strokeWidth={1.5} />
      <path d="M 235,100 L 250,85 L 265,100 L 250,115 Z" fill={LL.gold} stroke={LL.goldLine} strokeWidth={1.5} />
    </svg>
  )
}
