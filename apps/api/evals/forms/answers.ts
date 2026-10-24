// requires live verification in Claude Code session
// Answers derived from the private key ONLY in this eval, never supplied to the generator.
import { StructuredTask, type StructuredAnswer } from '@learnbuddy/shared-types/contracts';
import { columnLayout } from '../../src/modules/practice/columnCalc.js';

export function keyedParts(raw: unknown): StructuredAnswer | null {
  const parsed = StructuredTask.safeParse(raw);
  if (!parsed.success) return null;
  const task = parsed.data;
  switch (task.type) {
    case 'order':
      return { type: task.type, order: task.key };
    case 'match':
      return { type: task.type, links: task.key };
    case 'select_all':
      return { type: task.type, chosen: task.key };
    case 'mark':
      return { type: task.type, marks: task.key };
    case 'find_error':
      return { type: task.type, line: task.key, fix: task.right };
    case 'cloze':
      return { type: task.type, gaps: task.gaps.map((g) => ({ id: g.id, text: g.key })) };
    case 'table_fill':
      return {
        type: task.type,
        cells: task.rows.flat().flatMap((c) => ('id' in c ? [{ id: c.id, text: c.key }] : [])),
      };
    case 'column_calc': {
      const layout = columnLayout(task);
      return layout
        ? {
            type: task.type,
            cells: [...layout.keys].map(([id, c]) => ({
              id,
              digit: c.blank ? '' : String(c.digit),
            })),
          }
        : null;
    }
    case 'grid_draw': {
      const sheet = task.sheet;
      return sheet.mode === 'bars'
        ? {
            type: task.type,
            points: [],
            bars: sheet.bars.map((b, i) => ({ id: b.id, value: sheet.values[i]! })),
          }
        : {
            type: task.type,
            points: sheet.mode === 'graph' ? sheet.key.slice(0, sheet.count) : sheet.key,
            bars: [],
          };
    }
  }
}
