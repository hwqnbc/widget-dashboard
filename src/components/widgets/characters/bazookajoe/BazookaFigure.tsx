import { Box, keyframes } from '@mui/material'
import { BJ } from './bazookaJoePalette'

/**
 * "Bazooka Joe": a cocky minifig gunner — black cap with visor, sunglasses,
 * smirk, dark tactical vest (chest pockets, pouch row, harness belt), cargo
 * legs — shouldering an RPG with a TRANSLUCENT red warhead. The body is a
 * faithful rebuild of the source art; the weapon carries the three flagged
 * fixes: the handgrip sits IN the right hand, the tube rides the right
 * shoulder with the warhead pointing up-forward (authored vertically in
 * local coords, tip at −y, then placed with a −30° tilt), and the red gem
 * sections are genuinely translucent (`fillOpacity` + glass highlights).
 *
 * `launching` runs the launch loop (~2.6 s): the launcher and firing arm
 * kick back along the tube axis with an orange backblast at the rear cone,
 * the warhead streaks up-forward along its axis (a local-coords translate —
 * it inherits the tube's tilt) and detonates in a fireball at the apex,
 * then quietly reappears on the tube before the loop restarts. All flash
 * elements keep base `opacity: 0` (lesson #74).
 */

const DUR = '2.6s'

// Launcher + firing arm: a sharp kick back down the tube axis on the shot.
const recoil = keyframes`
  0%, 8%, 20%, 100% { transform: translate(0px, 0px); }
  11%               { transform: translate(5px, 9px); }
`
// Backblast at the rear opening: a quick orange pop.
const backblast = keyframes`
  0%, 9%, 17%, 100% { opacity: 0; transform: scale(0.5); }
  11%               { opacity: 1; transform: scale(1.2); }
  14%               { opacity: 0.7; transform: scale(1.4); }
`
// The warhead's flight up the tube axis (local coords — parent is tilted).
const flight = keyframes`
  0%, 10%   { transform: translate(0px, 0px); opacity: 1; }
  24%       { transform: translate(0px, -110px); opacity: 1; }
  26%, 92%  { transform: translate(0px, -110px); opacity: 0; }
  96%, 100% { transform: translate(0px, 0px); opacity: 1; }
`
// The fireball at the flight apex.
const boom = keyframes`
  0%, 25%   { opacity: 0; transform: scale(0.3); }
  29%       { opacity: 1; transform: scale(1.3); }
  38%, 100% { opacity: 0; transform: scale(1.75); }
`

/** Orange fireball star (spiked burst + fire core + white heart). */
function FireStar({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M0 ${-r} L${r * 0.3} ${-r * 0.34} L${r} 0 L${r * 0.3} ${r * 0.34} L0 ${r} L${-r * 0.3} ${r * 0.34} L${-r} 0 L${-r * 0.3} ${-r * 0.34} Z`}
        fill={BJ.fire}
      />
      <circle r={r * 0.42} fill={BJ.fireCore} />
      <circle r={r * 0.2} fill="#fff" />
    </g>
  )
}

export default function BazookaFigure({ launching = false }: { launching?: boolean }) {
  const anim = (kf: ReturnType<typeof keyframes>, timing = 'ease-out') =>
    launching ? { animation: `${kf} ${DUR} ${timing} infinite` } : {}

  return (
    <svg viewBox="8 -40 362 553" width="100%" height="100%" style={{ overflow: 'visible' }} strokeLinejoin="round">
      <defs>
        <linearGradient id="bj-red" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={BJ.redHi} />
          <stop offset="40%" stopColor={BJ.red} />
          <stop offset="100%" stopColor={BJ.redDeep} />
        </linearGradient>
        <linearGradient id="bj-white" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor={BJ.white} />
          <stop offset="100%" stopColor={BJ.whiteShade} />
        </linearGradient>
        <linearGradient id="bj-black" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={BJ.plasticHi} />
          <stop offset="35%" stopColor={BJ.plastic} />
          <stop offset="100%" stopColor={BJ.plasticShade} />
        </linearGradient>
        <linearGradient id="bj-silver" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={BJ.silver} />
          <stop offset="50%" stopColor={BJ.silverHi} />
          <stop offset="100%" stopColor={BJ.silverShade} />
        </linearGradient>
        <linearGradient id="bj-skin" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={BJ.skin} />
          <stop offset="100%" stopColor={BJ.skinShade} />
        </linearGradient>
      </defs>

      {/* ---- legs: hips + belt buckle, cargo pockets, straps, boots ---- */}
      <g>
        <path d="M 195,350 L 305,350 L 302,375 L 198,375 Z" fill={BJ.hip} stroke={BJ.plasticShade} strokeWidth={2} />
        <rect x={200} y={352} width={100} height={6} rx={2} fill={BJ.hipLine} />
        <rect x={240} y={351} width={20} height={8} fill="url(#bj-silver)" rx={1} />
        <path d="M 198,377 L 247,377 L 247,490 L 190,490 L 190,470 L 198,470 Z" fill={BJ.legs} stroke={BJ.legLine} strokeWidth={2} />
        <path d="M 190,470 L 247,470 L 247,490 L 190,490 Z" fill={BJ.boot} />
        <rect x={202} y={385} width={40} height={25} rx={2} fill={BJ.hip} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.5} />
        <path d="M 202,385 L 242,385 L 237,393 L 207,393 Z" fill="#2d3136" stroke="#fff" strokeOpacity={0.4} strokeWidth={1} />
        <path d="M 202,418 L 242,418" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3,2" />
        <rect x={218} y={415} width={6} height={6} fill="url(#bj-silver)" />
        <path d="M 200,435 L 244,435 M 200,445 L 244,445" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x={204} y={432} width={34} height={16} fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={1.5} rx={2} />
        <circle cx={212} cy={440} r={1.5} fill="#fff" opacity={0.7} />
        <circle cx={230} cy={440} r={1.5} fill="#fff" opacity={0.7} />
        <path d="M 253,377 L 302,377 L 302,470 L 310,470 L 310,490 L 253,490 Z" fill={BJ.legs} stroke={BJ.legLine} strokeWidth={2} />
        <path d="M 253,470 L 310,470 L 310,490 L 253,490 Z" fill={BJ.boot} />
        <rect x={258} y={385} width={40} height={25} rx={2} fill={BJ.hip} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.5} />
        <path d="M 258,385 L 298,385 L 293,393 L 263,393 Z" fill="#2d3136" stroke="#fff" strokeOpacity={0.4} strokeWidth={1} />
        <path d="M 258,418 L 298,418" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="3,2" />
        <rect x={274} y={415} width={6} height={6} fill="url(#bj-silver)" />
        <path d="M 256,435 L 300,435 M 256,445 L 300,445" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.5} />
        <rect x={260} y={432} width={34} height={16} fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={1.5} rx={2} />
        <circle cx={268} cy={440} r={1.5} fill="#fff" opacity={0.7} />
        <circle cx={286} cy={440} r={1.5} fill="#fff" opacity={0.7} />
      </g>

      {/* ---- torso: vest, collar, zipper, chest pockets, pouch row, harness ---- */}
      <g>
        <path d="M 190,200 L 310,200 L 325,345 L 175,345 Z" fill={BJ.vestBase} stroke={BJ.plasticShade} strokeWidth={2} />
        <path d="M 188,200 L 312,200 L 323,342 L 177,342 Z" fill={BJ.vest} />
        <path d="M 225,200 L 250,225 L 275,200 Z" fill={BJ.neck} stroke={BJ.vestBase} strokeWidth={2} />
        <path d="M 220,200 L 250,232 L 280,200 L 305,200 L 318,290 L 182,290 L 195,200 Z" fill="none" stroke={BJ.vestSeam} strokeWidth={3} />
        <path d="M 250,230 L 250,340" stroke={BJ.plasticShade} strokeWidth={3} />
        <path d="M 250,230 L 250,340" stroke="url(#bj-silver)" strokeWidth={1} strokeDasharray="4,2" />
        <rect x={198} y={220} width={42} height={30} rx={2} fill={BJ.pocket} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.5} />
        <path d="M 198,220 L 240,220 L 235,228 L 203,228 Z" fill={BJ.pocketFlap} />
        <circle cx={219} cy={224} r={2} fill="url(#bj-silver)" />
        <path d="M 202,235 L 236,235" stroke="#fff" strokeOpacity={0.2} strokeWidth={1} />
        <rect x={260} y={220} width={42} height={30} rx={2} fill={BJ.pocket} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.5} />
        <path d="M 260,220 L 302,220 L 297,228 L 265,228 Z" fill={BJ.pocketFlap} />
        <circle cx={281} cy={224} r={2} fill="url(#bj-silver)" />
        <path d="M 264,235 L 298,235" stroke="#fff" strokeOpacity={0.2} strokeWidth={1} />
        {/* pouch row */}
        {[187, 218, 256, 287].map((px) => (
          <g key={px}>
            <rect x={px} y={260} width={26} height={38} rx={2} fill={BJ.pouch} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.2} />
            <rect x={px + 2} y={262} width={22} height={10} fill={BJ.pouchFlap} />
            <path d={`M ${px + 13},267 L ${px + 13},293`} stroke="url(#bj-silver)" strokeWidth={1.5} />
          </g>
        ))}
        {/* harness belt */}
        <rect x={180} y={308} width={140} height={32} fill={BJ.harness} stroke="#000" strokeWidth={1} />
        <path d="M 180,318 L 320,318 M 180,330 L 320,330" stroke="#fff" strokeOpacity={0.3} strokeWidth={2} strokeDasharray="8,5" />
        <rect x={210} y={313} width={12} height={18} fill="url(#bj-silver)" rx={1} />
        <rect x={278} y={313} width={12} height={18} fill="url(#bj-silver)" rx={1} />
      </g>

      {/* ---- left arm (viewer right, resting) ---- */}
      <g>
        <path d="M 310,200 L 340,215 L 355,275 L 330,290 L 315,235 L 310,200 Z" fill={BJ.vestBase} stroke={BJ.plasticShade} strokeWidth={2} />
        <path d="M 342,280 C 352,288 350,305 338,308 C 328,310 322,295 330,285 Z" fill="url(#bj-skin)" stroke={BJ.skinLine} strokeWidth={1.5} />
      </g>

      {/* ---- shouldered RPG + firing arm (kick back together on launch) ----
       * Weapon authored VERTICALLY (tip at −y, grip block on +x), placed so
       * the grip sits in the right hand and the tube tilts −30° over the
       * shoulder — warhead up-forward, rear cone down past the chest. */}
      <Box component="g" sx={{ transformBox: 'view-box', ...anim(recoil) }}>
        <g transform="translate(133 173) rotate(-30) scale(1.35)">
          {/* rear opening + rear cone (backblast end) */}
          <ellipse cx={0} cy={115} rx={13} ry={4.5} fill={BJ.harness} stroke="#000" strokeWidth={1} />
          <path d="M -13,115 L 13,115 L 9,92 L -9,92 Z" fill="url(#bj-black)" stroke="#000" strokeWidth={1.5} />
          {/* black tube */}
          <path d="M -9,92 L 9,92 L 7,52 L -7,52 Z" fill="url(#bj-black)" stroke="#000" strokeWidth={1.5} />
          {/* handgrip on the +x side — sits in the fist */}
          <rect x={6} y={58} width={13} height={26} rx={2} fill={BJ.harness} stroke="#000" strokeWidth={1.5} />
          {/* white ridged mid section + collar */}
          <path d="M -10,52 L 10,52 L 10,14 L -10,14 Z" fill="url(#bj-white)" stroke={BJ.whiteShade} strokeWidth={1.5} />
          <path d="M -10,42 L 10,42 M -10,22 L 10,22" stroke={BJ.silver} strokeWidth={2} />
          <rect x={-11} y={10} width={22} height={5} fill={BJ.white} stroke={BJ.whiteShade} strokeWidth={1} />
          {/* TRANSLUCENT red warhead — flies on launch (local-coords flight) */}
          <Box component="g" sx={anim(flight, 'ease-in')}>
            <rect x={-9} y={2} width={18} height={8} fill="url(#bj-red)" fillOpacity={0.62} stroke={BJ.redDeep} strokeWidth={1} />
            <path d="M -9,2 L 9,2 L 4,-28 L -4,-28 Z" fill="url(#bj-red)" fillOpacity={0.62} stroke={BJ.redEdge} strokeWidth={1.5} />
            <path d="M -4,-28 L 4,-28 L 3.5,-37 L -3.5,-37 Z" fill="url(#bj-red)" fillOpacity={0.7} stroke="#b30000" strokeWidth={1} />
            <ellipse cx={0} cy={-37} rx={3.5} ry={2} fill={BJ.redGlow} />
            {/* glass highlights */}
            <path d="M -5,-2 L -2.5,-26" stroke="#fff" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
            <path d="M -7,4 L -7,9" stroke="#fff" strokeOpacity={0.5} strokeWidth={1.5} />
          </Box>
        </g>
        {/* firing arm over the grip: shoulder wedge, raised forearm, fist */}
        <path d="M 190,200 L 158,212 L 150,262 L 172,268 L 185,228 Z" fill={BJ.vestBase} stroke={BJ.plasticShade} strokeWidth={2} />
        <path d="M 150,262 L 172,268 L 201,256 L 196,237 L 163,248 Z" fill={BJ.vestBase} stroke={BJ.plasticShade} strokeWidth={2} />
        <circle cx={197} cy={248} r={12} fill="url(#bj-skin)" stroke={BJ.skinLine} strokeWidth={1.5} />
        <path d="M 189,244 C 187,252 197,258 204,253" fill="none" stroke={BJ.skinLine} strokeWidth={2} />
      </Box>

      {/* ---- launch effects ---- */}
      {launching && (
        <>
          {/* backblast at the rear opening, blowing down-right */}
          <Box
            component="g"
            sx={{ opacity: 0, transformBox: 'view-box', transformOrigin: '224px 330px', animation: `${backblast} ${DUR} ease-out infinite` }}
          >
            <FireStar x={224} y={330} r={22} />
            <circle cx={240} cy={343} r={7} fill={BJ.fire} opacity={0.7} />
            <circle cx={251} cy={352} r={4.5} fill={BJ.fire} opacity={0.5} />
          </Box>
          {/* fireball at the warhead's apex */}
          <Box
            component="g"
            sx={{ opacity: 0, transformBox: 'view-box', transformOrigin: '48px 25px', animation: `${boom} ${DUR} ease-out infinite` }}
          >
            <FireStar x={48} y={25} r={42} />
            <circle cx={72} cy={43} r={9} fill={BJ.fire} opacity={0.6} />
            <circle cx={26} cy={47} r={7} fill={BJ.fire} opacity={0.5} />
          </Box>
        </>
      )}

      {/* ---- head: neck pin, head block, smirk, sunglasses, cap ---- */}
      <g>
        <rect x={238} y={188} width={24} height={14} fill={BJ.skinShade} stroke="#b58447" strokeWidth={1} />
        <rect x={212} y={100} width={76} height={92} rx={20} fill="url(#bj-skin)" stroke={BJ.skinLine} strokeWidth={2} />
        <path d="M 235,165 Q 248,162 262,158" fill="none" stroke={BJ.smirk} strokeWidth={3} strokeLinecap="round" />
        <path d="M 262,158 Q 268,154 266,163" fill="none" stroke={BJ.smirk} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M 255,167 Q 260,166 263,164" fill="none" stroke={BJ.dimple} strokeWidth={1.5} />
        {/* sunglasses */}
        <path d="M 214,124 L 286,124 L 282,143 C 280,148 260,152 253,143 L 247,143 C 240,152 220,148 218,143 Z" fill={BJ.lens} stroke={BJ.lensFrame} strokeWidth={2} />
        <polygon points="220,127 240,127 232,144 220,140" fill="#ffffff" opacity={0.25} />
        <polygon points="224,127 230,127 225,138 221,138" fill="#ffffff" opacity={0.4} />
        <polygon points="256,127 276,127 272,140 260,144" fill="#ffffff" opacity={0.25} />
        <polygon points="260,127 266,127 263,138 259,138" fill="#ffffff" opacity={0.4} />
        <rect x={247} y={125} width={6} height={3} fill={BJ.plasticHi} />
        {/* cap: crown, band, visor */}
        <path d="M 208,108 C 206,75 220,68 250,68 C 280,68 294,75 292,108 Z" fill="url(#bj-black)" stroke={BJ.plasticShade} strokeWidth={2} />
        <path d="M 206,105 L 294,105 L 294,115 L 206,115 Z" fill={BJ.capBand} />
        <path d="M 200,112 C 210,112 240,120 250,120 C 260,120 290,112 300,112 C 304,118 290,127 250,128 C 210,127 196,118 200,112 Z" fill={BJ.visor} stroke={BJ.visorEdge} strokeWidth={1.5} />
        <path d="M 202,115 C 220,121 250,124 288,115" fill="none" stroke={BJ.visorHi} strokeWidth={1.5} opacity={0.6} />
      </g>
    </svg>
  )
}
