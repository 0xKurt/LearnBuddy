// What the decoder holds an answer to: a check of a JSON value against the schema `toJsonSchema`
// emits — exactly its keywords (type, enum, items, anyOf, properties, additionalProperties,
// required; `description` is no constraint). It answers the question the profiles of issue #281
// (D2) have to answer in tests: would Vertex's constrained decoding let this answer through the
// schema that was sent? zod answers a different one (what code accepts afterwards), and both are
// asserted, so neither stands in for the other.
//
// Not a general JSON-Schema validator: an unknown keyword throws, so a converter that starts
// emitting something new fails the tests instead of being silently ignored here.
// requires live verification in Claude Code session (a test helper; the real decoder is Vertex's)

import type { JsonSchema } from '../llm/gateway.js';

const KNOWN = new Set([
  'type',
  'description',
  'enum',
  'items',
  'anyOf',
  'properties',
  'additionalProperties',
  'required',
]);

type Json = JsonSchema[string];

function isObject(v: Json | undefined): v is JsonSchema {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typeOk(type: string, v: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof v === 'string';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'null':
      return v === null;
    case 'array':
      return Array.isArray(v);
    case 'object':
      return typeof v === 'object' && v !== null && !Array.isArray(v);
    default:
      throw new Error(`schemaCheck: unknown type ${type}`);
  }
}

/**
 * Every place where `value` breaks `schema`, as `path: reason`; empty when the decoder would
 * accept it. In an `anyOf` the branch errors are reported only when no branch fits.
 */
export function schemaErrors(schema: JsonSchema, value: unknown, path = '$'): string[] {
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) throw new Error(`schemaCheck: unsupported keyword ${key} at ${path}`);
  }
  const branches = schema.anyOf;
  if (Array.isArray(branches)) {
    const results = branches.filter(isObject).map((b) => schemaErrors(b, value, path));
    if (results.some((r) => r.length === 0)) return [];
    return [`${path}: no anyOf branch fits (${results.map((r) => r[0] ?? '').join(' | ')})`];
  }
  const errors: string[] = [];
  if (typeof schema.type === 'string' && !typeOk(schema.type, value)) {
    return [`${path}: not ${schema.type}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  }
  if (isObject(schema.items) && Array.isArray(value)) {
    const items = schema.items;
    value.forEach((v, i) => errors.push(...schemaErrors(items, v, `${path}[${i}]`)));
  }
  const props = schema.properties;
  if (isObject(props) && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === 'string' && !(key in record)) errors.push(`${path}.${key}: missing`);
    }
    for (const [key, v] of Object.entries(record)) {
      const child = props[key];
      if (isObject(child)) errors.push(...schemaErrors(child, v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
    }
  }
  return errors;
}
