// The fire ninja avatar's grouped pieces: head (chip), full figure, the looping
// victory action, and the tap-toggled fire-blade action, plus its palette. The
// avatar registry assembles the { Head, Figure, Celebration, Action } bundle
// from these.
// FireNinjaFigure3D/FireNinjaModel3D are deliberately NOT re-exported here:
// the registry imports them with lazy(), and a static re-export would pull
// three.js into the main chunk.
export { default as FireNinjaHead } from './FireNinjaHead'
export { default as FireNinjaFigure } from './FireNinjaFigure'
export { default as FireNinjaCelebration } from './FireNinjaCelebration'
export { default as FireBladeFigure } from './FireBladeFigure'
export { F } from './fireNinjaPalette'
