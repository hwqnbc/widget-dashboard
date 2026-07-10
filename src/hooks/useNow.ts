import { useEffect, useState } from 'react'

/** The current `Date`, refreshed every `intervalMs` (default 1000ms). Used by
 * the clock widgets so they share one ticking-timer implementation. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
