// The school figures that live in files of their own: clock, money, dot field, base-ten blocks
// (#254, PrimaryFigures.tsx), trees, pedigrees, automata (#256, TreeFigures.tsx), the periodic
// table (#250, PeriodicTable.tsx), solids, cube nets, points in space (#255, SolidFigures.tsx),
// diagrams of boxes and arrows (#247, DiagramFigures.tsx), circuits and logic nets (#261,
// CircuitFigures.tsx), Itten's colour wheel (#261, ColorWheel.tsx), maps (#251, MapFigures.tsx) and labelled pictures
// (#252, SchematicFigures.tsx). FigureView asks this file once
// for the drawing and once for the words, so a new figure of this kind is added here —
// FigureView is never touched for it again.

import type { Figure, PrimaryFigure } from '@learnbuddy/shared-types/contracts';

// Imported by path, like every figure file: the guards are dependency-free.
import type { Translate } from '../../lib/i18n/index.js';
import { isCircuit } from '../../../../packages/shared-math/src/circuit.js';
import { isDiagram } from '../../../../packages/shared-math/src/diagram.js';
import type { FigureNames } from '../../../../packages/shared-math/src/figureNames.js';
import { isColorWheel } from '../../../../packages/shared-math/src/itten.js';
import { isLogic } from '../../../../packages/shared-math/src/logic.js';
import { isMap } from '../../../../packages/shared-math/src/maps.js';
import { isSchematic } from '../../../../packages/shared-math/src/schematics.js';
import { isPeriodicTable } from '../../../../packages/shared-math/src/periodic.js';
import { isPrimary } from '../../../../packages/shared-math/src/primary.js';
import { isSpaceFigure } from '../../../../packages/shared-math/src/space.js';
import { isTreeFigure } from '../../../../packages/shared-math/src/trees.js';
import {
  describeSwitching,
  SwitchingBody,
  type CircuitFig,
  type LogicFig,
} from './CircuitFigures.js';
import { ColorWheelBody, describeColorWheel, type ColorWheelFig } from './ColorWheel.js';
import { DiagramBody, describeDiagram, type DiagramFig } from './DiagramFigures.js';
import { describeMap, MapBody, type MapFigure } from './MapFigures.js';
import { describeSchematic, SchematicBody, type SchematicFigure } from './SchematicFigures.js';
import { describePeriodic, PeriodicBody } from './PeriodicTable.js';
import { describePrimary, PrimaryBody } from './PrimaryFigures.js';
import { describeSpace, SpaceBody, type SpaceFig } from './SolidFigures.js';
import { describeTree, TreeBody } from './TreeFigures.js';

type TreeFig = Extract<Figure, { type: 'tree' | 'pedigree' | 'automaton' }>;
type PeriodicFig = Extract<Figure, { type: 'periodic_table' }>;
export type SchoolFigure =
  | PrimaryFigure
  | TreeFig
  | PeriodicFig
  | SpaceFig
  | DiagramFig
  | CircuitFig
  | LogicFig
  | ColorWheelFig
  | MapFigure
  | SchematicFigure;

export function isSchoolFigure(f: Figure): f is SchoolFigure {
  return (
    isPrimary(f) ||
    isTreeFigure(f) ||
    isPeriodicTable(f) ||
    isSpaceFigure(f) ||
    isDiagram(f) ||
    isCircuit(f) ||
    isLogic(f) ||
    isColorWheel(f) ||
    isMap(f) ||
    isSchematic(f)
  );
}

export function SchoolFigureBody({
  figure,
  width,
  scale,
}: {
  figure: SchoolFigure;
  width: number;
  /**
   * How far FigureView shrinks the drawing. A tree, a circuit, a logic net and a labelled picture
   * need it (their height does not follow their width, #419, #462); the rest follow the width.
   */
  scale: number;
}) {
  if (isPrimary(figure)) return <PrimaryBody figure={figure} width={width} />;
  if (isTreeFigure(figure)) return <TreeBody figure={figure} width={width} scale={scale} />;
  if (isSchematic(figure)) return <SchematicBody figure={figure} width={width} scale={scale} />;
  if (isPeriodicTable(figure)) return <PeriodicBody figure={figure} width={width} />;
  if (isDiagram(figure)) return <DiagramBody figure={figure} width={width} />;
  if (isCircuit(figure) || isLogic(figure))
    return <SwitchingBody figure={figure} width={width} scale={scale} />;
  if (isColorWheel(figure)) return <ColorWheelBody figure={figure} width={width} />;
  if (isMap(figure)) return <MapBody figure={figure} width={width} />;
  return <SpaceBody figure={figure} width={width} />;
}

/**
 * The figure in words for a screen reader — each file says what its drawing shows. A map and a
 * picture are described with their names (`useFigureNames`); until they are loaded, that they are
 * coming — never a description without them.
 */
export function describeSchoolFigure(
  figure: SchoolFigure,
  t: Translate,
  names: FigureNames | null,
): string {
  if (isPrimary(figure)) return describePrimary(figure, t);
  if (isTreeFigure(figure)) return describeTree(figure, t);
  if (isPeriodicTable(figure)) return describePeriodic(figure, t);
  if (isDiagram(figure)) return describeDiagram(figure, t);
  if (isCircuit(figure) || isLogic(figure)) return describeSwitching(figure, t);
  if (isColorWheel(figure)) return describeColorWheel(figure, t);
  if (isMap(figure)) return names ? describeMap(figure, t, names) : t('figure.loading');
  if (isSchematic(figure)) return names ? describeSchematic(figure, t, names) : t('figure.loading');
  return describeSpace(figure, t);
}
