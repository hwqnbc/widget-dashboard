// The Imperium Claw General avatar's grouped pieces: head (chip), full figure, and
// the looping diagonal-slash celebration, plus its palette. The avatar registry
// assembles the { Head, Figure, Celebration } bundle from these.
export { default as ImperiumHead } from './ImperiumHead'
export { default as ImperiumFigure } from './ImperiumFigure'
export { default as ImperiumCelebration } from './ImperiumCelebration'
export { IM } from './imperiumPalette'
// ImperiumFigure3D/ImperiumModel3D are deliberately NOT re-exported here: the
// registry imports them with lazy(), and a static re-export would pull
// three.js into the main chunk.
