/// <reference types="vite/client" />

// Vite `?inline` CSS imports resolve to the stylesheet text as a string.
// vite/client doesn't ship this wildcard, and the strict tsconfig
// (verbatimModuleSyntax + noUncheckedSideEffectImports) needs an explicit
// module shape. Used for the ArcGIS light/dark theme swap on the Map page.
declare module '*.css?inline' {
  const css: string
  export default css
}
