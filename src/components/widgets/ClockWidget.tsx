import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'

/** Displays the live local time, updating once per second. */
export default function ClockWidget() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography variant="h4" component="div" sx={{ fontFamily: 'monospace' }}>
        {now.toLocaleTimeString()}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {now.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </Typography>
    </Box>
  )
}
