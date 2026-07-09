// An original cartoon SVG of a retro toy minifigure (teal cap & body, green legs).
// Shares the character interface with Boy: pose 'idle' | 'brace', plus facing.
// viewBox is 240 x 380 to match the other characters.

const T = {
  teal: '#16b3a3',
  tealShade: '#0d897c',
  tealHi: '#67dccf',
  skin: '#efb188',
  skinShade: '#d4895f',
  leg: '#bcdb9e',
  legShade: '#95b675',
  badge: '#d4322a',
  shell: '#f3c20b',
  line: '#1f3f3b',
}

// An open "C"-shaped gripper hand centred at (cx, cy).
function Hand({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={`M${cx - 8} ${cy + 6} A 9 9 0 1 1 ${cx + 8} ${cy + 6}`}
      fill="none"
      stroke={T.teal}
      strokeWidth={7}
      strokeLinecap="round"
    />
  )
}

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
        {/* ---- legs ---- */}
        <path d="M90 300 L88 358 C88 365 110 365 110 358 L112 300 Z" fill={T.leg} stroke={T.legShade} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M128 300 L130 358 C130 365 152 365 152 358 L150 300 Z" fill={T.leg} stroke={T.legShade} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M96 308 L94 352" stroke="#ffffff" strokeWidth={3} opacity={0.35} strokeLinecap="round" />
        <path d="M134 308 L133 352" stroke="#ffffff" strokeWidth={3} opacity={0.3} strokeLinecap="round" />

        {/* ---- arms (behind torso at the shoulder) ---- */}
        {brace ? (
          <>
            <path d="M84 200 C76 176 82 158 100 150" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <path d="M156 200 C164 176 158 158 140 150" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <Hand cx={100} cy={146} />
            <Hand cx={140} cy={146} />
          </>
        ) : (
          <>
            <path d="M84 200 C70 214 64 252 70 290" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <path d="M156 200 C170 214 176 252 170 290" stroke={T.teal} strokeWidth={18} strokeLinecap="round" fill="none" />
            <Hand cx={70} cy={298} />
            <Hand cx={170} cy={298} />
          </>
        )}

        {/* ---- neck ---- */}
        <rect x={106} y={170} width={28} height={18} fill={T.skin} stroke={T.skinShade} strokeWidth={1.5} />

        {/* ---- torso (flared) ---- */}
        <path
          d="M82 184 C80 182 80 186 80 190 L70 288 C69 296 73 301 82 301 L158 301 C167 301 171 296 170 288 L160 190 C160 186 160 182 158 184 C145 182 132 187 120 187 C108 187 95 182 82 184 Z"
          fill={T.teal}
          stroke={T.tealShade}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* gloss + shade */}
        <path d="M94 196 C89 230 89 262 96 292" stroke="#ffffff" strokeWidth={6} opacity={0.22} strokeLinecap="round" fill="none" />
        <path d="M150 196 C156 230 156 262 150 292" stroke={T.tealShade} strokeWidth={8} opacity={0.3} strokeLinecap="round" fill="none" />

        {/* ---- chest badge (generic scallop emblem, not a real logo) ---- */}
        <rect x={104} y={250} width={32} height={13} rx={2} fill={T.badge} stroke="#9a1f19" strokeWidth={1} />
        <path d="M104 256 H136 M110 256 V263 M116 256 V263 M122 256 V263 M128 256 V263" stroke="#ffd9c0" strokeWidth={0.8} opacity={0.7} />
        <path d="M120 232 C107 232 102 244 105 250 L135 250 C138 244 133 232 120 232 Z" fill={T.shell} stroke="#b8910a" strokeWidth={1.2} strokeLinejoin="round" />
        <path d="M120 250 L113 234 M120 250 L120 232 M120 250 L127 234" stroke="#b8910a" strokeWidth={1} />

        {/* ---- head ---- */}
        <path d="M80 110 C78 150 84 174 120 176 C156 174 162 150 160 110 Z" fill={T.skin} stroke={T.skinShade} strokeWidth={2} />

        {/* cap dome */}
        <path d="M72 108 C70 62 94 46 120 46 C146 46 170 62 168 108 Z" fill={T.teal} stroke={T.tealShade} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M92 60 C84 70 80 86 82 100" stroke={T.tealHi} strokeWidth={6} opacity={0.6} strokeLinecap="round" fill="none" />
        {/* cap brim (sweeps to the front-left) */}
        <path d="M64 104 C40 104 30 114 42 120 C76 130 150 126 170 114 C176 110 172 104 164 104 C150 110 86 112 64 104 Z" fill={T.tealHi} stroke={T.tealShade} strokeWidth={2} strokeLinejoin="round" />

        {/* eyebrows */}
        <path d={brace ? 'M98 138 q8 -5 15 -1' : 'M100 142 q7 -3 13 0'} stroke={T.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />
        <path d={brace ? 'M127 137 q7 -4 15 1' : 'M127 142 q6 -3 13 0'} stroke={T.skinShade} strokeWidth={3} strokeLinecap="round" fill="none" />

        {/* eyes */}
        <ellipse cx={107} cy={151} rx={3.4} ry={4.6} fill={T.line} />
        <ellipse cx={133} cy={151} rx={3.4} ry={4.6} fill={T.line} />
        <circle cx={108} cy={149} r={1.1} fill="#fff" />
        <circle cx={134} cy={149} r={1.1} fill="#fff" />

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
