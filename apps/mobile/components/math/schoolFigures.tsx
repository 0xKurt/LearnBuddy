// The school figures that live in files of their own: clock, money, dot field, base-ten blocks
// (#254, PrimaryFigures.tsx), trees, pedigrees, automata (#256, TreeFigures.tsx), the periodic
// table (#250, PeriodicTable.tsx), solids, cube nets, points in space (#255, SolidFigures.tsx)
// and diagrams of boxes and arrows (#247, DiagramFigures.tsx). FigureView asks this file once
// for the drawing and once for the words, so a new figure of this kind is added here —
// FigureView is never touched for it again.

import type { Figure, PrimaryFigure } from '@learnbuddy/shared-types/contracts';

// Imported by path, like every figure file: the guards are dependency-free.
import { isDiagram } from '../../../../packages/shared-math/src/diagram.js';
import { isPeriodicTable } from '../../../../packages/shared-math/src/periodic.js';
import { isPrimary } from '../../../../packages/shared-math/src/primary.js';
import { isSpaceFigure } from '../../../../packages/shared-math/src/space.js';
import { isTreeFigure } from '../../../../packages/shared-math/src/trees.js';
import { DiagramBody, describeDiagram, type DiagramFig } from './DiagramFigures.js';
import { describePeriodic, PeriodicBody } from './PeriodicTable.js';
import { describePrimary, PrimaryBody } from './PrimaryFigures.js';
import { describeSpace, SpaceBody, type SpaceFig } from './SolidFigures.js';
import { describeTree, TreeBody } from './TreeFigures.js';

type TreeFig = Extract<Figure, { type: 'tree' | 'pedigree' | 'automaton' }>;
type PeriodicFig = Extract<Figure, { type: 'periodic_table' }>;
export type SchoolFigure = PrimaryFigure | TreeFig | PeriodicFig | SpaceFig | DiagramFig;
type T = (key: string, values?: Record<string, string | number>) => string;

export function isSchoolFigure(f: Figure): f is SchoolFigure {
  return isPrimary(f) || isTreeFigure(f) || isPeriodicTable(f) || isSpaceFigure(f) || isDiagram(f);
}

export function SchoolFigureBody({
  figure,
  width,
  scale,
}: {
  figure: SchoolFigure;
  width: number;
  /** How far FigureView shrinks the drawing; only a tree needs it, the rest follow the width. */
  scale: number;
}) {
  if (isPrimary(figure)) return <PrimaryBody figure={figure} width={width} />;
  if (isTreeFigure(figure)) return <TreeBody figure={figure} width={width} scale={scale} />;
  if (isPeriodicTable(figure)) return <PeriodicBody figure={figure} width={width} />;
  if (isDiagram(figure)) return <DiagramBody figure={figure} width={width} />;
  return <SpaceBody figure={figure} width={width} />;
}

/** The figure in words for a screen reader — each file says what its drawing shows. */
export function describeSchoolFigure(figure: SchoolFigure, t: T): string {
  if (isPrimary(figure)) return describePrimary(figure, t);
  if (isTreeFigure(figure)) return describeTree(figure, t);
  if (isPeriodicTable(figure)) return describePeriodic(figure, t);
  if (isDiagram(figure)) return describeDiagram(figure, t);
  return describeSpace(figure, t);
}
