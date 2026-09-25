// Zod → JSON Schema for the model's structured output (Vertex
// `responseJsonSchema`). Zod stays the single source of truth: the model gets
// the derived schema, and the reply is validated with the same zod schema,
// which also enforces what Gemini's schema subset cannot express (string
// lengths, patterns, refinements).
//
// Emits only keywords Vertex documents as supported: type, description,
// enum, items, minItems, maxItems, minimum, maximum, anyOf, properties,
// additionalProperties, required.

import { z } from 'zod';

import type { JsonSchema } from './gateway.js';

export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const out = convert(schema);
  const description = schema.description;
  return description && out.description === undefined ? { ...out, description } : out;
}

function withDescription(s: z.ZodTypeAny, out: JsonSchema): JsonSchema {
  return s.description ? { ...out, description: s.description } : out;
}

function convert(s: z.ZodTypeAny): JsonSchema {
  const def = s._def as { typeName: z.ZodFirstPartyTypeKind };
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString:
      return withDescription(s, { type: 'string' });
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const n = s as z.ZodNumber;
      const out: JsonSchema = { type: n.isInt ? 'integer' : 'number' };
      if (n.minValue !== null) out.minimum = n.minValue;
      if (n.maxValue !== null) out.maximum = n.maxValue;
      return withDescription(s, out);
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return withDescription(s, { type: 'boolean' });
    case z.ZodFirstPartyTypeKind.ZodNull:
      return { type: 'null' };
    case z.ZodFirstPartyTypeKind.ZodLiteral: {
      const value = (s as z.ZodLiteral<string | number | boolean>).value;
      if (typeof value === 'string') return withDescription(s, { type: 'string', enum: [value] });
      if (typeof value === 'number') return withDescription(s, { type: 'number', enum: [value] });
      return withDescription(s, { type: 'boolean' });
    }
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return withDescription(s, {
        type: 'string',
        enum: [...(s as z.ZodEnum<[string, ...string[]]>).options],
      });
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const a = s as z.ZodArray<z.ZodTypeAny>;
      const out: JsonSchema = { type: 'array', items: toJsonSchema(a.element) };
      const d = a._def as {
        minLength: { value: number } | null;
        maxLength: { value: number } | null;
      };
      if (d.minLength) out.minItems = d.minLength.value;
      if (d.maxLength) out.maxItems = d.maxLength.value;
      return withDescription(s, out);
    }
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const o = s as z.ZodObject<z.ZodRawShape>;
      const properties: { [key: string]: JsonSchema } = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(o.shape)) {
        const field = value as z.ZodTypeAny;
        properties[key] = toJsonSchema(field);
        if (!field.isOptional()) required.push(key);
      }
      return withDescription(s, {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      });
    }
    case z.ZodFirstPartyTypeKind.ZodUnion:
    case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
      const options = (s as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>)
        .options as z.ZodTypeAny[];
      return withDescription(s, { anyOf: options.map((o) => toJsonSchema(o)) });
    }
    case z.ZodFirstPartyTypeKind.ZodNullable:
      return withDescription(s, {
        anyOf: [toJsonSchema((s as z.ZodNullable<z.ZodTypeAny>).unwrap()), { type: 'null' }],
      });
    case z.ZodFirstPartyTypeKind.ZodOptional:
      return toJsonSchema((s as z.ZodOptional<z.ZodTypeAny>).unwrap());
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return toJsonSchema((s as z.ZodDefault<z.ZodTypeAny>).removeDefault());
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return withDescription(s, toJsonSchema((s as z.ZodEffects<z.ZodTypeAny>).innerType()));
    default:
      throw new Error(`toJsonSchema: unsupported zod type ${String(def.typeName)}`);
  }
}
