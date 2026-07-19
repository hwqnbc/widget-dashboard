import { Box, keyframes } from '@mui/material'
import { IM } from './imperiumPalette'

/**
 * The big translucent-orange energy blade on its black mount, in local coords:
 * the pistol grip is at (0,0); the barrel + broad blade extend to the LEFT (−x),
 * tip near (−112, 6). A small orange muzzle nub sits at the right (+x) end.
 */
function ClawWeapon() {
  return (
    <g strokeLinejoin="round">
      {/* orange muzzle nub (right end) */}
      <path d="M10 -6 L22 -3 L22 5 L10 8 Z" fill={IM.blade} opacity={0.85} stroke={IM.bladeEdge} strokeWidth={1} />
      {/* black barrel / mount */}
      <path d="M-92 -9 L12 -9 L16 9 L-92 9 Z" fill={IM.gun} stroke={IM.gunShade} strokeWidth={1.5} />
      <path d="M-92 -9 L12 -9" stroke={IM.gunHi} strokeWidth={1.4} opacity={0.7} />
      <circle cx={2} cy={0} r={4.5} fill={IM.gunShade} stroke={IM.steel} strokeWidth={1} />
      {/* pistol grip (down from origin) */}
      <path d="M-5 2 L7 2 L4 24 L-8 24 Z" fill={IM.gun} stroke={IM.gunShade} strokeWidth={1.5} />
      {/* broad translucent-orange blade — flat back on TOP, sharp cutting edge +
          point on the BOTTOM-left (as outlined) */}
      <path d="M-10 -26 L-114 -22 L-122 -2 L-104 8 L-12 10 Z" fill={IM.blade} opacity={0.62} stroke={IM.bladeEdge} strokeWidth={1.5} />
      {/* inner glow */}
      <path d="M-14 -21 L-108 -18 L-114 -4 L-16 3 Z" fill={IM.bladeHi} opacity={0.4} />
      <path d="M-16 -19 L-112 -15" stroke="#fff" strokeWidth={1} opacity={0.6} />
      {/* two square cut-outs near the top of the base */}
      <rect x={-46} y={-21} width={9} height={9} rx={1} fill={IM.gun} />
      <rect x={-31} y={-20} width={9} height={9} rx={1} fill={IM.gun} />
    </g>
  )
}

// The forearm + weapon slash diagonally, pivoting at the ELBOW — a wide chop whose
// tip sweeps from low (down-left) all the way up to face height (up-left). Bigger,
// higher arc than a wrist flick; the long blade still clears the viewBox at the top.
const LOW = -18
const HIGH = 48
const slash = keyframes`
  0%, 100% { transform: rotate(${LOW}deg); }
  50%      { transform: rotate(${HIGH}deg); }
`
const DUR = '0.7s'
const RELBOW = '168px 236px' // right elbow pivot

/**
 * "Imperium Claw General": a dark horned-helmet warlord — black armor + angular
 * pauldrons, a gold mechanical face with orange eyes, gold/black tech print, and a
 * big translucent-orange energy blade on a black mount held across the body.
 * `slashing` runs a diagonal blade slash pivoting at the elbow.
 */
export default function ClawFigure({ slashing = false }: { slashing?: boolean }) {
  const armSx = slashing ? { animation: `${slash} ${DUR} ease-in-out infinite` } : { transform: 'rotate(0deg)' }

  return (
    <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }} strokeLinejoin="miter">
      {/* ---- legs (black, orange circuit + tread) ---- */}
      <path d="M99 296 L118 296 L118 358 L99 358 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={2} />
      <path d="M122 296 L141 296 L141 358 L122 358 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={2} />
      <path d="M118 300 L118 356 M122 300 L122 356" stroke="#fff" strokeWidth={1.5} opacity={0.5} />
      <path d="M101 314 L116 314 M124 314 L139 314 M101 330 L116 330 M124 330 L139 330 M101 344 L116 344 M124 344 L139 344" stroke={IM.circuit} strokeWidth={1.6} opacity={0.85} />
      <path d="M103 306 L114 306 M126 306 L137 306" stroke={IM.armorHi} strokeWidth={2} opacity={0.6} />
      {/* boots */}
      <path d="M95 358 L120 358 L120 368 L95 368 Z" fill={IM.armorShade} stroke={IM.line} strokeWidth={1.5} />
      <path d="M120 358 L145 358 L145 368 L120 368 Z" fill={IM.armorShade} stroke={IM.line} strokeWidth={1.5} />

      {/* ---- torso (dark, gold tech print) ---- */}
      <path d="M84 196 L156 196 L164 296 L76 296 Z" fill={IM.torso} stroke={IM.armorShade} strokeWidth={2.5} />
      <path d="M120 196 L156 196 L164 296 L120 296 Z" fill="#000" opacity={0.18} />
      {/* gold chest print */}
      <path d="M120 210 C112 214 108 222 110 230 M120 210 C128 214 132 222 130 230" stroke={IM.gold} strokeWidth={2} fill="none" opacity={0.9} />
      <path d="M100 224 L112 232 M140 224 L128 232" stroke={IM.gold} strokeWidth={1.6} fill="none" opacity={0.8} />
      <path d="M110 244 L120 250 L130 244 L128 256 L120 262 L112 256 Z" fill={IM.gold} opacity={0.5} stroke={IM.goldShade} strokeWidth={1} />
      <path d="M120 250 L120 262" stroke={IM.circuit} strokeWidth={2} opacity={0.8} />
      <path d="M92 270 L148 270" stroke={IM.gold} strokeWidth={1.4} strokeDasharray="3 3" opacity={0.6} />

      {/* short dark neck (behind the head, meets the torso — no float) */}
      <path d="M110 182 L130 182 L130 200 L110 200 Z" fill={IM.torso} />

      {/* ---- head: horned black helmet (covers crown, sides + mouth) with a gold
             eye-band face + orange eyes; dropped so the helmet base meets the torso ---- */}
      <g transform="translate(0 24)">
        {/* short horns / antennae */}
        <path d="M98 92 L90 66 L100 78 L107 90 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.5} />
        <path d="M142 92 L150 66 L140 78 L133 90 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.5} />
        {/* helmet outer — covers crown, sides and the lower face (mouth/chin) */}
        <path d="M120 56 L98 70 L86 106 L92 146 L120 174 L148 146 L154 106 L142 70 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={2} />
        <path d="M120 56 L142 70 L154 106 L148 146 L120 174 Z" fill="#000" opacity={0.2} />
        <path d="M120 56 L104 66 L94 98" stroke={IM.armorEdge} strokeWidth={2} fill="none" opacity={0.7} />
        {/* gold eye-band face plate (only the eyes/upper cheeks show; mouth is covered) */}
        <path d="M101 116 L139 116 L140 136 L124 146 L116 146 L100 136 Z" fill={IM.face} stroke={IM.faceShade} strokeWidth={1.5} />
        <path d="M120 116 L139 116 L140 136 L124 146 L120 146 Z" fill={IM.faceShade} opacity={0.3} />
        <path d="M120 118 L120 145 M104 128 L114 132 M136 128 L126 132" stroke={IM.faceLine} strokeWidth={1.3} fill="none" opacity={0.8} />
        {/* black V-crest pointing down over the brow */}
        <path d="M101 114 L120 134 L139 114 L131 112 L120 126 L109 112 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.2} />
        {/* orange eyes — FOUR angular slits (upper + lower pairs) */}
        <path d="M103 123 L114 126 L113 130 L103 128 Z" fill={IM.eye} stroke={IM.bladeEdge} strokeWidth={0.7} />
        <path d="M137 123 L126 126 L127 130 L137 128 Z" fill={IM.eye} stroke={IM.bladeEdge} strokeWidth={0.7} />
        <path d="M106 134 L114 136 L113 140 L106 138 Z" fill={IM.eye} stroke={IM.bladeEdge} strokeWidth={0.7} />
        <path d="M134 134 L126 136 L127 140 L134 138 Z" fill={IM.eye} stroke={IM.bladeEdge} strokeWidth={0.7} />
        <path d="M104 125 L112 127 M136 125 L128 127" stroke={IM.eyeHi} strokeWidth={1} opacity={0.9} />
        {/* helmet mouth guard vent (orange slit on the black chin) */}
        <path d="M111 156 L129 156 L127 164 L113 164 Z" fill={IM.gunShade} />
        <path d="M113 159 L127 159" stroke={IM.eye} strokeWidth={1.6} opacity={0.85} />
      </g>

      {/* ---- subtle shoulders (no bladed pauldron — removed per reference) ---- */}
      <path d="M78 200 C68 202 64 210 66 220 L92 214 L90 198 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.6} />
      <path d="M162 200 C172 202 176 210 174 220 L148 214 L150 198 Z" fill={IM.armor} stroke={IM.armorShade} strokeWidth={1.6} />

      {/* ---- left arm (gold, resting on hip) ---- */}
      <path d="M84 220 C74 234 74 252 84 264" stroke={IM.gold} strokeWidth={15} strokeLinecap="round" fill="none" />
      <path d="M84 262 C92 268 98 268 104 264" stroke={IM.gold} strokeWidth={13} strokeLinecap="round" fill="none" />
      <circle cx={106} cy={264} r={7} fill={IM.armorShade} />

      {/* ---- right arm: upper arm (static) + forearm/weapon (slashing, pivots at elbow) ---- */}
      <path d="M152 208 L168 236" stroke={IM.gold} strokeWidth={15} strokeLinecap="round" fill="none" />
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: RELBOW, ...armSx }}>
        <path d="M168 236 L178 250" stroke={IM.gold} strokeWidth={13} strokeLinecap="round" fill="none" />
        {/* weapon at the grip, tilted so the blade points down-and-left */}
        <g transform="translate(178 250) rotate(-22)">
          <ClawWeapon />
        </g>
        {/* gripping hand (black gauntlet) */}
        <circle cx={178} cy={250} r={7.5} fill={IM.gunShade} stroke={IM.line} strokeWidth={1} />
      </Box>
    </svg>
  )
}
