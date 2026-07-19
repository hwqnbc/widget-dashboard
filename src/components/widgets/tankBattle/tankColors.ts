/** Tank paint schemes — their own module (a component file that also
 * exports constants trips react-refresh/only-export-components, lesson #19). */
export interface TankColors {
  hull: string
  turret: string
  track: string
}

export const PLAYER_TANK_COLORS: TankColors = {
  hull: '#5d7d4b',
  turret: '#4f6b40',
  track: '#33383b',
}

export const ENEMY_TANK_COLORS: TankColors = {
  hull: '#7a5350',
  turret: '#6b4744',
  track: '#3a3335',
}

export const HEAVY_TANK_COLORS: TankColors = {
  hull: '#5c4a63',
  turret: '#4e3d54',
  track: '#332e36',
}
