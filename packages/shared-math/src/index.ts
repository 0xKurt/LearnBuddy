// @learnbuddy/shared-math — answer normalisation, numeric input, units, a bounded
// expression parser and LaTeX helpers (docs/architecture.md §Practice). No evaluator.
export * from './numeric-input.js';
export * from './normalize.js';
export * from './units.js';
export * from './expression.js';
export * from './latex.js';
export * from './answer.js';
export * from './charts.js';
export * from './molecule.js';
export * from './primary.js';
export * from './trees.js';
export * from './pedigree.js';
export * from './periodic.js';
export * from './solids.js';
export * from './space.js';
export * from './cubes.js';
export * from './solidNets.js';
export * from './diagram.js';
export * from './regions.js';
export * from './maps.js';
// The shapes of the maps: the server decides with them what can be tapped. The app never imports
// this index; it loads them when a map is on the screen (`useMapShapes`).
export { MAP_SHAPES } from './mapShapes.data.js';
export * from './tap.js';
