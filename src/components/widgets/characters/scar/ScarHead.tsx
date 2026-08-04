// Scar's head: the tactical helmet (NVG mount, ARC rails, morale patches,
// comms earmuffs + mic boom) over the scarred, stubbled, scowling face —
// split out of the full figure and cropped to a tight square viewBox so it
// reads as a chip/mark. Strokes a touch heavier for chip legibility.

import { SC } from './scarPalette'

/**
 * Just the head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function ScarHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="215 28 172 172"
      role="img"
      aria-label="Scar figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* jaw + ears + stubble */}
      <polygon points="238,100 238,145 262,192 338,192 362,145 362,100" fill={SC.skinHi} />
      <polygon points="300,100 362,100 362,145 338,192 300,192" fill={SC.skinShade} opacity={0.45} />
      <path d="M 238 115 C 228 115, 228 140, 238 145 Z" fill={SC.skinShade} />
      <path d="M 362 115 C 372 115, 372 140, 362 145 Z" fill={SC.skinShade} />
      <path d="M 238 138 L 262 192 L 338 192 L 362 138 C 362 175, 330 198, 300 198 C 270 198, 238 175, 238 138 Z" fill={SC.stubble} opacity={0.35} />
      {/* nose + scowl */}
      <polygon points="300,110 292,148 300,152 308,148" fill={SC.nose} />
      <path d="M 292 148 C 292 155, 308 155, 308 148" fill="none" stroke={SC.crease} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M 268 174 Q 282 168, 300 171 T 332 166" fill="none" stroke={SC.lineDeep} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M 282 180 Q 300 184, 318 180" fill="none" stroke={SC.lip} strokeWidth={2.2} strokeLinecap="round" />
      {/* eyes + heavy brows + glabella lines */}
      <path d="M 258 120 Q 272 114, 286 121 Q 272 128, 258 120 Z" fill={SC.eyeWhite} />
      <circle cx={273} cy={120} r={4.5} fill={SC.iris} />
      <circle cx={273} cy={120} r={2} fill="#000" />
      <path d="M 314 121 Q 328 114, 342 120 Q 328 128, 314 121 Z" fill={SC.eyeWhite} />
      <circle cx={327} cy={120} r={4.5} fill={SC.iris} />
      <circle cx={327} cy={120} r={2} fill="#000" />
      <path d="M 255 118 Q 272 112, 289 119 M 311 119 Q 328 112, 345 118" fill="none" stroke={SC.lidLine} strokeWidth={2.5} />
      <polygon points="248,113 292,120 290,108 250,102" fill={SC.brow} />
      <polygon points="352,113 308,120 310,108 350,102" fill={SC.brow} />
      <path d="M 297 112 L 297 124 M 303 112 L 303 124" stroke={SC.lineDeep} strokeWidth={2} />
      {/* stitched scar + cheek slash */}
      <path d="M 315 85 L 328 115 L 335 148 L 340 165" fill="none" stroke={SC.scar} strokeWidth={4} strokeLinecap="round" opacity={0.9} />
      <path d="M 316 85 L 329 115 L 336 148 L 341 165" fill="none" stroke={SC.scarHi} strokeWidth={1.4} strokeLinecap="round" opacity={0.75} />
      <path d="M 320 98 L 327 95 M 325 110 L 332 107 M 330 130 L 337 127 M 334 145 L 341 142" stroke={SC.stitch} strokeWidth={2.2} />
      <path d="M 250 145 L 278 160" fill="none" stroke={SC.scar} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      {/* helmet: dome, rim, NVG mount, rails, patches, earmuffs, mic boom */}
      <path d="M 225 105 C 220 30, 380 30, 375 105 Z" fill={SC.helmet} stroke="#0a0b0d" strokeWidth={2.2} />
      <path d="M 220 100 C 260 88, 340 88, 380 100 L 382 108 C 340 95, 260 95, 218 108 Z" fill={SC.helmetRim} />
      <rect x={282} y={55} width={36} height={38} rx={3} fill={SC.mount} stroke="#0a0b0d" strokeWidth={2} />
      <rect x={290} y={62} width={20} height={24} rx={2} fill={SC.mountDark} />
      <circle cx={300} cy={74} r={5} fill={SC.lens} />
      <path d="M 226 78 L 255 75 L 258 92 L 228 95 Z" fill={SC.mount} stroke="#0a0b0d" strokeWidth={1.5} />
      <path d="M 374 78 L 345 75 L 342 92 L 372 95 Z" fill={SC.mount} stroke="#0a0b0d" strokeWidth={1.5} />
      <polygon points="245,48 270,45 268,62 243,65" fill={SC.mountDark} stroke={SC.patchEdge} strokeWidth={1} />
      <polygon points="355,48 330,45 332,62 357,65" fill={SC.mountDark} stroke={SC.patchEdge} strokeWidth={1} />
      <rect x={222} y={112} width={16} height={28} rx={4} fill="#0d0e11" stroke={SC.patchEdge} strokeWidth={1.5} />
      <rect x={362} y={112} width={16} height={28} rx={4} fill="#0d0e11" stroke={SC.patchEdge} strokeWidth={1.5} />
      <path d="M 368 132 C 370 160, 330 172, 290 170" fill="none" stroke="#000" strokeWidth={4.5} strokeLinecap="round" />
      <path d="M 368 132 C 370 160, 330 172, 290 170" fill="none" stroke={SC.padEdge} strokeWidth={2} strokeLinecap="round" />
      <rect x={280} y={163} width={14} height={10} rx={3} fill={SC.rail} stroke="#000" strokeWidth={1.5} />
    </svg>
  )
}
