// The toy avatar's grouped pieces: head (chip), full figure, and the looping
// victory action, plus its palette/parts. The avatar registry assembles the
// { Head, Figure, Celebration } bundle from these.
// ToyFigure3D is deliberately NOT re-exported here: the registry imports it
// with lazy(), and a static re-export would pull three.js into the main chunk.
export { default as ToyHead } from './ToyHead'
export { default as ToyFigure } from './ToyFigure'
export { default as ToyCelebration } from './ToyCelebration'
export { default as SixSevenFigure } from './SixSevenFigure'
export { TOY } from './toyPalette'
export * from './toyParts'
