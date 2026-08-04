import { Box, keyframes } from '@mui/material'
import { SC } from './scarPalette'

/**
 * "Scar": a grizzled special-forces soldier — tactical helmet with NVG mount +
 * comms headset/mic boom, stitched scar down the right cheek + slash on the
 * left, stubble and a fierce scowl, slim MOLLE vest with mag pouches and a
 * SPECIAL patch, suppressed SMG carried across the chest in the right hand,
 * red-banded flashbang canister in the left. Coordinates come straight from
 * the source art (a 600×700 board); the viewBox is cropped to the character
 * (wide enough on the right for the flashbang's flight).
 *
 * `assaulting` runs the breach loop (~2.4 s): the left arm winds up and lobs
 * the canister up-and-away — it spins along an arc and detonates in a white
 * flash burst — then the SMG lays covering fire: three quick recoil kicks,
 * each with a muzzle flash at the suppressor and a tracer streak up-right.
 * Every flash element keeps base `opacity: 0` so it stays dark outside its
 * keyframe window (lesson #74).
 */

const DUR = '2.4s'

// Left arm: wind back, then swing up-forward on the throw, settle home.
const armSwing = keyframes`
  0%, 88%, 100% { transform: rotate(0deg); }
  8%            { transform: rotate(9deg); }
  22%           { transform: rotate(-24deg); }
  40%           { transform: rotate(-6deg); }
`
// Canister: dip on the windup, arc up-right spinning, vanish at the burst,
// reappear in the hand just before the loop restarts.
const canisterFly = keyframes`
  0%       { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
  8%       { transform: translate(-4px, 10px) rotate(-12deg); opacity: 1; }
  25%      { transform: translate(62px, -180px) rotate(300deg); opacity: 1; }
  27%, 94% { transform: translate(62px, -180px) rotate(300deg); opacity: 0; }
  96%, 100% { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
`
// The flashbang detonation at the arc's apex.
const burst = keyframes`
  0%, 24%   { opacity: 0; transform: scale(0.3); }
  27%       { opacity: 1; transform: scale(1.35); }
  34%, 100% { opacity: 0; transform: scale(1.7); }
`
// SMG recoil: three quick kicks back along the barrel during covering fire.
const recoil = keyframes`
  0%, 42%, 48%, 57%, 63%, 72%, 78%, 100% { transform: translate(0px, 0px); }
  45%, 60%, 75%                          { transform: translate(-7px, 5px); }
`
// Muzzle flash pops synced to each kick.
const muzzle = keyframes`
  0%, 43%, 49%, 58%, 64%, 73%, 79%, 100% { opacity: 0; }
  45%, 60%, 75%                          { opacity: 1; }
`
// Tracer streak: flies up-right from the suppressor after each shot.
const tracer = keyframes`
  0%, 44%  { transform: translate(0px, 0px); opacity: 0; }
  45%      { transform: translate(0px, 0px); opacity: 1; }
  52%      { transform: translate(85px, -70px); opacity: 0; }
  59%      { transform: translate(0px, 0px); opacity: 0; }
  60%      { transform: translate(0px, 0px); opacity: 1; }
  67%      { transform: translate(85px, -70px); opacity: 0; }
  74%      { transform: translate(0px, 0px); opacity: 0; }
  75%      { transform: translate(0px, 0px); opacity: 1; }
  82%      { transform: translate(85px, -70px); opacity: 0; }
  83%, 100% { transform: translate(0px, 0px); opacity: 0; }
`

/** White starburst (flash core + crossed spikes) centred on (x,y). */
function FlashStar({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M0 ${-r} L${r * 0.28} ${-r * 0.32} L${r} 0 L${r * 0.28} ${r * 0.32} L0 ${r} L${-r * 0.28} ${r * 0.32} L${-r} 0 L${-r * 0.28} ${-r * 0.32} Z`}
        fill={SC.flash}
      />
      <circle r={r * 0.34} fill={SC.flashCore} />
      <circle r={r * 0.17} fill="#fff" />
    </g>
  )
}

export default function SoldierFigure({ assaulting = false }: { assaulting?: boolean }) {
  const anim = (kf: ReturnType<typeof keyframes>, extra = 'ease-in-out') =>
    assaulting ? { animation: `${kf} ${DUR} ${extra} infinite` } : {}

  return (
    <svg viewBox="90 25 430 630" width="100%" height="100%" style={{ overflow: 'visible' }} strokeLinejoin="round">
      <defs>
        <linearGradient id="sc-vest" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={SC.vestHi} />
          <stop offset="50%" stopColor={SC.vest} />
          <stop offset="100%" stopColor={SC.vestShade} />
        </linearGradient>
        <linearGradient id="sc-gun" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={SC.gunHi} />
          <stop offset="30%" stopColor={SC.gun} />
          <stop offset="100%" stopColor={SC.gunShade} />
        </linearGradient>
        <linearGradient id="sc-skin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={SC.skinHi} />
          <stop offset="100%" stopColor={SC.skinShade} />
        </linearGradient>
        <linearGradient id="sc-red" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={SC.red} />
          <stop offset="100%" stopColor={SC.redDeep} />
        </linearGradient>
      </defs>

      {/* ---- legs: lean stance, knee pads + straps, thigh holster ---- */}
      <g>
        <path d="M 230 460 L 285 460 L 275 640 L 215 640 Z" fill={SC.legs} />
        <path d="M 315 460 L 370 460 L 385 640 L 325 640 Z" fill={SC.legs} />
        <path d="M 285 460 L 300 530 L 315 460 Z" fill={SC.legShade} />
        <polygon points="230,520 275,520 270,565 225,565" fill={SC.pad} stroke={SC.padEdge} strokeWidth={2} />
        <polygon points="325,520 370,520 375,565 330,565" fill={SC.pad} stroke={SC.padEdge} strokeWidth={2} />
        <path d="M 225 530 L 280 530 M 222 555 L 272 555 M 320 530 L 372 530 M 323 555 L 378 555" stroke={SC.strap} strokeWidth={3} />
        <rect x={325} y={480} width={45} height={12} fill={SC.pad} rx={2} />
        <path d="M 320 486 L 372 486" stroke="#252a33" strokeWidth={2} />
      </g>

      {/* ---- left arm (swings on the throw) + gloved hand ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: '392px 248px', ...anim(armSwing) }}>
        <path d="M 370 230 L 435 270 L 415 390 L 375 370 Z" fill={SC.sleeve} />
        <path d="M 400 320 L 430 325 L 415 395 L 388 385 Z" fill={SC.vestShade} stroke="#2a303a" strokeWidth={1.5} />
        <circle cx={400} cy={405} r={14} fill="#1c2026" />
        <path d="M 390 395 C 385 410, 405 420, 412 405" fill="none" stroke={SC.gunShade} strokeWidth={4} />
      </Box>

      {/* ---- flashbang canister (flies on the toss) ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', transformOrigin: '404px 405px', ...anim(canisterFly, 'ease-out') }}>
        <g transform="translate(390 370) rotate(-10)">
          <rect x={0} y={20} width={28} height={50} rx={4} fill="url(#sc-gun)" stroke="#000" strokeWidth={1.5} />
          <rect x={1} y={56} width={26} height={12} rx={2} fill="url(#sc-red)" />
          <rect x={8} y={10} width={12} height={10} fill="#2a303a" />
          <path d="M 14 2 L 14 10 M 8 5 L 20 5" stroke={SC.steel} strokeWidth={2} />
          <circle cx={5} cy={8} r={4} fill="none" stroke={SC.ring} strokeWidth={1.5} />
        </g>
      </Box>

      {/* ---- flashbang burst at the arc's apex ---- */}
      {assaulting && (
        <Box component="g" sx={{ opacity: 0, transformBox: 'view-box', transformOrigin: '468px 228px', animation: `${burst} ${DUR} ease-out infinite` }}>
          <FlashStar x={468} y={228} r={34} />
        </Box>
      )}

      {/* ---- torso: base shirt, armor vest, collar, MOLLE, patch, pouches, belt ---- */}
      <g>
        <path d="M 200 220 L 300 200 L 400 220 L 380 460 L 220 460 Z" fill={SC.shirt} />
        <path d="M 220 220 L 380 220 L 365 350 L 350 450 L 250 450 L 235 350 Z" fill="url(#sc-vest)" stroke="#0d0e11" strokeWidth={2} />
        <path d="M 240 215 C 240 230, 360 230, 360 215 L 375 195 L 225 195 Z" fill="#111317" stroke={SC.strap} strokeWidth={2} />
        <g stroke="#0c0e10" strokeWidth={2.5}>
          <path d="M 240 260 L 360 260 M 242 285 L 358 285 M 245 310 L 355 310 M 248 335 L 352 335 M 250 380 L 350 380 M 252 410 L 348 410" />
        </g>
        <g stroke={SC.stitchLine} strokeWidth={1} strokeDasharray="3,4" opacity={0.6}>
          <path d="M 260 255 L 260 340 M 280 255 L 280 340 M 300 255 L 300 340 M 320 255 L 320 340 M 340 255 L 340 340" />
        </g>
        <rect x={260} y={230} width={80} height={20} rx={2} fill={SC.gunShade} stroke={SC.patchEdge} strokeWidth={1} />
        <text x={300} y={244} fontFamily="Impact, Arial Black, sans-serif" fontSize={11} fill="#b0b8c2" textAnchor="middle" letterSpacing={2}>
          SPECIAL
        </text>
        {/* triple mag pouches */}
        <rect x={255} y={340} width={26} height={65} rx={3} fill={SC.pouch} stroke="#0a0b0d" strokeWidth={2} />
        <rect x={253} y={338} width={30} height={16} rx={2} fill={SC.vestShade} />
        <path d="M 268 354 L 268 400" stroke={SC.strap} strokeWidth={2} />
        <rect x={287} y={340} width={26} height={65} rx={3} fill={SC.pouch} stroke="#0a0b0d" strokeWidth={2} />
        <rect x={285} y={338} width={30} height={16} rx={2} fill={SC.vestShade} />
        <path d="M 300 354 L 300 400" stroke={SC.strap} strokeWidth={2} />
        <rect x={319} y={340} width={26} height={65} rx={3} fill={SC.pouch} stroke="#0a0b0d" strokeWidth={2} />
        <rect x={317} y={338} width={30} height={16} rx={2} fill={SC.vestShade} />
        <path d="M 332 354 L 332 400" stroke={SC.strap} strokeWidth={2} />
        {/* side utility pouches, belt + buckle */}
        <rect x={228} y={350} width={22} height={50} rx={2} fill="#14171d" stroke={SC.strap} strokeWidth={1.5} />
        <rect x={350} y={350} width={22} height={50} rx={2} fill="#14171d" stroke={SC.strap} strokeWidth={1.5} />
        <rect x={215} y={445} width={170} height={24} fill="#0a0b0d" />
        <rect x={215} y={449} width={170} height={3} fill={SC.magLine} />
        <rect x={282} y={440} width={36} height={34} rx={3} fill="#252a33" stroke="#000" strokeWidth={2} />
        <rect x={293} y={448} width={14} height={18} fill={SC.pad} />
      </g>

      {/* ---- right arm + suppressed SMG (kicks during covering fire) ---- */}
      <Box component="g" sx={{ transformBox: 'view-box', ...anim(recoil, 'ease-out') }}>
        <path d="M 230 230 L 165 270 L 185 380 L 225 360 Z" fill={SC.sleeve} />
        <path d="M 200 320 L 170 325 L 185 395 L 212 385 Z" fill={SC.vestShade} stroke="#2a303a" strokeWidth={1.5} />
        <circle cx={170} cy={385} r={13} fill="#1c2026" />
        <g transform="translate(40 270) rotate(-15)">
          {/* collapsed stock */}
          <rect x={40} y={98} width={50} height={8} rx={2} fill="#111317" />
          <rect x={35} y={93} width={10} height={18} rx={2} fill="#1c2026" />
          {/* receiver + top rail with slots */}
          <rect x={85} y={85} width={110} height={32} rx={3} fill="url(#sc-gun)" stroke="#000" strokeWidth={1.5} />
          <rect x={75} y={79} width={140} height={7} fill={SC.rail} />
          <path
            d="M 80 79 L 80 86 M 90 79 L 90 86 M 100 79 L 100 86 M 110 79 L 110 86 M 120 79 L 120 86 M 130 79 L 130 86 M 140 79 L 140 86 M 150 79 L 150 86 M 160 79 L 160 86 M 170 79 L 170 86 M 180 79 L 180 86 M 190 79 L 190 86"
            stroke={SC.railSlot}
            strokeWidth={2}
          />
          {/* holo sight with the red lens */}
          <rect x={110} y={62} width={40} height={17} rx={2} fill={SC.helmet} stroke="#000" strokeWidth={1} />
          <circle cx={120} cy={70} r={5} fill="#2d3542" />
          <circle cx={140} cy={70} r={4} fill={SC.redDeep} />
          {/* barrel + ridged suppressor */}
          <rect x={195} y={92} width={35} height={10} fill={SC.rail} />
          <rect x={230} y={88} width={40} height={18} rx={3} fill="url(#sc-gun)" stroke="#000" strokeWidth={1.5} />
          <path d="M 240 88 L 240 106 M 250 88 L 250 106 M 260 88 L 260 106" stroke="#0a0b0d" strokeWidth={2} />
          {/* curved mag, foregrip, pistol grip + trigger guard */}
          <path d="M 140 117 L 165 117 L 155 185 L 132 182 Z" fill={SC.gripDark} stroke="#000" strokeWidth={1.5} />
          <path d="M 142 130 L 161 130 M 139 150 L 157 150" stroke={SC.magLine} strokeWidth={2} />
          <path d="M 180 117 L 200 117 L 190 150 L 175 145 Z" fill={SC.gripDark} stroke="#000" strokeWidth={1.5} />
          <path d="M 105 117 L 122 117 L 112 160 L 93 155 Z" fill={SC.gripDark} />
          <path d="M 122 117 C 135 117, 135 132, 122 132" fill="none" stroke={SC.gripDark} strokeWidth={3} />
        </g>
      </Box>

      {/* ---- covering-fire effects: muzzle flash + tracer streaks up-right ---- */}
      {assaulting && (
        <>
          <Box component="g" sx={{ opacity: 0, animation: `${muzzle} ${DUR} ease-out infinite` }}>
            <FlashStar x={330} y={289} r={20} />
          </Box>
          <Box component="g" sx={{ opacity: 0, transformBox: 'view-box', animation: `${tracer} ${DUR} linear infinite` }}>
            <path d="M 338 282 L 366 259" stroke={SC.flashCore} strokeWidth={4} strokeLinecap="round" />
            <path d="M 344 277 L 360 264" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
          </Box>
        </>
      )}

      {/* ---- head: neck, jaw, stubble, scowl, eyes, scars, helmet + headset ---- */}
      <g>
        <path d="M 260 170 L 340 170 L 348 215 L 252 215 Z" fill={SC.skinDark} />
        <path d="M 280 170 L 320 170 L 330 215 L 270 215 Z" fill="#7a4727" opacity={0.5} />
        <polygon points="238,100 238,145 262,192 338,192 362,145 362,100" fill="url(#sc-skin)" />
        <path d="M 238 115 C 228 115, 228 140, 238 145 Z" fill={SC.skinShade} />
        <path d="M 362 115 C 372 115, 372 140, 362 145 Z" fill={SC.skinShade} />
        <path d="M 238 138 L 262 192 L 338 192 L 362 138 C 362 175, 330 198, 300 198 C 270 198, 238 175, 238 138 Z" fill={SC.stubble} opacity={0.35} />
        {/* nose + scowl */}
        <polygon points="300,110 292,148 300,152 308,148" fill={SC.nose} />
        <path d="M 292 148 C 292 155, 308 155, 308 148" fill="none" stroke={SC.crease} strokeWidth={2} strokeLinecap="round" />
        <path d="M 268 174 Q 282 168, 300 171 T 332 166" fill="none" stroke={SC.lineDeep} strokeWidth={4} strokeLinecap="round" />
        <path d="M 265 172 L 262 178 M 334 164 L 337 171" stroke={SC.lineDeep} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M 282 180 Q 300 184, 318 180" fill="none" stroke={SC.lip} strokeWidth={2} strokeLinecap="round" />
        {/* eyes: socket shadows, whites, irises, squint lids, heavy brows */}
        <polygon points="252,108 290,115 285,132 250,126" fill={SC.crease} opacity={0.35} />
        <polygon points="348,108 310,115 315,132 350,126" fill={SC.crease} opacity={0.35} />
        <path d="M 258 120 Q 272 114, 286 121 Q 272 128, 258 120 Z" fill={SC.eyeWhite} />
        <circle cx={273} cy={120} r={4} fill={SC.iris} />
        <circle cx={273} cy={120} r={1.8} fill="#000" />
        <circle cx={271.5} cy={118.5} r={0.8} fill="#fff" />
        <path d="M 314 121 Q 328 114, 342 120 Q 328 128, 314 121 Z" fill={SC.eyeWhite} />
        <circle cx={327} cy={120} r={4} fill={SC.iris} />
        <circle cx={327} cy={120} r={1.8} fill="#000" />
        <circle cx={325.5} cy={118.5} r={0.8} fill="#fff" />
        <path d="M 255 118 Q 272 112, 289 119 M 311 119 Q 328 112, 345 118" fill="none" stroke={SC.lidLine} strokeWidth={2.5} />
        <polygon points="248,113 292,120 290,108 250,102" fill={SC.brow} />
        <polygon points="352,113 308,120 310,108 350,102" fill={SC.brow} />
        <path d="M 297 112 L 297 124 M 303 112 L 303 124" stroke={SC.lineDeep} strokeWidth={2} />
        {/* battle scars: stitched right-cheek scar + left slash */}
        <path d="M 315 85 L 328 115 L 335 148 L 340 165" fill="none" stroke={SC.scar} strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
        <path d="M 316 85 L 329 115 L 336 148 L 341 165" fill="none" stroke={SC.scarHi} strokeWidth={1.2} strokeLinecap="round" opacity={0.75} />
        <path d="M 320 98 L 327 95 M 325 110 L 332 107 M 330 130 L 337 127 M 334 145 L 341 142" stroke={SC.stitch} strokeWidth={2} />
        <path d="M 250 145 L 278 160" fill="none" stroke={SC.scar} strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
        <path d="M 250 146 L 278 161" fill="none" stroke={SC.scarHi} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
        {/* helmet: dome, rim, NVG mount, ARC rails, patches, earmuffs, mic boom */}
        <path d="M 225 105 C 220 30, 380 30, 375 105 Z" fill={SC.helmet} stroke="#0a0b0d" strokeWidth={2} />
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
        <path d="M 368 132 C 370 160, 330 172, 290 170" fill="none" stroke="#000" strokeWidth={4} strokeLinecap="round" />
        <path d="M 368 132 C 370 160, 330 172, 290 170" fill="none" stroke={SC.padEdge} strokeWidth={2} strokeLinecap="round" />
        <rect x={280} y={163} width={14} height={10} rx={3} fill={SC.rail} stroke="#000" strokeWidth={1.5} />
      </g>
    </svg>
  )
}
