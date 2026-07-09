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

/** A little cartoon Claude: rounded body, face, and a friendly wave. */
function ClaudeCartoon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Claude"
    >
      {/* body */}
      <ellipse cx="24" cy="26" rx="15" ry="16" fill={CLAUDE_ORANGE} />
      {/* lighter belly */}
      <ellipse cx="24" cy="29" rx="9" ry="10" fill="#F3C9B8" />
      {/* ears / tufts */}
      <circle cx="12" cy="13" r="4.5" fill={CLAUDE_ORANGE} />
      <circle cx="36" cy="13" r="4.5" fill={CLAUDE_ORANGE} />
      {/* eyes */}
      <circle cx="19" cy="23" r="2.4" fill="#2A1B14" />
      <circle cx="29" cy="23" r="2.4" fill="#2A1B14" />
      <circle cx="19.8" cy="22.2" r="0.8" fill="#fff" />
      <circle cx="29.8" cy="22.2" r="0.8" fill="#fff" />
      {/* smile */}
      <path
        d="M19 29 Q24 33 29 29"
        fill="none"
        stroke="#2A1B14"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* cheeks */}
      <circle cx="15" cy="28" r="1.8" fill="#EFA98F" opacity="0.8" />
      <circle cx="33" cy="28" r="1.8" fill="#EFA98F" opacity="0.8" />
    </svg>
  )
}

/** An analog "round" clock with a cartoon Claude orbiting the face. */
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
        {/* Orbiting Claude — rotates around the clock's centre. */}
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
              // Counter-spin keeps Claude upright-ish while spinning too.
              animation: `${spin} 6s linear infinite`,
              lineHeight: 0,
            }}
          >
            <ClaudeCartoon size={30} />
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
