// Jet Trooper's head: peach minifig face (raised brows, glossy eyes, easy
// smirk with a brow nick), brown cap with the tan visor band, and the white
// headset earguards with dark speaker discs. Cropped to a tight square
// viewBox; strokes as in the source art for chip legibility.

import { JT } from './jetTrooperPalette'

/**
 * Just the head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function JetTrooperHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="292 135 196 196"
      role="img"
      aria-label="Jet Trooper figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* head cylinder */}
      <rect x={345} y={195} width={90} height={120} rx={28} fill={JT.face} stroke={JT.line} strokeWidth={3} />
      {/* eyebrows */}
      <path d="M 360 232 Q 375 224 388 234" fill="none" stroke={JT.faceLine} strokeWidth={4.5} strokeLinecap="round" />
      <path d="M 402 234 Q 415 224 430 232" fill="none" stroke={JT.faceLine} strokeWidth={4.5} strokeLinecap="round" />
      {/* minifig eyes */}
      <ellipse cx={373} cy={248} rx={6.5} ry={9} fill="#1a130e" />
      <circle cx={371} cy={245} r={2.5} fill="#fff" />
      <ellipse cx={417} cy={248} rx={6.5} ry={9} fill="#1a130e" />
      <circle cx={415} cy={245} r={2.5} fill="#fff" />
      {/* brow mark + mouth */}
      <path d="M 388 222 L 392 216" stroke={JT.faceShade} strokeWidth={3} strokeLinecap="round" />
      <path d="M 378 282 Q 395 288 410 282" fill="none" stroke={JT.faceLine} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M 385 292 Q 395 295 403 292" fill="none" stroke={JT.faceLine} strokeWidth={2} strokeLinecap="round" />
      {/* cap + visor rim */}
      <path d="M 338 200 C 335 140, 445 140, 442 200 Z" fill={JT.cap} stroke={JT.capLine} strokeWidth={3} />
      <path d="M 336 195 C 365 180, 415 180, 444 195 L 442 208 C 415 192, 365 192, 338 208 Z" fill={JT.capBand} stroke={JT.capLine} strokeWidth={2} />
      {/* white headset earguards with speaker discs */}
      <path d="M 338 185 L 305 205 L 300 295 L 335 305 L 352 260 L 340 250 L 348 205 Z" fill={JT.guard} stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={322} cy={250} r={11} fill={JT.guardDisc} stroke="#1a1c1e" strokeWidth={2} />
      <circle cx={322} cy={250} r={5} fill={JT.silver} />
      <path d="M 310 285 L 328 285" stroke="#a0a5bd" strokeWidth={3} strokeLinecap="round" />
      <path d="M 442 185 L 475 205 L 480 295 L 445 305 L 428 260 L 440 250 L 432 205 Z" fill={JT.guard} stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={458} cy={250} r={11} fill={JT.guardDisc} stroke="#1a1c1e" strokeWidth={2} />
      <circle cx={458} cy={250} r={5} fill={JT.silver} />
    </svg>
  )
}
