// Chat Completions strict wire schema; the domain's zod contract and prompt remain unchanged.
import { LlmError, type JsonSchema } from './gateway.js';
import { schemaProperties } from './schemaBudget.js';

export function schemaObject(value: unknown): value is JsonSchema {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function branches(schema: JsonSchema): JsonSchema[] {
  return Array.isArray(schema.anyOf) ? schema.anyOf.filter(schemaObject) : [];
}

function acceptsNull(schema: JsonSchema): boolean {
  return schema.type === 'null' || branches(schema).some(acceptsNull);
}

/** All properties required; only formerly optional, non-nullable fields gain a null sentinel. */
export function strictSchema(schema: JsonSchema): JsonSchema {
  const out = { ...schema };
  if (schemaObject(schema.properties)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => {
        if (!schemaObject(value))
          throw new LlmError('refused', 'unsupported strict schema property');
        const child = strictSchema(value);
        if (required.includes(key) || acceptsNull(child)) return [key, child];
        const { description, ...inner } = child;
        return [
          key,
          {
            ...(description === undefined ? {} : { description }),
            anyOf: [inner, { type: 'null' }],
          },
        ];
      }),
    );
    out.required = Object.keys(schema.properties);
    out.additionalProperties = false;
  }
  if (schemaObject(schema.items)) out.items = strictSchema(schema.items);
  if (Array.isArray(schema.anyOf)) out.anyOf = branches(schema).map(strictSchema);
  return out;
}

/** Matches the wire shape, including null sentinels, to select a union branch without guessing. */
export function matchesSchema(schema: JsonSchema, value: unknown, sentinels = false): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => v === value)) return false;
  if (schema.anyOf) return branches(schema).some((s) => matchesSchema(s, value, sentinels));
  if (schema.type === 'null') return value === null;
  if (schema.type === 'array')
    return (
      Array.isArray(value) &&
      (!schemaObject(schema.items) ||
        value.every((v) => matchesSchema(schema.items as JsonSchema, v, sentinels)))
    );
  if (schema.type === 'object') {
    if (!schemaObject(value) || !schemaObject(schema.properties)) return false;
    const properties = schema.properties;
    const required = Array.isArray(schema.required) ? schema.required : [];
    return (
      required.every((key) => typeof key === 'string' && Object.hasOwn(value, key)) &&
      Object.entries(value).every(([key, v]) => {
        const child = properties[key];
        return (
          schemaObject(child) &&
          ((sentinels && !required.includes(key) && v === null) ||
            matchesSchema(child, v, sentinels))
        );
      })
    );
  }
  if (schema.type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === schema.type;
}

export function optionalNull(schema: JsonSchema, key: string, value: unknown): boolean {
  const child = schemaObject(schema.properties) ? schema.properties[key] : undefined;
  return (
    value === null &&
    schemaObject(child) &&
    !acceptsNull(child) &&
    !(Array.isArray(schema.required) && schema.required.includes(key))
  );
}

/** Restore omission only where strict mode added it; explicit nullable values and invalid data survive. */
export function restoreStrictJson(schema: JsonSchema, value: unknown): unknown {
  if (schema.anyOf) {
    const match = branches(schema).find((s) => matchesSchema(s, value, true));
    return match ? restoreStrictJson(match, value) : value;
  }
  if (Array.isArray(value) && schemaObject(schema.items)) {
    const items = schema.items;
    return value.map((v) => restoreStrictJson(items, v));
  }
  if (schemaObject(value) && schemaObject(schema.properties)) {
    const properties = schema.properties;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => !optionalNull(schema, key, v))
        .map(([key, v]) => [
          key,
          schemaObject(properties[key]) ? restoreStrictJson(properties[key], v) : v,
        ]),
    );
  }
  return value;
}

/** Provider-specific limits; strict function parameters use these same limits. */
export function assertStrictSchema(
  schema: JsonSchema,
  limits: { properties: number; depth: number },
): void {
  if (schema.type !== 'object' || schema.anyOf)
    throw new LlmError('refused', 'strict schema requires an object root');
  if (schemaProperties(schema) > limits.properties)
    throw new LlmError('refused', `strict schema exceeds ${limits.properties} properties`);
  let enums = 0;
  let strings = 0;
  const walk = (node: JsonSchema, parents: number): void => {
    const depth = parents + (node.type === 'object' || node.type === 'array' ? 1 : 0);
    if (depth > limits.depth) throw new LlmError('refused', 'strict schema exceeds nesting limit');
    if (Array.isArray(node.enum)) {
      enums += node.enum.length;
      const length = node.enum.reduce<number>(
        (sum, v) => sum + (typeof v === 'string' ? v.length : 0),
        0,
      );
      strings += length;
      if (node.enum.length > 250 && length > 15_000)
        throw new LlmError('refused', 'strict enum string limit');
    }
    if (schemaObject(node.properties))
      for (const [key, child] of Object.entries(node.properties)) {
        strings += key.length;
        if (schemaObject(child)) walk(child, depth);
      }
    if (schemaObject(node.items)) walk(node.items, depth);
    for (const branch of branches(node)) walk(branch, depth);
  };
  walk(schema, 0);
  if (enums > 1000 || strings > 120_000)
    throw new LlmError('refused', 'strict schema enum/string limit');
}
