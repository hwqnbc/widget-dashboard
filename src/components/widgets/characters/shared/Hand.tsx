/**
 * An open "C"-shaped gripper hand centred at (cx, cy). `r` is the grip radius;
 * the opening offsets scale with it so different characters (toy r=9, ninja
 * r=8) share one implementation.
 */
export default function Hand({
  cx,
  cy,
  stroke,
  r = 9,
  strokeWidth = 7,
}: {
  cx: number
  cy: number
  stroke: string
  r?: number
  strokeWidth?: number
}) {
  const dx = r - 1
  const dy = r - 3
  return (
    <path
      d={`M${cx - dx} ${cy + dy} A ${r} ${r} 0 1 1 ${cx + dx} ${cy + dy}`}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  )
}
