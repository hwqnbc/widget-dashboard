import { useState } from 'react'
import SixSevenFigure from './characters/SixSevenFigure'
import TapStage from './TapStage'

/**
 * The toy minifigure doing the "6 7" meme: tap to make its hands bounce up and
 * down in alternation while a big 6 and 7 pop in at its sides. Tap again to stop.
 */
export default function SixSevenWidget() {
  const [playing, setPlaying] = useState(false)
  return (
    <TapStage
      onClick={() => setPlaying((p) => !p)}
      ariaLabel={playing ? 'Stop the 6 7' : 'Start the 6 7'}
    >
      <SixSevenFigure playing={playing} />
    </TapStage>
  )
}
