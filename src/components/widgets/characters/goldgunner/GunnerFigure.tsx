import { Box, keyframes } from '@mui/material'
import { GG } from './goldGunnerPalette'

/**
 * "Gold Gunner": a LEGO-style dual-wielding gunslinger — yellow minifig skin,
 * brown swept hair, a yellow/orange jacket over a black V-neck, black tactical
 * cargo trousers, a black rifle raised in the right hand and a gold twin-barrel
 * blaster in the left. `blazing` fires both guns: each kicks back on a fast
 * recoil loop with a muzzle flash at its barrel (the black rifle and the gold
 * blaster alternate so it reads as rapid two-gun fire).
 *
 * Coordinates come straight from the source art (a 500×600 board); the viewBox
 * is cropped to the character so it fills the stage. `transformBox:'view-box'`
 * + a view-box `transformOrigin` pins each recoil/flash pivot regardless of how
 * the svg is scaled.
 */

// A crisp back-kick: the gun snaps back along its aim, then eases home.
const recoil = keyframes`
  0%, 100% { transform: translate(0px, 0px); }
  10%      { transform: translate(3px, 8px); }
  32%      { transform: translate(0px, 0px); }
`
// Muzzle flash: a brief bright pop synced to the kick, dark the rest of the cycle.
const flash = keyframes`
  0%, 16%, 100% { opacity: 0; transform: scale(0.4); }
  7%            { opacity: 1; transform: scale(1.15); }
`
const DUR = '0.5s'

/** An 8-point starburst muzzle flash centred on (x,y), pulsing while blazing. */
function Muzzle({ x, y, delay }: { x: number; y: number; delay: string }) {
  return (
    <Box
      component="g"
      sx={{
        // Hidden by default so the flash stays dark through its start-delay
        // (before the animation's first keyframe applies).
        opacity: 0,
        transformBox: 'view-box',
        transformOrigin: `${x}px ${y}px`,
        animation: `${flash} ${DUR} ease-out ${delay} infinite`,
      }}
    >
      <g transform={`translate(${x} ${y})`}>
        <path d="M0 -15 L4 -5 L15 0 L4 5 L0 15 L-4 5 L-15 0 L-4 -5 Z" fill={GG.flash} />
        <circle r={5} fill={GG.flashCore} />
        <circle r={2.5} fill="#fff" />
      </g>
    </Box>
  )
}

export default function GunnerFigure({ blazing = false }: { blazing?: boolean }) {
  const kick = (delay: string) =>
    blazing
      ? { transformBox: 'view-box' as const, animation: `${recoil} ${DUR} ease-out ${delay} infinite` }
      : {}

  return (
    <svg viewBox="120 108 300 420" width="100%" height="100%" style={{ overflow: 'visible' }} strokeLinejoin="round">
      <defs>
        <linearGradient id="gg-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={GG.goldHi} />
          <stop offset="50%" stopColor={GG.gold} />
          <stop offset="100%" stopColor={GG.goldShade} />
        </linearGradient>
        <linearGradient id="gg-gold-hi" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={GG.goldBright} />
          <stop offset="100%" stopColor="#d4af37" />
        </linearGradient>
        <linearGradient id="gg-black" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={GG.gunHi} />
          <stop offset="40%" stopColor={GG.gun} />
          <stop offset="100%" stopColor={GG.gunShade} />
        </linearGradient>
        <linearGradient id="gg-jacket" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={GG.jacketHi} />
          <stop offset="70%" stopColor={GG.jacket} />
          <stop offset="100%" stopColor={GG.jacketShade} />
        </linearGradient>
        <linearGradient id="gg-skin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={GG.skinHi} />
          <stop offset="100%" stopColor={GG.skinShade} />
        </linearGradient>
        <linearGradient id="gg-hair" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={GG.hairMid} />
          <stop offset="100%" stopColor={GG.hairShade} />
        </linearGradient>
      </defs>

      {/* ---- legs & hips (black tactical trousers) ---- */}
      <g>
        <path d="M 180 380 L 320 380 L 315 400 L 185 400 Z" fill={GG.pants} />
        <rect x={246} y={380} width={8} height={20} fill={GG.gunShade} />
        <rect x={183} y={382} width={134} height={6} fill={GG.panel} />
        <rect x={235} y={381} width={30} height={8} fill="#555" rx={1} />
        <rect x={240} y={383} width={20} height={4} fill="#222" />
        <rect x={185} y={401} width={62} height={110} fill="#262626" rx={2} />
        <rect x={253} y={401} width={62} height={110} fill={GG.pants} rx={2} />
        <line x1={249} y1={400} x2={249} y2={511} stroke={GG.gunShade} strokeWidth={3} />
        {/* thigh + knee-pad prints */}
        <rect x={195} y={415} width={42} height={15} fill={GG.panel} rx={2} />
        <circle cx={205} cy={422} r={3} fill={GG.stud} />
        <circle cx={227} cy={422} r={3} fill={GG.stud} />
        <rect x={195} y={445} width={42} height={35} fill={GG.pantsHi} rx={4} />
        <circle cx={216} cy={462} r={10} fill="#1a1a1a" stroke="#444" strokeWidth={2} />
        <rect x={263} y={415} width={42} height={15} fill={GG.panel} rx={2} />
        <circle cx={273} cy={422} r={3} fill={GG.stud} />
        <circle cx={295} cy={422} r={3} fill={GG.stud} />
        <rect x={263} y={445} width={42} height={35} fill={GG.pantsHi} rx={4} />
        <circle cx={284} cy={462} r={10} fill="#1a1a1a" stroke="#444" strokeWidth={2} />
        {/* boots */}
        <rect x={185} y={500} width={62} height={11} fill="#181818" />
        <rect x={253} y={500} width={62} height={11} fill={GG.pantsShade} />
        <rect x={195} y={504} width={42} height={7} fill="#000" />
        <rect x={263} y={504} width={42} height={7} fill="#000" />
      </g>

      {/* ---- torso & arms (yellow jacket, black V-neck) ---- */}
      <g>
        <polygon points="200,240 300,240 320,380 180,380" fill="url(#gg-jacket)" />
        <polygon points="215,240 285,240 275,320 250,375 225,320" fill={GG.vneck} />
        <polygon points="235,240 265,240 250,310" fill={GG.shirt} />
        <path d="M 220 240 L 250 330 L 280 240" fill="none" stroke={GG.jacketHi} strokeWidth={3} />
        <path d="M 210 240 L 225 320 L 250 378 L 275 320 L 290 240" fill="none" stroke={GG.shirt} strokeWidth={4} />
        <path d="M 190 350 Q 205 345 220 352" fill="none" stroke="#222" strokeWidth={2.5} strokeLinecap="round" />
        <path d="M 310 350 Q 295 345 280 352" fill="none" stroke="#222" strokeWidth={2.5} strokeLinecap="round" />
        {/* right arm (raised, holds the black rifle) */}
        <path d="M 200 240 L 165 270 L 155 315 L 180 325 L 195 285 L 205 270 Z" fill={GG.jacket} />
        <path d="M 152 310 C 145 315 140 325 145 335 C 150 345 162 345 168 335 L 175 320 Z" fill="url(#gg-skin)" />
        {/* left arm (lowered, holds the gold blaster) */}
        <path d="M 300 240 L 335 275 L 345 320 L 320 330 L 305 290 L 295 270 Z" fill={GG.jacketShade} />
        <path d="M 342 315 C 350 320 355 330 350 340 C 345 350 333 350 327 340 L 322 325 Z" fill="url(#gg-skin)" />
      </g>

      {/* ---- head & hair ---- */}
      <g>
        <rect x={235} y={225} width={30} height={18} fill={GG.skinShade} rx={2} />
        <rect x={230} y={142} width={40} height={10} rx={3} fill={GG.skinShade} />
        <rect x={210} y={150} width={80} height={80} rx={20} fill="url(#gg-skin)" />
        <path d="M 225 175 Q 235 170 243 176" fill="none" stroke={GG.line} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M 275 175 Q 265 170 257 176" fill="none" stroke={GG.line} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={235} cy={186} r={4.5} fill="#1a1a1a" />
        <circle cx={265} cy={186} r={4.5} fill="#1a1a1a" />
        <circle cx={233.5} cy={184.5} r={1.5} fill="#fff" />
        <circle cx={263.5} cy={184.5} r={1.5} fill="#fff" />
        <path d="M 236 204 Q 250 216 264 204" fill="none" stroke={GG.line} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M 265 203 Q 268 206 267 209" fill="none" stroke={GG.line} strokeWidth={2} strokeLinecap="round" />
        <path
          d="M 206 162 C 200 140, 215 120, 240 120 C 260 118, 285 125, 294 148 C 300 162, 295 178, 293 185 C 288 180, 285 172, 282 170 C 278 162, 270 160, 260 163 C 250 166, 240 158, 230 160 C 220 162, 215 172, 212 178 C 208 175, 207 168, 206 162 Z"
          fill="url(#gg-hair)"
        />
        <path d="M 218 145 Q 240 130 270 138" fill="none" stroke={GG.hairHi} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
        <path d="M 225 135 Q 255 125 280 135" fill="none" stroke={GG.hairMid} strokeWidth={3} strokeLinecap="round" />
        <path d="M 212 160 Q 230 148 250 152" fill="none" stroke={GG.hairHi} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
      </g>

      {/* ---- black rifle (right hand, raised) ---- */}
      <Box component="g" sx={{ transformOrigin: '170px 260px', ...kick('0s') }}>
        <g transform="rotate(-15, 170, 260)">
          <rect x={148} y={160} width={12} height={110} rx={3} fill="url(#gg-black)" />
          <rect x={146} y={152} width={16} height={12} rx={2} fill={GG.gunShade} />
          <rect x={150} y={146} width={8} height={8} rx={1} fill="#222" />
          <rect x={142} y={200} width={8} height={18} rx={2} fill="#222" />
          <rect x={160} y={210} width={6} height={25} rx={1} fill={GG.panel} />
          <path d="M 148 260 L 160 260 L 165 310 L 140 300 Z" fill="#1a1a1a" />
          <rect x={150} y={280} width={10} height={35} rx={2} transform="rotate(20, 155, 280)" fill="#0d0d0d" />
        </g>
      </Box>

      {/* ---- gold twin-barrel blaster (left hand, lowered) ---- */}
      <Box component="g" sx={{ transformOrigin: '380px 330px', ...kick('0.25s') }}>
        <rect x={330} y={300} width={65} height={16} rx={8} fill="url(#gg-gold)" stroke={GG.goldEdge} strokeWidth={1} />
        <rect x={390} y={298} width={12} height={20} rx={3} fill="url(#gg-gold-hi)" />
        <ellipse cx={402} cy={308} rx={3} ry={8} fill="#3a2700" />
        <rect x={330} y={320} width={65} height={16} rx={8} fill="url(#gg-gold)" stroke={GG.goldEdge} strokeWidth={1} />
        <rect x={390} y={318} width={12} height={20} rx={3} fill="url(#gg-gold-hi)" />
        <ellipse cx={402} cy={328} rx={3} ry={8} fill="#3a2700" />
        <rect x={340} y={308} width={35} height={20} rx={2} fill="url(#gg-gold-hi)" />
        <circle cx={350} cy={318} r={4} fill={GG.goldShade} />
        <circle cx={365} cy={318} r={4} fill={GG.goldShade} />
        <rect x={335} y={330} width={14} height={30} rx={3} transform="rotate(15, 335, 330)" fill="url(#gg-gold)" stroke="#4a3200" strokeWidth={1} />
        <rect x={325} y={322} width={20} height={10} rx={2} fill="#8f680d" />
      </Box>

      {/* ---- muzzle flashes (only while blazing) ---- */}
      {blazing && (
        <>
          {/* black rifle muzzle (rendered position of the rotated barrel tip) */}
          <Muzzle x={125} y={150} delay="0s" />
          {/* gold blaster's two barrel mouths */}
          <Muzzle x={410} y={308} delay="0.25s" />
          <Muzzle x={410} y={328} delay="0.25s" />
        </>
      )}
    </svg>
  )
}
