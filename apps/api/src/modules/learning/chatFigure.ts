// A picture in the conversation uses the same checked data and library as practice (#934).
import {
  FIGURE_NAMES,
  schematicCanonical,
  schematicNumbered,
  schematicPartName,
  schematicProblem,
} from '@learnbuddy/shared-math';
import { ChatFigure, SCHEMATIC_DRAWINGS } from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';
import { type ActToolEntry } from '../buddy/registry.js';
import { ToolRejection, type ToolOutcome, type ToolContext } from '../buddy/toolKit.js';
import { wholeDrawing } from '../practice/items.js';
import { figureHolds } from '../practice/figureCheck.js';

function figureProblem(figure: ChatFigure): string | null {
  if (figure.type === 'schematic') {
    const problem = schematicProblem(FIGURE_NAMES, figure);
    return problem
      ? `${problem}; available parts: ${FIGURE_NAMES.pictures[figure.d].parts.map((p) => p.id).join(', ')}`
      : null;
  }
  return wholeDrawing(figure) && figureHolds(figure, '', false)
    ? null
    : 'drawing must be complete and numerically consistent';
}
const showFigure = z.object({
  tool: z.literal('show_figure'),
  args: z.object({
    drawing: z.enum([...SCHEMATIC_DRAWINGS, 'fraction_circle', 'fraction_bar']),
    n: z
      .array(z.string().trim().min(1).max(40))
      .max(6)
      .describe('library part ids from schematic_parts; empty for fractions'),
    parts: z
      .number()
      .int()
      .min(1)
      .max(24)
      .nullable()
      .describe('fraction denominator; null for library drawings'),
    filled: z
      .number()
      .int()
      .min(0)
      .max(24)
      .nullable()
      .describe('fraction numerator; null for library drawings'),
  }),
});
declare module '../buddy/decision.js' {
  interface DomainActSchemas {
    show_figure: typeof showFigure;
  }
}
export const CHAT_FIGURE_TOOL: ActToolEntry & { name: 'show_figure' } = {
  name: 'show_figure',
  schema: showFigure,
  before: 'open_area',
  spec: {
    surfaces: ['turn'],
    touches: ['nothing'],
    needsQuote: false,
    undoable: false,
    offer: true,
    does: 'display a checked library drawing or fraction immediately in chat, including picture follow-ups',
  },
};

export async function runShowFigure(
  action: z.infer<typeof showFigure>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const { drawing, n, parts, filled } = action.args;
  const fraction = drawing === 'fraction_circle' || drawing === 'fraction_bar';
  if (fraction ? n.length > 0 : parts !== null || filled !== null)
    throw new ToolRejection('show_figure: library drawings use n; fractions use parts and filled');
  const parsed = ChatFigure.safeParse(
    fraction
      ? {
          type: 'fraction',
          shape: drawing === 'fraction_circle' ? 'circle' : 'bar',
          fractions: [{ parts, filled }],
        }
      : { type: 'schematic', d: drawing, n, ask: 0 },
  );
  if (!parsed.success) throw new ToolRejection(`show_figure: ${parsed.error.message}`);
  const raw = parsed.data;
  const problem = figureProblem(raw);
  if (problem) throw new ToolRejection(`show_figure: ${problem}`);
  const figure = raw.type === 'schematic' ? schematicCanonical(FIGURE_NAMES, raw) : raw;
  const labels =
    figure.type === 'schematic'
      ? (schematicNumbered(FIGURE_NAMES, figure) ?? []).map(
          (part, i) => `${i + 1}. ${schematicPartName(FIGURE_NAMES, figure.d, part, ctx.locale)}`,
        )
      : [];
  return { summary: { tool: 'show_figure', figure, labels }, undo: null };
}
