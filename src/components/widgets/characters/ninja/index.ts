// The ninja avatar's grouped pieces: head (chip), full figure, and the looping
// victory action, plus its palette. The avatar registry assembles the
// { Head, Figure, Celebration } bundle from these.
// NinjaFigure3D/NinjaModel3D are deliberately NOT re-exported here: the
// registry imports them with lazy(), and a static re-export would pull
// three.js into the main chunk.
export { default as NinjaHead } from './NinjaHead'
export { default as NinjaFigure } from './NinjaFigure'
export { default as NinjaCelebration } from './NinjaCelebration'
export { default as SwordNinjaFigure } from './SwordNinjaFigure'
export { N } from './ninjaPalette'
