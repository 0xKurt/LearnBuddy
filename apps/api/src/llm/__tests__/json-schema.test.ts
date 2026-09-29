// The zod → JSON-Schema seam the model is asked to answer in. A mistake here does
// not fail a test or a type check: it fails at Vertex, in a live call that costs
// money and a learner's turn. The shapes below are the ones the app really sends
// (modules/buddy/registry.ts, modules/materials/images.ts, modules/practice/*).

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toJsonSchema } from '../json-schema.js';

/** Every node of a schema, so a rule can be checked everywhere and not only on top. */
function nodes(schema: unknown): Array<Record<string, unknown>> {
  if (typeof schema !== 'object' || schema === null) return [];
  const node = schema as Record<string, unknown>;
  const children = [
    ...(Array.isArray(node.anyOf) ? node.anyOf : []),
    ...(node.items === undefined ? [] : [node.items]),
    ...Object.values((node.properties ?? {}) as Record<string, unknown>),
  ];
  return [node, ...children.flatMap(nodes)];
}

/** What Gemini's schema subset takes (json-schema.ts §head). */
const EMITTED = new Set([
  'type',
  'description',
  'enum',
  'items',
  'anyOf',
  'properties',
  'required',
  'additionalProperties',
]);

describe('what reaches Vertex', () => {
  // Bounds as constraints made Vertex refuse the Buddy turn schema ("too many states
  // for serving"): they go into the description, and zod still checks them on the way back.
  it('never sends a constraint, however deep it sits', () => {
    const schema = z.object({
      assets: z
        .array(
          z.object({
            page_index: z.number().int().min(0).max(19),
            box: z.array(z.number().min(0).max(1)).min(4).max(4),
            label: z.string().trim().min(1).max(120),
            item_indices: z.array(z.number().int().min(0).max(499)).min(1).max(60),
          }),
        )
        .max(12),
    });
    for (const node of nodes(toJsonSchema(schema))) {
      expect(Object.keys(node).every((k) => EMITTED.has(k))).toBe(true);
    }
  });

  it('says the bounds instead, so the model still knows them', () => {
    const out = toJsonSchema(
      z.object({
        page_index: z.number().int().min(0).max(19).describe('the page'),
        score: z.number().min(0.5),
        tries: z.number().int().max(3),
        plain: z.number(),
        box: z.array(z.number()).min(4).max(4),
        options: z.array(z.string()).min(2).describe('tappable answers'),
        free: z.array(z.string()),
      }),
    );
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.page_index).toEqual({ type: 'integer', description: 'the page (0–19)' });
    expect(props.score).toEqual({ type: 'number', description: '(at least 0.5)' });
    expect(props.tries).toEqual({ type: 'integer', description: '(at most 3)' });
    expect(props.plain).toEqual({ type: 'number' });
    expect(props.box?.description).toBe('(4–4 items)');
    expect(props.options?.description).toBe('tappable answers (at least 2 items)');
    expect(props.free?.description).toBeUndefined();
  });
});

describe('objects', () => {
  it('closes every object and asks for exactly the fields that are not optional', () => {
    const out = toJsonSchema(
      z.object({
        reply: z.string(),
        options: z.array(z.string()).nullable(),
        asks_permission: z.boolean(),
        // Lenient when parsing, so the model is not forced to write it.
        concern: z.boolean().default(false),
        note: z.string().optional(),
      }),
    );
    expect(out.additionalProperties).toBe(false);
    // A nullable field is still a field the model must write (null is an answer).
    expect(out.required).toEqual(['reply', 'options', 'asks_permission']);
    expect(Object.keys(out.properties as object)).toEqual([
      'reply',
      'options',
      'asks_permission',
      'concern',
      'note',
    ]);
  });

  it('closes nested objects too — a stray field there is just as wrong', () => {
    const out = toJsonSchema(
      z.object({ args: z.object({ id: z.string(), text: z.string().nullable() }) }),
    );
    for (const node of nodes(out)) {
      if (node.type === 'object') expect(node.additionalProperties).toBe(false);
    }
  });
});

describe('the forms the app actually uses', () => {
  it('turns an act-tool union into anyOf, each option told apart by its tool name', () => {
    const union = z.discriminatedUnion('tool', [
      z.object({ tool: z.literal('remember'), args: z.object({ text: z.string() }) }),
      z.object({ tool: z.literal('forget'), args: z.object({ id: z.string() }) }),
    ]);
    const out = toJsonSchema(union);
    expect(Array.isArray(out.anyOf)).toBe(true);
    const options = out.anyOf as Array<Record<string, unknown>>;
    expect(
      options.map((o) => (o.properties as Record<string, Record<string, unknown>>).tool),
    ).toEqual([
      { type: 'string', enum: ['remember'] },
      { type: 'string', enum: ['forget'] },
    ]);
    // Every branch stays a closed object; the model cannot invent a field.
    expect(options.every((o) => o.additionalProperties === false)).toBe(true);
  });

  it('offers a plain union as anyOf as well', () => {
    const out = toJsonSchema(z.union([z.string(), z.number().int()]));
    expect(out.anyOf).toEqual([{ type: 'string' }, { type: 'integer' }]);
  });

  it('writes an enum as the list of words, not as free text', () => {
    expect(toJsonSchema(z.enum(['study', 'homework']).describe('what for'))).toEqual({
      type: 'string',
      enum: ['study', 'homework'],
      description: 'what for',
    });
  });

  it('writes a literal as the one value it may be', () => {
    expect(toJsonSchema(z.literal('remember'))).toEqual({ type: 'string', enum: ['remember'] });
    expect(toJsonSchema(z.literal(3))).toEqual({ type: 'number', enum: [3] });
    expect(toJsonSchema(z.literal(true))).toEqual({ type: 'boolean' });
  });

  it('lets a nullable field answer with null, and says the reason only once', () => {
    const asked = z.array(z.string()).nullable().describe('answers, or null');
    expect(toJsonSchema(asked)).toEqual({
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
      description: 'answers, or null',
    });
    // The same text on wrapper and value would be billed twice (Gemini 3.x).
    const twice = z.string().describe('the reason').nullable().describe('the reason');
    expect(toJsonSchema(twice)).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'the reason',
    });
    // Two different texts both stay: they say different things.
    const both = z.string().describe('inner').nullable().describe('outer');
    expect(toJsonSchema(both)).toEqual({
      anyOf: [{ type: 'string', description: 'inner' }, { type: 'null' }],
      description: 'outer',
    });
  });

  it('looks through the wrappers that only concern parsing', () => {
    const plain = { type: 'string' };
    expect(toJsonSchema(z.string().optional())).toEqual(plain);
    expect(toJsonSchema(z.string().default('x'))).toEqual(plain);
    expect(toJsonSchema(z.string().catch('x'))).toEqual(plain);
    expect(toJsonSchema(z.string().refine((s) => s.length > 0))).toEqual(plain);
    expect(toJsonSchema(z.string().transform((s) => s.trim()))).toEqual(plain);
    // The wrapper's own words still reach the model.
    expect(toJsonSchema(z.string().optional().describe('why'))).toEqual({
      type: 'string',
      description: 'why',
    });
    expect(toJsonSchema(z.null().describe('nothing'))).toEqual({
      type: 'null',
      description: 'nothing',
    });
  });

  it('keeps the order of an array and describes what is in it', () => {
    expect(toJsonSchema(z.array(z.object({ id: z.string() })))).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    });
  });
});

describe('a shape it cannot express', () => {
  // Silently emitting something Gemini does not understand would only show up in a
  // live call: it fails here instead, with the type in the message.
  it('refuses rather than sending something the model cannot answer', () => {
    expect(() => toJsonSchema(z.record(z.string()))).toThrow(/unsupported zod type ZodRecord/);
    expect(() => toJsonSchema(z.date())).toThrow(/unsupported zod type ZodDate/);
    expect(() => toJsonSchema(z.tuple([z.string()]))).toThrow(/unsupported zod type ZodTuple/);
    expect(() => toJsonSchema(z.any())).toThrow(/unsupported zod type ZodAny/);
    // And deep inside a real shape, not only at the top.
    expect(() => toJsonSchema(z.object({ meta: z.record(z.string()) }))).toThrow(
      /unsupported zod type ZodRecord/,
    );
  });
});
