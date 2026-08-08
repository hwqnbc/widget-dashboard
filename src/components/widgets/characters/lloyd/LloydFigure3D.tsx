// Lloyd's 3D figure as shown in the Avatar Actions viewer: the venue-neutral
// LloydModel3D on the shared turntable stage. The stage owns the spin; the
// model owns the character animation. The turntable is the USER'S toggle
// (`spinning`, uniform across every avatar viewer): on = the one 0.45 rad/s
// rate, off = ease back to face the camera — tap off to watch the Sword Chop
// face-on (or leave it spinning to see the wings and tail sweep past).
//
// Loaded only via the avatar registry's lazy() — never re-export from
// lloyd/index.ts, or three.js lands in the main chunk.
import FigureStage3D from '../shared/FigureStage3D'
import LloydModel3D from './LloydModel3D'

export default function LloydFigure3D({ action, spinning = true }: { action?: string; spinning?: boolean }) {
  return (
    <FigureStage3D spin={spinning ? 0.45 : 0}>
      <LloydModel3D action={action} />
    </FigureStage3D>
  )
}
