// The frak avatar's grouped pieces: head (chip), full figure, and the looping
// chopping celebration, plus its palette. The avatar registry assembles the
// { Head, Figure, Celebration } bundle from these.
export { default as FrakHead } from './FrakHead'
export { default as FrakFigure } from './FrakFigureStatic'
export { default as FrakCelebration } from './FrakCelebration'
export { FR } from './frakPalette'
// FrakFigure3D/FrakModel3D are deliberately NOT re-exported here: the
// registry imports them with lazy(), and a static re-export would pull
// three.js into the main chunk.
