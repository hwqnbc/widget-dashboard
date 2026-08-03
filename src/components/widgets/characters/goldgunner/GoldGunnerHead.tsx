// Gold Gunner's head: a yellow LEGO-minifig face — friendly smile, dark
// eyebrows, brown swept-back hair — split out of the full figure (same paths,
// cropped to a tight square viewBox around the head so it reads as a chip/mark).

import { GG } from './goldGunnerPalette'

/**
 * Just the head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function GoldGunnerHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="192 114 116 116"
      role="img"
      aria-label="Gold Gunner figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* head cylinder + top stud */}
      <rect x={230} y={142} width={40} height={10} rx={3} fill={GG.skinShade} />
      <rect x={210} y={150} width={80} height={80} rx={20} fill={GG.skin} />
      <path d="M 250 150 L 290 150 A20 20 0 0 1 290 230 L 250 230 Z" fill={GG.skinShade} opacity={0.3} />
      {/* eyebrows */}
      <path d="M 225 175 Q 235 170 243 176" fill="none" stroke={GG.line} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M 275 175 Q 265 170 257 176" fill="none" stroke={GG.line} strokeWidth={3.5} strokeLinecap="round" />
      {/* eyes + highlights */}
      <circle cx={235} cy={186} r={4.5} fill="#1a1a1a" />
      <circle cx={265} cy={186} r={4.5} fill="#1a1a1a" />
      <circle cx={233.5} cy={184.5} r={1.5} fill="#fff" />
      <circle cx={263.5} cy={184.5} r={1.5} fill="#fff" />
      {/* smile + dimple */}
      <path d="M 236 204 Q 250 216 264 204" fill="none" stroke={GG.line} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M 265 203 Q 268 206 267 209" fill="none" stroke={GG.line} strokeWidth={2} strokeLinecap="round" />
      {/* brown swept hair */}
      <path
        d="M 206 162 C 200 140, 215 120, 240 120 C 260 118, 285 125, 294 148 C 300 162, 295 178, 293 185 C 288 180, 285 172, 282 170 C 278 162, 270 160, 260 163 C 250 166, 240 158, 230 160 C 220 162, 215 172, 212 178 C 208 175, 207 168, 206 162 Z"
        fill={GG.hair}
      />
      <path d="M 218 145 Q 240 130 270 138" fill="none" stroke={GG.hairHi} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
      <path d="M 225 135 Q 255 125 280 135" fill="none" stroke={GG.hairMid} strokeWidth={3} strokeLinecap="round" />
      <path d="M 212 160 Q 230 148 250 152" fill="none" stroke={GG.hairHi} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
    </svg>
  )
}
