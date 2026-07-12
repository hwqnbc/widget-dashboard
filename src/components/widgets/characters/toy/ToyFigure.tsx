// An original cartoon SVG of a retro toy minifigure (teal cap & body, green legs).
// Shares the character interface with Boy: pose 'idle' | 'brace', plus facing.
// viewBox is 240 x 380 to match the other characters. The static body/head parts
// are shared via toyParts; only the pose-dependent arms and mouth are inline.

import { TOY as T } from './toyPalette'
import Hand from '../shared/Hand'
import { ToyLegs, ToyNeck, ToyTorso, ToyCapAndFace } from './toyParts'

export default function ToyFigure({
  pose = 'idle',
  facing = 1,
}: {
  pose?: 'idle' | 'brace'
  facing?: 1 | -1
}) {
  const brace = pose === 'brace'
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        transform: `scaleX(${facing})`,
        transformOrigin: 'center',
        transition: 'transform .15s ease',
      }}
    >
      <svg viewBox="0 0 240 380" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <ToyLegs />

        {/* ---- arms (behind torso at the shoulder) ---- */}
        {brace ? (
          <>
            <path d="M84 200 C76 176 82 158 100 150" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <path d="M156 200 C164 176 158 158 140 150" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <Hand cx={100} cy={146} stroke={T.teal} />
            <Hand cx={140} cy={146} stroke={T.teal} />
          </>
        ) : (
          <>
            <path d="M84 200 C70 214 64 252 70 290" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <path d="M156 200 C170 214 176 252 170 290" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <Hand cx={70} cy={298} stroke={T.teal} />
            <Hand cx={170} cy={298} stroke={T.teal} />
          </>
        )}

        <ToyNeck />
        <ToyTorso />
        <ToyCapAndFace brace={brace} />

        {/* mouth */}
        {brace ? (
          <ellipse cx={120} cy={166} rx={5} ry={6} fill="#7a3b34" stroke={T.line} strokeWidth={1.2} />
        ) : (
          <path d="M108 162 Q120 173 132 162" stroke={T.line} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        )}

        {/* brace-only sweat drop */}
        {brace && <path d="M158 120 C162 128 166 128 162 134 C156 134 154 128 158 120 Z" fill="#7fd0f0" stroke="#4aa6d0" strokeWidth={1} />}
      </svg>
    </div>
  )
}
