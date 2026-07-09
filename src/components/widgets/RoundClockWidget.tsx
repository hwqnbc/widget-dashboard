import { useEffect, useState } from 'react'
import { Box, keyframes } from '@mui/material'

/** Claude's signature warm terracotta. */
const CLAUDE_ORANGE = '#D97757'

/** One full orbit + spin per rotation. */
const orbit = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
`

/** Toy-figure palette (matches components/widgets/characters/ToyFigure). */
const TOY = {
  teal: '#16b3a3',
  tealShade: '#0d897c',
  tealHi: '#67dccf',
  skin: '#efb188',
  skinShade: '#d4895f',
  line: '#1f3f3b',
}

/**
 * The head of the toy minifigure (capped head, face) lifted from ToyFigure,
 * cropped to a tight square viewBox so it can orbit the clock.
 */
function ToyHead({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="28 39 144 144"
      role="img"
      aria-label="Toy figure"
      style={{ overflow: 'visible' }}
    >
      {/* head */}
      <path
        d="M80 110 C78 150 84 174 120 176 C156 174 162 150 160 110 Z"
        fill={TOY.skin}
        stroke={TOY.skinShade}
        strokeWidth={2}
      />
      {/* cap dome */}
      <path
        d="M72 108 C70 62 94 46 120 46 C146 46 170 62 168 108 Z"
        fill={TOY.teal}
        stroke={TOY.tealShade}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M92 60 C84 70 80 86 82 100"
        stroke={TOY.tealHi}
        strokeWidth={6}
        opacity={0.6}
        strokeLinecap="round"
        fill="none"
      />
      {/* cap brim */}
      <path
        d="M64 104 C40 104 30 114 42 120 C76 130 150 126 170 114 C176 110 172 104 164 104 C150 110 86 112 64 104 Z"
        fill={TOY.tealHi}
        stroke={TOY.tealShade}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* eyebrows */}
      <path d="M100 142 q7 -3 13 0" stroke={TOY.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M127 142 q6 -3 13 0" stroke={TOY.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
      {/* eyes */}
      <ellipse cx={107} cy={151} rx={3.4} ry={4.6} fill={TOY.line} />
      <ellipse cx={133} cy={151} rx={3.4} ry={4.6} fill={TOY.line} />
      <circle cx={108} cy={149} r={1.1} fill="#fff" />
      <circle cx={134} cy={149} r={1.1} fill="#fff" />
      {/* mouth */}
      <path d="M108 162 Q120 173 132 162" stroke={TOY.line} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** An analog "round" clock with the toy figure's head orbiting the face. */
export default function RoundClockWidget() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const seconds = now.getSeconds()
  const minutes = now.getMinutes()
  const hours = now.getHours() % 12

  const secondDeg = seconds * 6
  const minuteDeg = minutes * 6 + seconds * 0.1
  const hourDeg = hours * 30 + minutes * 0.5

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // The orbiting cartoon must never spill past the widget: any overflow
        // makes the card's scrollable body flash a scrollbar as it spins.
        overflow: 'hidden',
      }}
    >
      {/* Sizing box: the clock face plus room for the orbit. */}
      <Box
        sx={{
          position: 'relative',
          width: '82%',
          aspectRatio: '1 / 1',
          maxHeight: '100%',
        }}
      >
        {/* Orbiting toy-figure head — rotates around the clock's centre. */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            animation: `${orbit} 6s linear infinite`,
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              // Keep the cartoon's full orbit inside the sizing box so it never
              // overflows the card. Its centre rides a circle just inside the
              // box edge; a small top offset leaves margin for sub-pixel drift.
              top: '3%',
              left: '50%',
              transform: 'translateX(-50%)',
              // Counter-spin keeps the head upright-ish while spinning too.
              animation: `${spin} 6s linear infinite`,
              lineHeight: 0,
            }}
          >
            <ToyHead size={34} />
          </Box>
        </Box>

        {/* Clock face */}
        <Box
          component="svg"
          viewBox="0 0 100 100"
          sx={{
            position: 'absolute',
            inset: '14%',
            width: '72%',
            height: '72%',
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke={CLAUDE_ORANGE}
            strokeWidth="3"
          />
          {/* hour ticks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * 30 * Math.PI) / 180
            const r1 = 40
            const r2 = 46
            return (
              <line
                key={i}
                x1={50 + r1 * Math.sin(a)}
                y1={50 - r1 * Math.cos(a)}
                x2={50 + r2 * Math.sin(a)}
                y2={50 - r2 * Math.cos(a)}
                stroke="currentColor"
                strokeWidth={i % 3 === 0 ? 2.5 : 1.2}
                strokeLinecap="round"
                opacity={0.6}
              />
            )
          })}
          {/* hour hand */}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="28"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform={`rotate(${hourDeg} 50 50)`}
          />
          {/* minute hand */}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="16"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={`rotate(${minuteDeg} 50 50)`}
          />
          {/* second hand */}
          <line
            x1="50"
            y1="55"
            x2="50"
            y2="12"
            stroke={CLAUDE_ORANGE}
            strokeWidth="1.2"
            strokeLinecap="round"
            transform={`rotate(${secondDeg} 50 50)`}
          />
          <circle cx="50" cy="50" r="2.6" fill={CLAUDE_ORANGE} />
        </Box>
      </Box>
    </Box>
  )
}
