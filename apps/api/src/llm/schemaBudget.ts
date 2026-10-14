// How large a response schema Vertex still serves (issue #627). Vertex refuses a
// `responseJsonSchema` that is too large with a bare `400 INVALID_ARGUMENT` ("Request contains an
// invalid argument."). It names no limit and no field. Gemini 2.5 called the same thing "too many
// states for serving" (#279). The request never reaches the model, and the run ends in
// `model_unavailable`.
//
// What decides it, measured on `eu/gemini-3.6-flash` on 14.10.2026 (#627): the count of PROPERTIES
// over every object of the schema. Descriptions, enum values, nesting depth and the number of union
// branches did not change the verdict:
//   - one flat object with 269 required string properties is served, with 270 it is refused; 280
//     properties with only 250 of them required are refused too;
//   - the item schema with the 32-branch figure union has 291 properties: refused; without
//     `geometry.polygons` it has 290 and is served; with every description removed it is still
//     refused; a union of 64 small branches (129 properties) is served;
//   - the Buddy turn (268) is served; practice (774), test (743), help (518), the sheet reading
//     (700) and homework (645) were refused.
// Every refused schema had at least 270 properties. Every schema at 269 or fewer was served. A tree
// was once served at 290, so the limit is no plain property count. 269 is the bound every
// measurement holds to, and a schema we send stays at or under it
// (`__tests__/schemaBudget.test.ts`; docs/engineering-guards.md §Schema budget).

import type { JsonSchema } from './gateway.js';

/** The most properties a schema we send may declare over all its objects (#627). */
export const MAX_SCHEMA_PROPERTIES = 269;

type Node = JsonSchema[string];

function isSchema(n: Node | undefined): n is JsonSchema {
  return typeof n === 'object' && n !== null && !Array.isArray(n);
}

/** Properties declared over every object of `schema` (property values, items and anyOf branches). */
export function schemaProperties(schema: JsonSchema): number {
  let count = 0;
  const walk = (s: JsonSchema): void => {
    const props = s.properties;
    if (isSchema(props)) {
      for (const value of Object.values(props)) {
        count += 1;
        if (isSchema(value)) walk(value);
      }
    }
    if (isSchema(s.items)) walk(s.items);
    if (Array.isArray(s.anyOf)) for (const b of s.anyOf) if (isSchema(b)) walk(b);
  };
  walk(schema);
  return count;
}

/** Whether Vertex serves this schema, by the measured bound. */
export function withinBudget(schema: JsonSchema): boolean {
  return schemaProperties(schema) <= MAX_SCHEMA_PROPERTIES;
}
