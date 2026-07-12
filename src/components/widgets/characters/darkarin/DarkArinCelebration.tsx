import { useEffect, useState } from 'react'
import TwinSwordFigure from './TwinSwordFigure'

/**
 * DarkArin's looping victory action: crosses and uncrosses the swords on a loop by
 * toggling `crossed` on an interval. Starts in the ready stance without animating
 * (`animate` flips true once the loop begins) so there's no flash on mount.
 * Self-contained (no props) to match the registry's celebration contract.
 */
export default function DarkArinCelebration() {
  const [crossed, setCrossed] = useState(false)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      setActive(true)
      setCrossed((c) => !c)
    }, 1300)
    return () => clearInterval(t)
  }, [])
  return <TwinSwordFigure crossed={crossed} animate={active} />
}
