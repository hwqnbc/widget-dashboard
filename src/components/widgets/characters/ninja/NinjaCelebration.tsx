import { useEffect, useState } from 'react'
import SwordNinjaFigure from './SwordNinjaFigure'

/**
 * The ninja avatar's looping victory "action": draws and sheathes the katana on
 * a loop by toggling `drawn` on an interval. Starts sheathed without animating
 * (`animate` flips on once the loop begins) so there's no draw/sheathe flash on
 * mount. Self-contained (no props) to match the avatar registry's celebration
 * contract. Extracted from the former `LoopingNinja` in WinnerCelebration.
 */
export default function NinjaCelebration() {
  const [drawn, setDrawn] = useState(false)
  const [active, setActive] = useState(false)
  useEffect(() => {
    const t = setInterval(() => {
      setActive(true)
      setDrawn((d) => !d)
    }, 1100)
    return () => clearInterval(t)
  }, [])
  return <SwordNinjaFigure drawn={drawn} animate={active} />
}
