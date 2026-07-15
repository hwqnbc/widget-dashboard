import { useEffect, useState } from 'react'
import FrakFigure from './FrakFigure'

/**
 * frak's looping victory action: chopping forward, alternating the two gold
 * swords — one strikes down in front while the other winds up. Toggles the figure
 * `phase` on an interval; `animate` flips true once the loop begins so there's no
 * flash on mount. Rendered by WinnerCelebration and played on tap by the Avatar
 * Actions widget.
 */
export default function FrakCelebration() {
  const [phase, setPhase] = useState<0 | 1>(0)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      setActive(true)
      setPhase((p) => (p === 0 ? 1 : 0))
    }, 620)
    return () => clearInterval(t)
  }, [])
  return <FrakFigure phase={phase} animate={active} />
}
