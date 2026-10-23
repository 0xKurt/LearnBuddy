// Azure's strict wire schema; the domain's zod contract and prompt remain unchanged.
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
export function azureSchema(schema: JsonSchema): JsonSchema {
  const out = { ...schema };
  if (schemaObject(schema.properties)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => {
        if (!schemaObject(value))
          throw new LlmError('refused', 'unsupported Azure schema property');
        const child = azureSchema(value);
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
  if (schemaObject(schema.items)) out.items = azureSchema(schema.items);
  if (Array.isArray(schema.anyOf)) out.anyOf = branches(schema).map(azureSchema);
  return out;
}

/** Matches the wire shape, including null sentinels, to select a union branch without guessing. */
function matches(schema: JsonSchema, value: unknown): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => v === value)) return false;
  if (schema.anyOf) return branches(schema).some((s) => matches(s, value));
  if (schema.type === 'null') return value === null;
  if (schema.type === 'array')
    return (
      Array.isArray(value) &&
      (!schemaObject(schema.items) || value.every((v) => matches(schema.items as JsonSchema, v)))
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
          schemaObject(child) && ((!required.includes(key) && v === null) || matches(child, v))
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

/** Restore omission only where Azure added it; explicit nullable values and invalid data survive. */
export function restoreAzureJson(schema: JsonSchema, value: unknown): unknown {
  if (schema.anyOf) {
    const match = branches(schema).find((s) => matches(s, value));
    return match ? restoreAzureJson(match, value) : value;
  }
  if (Array.isArray(value) && schemaObject(schema.items)) {
    const items = schema.items;
    return value.map((v) => restoreAzureJson(items, v));
  }
  if (schemaObject(value) && schemaObject(schema.properties)) {
    const properties = schema.properties;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => !optionalNull(schema, key, v))
        .map(([key, v]) => [
          key,
          schemaObject(properties[key]) ? restoreAzureJson(properties[key], v) : v,
        ]),
    );
  }
  return value;
}

/** Published Azure limit, not the larger limit documented for another provider. */
export function assertAzureSchema(schema: JsonSchema): void {
  if (schema.type !== 'object' || schema.anyOf)
    throw new LlmError('refused', 'Azure requires an object schema root');
  if (schemaProperties(schema) > 100)
    throw new LlmError('refused', 'Azure strict schema exceeds 100 properties');
  const walk = (node: JsonSchema, parents: number): void => {
    const depth = parents + (node.type === 'object' || node.type === 'array' ? 1 : 0);
    if (depth > 5) throw new LlmError('refused', 'Azure strict schema exceeds five nesting levels');
    if (schemaObject(node.properties))
      for (const child of Object.values(node.properties))
        if (schemaObject(child)) walk(child, depth);
    if (schemaObject(node.items)) walk(node.items, depth);
    for (const branch of branches(node)) walk(branch, depth);
  };
  walk(schema, 0);
}
