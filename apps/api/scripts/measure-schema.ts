import { z } from 'zod';

import { toJsonSchema } from '../src/llm/json-schema.js';
import { lookupsField } from '../src/modules/buddy/lookups.js';
import { TURN_SYSTEM } from '../src/modules/buddy/prompts.js';
import { CheckDecision, TurnDecisionForModel } from '../src/modules/buddy/registry.js';

function walk(node: unknown, out: { desc: number; count: number; longest: string }): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'description' && typeof v === 'string') {
        out.desc += v.length;
        out.count += 1;
        if (v.length > out.longest.length) out.longest = v;
      } else walk(v, out);
    }
  }
}

const schemas: [string, unknown][] = [
  [
    'turn, lookup round',
    toJsonSchema(z.object({ lookups: lookupsField }).extend(TurnDecisionForModel.shape)),
  ],
  ['turn, final round', toJsonSchema(TurnDecisionForModel)],
  ['background check', toJsonSchema(CheckDecision)],
];
for (const [name, schema] of schemas) {
  const json = JSON.stringify(schema);
  const out = { desc: 0, count: 0, longest: '' };
  walk(schema, out);
  console.log(
    `${name.padEnd(20)} ${String(json.length).padStart(7)} chars total · ` +
      `${String(out.desc).padStart(6)} description (${Math.round((100 * out.desc) / json.length)} %) · ` +
      `${out.count} of them · longest ${out.longest.length}`,
  );
}
console.log(`${'TURN_SYSTEM'.padEnd(20)} ${String(TURN_SYSTEM.length).padStart(7)} chars`);
