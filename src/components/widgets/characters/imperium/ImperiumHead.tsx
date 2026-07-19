// Imperium Claw General's head: short-horned black helmet that covers the mouth,
// with a gold eye-band face and orange eyes. Cropped to a tight square viewBox;
// strokes a touch heavier for chip legibility.

import { IM } from './imperiumPalette'

/**
 * Just the head. `size` sets the svg width/height — pass a number for a fixed
 * pixel size or leave the default `'100%'` to fill the parent.
 */
export default function ImperiumHead({ size = '100%' }: { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="56 54 128 128"
      role="img"
      aria-label="Imperium Claw General figure"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* short horns */}
      <path d="M98 92 L90 66 L100 78 L107 90 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.8} />
      <path d="M142 92 L150 66 L140 78 L133 90 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.8} />
      {/* helmet outer (covers crown, sides + mouth) */}
      <path d="M120 56 L98 70 L86 106 L92 146 L120 174 L148 146 L154 106 L142 70 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={2.2} />
      <path d="M120 56 L142 70 L154 106 L148 146 L120 174 Z" fill="#000" opacity={0.2} />
      <path d="M120 56 L104 66 L94 98" stroke={IM.armorEdge} strokeWidth={2} fill="none" opacity={0.7} />
      {/* gold eye-band face */}
      <path d="M101 116 L139 116 L140 136 L124 146 L116 146 L100 136 Z" fill={IM.face} stroke={IM.faceShade} strokeWidth={1.8} />
      <path d="M120 116 L139 116 L140 136 L124 146 L120 146 Z" fill={IM.faceShade} opacity={0.3} />
      <path d="M120 118 L120 145 M104 128 L114 132 M136 128 L126 132" stroke={IM.faceLine} strokeWidth={1.5} fill="none" opacity={0.8} />
      {/* black V-crest */}
      <path d="M101 114 L120 134 L139 114 L131 112 L120 126 L109 112 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.4} />
      {/* orange eyes */}
      <path d="M104 126 L117 130 L116 135 L104 132 Z" fill={IM.eye} stroke={IM.bladeEdge} strokeWidth={1} />
      <path d="M136 126 L123 130 L124 135 L136 132 Z" fill={IM.eye} stroke={IM.bladeEdge} strokeWidth={1} />
      <path d="M106 128 L114 131 M134 128 L126 131" stroke={IM.eyeHi} strokeWidth={1.4} opacity={0.9} />
      {/* mouth-guard vent */}
      <path d="M111 156 L129 156 L127 164 L113 164 Z" fill={IM.gunShade} />
      <path d="M113 159 L127 159" stroke={IM.eye} strokeWidth={1.8} opacity={0.85} />
    </svg>
  )
}
