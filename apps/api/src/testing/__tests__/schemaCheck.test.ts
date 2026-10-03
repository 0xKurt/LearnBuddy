// The decoder stand-in of the profile tests (issue #281, D2) on handmade schemas: it must say
// "no" exactly where Vertex's constrained decoding would, or the profile tests prove nothing.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toJsonSchema } from '../../llm/json-schema.js';
import { schemaErrors } from '../schemaCheck.js';

const Shape = toJsonSchema(
  z.object({
    title: z.string(),
    note: z.string().nullable().default(null),
    marks: z.array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('dot'), size: z.number().int() }),
        z.object({ kind: z.literal('box'), color: z.enum(['red', 'blue']) }),
      ]),
    ),
  }),
);

describe('schemaErrors', () => {
  it('accepts what the schema allows, an optional field left out', () => {
    expect(schemaErrors(Shape, { title: 'x', marks: [{ kind: 'dot', size: 2 }] })).toEqual([]);
    expect(
      schemaErrors(Shape, { title: 'x', note: null, marks: [{ kind: 'box', color: 'red' }] }),
    ).toEqual([]);
  });

  it('rejects a missing required field, an extra field, a wrong type and a value off the enum', () => {
    expect(schemaErrors(Shape, { marks: [] })).toEqual(['$.title: missing']);
    expect(schemaErrors(Shape, { title: 'x', marks: [], extra: 1 })).toEqual([
      '$.extra: not allowed',
    ]);
    expect(schemaErrors(Shape, { title: 1, marks: [] })).toEqual(['$.title: not string']);
    expect(schemaErrors(Shape, { title: 'x', marks: [{ kind: 'dot', size: 1.5 }] })).toHaveLength(
      1,
    );
    expect(
      schemaErrors(Shape, { title: 'x', marks: [{ kind: 'box', color: 'green' }] }),
    ).toHaveLength(1);
  });

  it('rejects a union branch that does not exist', () => {
    expect(schemaErrors(Shape, { title: 'x', marks: [{ kind: 'star' }] })[0]).toContain(
      'no anyOf branch fits',
    );
  });

  it('throws on a keyword it does not know rather than ignoring it', () => {
    expect(() => schemaErrors({ type: 'string', pattern: 'x' }, 'x')).toThrow(/pattern/);
  });
});
