// The school figures that live in files of their own: clock, money, dot field, base-ten blocks
// (#254, PrimaryFigures.tsx), trees, pedigrees, automata (#256, TreeFigures.tsx), the periodic
// table (#250, PeriodicTable.tsx) and solids, cube nets, points in space (#255,
// SolidFigures.tsx). FigureView asks this file once for the drawing and once for the words, so a
// new figure of this kind is added here — FigureView is never touched for it again.

import type { Figure, PrimaryFigure } from '@learnbuddy/shared-types/contracts';

// Imported by path, like every figure file: the guards are dependency-free.
import { isPeriodicTable } from '../../../../packages/shared-math/src/periodic.js';
import { isPrimary } from '../../../../packages/shared-math/src/primary.js';
import { isSpaceFigure } from '../../../../packages/shared-math/src/space.js';
import { isTreeFigure } from '../../../../packages/shared-math/src/trees.js';
import { describePeriodic, PeriodicBody } from './PeriodicTable.js';
import { describePrimary, PrimaryBody } from './PrimaryFigures.js';
import { describeSpace, SpaceBody, type SpaceFig } from './SolidFigures.js';
import { describeTree, TreeBody } from './TreeFigures.js';

type TreeFig = Extract<Figure, { type: 'tree' | 'pedigree' | 'automaton' }>;
type PeriodicFig = Extract<Figure, { type: 'periodic_table' }>;
export type SchoolFigure = PrimaryFigure | TreeFig | PeriodicFig | SpaceFig;
type T = (key: string, values?: Record<string, string | number>) => string;

export function isSchoolFigure(f: Figure): f is SchoolFigure {
  return isPrimary(f) || isTreeFigure(f) || isPeriodicTable(f) || isSpaceFigure(f);
}

export function SchoolFigureBody({ figure, width }: { figure: SchoolFigure; width: number }) {
  if (isPrimary(figure)) return <PrimaryBody figure={figure} width={width} />;
  if (isTreeFigure(figure)) return <TreeBody figure={figure} width={width} />;
  if (isPeriodicTable(figure)) return <PeriodicBody figure={figure} width={width} />;
  return <SpaceBody figure={figure} width={width} />;
}

/** The figure in words for a screen reader — each file says what its drawing shows. */
export function describeSchoolFigure(figure: SchoolFigure, t: T): string {
  if (isPrimary(figure)) return describePrimary(figure, t);
  if (isTreeFigure(figure)) return describeTree(figure, t);
  if (isPeriodicTable(figure)) return describePeriodic(figure, t);
  return describeSpace(figure, t);
}
