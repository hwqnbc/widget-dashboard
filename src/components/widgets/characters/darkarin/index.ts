// DarkArin avatar's grouped pieces: head (chip), full figure, the looping victory
// action, and the tap-toggled cross-swords action, plus its palette. The avatar
// registry assembles the { Head, Figure, Celebration, Action } bundle from these.
export { default as DarkArinHead } from './DarkArinHead'
export { default as DarkArinFigure } from './DarkArinFigure'
export { default as DarkArinCelebration } from './DarkArinCelebration'
export { default as TwinSwordFigure } from './TwinSwordFigure'
export { D } from './darkArinPalette'
// DarkArinFigure3D/DarkArinModel3D are deliberately NOT re-exported here: the
// registry imports them with lazy(), and a static re-export would pull
// three.js into the main chunk.
