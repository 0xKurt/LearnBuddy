// The schema budget guard (issue #627, docs/engineering-guards.md §Schema budget): every response
// schema we send to Vertex stays at or under the property bound Vertex was measured to serve. The
// schema inventory (`evals/schema/inventory.ts`) lists every call. A schema over the bound is
// refused before the model reads a word, so a new field or form must fail here, not in a run.

import { describe, expect, it } from 'vitest';

import { variants } from '../../../evals/schema/inventory.js';
import * as sheetSources from '../../modules/materials/sources.js';
import { choiceFor } from '../../modules/practice/formChoice.js';
import { explainSchemaFor } from '../../modules/practice/setProfiles.js';
import type { JsonSchema } from '../gateway.js';
import { toJsonSchema } from '../json-schema.js';
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

  it.each(variants().map((v) => [`${v.purpose} — ${v.profile}`, v] as const))(
    '%s stays within the budget',
    (_name, v) => {
      expect(v.schema).toBeDefined();
      expect(schemaProperties(v.schema!)).toBeLessThanOrEqual(MAX_SCHEMA_PROPERTIES);
    },
  );

  it.each([
    ['practice', explainSchemaFor('practice', null)],
    ['test', explainSchemaFor('test', null)],
    ['help', explainSchemaFor('help', null)],
    ['a sheet', sheetSources.EXTRACTION_SCHEMA],
    ['homework', sheetSources.HOMEWORK_SCHEMA],
  ])('the choosing call before %s stays within the budget', (_name, full) => {
    expect(schemaProperties(toJsonSchema(choiceFor(full)))).toBeLessThanOrEqual(
      MAX_SCHEMA_PROPERTIES,
    );
  });
});
