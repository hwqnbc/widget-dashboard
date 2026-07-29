// The ninja avatar's 3D figure as shown in the Avatar Actions viewer: the
// venue-neutral NinjaModel3D on the shared turntable stage. The stage owns
// the spin (faster while celebrating); the model owns the character
// animation.
//
// Loaded only via the avatar registry's lazy() — never re-export from
// ninja/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import NinjaModel3D from './NinjaModel3D'

export default function NinjaFigure3D({ playing = false }: { playing?: boolean }) {
  return (
    <FigureStage3D spin={playing ? 1.3 : 0.45}>
      <NinjaModel3D playing={playing} />
    </FigureStage3D>
  )
}
