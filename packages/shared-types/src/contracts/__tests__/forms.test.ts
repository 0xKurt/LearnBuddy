// Practice forms are chosen by Buddy or by code, never by the learner (CLAUDE.md rule 16,
// issue #296). The mechanical half on the contract side: no request the app can send names a
// form. A request that carried `ItemKind` — or an enum or literal made only of forms — would be
// the API half of a form picker. The app half is apps/mobile/lib/__tests__/minimalism.test.ts.
//
// What this cannot see: a form smuggled through a free `z.string()`. That is a review question,
// not a mechanical one.
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import * as contracts from '../index.js';
import { ItemKind } from '../learning.js';

const FORMS: readonly string[] = ItemKind.options;

/** Every schema reachable from `root`, whatever wraps it (objects, unions, effects, lazy …). */
function reachable(root: z.ZodTypeAny): z.ZodTypeAny[] {
  const seen = new Set<z.ZodTypeAny>();
  const visit = (s: z.ZodTypeAny) => {
    if (seen.has(s)) return;
    seen.add(s);
    const def = s._def as Record<string, unknown>;
    for (const [key, value] of Object.entries(def)) {
      if (value instanceof z.ZodType) visit(value);
      else if (Array.isArray(value)) {
        for (const v of value) if (v instanceof z.ZodType) visit(v);
      } else if (key === 'shape' && typeof value === 'function') {
        for (const v of Object.values((value as () => Record<string, unknown>)()))
          if (v instanceof z.ZodType) visit(v);
      } else if (key === 'getter' && typeof value === 'function') {
        const v: unknown = (value as () => unknown)();
        if (v instanceof z.ZodType) visit(v);
      }
    }
  };
  visit(root);
  return [...seen];
}

/** Does this schema let the sender pick a form? */
function namesAForm(s: z.ZodTypeAny): boolean {
  if (s === ItemKind) return true;
  if (s instanceof z.ZodEnum) {
    const options = s.options as readonly string[];
    return options.length > 0 && options.every((o) => FORMS.includes(o));
  }
  if (s instanceof z.ZodLiteral) return typeof s.value === 'string' && FORMS.includes(s.value);
  return false;
}

const requests: [string, z.ZodTypeAny][] = Object.entries(
  contracts as Record<string, unknown>,
).flatMap(([name, value]): [string, z.ZodTypeAny][] =>
  name.endsWith('Request') && value instanceof z.ZodType ? [[name, value]] : [],
);

describe('no request carries a practice form (rule 16, issue #296)', () => {
  it('finds the requests it guards', () => {
    expect(requests.map(([name]) => name)).toContain('StartTopicRequest');
    expect(requests.length).toBeGreaterThan(20);
  });

  it('sees through the wrappers to the fields', () => {
    // StartPracticeRequest is an object behind .refine(); its `mode` enum must be reached.
    const all = reachable(contracts.StartPracticeRequest);
    expect(all.some((s) => s instanceof z.ZodEnum && s.options.includes('test'))).toBe(true);
  });

  it('has no request that lets the learner choose a form', () => {
    const offending = requests
      .filter(([, schema]) => reachable(schema).some(namesAForm))
      .map(([name]) => name);
    expect(offending).toEqual([]);
  });

  it('would catch one if it were written', () => {
    const picks = (s: z.ZodTypeAny) => reachable(s).some(namesAForm);
    expect(picks(z.object({ form: ItemKind }))).toBe(true);
    expect(picks(z.object({ form: z.enum(['order', 'match']).optional() }))).toBe(true);
    expect(picks(z.object({ a: z.array(z.object({ kind: z.literal('table_fill') })) }))).toBe(true);
    // A session mode is not a form, even where some names coincide ('vocab', 'speak').
    expect(picks(z.object({ kind: z.enum(['practice', 'vocab', 'speak']) }))).toBe(false);
  });
});
