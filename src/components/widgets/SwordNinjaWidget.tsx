import { useRef, useState } from 'react'
import SwordNinjaFigure from './characters/ninja/SwordNinjaFigure'
import TapStage from './TapStage'

/**
 * A stylized white ninja with two katanas crossed on its back. Tap to draw one
 * katana and swing it into a defensive guard; tap again to sheathe it.
 */
export default function SwordNinjaWidget() {
  const [drawn, setDrawn] = useState(false)
  const interacted = useRef(false)

  const toggle = () => {
    interacted.current = true
    setDrawn((d) => !d)
  }

  return (
    <TapStage
      onClick={toggle}
      ariaLabel={drawn ? 'Sheathe the sword' : 'Draw the sword'}
    >
      <SwordNinjaFigure drawn={drawn} animate={interacted.current} />
    </TapStage>
  )
}
