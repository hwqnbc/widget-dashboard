// An original cartoon SVG recreation of a boy holding his pet bearded dragon.
// viewBox is 240 x 380 (ratio ~0.63). Two expressions: 'idle' and 'brace'.

const P = {
  skin: '#f6c79f',
  skinShade: '#e2a87f',
  hair: '#3a2b21',
  hairHi: '#5f4634',
  white: '#fbfdff',
  stripe: '#bcdcf2',
  blue: '#3f86c4',
  blueShade: '#2f6ea8',
  collar: '#b7b9cc',
  shorts: '#2b3a66',
  shortsHi: '#3a4d80',
  liz: '#f7c81b',
  lizShade: '#dca412',
  lizBelly: '#ffe07a',
  lizSpot: '#d98f12',
  line: '#2a2118',
}

export default function Boy({
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
        <defs>
          <clipPath id="boyShirt">
            <path d="M84 188 C82 200 82 230 86 250 C104 258 136 258 154 250 C158 230 158 200 156 188 C148 188 142 198 134 198 C128 204 112 204 106 198 C98 198 92 188 84 188 Z" />
          </clipPath>
        </defs>

        {/* ---- legs + slippers ---- */}
        <path d="M108 300 L106 344" stroke={P.skin} strokeWidth={20} strokeLinecap="round" />
        <path d="M132 300 L134 344" stroke={P.skin} strokeWidth={20} strokeLinecap="round" />
        {/* left slipper (dog) */}
        <ellipse cx={102} cy={354} rx={17} ry={10} fill={P.shorts} stroke={P.line} strokeWidth={2.5} />
        <circle cx={101} cy={351} r={6} fill="#d8a05a" />
        <path d="M96 347 l-2 -4 l4 1 Z M106 347 l2 -4 l-4 1 Z" fill="#d8a05a" />
        <circle cx={99} cy={351} r={1} fill={P.line} />
        <circle cx={103} cy={351} r={1} fill={P.line} />
        <circle cx={101} cy={353} r={1.2} fill={P.line} />
        {/* right slipper (cat) */}
        <ellipse cx={138} cy={354} rx={17} ry={10} fill={P.shorts} stroke={P.line} strokeWidth={2.5} />
        <circle cx={137} cy={351} r={6} fill="#e8c34a" />
        <path d="M132 347 l-1 -5 l4 3 Z M142 347 l1 -5 l-4 3 Z" fill="#e8c34a" />
        <circle cx={135} cy={351} r={1} fill={P.line} />
        <circle cx={139} cy={351} r={1} fill={P.line} />
        <path d="M137 353 l-3 1 M137 353 l3 1" stroke={P.line} strokeWidth={0.7} />

        {/* ---- shorts ---- */}
        <path
          d="M86 246 C83 270 88 296 96 303 L116 303 C119 297 121 297 124 303 L134 303 C146 296 156 272 154 246 Z"
          fill={P.shorts}
          stroke={P.line}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <path d="M88 252 C108 258 132 258 152 252" fill="none" stroke={P.shortsHi} strokeWidth={4} strokeLinecap="round" />
        <path d="M120 258 L120 300" stroke={P.shortsHi} strokeWidth={2} opacity={0.6} />

        {/* ---- upper arms (behind torso) ---- */}
        <path d="M90 190 L82 240" stroke={P.skin} strokeWidth={24} strokeLinecap="round" />
        <path d="M150 190 L158 240" stroke={P.skin} strokeWidth={24} strokeLinecap="round" />

        {/* ---- neck ---- */}
        <path d="M107 156 L133 156 L131 192 L109 192 Z" fill={P.skin} stroke={P.line} strokeWidth={2} />
        <path d="M109 160 C116 168 124 168 131 160" fill={P.skinShade} opacity={0.55} />

        {/* ---- shirt (tank top) ---- */}
        <path
          d="M84 188 C82 200 82 230 86 250 C104 258 136 258 154 250 C158 230 158 200 156 188 C148 188 142 198 134 198 C128 204 112 204 106 198 C98 198 92 188 84 188 Z"
          fill={P.white}
          stroke={P.line}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        <g clipPath="url(#boyShirt)">
          {/* solid blue lower body */}
          <rect x={78} y={214} width={84} height={50} fill={P.blue} />
          {/* light-blue chest stripes on the white upper area */}
          <rect x={78} y={196} width={84} height={4} fill={P.stripe} />
          <rect x={78} y={204} width={84} height={4} fill={P.stripe} />
          <rect x={78} y={212} width={84} height={4} fill={P.blue} opacity={0.4} />
          {/* side shading */}
          <rect x={148} y={188} width={14} height={70} fill={P.blueShade} opacity={0.35} />
        </g>
        {/* collar trim */}
        <path d="M104 197 C112 205 128 205 136 197" fill="none" stroke={P.collar} strokeWidth={5} strokeLinecap="round" />
        {/* shoulder straps */}
        <path d="M90 190 C92 180 102 178 106 188" fill={P.white} stroke={P.line} strokeWidth={2} />
        <path d="M150 190 C148 180 138 178 134 188" fill={P.white} stroke={P.line} strokeWidth={2} />

        {/* ---- forearms holding lizard ---- */}
        <path d="M82 240 L102 250" stroke={P.skin} strokeWidth={22} strokeLinecap="round" />
        <path d="M158 240 L146 256" stroke={P.skin} strokeWidth={22} strokeLinecap="round" />

        {/* ---- bearded dragon ---- */}
        <g transform="rotate(-6 120 240)">
          {/* tail */}
          <path
            d="M166 226 C188 230 205 250 211 277 C213 289 206 297 199 294 C200 282 193 261 174 243 Z"
            fill={P.liz}
            stroke={P.lizShade}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* dorsal frill spikes */}
          <path
            d="M74 218 l4 -6 l4 6 l5 -6 l4 6 l6 -6 l5 6 l8 -5 l5 5 l9 -4 l5 4 l9 -3 l6 3 Z"
            fill={P.lizShade}
          />
          {/* body + head */}
          <path
            d="M58 234 C54 226 60 220 70 219 C74 216 82 215 90 216 C110 213 140 215 166 224 C176 227 182 233 180 240 C176 248 160 252 140 252 C110 254 80 252 66 246 C58 243 55 239 58 234 Z"
            fill={P.liz}
            stroke={P.lizShade}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* belly highlight */}
          <path d="M70 246 C100 252 140 250 172 240 C150 250 100 252 70 246 Z" fill={P.lizBelly} opacity={0.7} />
          {/* beard */}
          <path d="M60 242 l4 6 l3 -4 l3 5 l3 -4 l3 5 l2 -4 Z" fill={P.lizSpot} />
          {/* spots */}
          <ellipse cx={96} cy={230} rx={3} ry={2} fill={P.lizSpot} opacity={0.7} />
          <ellipse cx={118} cy={228} rx={3} ry={2} fill={P.lizSpot} opacity={0.7} />
          <ellipse cx={140} cy={230} rx={3} ry={2} fill={P.lizSpot} opacity={0.7} />
          {/* legs */}
          <path d="M98 250 l-2 12 m0 0 l-4 3 m4 -3 l0 5 m0 -5 l4 3" stroke={P.lizShade} strokeWidth={3} strokeLinecap="round" fill="none" />
          <path d="M150 250 l2 12 m0 0 l-4 3 m4 -3 l0 5 m0 -5 l4 3" stroke={P.lizShade} strokeWidth={3} strokeLinecap="round" fill="none" />
          {/* face */}
          <circle cx={70} cy={230} r={3.4} fill={P.line} />
          <circle cx={71} cy={229} r={1} fill="#fff" />
          <circle cx={60} cy={233} r={1} fill={P.lizShade} />
          <path d="M58 236 C68 240 80 240 90 238" fill="none" stroke={P.lizShade} strokeWidth={1.5} strokeLinecap="round" />
        </g>

        {/* fingers gripping over the lizard */}
        <g fill={P.skin} stroke={P.line} strokeWidth={1.5}>
          <rect x={96} y={246} width={6} height={12} rx={3} />
          <rect x={103} y={247} width={6} height={12} rx={3} />
          <rect x={140} y={250} width={6} height={12} rx={3} />
          <rect x={147} y={249} width={6} height={12} rx={3} />
        </g>

        {/* ---- head ---- */}
        {/* hair back */}
        <path d="M58 110 C44 56 80 26 120 24 C160 26 196 56 182 110 C180 96 172 90 165 90 L74 90 C68 90 60 96 58 110 Z" fill={P.hair} />
        {/* ears */}
        <ellipse cx={70} cy={110} rx={9} ry={12} fill={P.skin} stroke={P.line} strokeWidth={1.5} />
        <ellipse cx={170} cy={110} rx={9} ry={12} fill={P.skin} stroke={P.line} strokeWidth={1.5} />
        <path d="M68 105 C72 110 72 116 69 120" fill="none" stroke={P.skinShade} strokeWidth={1.5} />
        <path d="M172 105 C168 110 168 116 171 120" fill="none" stroke={P.skinShade} strokeWidth={1.5} />
        {/* face */}
        <path
          d="M70 96 C70 72 88 60 120 60 C152 60 170 72 170 96 C172 120 164 142 144 154 C132 161 108 161 96 154 C76 142 68 120 70 96 Z"
          fill={P.skin}
          stroke={P.line}
          strokeWidth={2}
        />
        {/* hair fringe over forehead */}
        <path
          d="M62 100 C50 50 86 26 120 24 C158 26 192 52 178 102 C176 86 168 90 168 90 C170 78 160 86 152 80 C146 92 138 84 130 88 C124 94 118 84 110 88 C102 94 94 84 86 86 C78 90 72 82 70 94 C70 92 64 88 62 100 Z"
          fill={P.hair}
        />
        {/* hair highlights */}
        <ellipse cx={104} cy={44} rx={16} ry={7} fill={P.hairHi} opacity={0.6} transform="rotate(-18 104 44)" />
        <ellipse cx={140} cy={50} rx={12} ry={5} fill={P.hairHi} opacity={0.5} transform="rotate(-12 140 50)" />

        {/* eyebrows */}
        {brace ? (
          <>
            <path d="M84 96 C92 90 104 90 110 95" fill="none" stroke={P.line} strokeWidth={5} strokeLinecap="round" />
            <path d="M130 95 C136 90 148 90 156 96" fill="none" stroke={P.line} strokeWidth={5} strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M86 102 C94 97 104 97 110 101" fill="none" stroke={P.line} strokeWidth={5} strokeLinecap="round" />
            <path d="M130 101 C136 97 146 97 154 102" fill="none" stroke={P.line} strokeWidth={5} strokeLinecap="round" />
          </>
        )}

        {/* eyes */}
        <ellipse cx={101} cy={117} rx={10} ry={13} fill={P.white} stroke={P.line} strokeWidth={1.5} />
        <ellipse cx={139} cy={117} rx={10} ry={13} fill={P.white} stroke={P.line} strokeWidth={1.5} />
        <circle cx={101} cy={118} r={7.5} fill={P.line} />
        <circle cx={139} cy={118} r={7.5} fill={P.line} />
        <circle cx={104} cy={114} r={2.4} fill="#fff" />
        <circle cx={142} cy={114} r={2.4} fill="#fff" />

        {/* nose */}
        <path d="M118 132 C120 135 122 135 124 132" fill="none" stroke={P.skinShade} strokeWidth={2} strokeLinecap="round" />

        {/* mouth */}
        {brace ? (
          <ellipse cx={120} cy={146} rx={6} ry={7} fill="#7a3b34" stroke={P.line} strokeWidth={1.5} />
        ) : (
          <path d="M108 144 C114 152 126 152 132 144" fill="none" stroke={P.line} strokeWidth={2.5} strokeLinecap="round" />
        )}

        {/* brace-only sweat drop */}
        {brace && <path d="M164 96 C168 104 172 104 168 110 C162 110 160 104 164 96 Z" fill="#7fd0f0" stroke="#4aa6d0" strokeWidth={1} />}
      </svg>
    </div>
  )
}
