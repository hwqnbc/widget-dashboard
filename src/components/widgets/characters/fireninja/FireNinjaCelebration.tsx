import { useEffect, useState } from 'react'
import FireBladeFigure from './FireBladeFigure'

/**
 * The fire ninja avatar's looping victory "action": ignites and extinguishes the
 * fire blade on a loop by toggling `lit` on an interval. Starts unlit without
 * animating (`animate` flips on once the loop begins) so there's no ignite flash
 * on mount. Self-contained (no props) to match the registry's celebration
 * contract. Mirrors NinjaCelebration.
 */
export default function FireNinjaCelebration() {
  const [lit, setLit] = useState(false)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      setActive(true)
      setLit((l) => !l)
    }, 1200)
    return () => clearInterval(t)
  }, [])
  return <FireBladeFigure lit={lit} animate={active} />
}
