// The Jet Trooper avatar's grouped pieces: head (chip), full figure, and
// the looping Jet & Blast celebration, plus its palette. The avatar
// registry assembles the { Head, Figure, Celebration } bundle from these.
// JetTrooperFigure3D/JetTrooperModel3D are deliberately NOT re-exported
// here: the registry imports them with lazy(), and a static re-export
// would pull three.js into the main chunk.
export { default as JetTrooperHead } from './JetTrooperHead'
export { default as JetTrooperFigure } from './JetTrooperFigure'
export { default as JetTrooperCelebration } from './JetTrooperCelebration'
export { JT } from './jetTrooperPalette'
