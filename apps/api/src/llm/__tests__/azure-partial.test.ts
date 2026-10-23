import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { restoreAzurePartial } from '../azure-partial.js';
import { restoreAzureJson } from '../azure-schema.js';
import { toJsonSchema } from '../json-schema.js';
import { answerUpTo, partialString } from '../partial.js';

const contract = z.object({
  before: z.string().optional(),
  reply: z.string(),
  rows: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('omit'), x: z.number().optional() }),
        z.object({ kind: z.literal('keep'), x: z.number().nullable() }),
      ]),
    )
    .nullable(),
  after: z.string().optional(),
});
const schema = toJsonSchema(contract);
const wire = JSON.stringify({
  before: null,
  reply: 'Hallo "{null}", Grüße \\n',
  rows: [
    { kind: 'omit', x: null },
    { kind: 'keep', x: null },
  ],
  after: null,
});

describe('Azure partial JSON restoration', () => {
  it('preserves partial-string completion at every possible chunk boundary', () => {
    for (let i = 1; i <= wire.length; i++) {
      const prefix = wire.slice(0, i);
      expect(partialString(restoreAzurePartial(schema, prefix), 'reply')).toEqual(
        partialString(prefix, 'reply'),
      );
    }
  });

  it('restores completed rows in nullable arrays before the rest of the response arrives', () => {
    const prefix = wire.slice(0, wire.indexOf('},{') + 2);
    const partial = restoreAzurePartial(schema, prefix);
    expect(answerUpTo(partial, 'rows', 1)).toEqual({
      reply: 'Hallo "{null}", Grüße \\n',
      rows: [{ kind: 'omit' }],
    });
    const complete = JSON.parse(restoreAzurePartial(schema, wire));
    expect(complete).toEqual(restoreAzureJson(schema, JSON.parse(wire)));
    expect(contract.safeParse(complete).success).toBe(true);
  });
});
