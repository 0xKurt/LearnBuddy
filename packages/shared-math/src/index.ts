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
export * from './ratio.js';
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
export * from './mapGrid.js';
export * from './schematics.js';
export * from './figureNames.js';
// The names of the maps and pictures: the server hands them to every function that resolves a
// name. The app loads them with the first map or picture (`useFigureNames`, #440).
export { FIGURE_NAMES } from './figureNames.data.js';
// The drawings' shapes: the server decides with them what can be tapped; the app loads them with
// the first picture (`useSchematicShapes`).
export { SCHEMATIC_SHAPES } from './schematicShapes.data.js';
// The shapes of the maps: the server decides with them what can be tapped. The app never imports
// this index; it loads them when a map is on the screen (`useMapShapes`).
export { MAP_SHAPES } from './mapShapes.data.js';
export { mapZoom } from './mapZoom.js';
export * from './labelBoxes.js';
export * from './tap.js';
export * from './circuit.js';
export * from './logic.js';
export * from './itten.js';
