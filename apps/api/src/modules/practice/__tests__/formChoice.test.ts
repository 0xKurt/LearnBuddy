// What the filter after a choice of forms takes out, and that it says so (#664, audit F10; the
// Zweitaudit probe `codex/probes.mts`).

import { FractionFigure } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toJsonSchema } from '../../../llm/json-schema.js';
import { strictSchema } from '../../../llm/chat-schema.js';

import { fitted, keepChosen, keptAndLost } from '../formChoice.js';

const figure = { type: 'fraction', shape: 'bar', fractions: [{ parts: 4, filled: 3 }] };
const before = {
  items: [
    { prompt: 'Berechne 2+2', answer: '4' },
    { prompt: 'Welcher Bruch ist markiert?', answer: '3/4', figure },
  ],
  structured: [{ type: 'order', prompt: 'Ordne', elements: ['a', 'b'] }],
  part_tasks: [{ prompt: 'Teil a' }],
  more_items: false,
  not_practicable: [],
  unclear: [],
};

describe('keptAndLost (#664)', () => {
  it('retains provider string bounds when narrowing the forms', () => {
    const schema = toJsonSchema(
      z.object({
        title: z.string().max(40),
        items: z.array(z.object({ text: z.string().max(120) })).max(2),
      }),
    );
    const narrowed = fitted(schema, { forms: [], figures: [] });
    expect(strictSchema(narrowed.schema)).toMatchObject({
      properties: {
        title: { maxLength: 40 },
        items: { maxItems: 2, items: { properties: { text: { maxLength: 120 } } } },
      },
    });
  });
  it('names every task it drops: a valid figure not chosen, a form not chosen', () => {
    expect(FractionFigure.safeParse(figure).success).toBe(true);
    const { kept, lost } = keptAndLost(before, { forms: new Set(), figures: new Set() });
    expect((kept as typeof before).items).toEqual([before.items[0]]);
    expect(lost).toEqual([
      { at: 'items[1]', kind: 'figure', name: 'fraction' },
      { at: 'part_tasks[0]', kind: 'form', name: 'part_tasks' },
      { at: 'structured[0]', kind: 'form', name: 'order' },
    ]);
  });

  it('loses nothing when everything written was chosen, or nothing was narrowed', () => {
    const all = { forms: new Set(['order', 'part_tasks']), figures: new Set(['fraction']) };
    expect(keptAndLost(before, all).lost).toEqual([]);
    expect(keptAndLost(before, null)).toEqual({ kept: before, lost: [] });
  });

  it('keepChosen keeps what it kept before', () => {
    const keep = { forms: new Set<string>(), figures: new Set<string>() };
    expect(keepChosen(before, keep)).toEqual(keptAndLost(before, keep).kept);
  });
});
