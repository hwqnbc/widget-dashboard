import { useEffect, useState } from 'react'

/**
 * Transient "next player" hand-off state for pass-and-play games. `announce(p)`
 * shows the incoming player; it auto-clears after `ms` (cleaned-up timer), or
 * `clear()` dismisses early. While `player` is set, the caller locks the board.
 */
export function useHandoff(ms = 1000) {
  const [player, setPlayer] = useState<'toy' | 'ninja' | null>(null)
  useEffect(() => {
    if (!player) return
    const t = setTimeout(() => setPlayer(null), ms)
    return () => clearTimeout(t)
  }, [player, ms])
  return {
    player,
    announce: (p: 'toy' | 'ninja') => setPlayer(p),
    clear: () => setPlayer(null),
  }
}
