// How the model writes a tool call (issue #726, KI-Audit F3/F18): flat — `{ tool, ...args }` —
// instead of `{ tool, args: { … } }`. Vertex serves a response schema only up to 269 properties
// over all its objects (`llm/schemaBudget.ts`), and the `args` wrapper is one property per tool:
// 24 act tools and 3 lookups in a Buddy turn. Code nests the call again before it validates it,
// so every handler, every stored decision and every scripted answer keep the `{ tool, args }`
// shape they have; a call that already comes nested passes unchanged.

import { z } from 'zod';

type Call = z.ZodObject<{ tool: z.ZodLiteral<string>; args: z.AnyZodObject }>;

/** The flat object the model is offered for one call schema (`{ tool, args }`). */
function flatCall(call: Call): z.AnyZodObject {
  return z.object({ tool: call.shape.tool }).extend(call.shape.args.shape);
}

/** A flat call nested again (`{ tool, ...args }` → `{ tool, args }`); anything else as it came. */
export function nestCall(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if ('args' in value || !('tool' in value)) return value;
  const { tool, ...args } = value as Record<string, unknown>;
  return { tool, args };
}

/** The model's flat union of `calls`, discriminated by `tool`. */
export function flatUnion(calls: readonly Call[]) {
  const [first, second, ...rest] = calls.map(flatCall);
  if (!first) return z.never();
  if (!second) return first;
  return z.discriminatedUnion('tool', [first, second, ...rest]);
}
