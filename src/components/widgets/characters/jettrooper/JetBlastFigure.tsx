import { Box, keyframes } from '@mui/material'
import { JT } from './jetTrooperPalette'

// Jet & Blast: the whole figure rides a lift-off bob while the jetpack's
// cyan exhaust flames flare below the hip thrusters, and the beam weapon
// fires two red pulses from the big lens dish. Flames + flash live at base
// opacity 0 so the resting figure never shows them (lesson #74).
const lift = keyframes`
  0%   { transform: translateY(0); }
  25%  { transform: translateY(-44px); }
  40%  { transform: translateY(-36px); }
  55%  { transform: translateY(-44px); }
  75%  { transform: translateY(-38px); }
  100% { transform: translateY(0); }
`
const flames = keyframes`
  0%, 8%   { opacity: 0; }
  18%      { opacity: 0.95; }
  38%      { opacity: 0.75; }
  55%      { opacity: 0.95; }
  70%      { opacity: 0.8; }
  82%      { opacity: 0.5; }
  92%, 100% { opacity: 0; }
`
const flash = keyframes`
  0%, 38% { opacity: 0; }
  44%     { opacity: 0.95; }
  52%     { opacity: 0; }
  60%     { opacity: 0; }
  66%     { opacity: 0.9; }
  74%     { opacity: 0; }
  100%    { opacity: 0; }
`
const DUR = '2.6s'

/**
 * "Jet Trooper": a tan-fatigues soldier — brown tactical vest over a grey
 * undershirt with pouches, belt and a silver rank badge, brown cap with the
 * tan visor band, white headset earguards, chunky boots — wearing a
 * twin-tank JETPACK (cyan hip thrusters) and gripping the beam weapon with
 * the big red concentric-lens dish in the right hand. `blasting` runs the
 * Jet & Blast loop: lift off on flaring cyan exhaust and fire two red beam
 * pulses. (The source art's display ground shadow is dropped.)
 */
export default function JetBlastFigure({ blasting = false }: { blasting?: boolean }) {
  const liftSx = blasting ? { animation: `${lift} ${DUR} ease-in-out infinite` } : { transform: 'translateY(0)' }

  return (
    <svg viewBox="230 130 560 620" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="jt-red-lens" cx="45%" cy="45%" r="50%">
          <stop offset="0%" stopColor={JT.lensHi} />
          <stop offset="25%" stopColor={JT.lensRed} />
          <stop offset="70%" stopColor={JT.lensMid} />
          <stop offset="100%" stopColor={JT.lensDeep} />
        </radialGradient>
        <linearGradient id="jt-metal-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f545c" />
          <stop offset="50%" stopColor="#2a2d32" />
          <stop offset="100%" stopColor="#15171a" />
        </linearGradient>
        <linearGradient id="jt-metal-scope" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#727982" />
          <stop offset="100%" stopColor="#3d4248" />
        </linearGradient>
        <linearGradient id="jt-jet-cyan" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={JT.jetHi} stopOpacity={0.9} />
          <stop offset="50%" stopColor={JT.jet} stopOpacity={0.8} />
          <stop offset="100%" stopColor={JT.jetDeep} stopOpacity={0.9} />
        </linearGradient>
        <linearGradient id="jt-vest" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={JT.vest} />
          <stop offset="100%" stopColor={JT.vestDeep} />
        </linearGradient>
        <linearGradient id="jt-tan" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={JT.cloth} />
          <stop offset="100%" stopColor={JT.clothDeep} />
        </linearGradient>
        <linearGradient id="jt-tank" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6d737c" />
          <stop offset="45%" stopColor="#50555c" />
          <stop offset="100%" stopColor="#2d3035" />
        </linearGradient>
      </defs>

      {/* the whole figure lifts off as one */}
      <Box component="g" sx={{ transformBox: 'view-box', ...liftSx }}>
        {/* ---- JETPACK (worn on the back — behind everything) ---- */}
        <rect x={330} y={320} width={120} height={180} rx={12} fill={JT.pack} stroke={JT.packLine} strokeWidth={3} />
        <rect x={288} y={330} width={60} height={22} rx={6} fill={JT.packDeep} stroke={JT.packLine} strokeWidth={2.5} />
        <rect x={432} y={330} width={60} height={22} rx={6} fill={JT.packDeep} stroke={JT.packLine} strokeWidth={2.5} />
        <rect x={270} y={290} width={40} height={86} rx={19} fill="url(#jt-tank)" stroke={JT.packLine} strokeWidth={3} />
        <rect x={470} y={290} width={40} height={86} rx={19} fill="url(#jt-tank)" stroke={JT.packLine} strokeWidth={3} />
        <ellipse cx={290} cy={300} rx={15} ry={7} fill={JT.tankHi} stroke={JT.packLine} strokeWidth={2} />
        <ellipse cx={490} cy={300} rx={15} ry={7} fill={JT.tankHi} stroke={JT.packLine} strokeWidth={2} />
        <path d="M 276 340 L 304 340" stroke={JT.packLine} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M 476 340 L 504 340" stroke={JT.packLine} strokeWidth={2.5} strokeLinecap="round" />
        {/* thruster housings + resting exhaust */}
        <path d="M 268 496 L 320 496 L 314 542 L 276 542 Z" fill={JT.tank} stroke={JT.packLine} strokeWidth={3} strokeLinejoin="round" />
        <path d="M 460 496 L 512 496 L 504 542 L 466 542 Z" fill={JT.tank} stroke={JT.packLine} strokeWidth={3} strokeLinejoin="round" />
        <rect x={272} y={510} width={42} height={8} rx={3} fill={JT.packDeep} />
        <rect x={464} y={510} width={42} height={8} rx={3} fill={JT.packDeep} />
        <path d="M 276 542 L 314 542 L 322 584 L 268 584 Z" fill="url(#jt-jet-cyan)" stroke={JT.jetGlow} strokeWidth={1.5} />
        <path d="M 466 542 L 504 542 L 512 584 L 458 584 Z" fill="url(#jt-jet-cyan)" stroke={JT.jetGlow} strokeWidth={1.5} />

        {/* ---- blast flames (base opacity 0 — #74) ---- */}
        <Box component="g" sx={{ opacity: 0, ...(blasting ? { animation: `${flames} ${DUR} linear infinite` } : {}) }}>
          <path d="M 272 584 L 318 584 L 305 640 L 295 668 L 285 640 Z" fill="url(#jt-jet-cyan)" stroke={JT.jetGlow} strokeWidth={2} />
          <path d="M 462 584 L 508 584 L 495 640 L 485 668 L 475 640 Z" fill="url(#jt-jet-cyan)" stroke={JT.jetGlow} strokeWidth={2} />
          <path d="M 283 584 L 307 584 L 295 634 Z" fill={JT.jetHi} opacity={0.9} />
          <path d="M 473 584 L 497 584 L 485 634 Z" fill={JT.jetHi} opacity={0.9} />
          <ellipse cx={295} cy={588} rx={26} ry={8} fill={JT.jetGlow} opacity={0.8} />
          <ellipse cx={485} cy={588} rx={26} ry={8} fill={JT.jetGlow} opacity={0.8} />
        </Box>

        {/* ---- legs & hips ---- */}
        <path d="M 315 520 L 465 520 L 465 550 L 315 550 Z" fill={JT.clothDeep} stroke={JT.line} strokeWidth={3} />
        <path d="M 380 520 L 400 520 L 400 550 L 380 550 Z" fill="#a08d62" />
        <path d="M 315 550 L 386 550 L 386 706 L 315 706 Z" fill="url(#jt-tan)" stroke={JT.line} strokeWidth={3} />
        <path d="M 315 676 L 386 676 L 386 706 L 315 706 Z" fill={JT.clothShade} stroke={JT.line} strokeWidth={2} />
        <path d="M 311 698 L 390 698 L 390 742 L 296 742 L 296 718 Z" fill={JT.boot} stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
        <path d="M 296 730 L 390 730 L 390 742 L 296 742 Z" fill={JT.bootSole} stroke={JT.line} strokeWidth={2} />
        <path d="M 316 706 L 386 706" stroke={JT.line} strokeWidth={2} />
        <path d="M 325 570 C 330 585, 370 585, 375 570" fill="none" stroke={JT.seam} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M 322 600 L 350 600 L 350 645 L 322 645 Z" fill="none" stroke={JT.seam} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M 320 595 L 352 595" stroke={JT.seam} strokeWidth={3} strokeLinecap="round" />
        <path d="M 325 660 L 375 660" fill="none" stroke={JT.seam} strokeWidth={2} />
        <path d="M 394 550 L 465 550 L 465 706 L 394 706 Z" fill="url(#jt-tan)" stroke={JT.line} strokeWidth={3} />
        <path d="M 394 676 L 465 676 L 465 706 L 394 706 Z" fill={JT.clothShade} stroke={JT.line} strokeWidth={2} />
        <path d="M 390 698 L 469 698 L 484 718 L 484 742 L 390 742 Z" fill={JT.boot} stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
        <path d="M 390 730 L 484 730 L 484 742 L 390 742 Z" fill={JT.bootSole} stroke={JT.line} strokeWidth={2} />
        <path d="M 394 706 L 464 706" stroke={JT.line} strokeWidth={2} />
        <path d="M 404 570 C 410 585, 450 585, 455 570" fill="none" stroke={JT.seam} strokeWidth={2.5} strokeLinecap="round" />
        <path d="M 430 600 L 458 600 L 458 645 L 430 645 Z" fill="none" stroke={JT.seam} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M 428 595 L 460 595" stroke={JT.seam} strokeWidth={3} strokeLinecap="round" />
        <path d="M 404 660 L 455 660" fill="none" stroke={JT.seam} strokeWidth={2} />

        {/* ---- torso & vest ---- */}
        <path d="M 335 325 L 445 325 L 465 520 L 315 520 Z" fill="url(#jt-tan)" stroke={JT.line} strokeWidth={3.5} strokeLinejoin="round" />
        <path d="M 372 325 L 408 325 L 402 385 L 388 410 L 378 385 Z" fill={JT.shirt} stroke={JT.line} strokeWidth={2} />
        <path d="M 372 325 L 388 380 L 380 410" fill="none" stroke="#222" strokeWidth={2} />
        <path d="M 408 325 L 392 380 L 380 410" fill="none" stroke="#222" strokeWidth={2} />
        <path d="M 335 325 L 372 325 L 388 410 L 375 520 L 315 520 L 328 390 Z" fill="url(#jt-vest)" stroke={JT.line} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M 445 325 L 408 325 L 392 410 L 405 520 L 465 520 L 452 390 Z" fill="url(#jt-vest)" stroke={JT.line} strokeWidth={2.5} strokeLinejoin="round" />
        {/* jetpack shoulder harness */}
        <path d="M 344 325 L 366 325 L 396 470 L 372 470 Z" fill="#3f434a" stroke={JT.packLine} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M 436 325 L 414 325 L 384 470 L 408 470 Z" fill="#3f434a" stroke={JT.packLine} strokeWidth={2.5} strokeLinejoin="round" />
        <rect x={371} y={405} width={38} height={16} rx={3} fill={JT.steel} stroke={JT.packLine} strokeWidth={2} />
        <circle cx={390} cy={413} r={4} fill={JT.silver} stroke={JT.packLine} strokeWidth={1.5} />
        {/* stitching */}
        <path d="M 338 345 L 368 340" stroke="#3a2b19" strokeWidth={2} strokeDasharray="3,2" />
        <path d="M 442 345 L 412 340" stroke="#3a2b19" strokeWidth={2} strokeDasharray="3,2" />
        <path d="M 335 365 L 365 375" stroke="#3a2b19" strokeWidth={2} />
        <path d="M 332 385 L 362 395" stroke="#3a2b19" strokeWidth={2} />
        <path d="M 330 405 L 360 415" stroke="#3a2b19" strokeWidth={2} />
        <path d="M 445 365 L 415 375" stroke="#3a2b19" strokeWidth={2} />
        <path d="M 448 385 L 418 395" stroke="#3a2b19" strokeWidth={2} />
        <path d="M 450 405 L 420 415" stroke="#3a2b19" strokeWidth={2} />
        {/* silver rank badge */}
        <rect x={422} y={380} width={22} height={15} rx={1} fill={JT.silver} stroke="#1e2024" strokeWidth={2} />
        <rect x={425} y={383} width={7} height={9} fill={JT.dark} />
        <rect x={434} y={383} width={7} height={9} fill="#a0a5ad" />
        {/* pouches + belt */}
        <rect x={325} y={440} width={30} height={32} rx={3} fill={JT.vestDeep} stroke={JT.line} strokeWidth={2} />
        <path d="M 325 450 L 355 450" stroke={JT.line} strokeWidth={2} />
        <circle cx={340} cy={456} r={2} fill={JT.silver} />
        <rect x={425} y={440} width={30} height={32} rx={3} fill={JT.vestDeep} stroke={JT.line} strokeWidth={2} />
        <path d="M 425 450 L 455 450" stroke={JT.line} strokeWidth={2} />
        <circle cx={440} cy={456} r={2} fill={JT.silver} />
        <rect x={312} y={480} width={156} height={28} fill={JT.belt} stroke={JT.line} strokeWidth={2.5} />
        <rect x={375} y={477} width={30} height={34} rx={2} fill={JT.dark} stroke={JT.silver} strokeWidth={2} />
        <rect x={384} y={485} width={12} height={18} fill="none" stroke={JT.silver} strokeWidth={2} />
        <path d="M 330 480 L 330 508" stroke={JT.line} strokeWidth={2} />
        <path d="M 350 480 L 350 508" stroke={JT.line} strokeWidth={2} />
        <path d="M 430 480 L 430 508" stroke={JT.line} strokeWidth={2} />
        <path d="M 450 480 L 450 508" stroke={JT.line} strokeWidth={2} />

        {/* ---- left arm & hand ---- */}
        <path d="M 335 325 C 310 330, 275 370, 260 410 C 250 435, 255 460, 270 470 C 280 475, 295 460, 305 440 C 320 410, 330 365, 332 345 Z" fill="url(#jt-tan)" stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
        <path d="M 275 415 C 285 425, 295 425, 302 415" fill="none" stroke={JT.seam} strokeWidth={2} />
        <path d="M 262 455 L 282 470 L 275 482 L 255 467 Z" fill={JT.line} />
        <path d="M 250 468 C 235 475, 230 495, 242 508 C 255 520, 275 515, 280 498 C 283 490, 275 480, 268 485 C 262 490, 252 495, 248 485 C 245 478, 255 472, 260 470 Z" fill={JT.hand} stroke={JT.handLine} strokeWidth={2.5} />

        {/* ---- head, face & cap ---- */}
        <rect x={365} y={312} width={50} height={16} rx={5} fill="#78808a" stroke={JT.line} strokeWidth={2.5} />
        <rect x={345} y={195} width={90} height={120} rx={28} fill={JT.face} stroke={JT.line} strokeWidth={3} />
        <path d="M 360 232 Q 375 224 388 234" fill="none" stroke={JT.faceLine} strokeWidth={4.5} strokeLinecap="round" />
        <path d="M 402 234 Q 415 224 430 232" fill="none" stroke={JT.faceLine} strokeWidth={4.5} strokeLinecap="round" />
        <ellipse cx={373} cy={248} rx={6.5} ry={9} fill="#1a130e" />
        <circle cx={371} cy={245} r={2.5} fill="#fff" />
        <ellipse cx={417} cy={248} rx={6.5} ry={9} fill="#1a130e" />
        <circle cx={415} cy={245} r={2.5} fill="#fff" />
        <path d="M 388 222 L 392 216" stroke={JT.faceShade} strokeWidth={3} strokeLinecap="round" />
        <path d="M 378 282 Q 395 288 410 282" fill="none" stroke={JT.faceLine} strokeWidth={3.5} strokeLinecap="round" />
        <path d="M 385 292 Q 395 295 403 292" fill="none" stroke={JT.faceLine} strokeWidth={2} strokeLinecap="round" />
        <path d="M 338 200 C 335 140, 445 140, 442 200 Z" fill={JT.cap} stroke={JT.capLine} strokeWidth={3} />
        <path d="M 336 195 C 365 180, 415 180, 444 195 L 442 208 C 415 192, 365 192, 338 208 Z" fill={JT.capBand} stroke={JT.capLine} strokeWidth={2} />
        <path d="M 338 185 L 305 205 L 300 295 L 335 305 L 352 260 L 340 250 L 348 205 Z" fill={JT.guard} stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
        <circle cx={322} cy={250} r={11} fill={JT.guardDisc} stroke="#1a1c1e" strokeWidth={2} />
        <circle cx={322} cy={250} r={5} fill={JT.silver} />
        <path d="M 310 285 L 328 285" stroke="#a0a5bd" strokeWidth={3} strokeLinecap="round" />
        <path d="M 442 185 L 475 205 L 480 295 L 445 305 L 428 260 L 440 250 L 432 205 Z" fill={JT.guard} stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
        <circle cx={458} cy={250} r={11} fill={JT.guardDisc} stroke="#1a1c1e" strokeWidth={2} />
        <circle cx={458} cy={250} r={5} fill={JT.silver} />

        {/* ---- right arm ---- */}
        <path d="M 445 325 C 475 330, 520 360, 545 390 C 560 410, 565 435, 550 450 C 535 460, 515 440, 500 420 C 480 395, 455 355, 445 345 Z" fill="url(#jt-tan)" stroke={JT.line} strokeWidth={3} strokeLinejoin="round" />
        <path d="M 505 385 C 515 395, 525 400, 535 395" fill="none" stroke={JT.seam} strokeWidth={2} />

        {/* ---- beam weapon (pistol grip lands in the right hand) ---- */}
        <g transform="translate(593.5 409) scale(0.75) translate(-622.5 -365)">
          <path d="M 565 295 L 635 280 L 670 325 L 590 345 Z" fill="url(#jt-metal-scope)" stroke="#181a1d" strokeWidth={3} strokeLinejoin="round" />
          <path d="M 585 290 L 625 280 L 615 270 L 580 278 Z" fill={JT.gunMid} stroke="#181a1d" strokeWidth={2} />
          <polygon points="635,282 660,315 645,318 625,288" fill="#22252a" />
          <path d="M 535 410 L 590 335 L 675 355 L 610 450 L 545 440 Z" fill="url(#jt-metal-dark)" stroke="#15171a" strokeWidth={3} strokeLinejoin="round" />
          <rect x={540} y={420} width={25} height={52} rx={6} transform="rotate(15 540 420)" fill="#25282d" stroke="#111214" strokeWidth={2.5} />
          <path d="M 590 335 L 705 320 L 730 435 L 610 450 Z" fill="url(#jt-metal-dark)" stroke="#15171a" strokeWidth={3} strokeLinejoin="round" />
          <path d="M 600 350 L 695 338 L 705 352 L 610 365 Z" fill="#606670" opacity={0.4} />
          <ellipse cx={715} cy={380} rx={60} ry={78} fill="#282b30" stroke="#121315" strokeWidth={4} transform="rotate(-5 715 380)" />
          <ellipse cx={715} cy={380} rx={52} ry={68} fill={JT.gunDark} transform="rotate(-5 715 380)" />
          <ellipse cx={715} cy={380} rx={46} ry={60} fill="#800000" stroke="#ff3333" strokeWidth={1.5} transform="rotate(-5 715 380)" />
          <ellipse cx={715} cy={380} rx={42} ry={54} fill="url(#jt-red-lens)" transform="rotate(-5 715 380)" />
          <ellipse cx={715} cy={380} rx={30} ry={38} fill="none" stroke={JT.lensRing} strokeWidth={3} opacity={0.8} transform="rotate(-5 715 380)" />
          <ellipse cx={715} cy={380} rx={20} ry={26} fill="#cc0000" stroke={JT.lensHi} strokeWidth={2} transform="rotate(-5 715 380)" />
          <ellipse cx={715} cy={380} rx={10} ry={13} fill={JT.lensRing} transform="rotate(-5 715 380)" />
          <ellipse cx={712} cy={377} rx={4} ry={5} fill="#fff" opacity={0.9} />
          <path d="M 685 340 A 35 45 0 0 1 735 340" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.5} />
          <path d="M 695 415 A 30 40 0 0 0 730 415" fill="none" stroke={JT.lensHi} strokeWidth={2} opacity={0.6} />
          <circle cx={630} cy={375} r={7} fill={JT.gunDark} stroke={JT.gunMid} strokeWidth={2} />
          <rect x={650} y={365} width={25} height={6} rx={2} fill={JT.gunMid} />
          <rect x={650} y={376} width={25} height={6} rx={2} fill={JT.gunMid} />
        </g>

        {/* ---- beam muzzle flash at the lens (base opacity 0 — #74) ---- */}
        <Box component="g" sx={{ opacity: 0, ...(blasting ? { animation: `${flash} ${DUR} linear infinite` } : {}) }}>
          <circle cx={694} cy={409} r={26} fill={JT.lensRing} opacity={0.85} />
          <circle cx={694} cy={409} r={14} fill="#fff" />
          <path d="M 712 409 L 786 396 L 742 409 L 786 424 Z" fill={JT.lensRed} />
          <path d="M 706 388 L 758 350 L 718 392 Z" fill={JT.lensRing} opacity={0.9} />
          <path d="M 706 430 L 758 468 L 718 426 Z" fill={JT.lensRing} opacity={0.9} />
        </Box>

        {/* ---- right hand over the grip ---- */}
        <path d="M 535 440 C 520 445, 510 465, 520 480 C 532 492, 552 490, 560 472 C 565 462, 558 450, 550 455 C 542 460, 532 462, 530 452 C 528 445, 538 440, 545 438 Z" fill={JT.hand} stroke={JT.handLine} strokeWidth={2.5} />
      </Box>
    </svg>
  )
}
