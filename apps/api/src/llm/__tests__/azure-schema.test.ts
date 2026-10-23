import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buddyPrompt } from '../../modules/buddy/prompts.js';
import { registerLearning } from '../../modules/learning/register.js';
import { TutorDecision } from '../../modules/practice/tutor.js';
import { strictSchema, restoreStrictJson, assertStrictSchema } from '../chat-schema.js';
import { toJsonSchema } from '../json-schema.js';

registerLearning();
const assertAzureSchema = (schema: Parameters<typeof assertStrictSchema>[0]) =>
  assertStrictSchema(schema, { properties: 100, depth: 5 });

describe('strict Azure schemas retain the original contract', () => {
  it('requires optional fields as nullable without mutating names, order or descriptions', () => {
    const contract = z.object({
      properties: z.string().optional().describe('Original meaning'),
      items: z.enum(['a', 'b']).optional(),
      kept: z.string().nullable().optional(),
      required: z.string().nullable(),
      children: z.array(z.object({ x: z.number().optional() })),
    });
    const schema = toJsonSchema(contract);
    const before = JSON.stringify(schema);
    const strict = strictSchema(schema);
    expect(strict.required).toEqual(['properties', 'items', 'kept', 'required', 'children']);
    expect(strict.additionalProperties).toBe(false);
    expect(strict.properties).toMatchObject({
      properties: {
        description: 'Original meaning',
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      items: { anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }] },
    });
    const result = restoreStrictJson(schema, {
      properties: null,
      items: null,
      kept: null,
      required: null,
      children: [{ x: null }, { x: 3 }],
    });
    expect(result).toEqual({ kept: null, required: null, children: [{}, { x: 3 }] });
    expect(contract.safeParse(result).success).toBe(true);
    expect(JSON.stringify(schema)).toBe(before);
  });

  it('restores a real tutor answer, including the zod default', () => {
    const schema = toJsonSchema(TutorDecision);
    const wire = {
      intent: 'answer',
      verdict: 'correct',
      reply: 'Gut.',
      gave_hint: false,
      revealed_answer: false,
      concern: null,
    };
    expect(TutorDecision.parse(restoreStrictJson(schema, wire)).concern).toBe(false);
    expect(strictSchema(schema).required).toContain('concern');
    expect(() => assertAzureSchema(strictSchema(schema))).not.toThrow();
  });

  it('chooses the matching union branch before removing optional nulls', () => {
    const contract = z.object({
      rows: z.array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('optional'), value: z.string().optional() }),
          z.object({ kind: z.literal('nullable'), value: z.string().nullable() }),
        ]),
      ),
    });
    const value = restoreStrictJson(toJsonSchema(contract), {
      rows: [
        { kind: 'optional', value: null },
        { kind: 'nullable', value: null },
      ],
    });
    expect(value).toEqual({ rows: [{ kind: 'optional' }, { kind: 'nullable', value: null }] });
    expect(contract.safeParse(value).success).toBe(true);
  });

  it('does not erase invalid required nulls, unknown keys or unmatched union values', () => {
    const contract = z.object({ x: z.string(), y: z.string().optional() }).strict();
    const value = restoreStrictJson(toJsonSchema(contract), { x: null, extra: null, y: null });
    expect(value).toEqual({ x: null, extra: null });
    expect(contract.safeParse(value).success).toBe(false);
  });

  it('refuses the real Buddy schema rather than removing tools to fit the published limit', () => {
    expect(() => assertAzureSchema(strictSchema(buddyPrompt().turnStepSchema))).toThrow(/100/);
  });

  it('accepts five container levels and refuses six or a root union', () => {
    const wrap = (schema: z.ZodTypeAny) => z.object({ child: schema });
    let schema: z.ZodTypeAny = z.string();
    for (let i = 0; i < 5; i++) schema = wrap(schema);
    expect(() => assertAzureSchema(strictSchema(toJsonSchema(schema)))).not.toThrow();
    expect(() => assertAzureSchema(strictSchema(toJsonSchema(wrap(schema))))).toThrow(/nesting/);
    expect(() => assertAzureSchema({ anyOf: [{ type: 'object' }] })).toThrow(/root/);
  });
});
