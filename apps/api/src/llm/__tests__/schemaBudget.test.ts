// The schema budget guard (issue #627, docs/engineering-guards.md §Schema budget): every response
// schema we send to Vertex stays at or under the property bound Vertex was measured to serve —
// the choosing calls before a run or a reading included (`forms`, #665). The
// schema inventory (`evals/schema/inventory.ts`) lists every call. A schema over the bound is
// refused before the model reads a word, so a new field or form must fail here, not in a run.

import { describe, expect, it } from 'vitest';

import { variants } from '../../../evals/schema/inventory.js';
import type { JsonSchema } from '../gateway.js';
import { MAX_SCHEMA_PROPERTIES, schemaProperties, withinBudget } from '../schemaBudget.js';

/** One flat object with `n` required string properties: the shape the bound was measured on. */
function flat(n: number): JsonSchema {
  const properties: JsonSchema = {};
  for (let i = 0; i < n; i++) properties[`p${i}`] = { type: 'string' };
  return { type: 'object', properties, required: Object.keys(properties) };
}

describe('schema budget (#627)', () => {
  it('counts properties over every object, item and union branch', () => {
    const nested: JsonSchema = {
      type: 'object',
      properties: {
        a: { type: 'array', items: { type: 'object', properties: { x: {}, y: {} } } },
        b: {
          anyOf: [{ type: 'object', properties: { z: {} } }, { type: 'null' }],
        },
      },
    };
    expect(schemaProperties(nested)).toBe(5);
  });

  it('sits where Vertex was measured: 269 flat properties served, 270 refused', () => {
    expect(withinBudget(flat(MAX_SCHEMA_PROPERTIES))).toBe(true);
    expect(withinBudget(flat(MAX_SCHEMA_PROPERTIES + 1))).toBe(false);
  });

  it('lists every choosing call apart from the call it chooses for (#665)', () => {
    const choosing = variants().filter((v) => v.purpose === 'forms');
    // Every kind of run whose whole schema is past the budget, and the two kinds of reading.
    expect(choosing.map((v) => v.profile)).toEqual(
      expect.arrayContaining([
        'before explain kind=practice',
        'before explain kind=test',
        'before explain kind=help',
        'before extraction study',
        'before extraction homework',
      ]),
    );
    for (const v of choosing) expect(v.tier).toBe('fast');
  });

  it.each(variants().map((v) => [`${v.purpose} — ${v.profile}`, v] as const))(
    '%s stays within the budget',
    (_name, v) => {
      expect(v.schema).toBeDefined();
      expect(schemaProperties(v.schema!)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    },
  );
});
