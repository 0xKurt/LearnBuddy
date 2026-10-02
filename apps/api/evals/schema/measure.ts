// The counting half of the schema inventory (issue #281, D1): pure functions over a serialized
// JSON Schema, so what is counted is exactly what `toJsonSchema` hands to Vertex as
// `responseJsonSchema` — never the zod source, never a guess. No model, no database.
//
// Proven on small handmade schemas in `__tests__/measure.test.ts`.
// requires live verification in Claude Code session (eval tooling; this file itself calls nothing)

import { createHash } from 'node:crypto';

import type { JsonSchema } from '../../src/llm/gateway.js';

type JsonValue = JsonSchema[string];

/** What a (sub)schema costs and how it is built. */
export type Shape = {
  /** Characters of the compact JSON serialization (`JSON.stringify`, what the request carries). */
  chars: number;
  /** Schema nodes: the root, every property value, every `items`, every `anyOf` branch. */
  nodes: number;
  /** Nesting depth in schema nodes; a lone `{type:'string'}` is 1. */
  maxDepth: number;
  objects: number;
  /** Properties declared over all objects. */
  properties: number;
  /** Properties not listed in their object's `required` (zod `.optional()` / `.default()`). */
  optionalFields: number;
  /** Every node with `anyOf`, nullable wrappers included. */
  anyOfNodes: number;
  /** `anyOf` with exactly two branches, one of them `{type:'null'}` (zod `.nullable()`). */
  nullableAnyOf: number;
  /** `anyOf` nodes that are real choices (anyOfNodes − nullableAnyOf). */
  unions: number;
  /** Branches over all real unions. */
  unionBranches: number;
  /** Nodes with `enum`, and the values over all of them. */
  enums: number;
  enumValues: number;
  /** One-value enums — the tags string literals become (`z.literal('x')`). */
  singletonEnums: number;
  descriptions: DescriptionCount;
};

/**
 * The `description` keywords of a (sub)schema, counted two ways (Recherche 2 in #279 mixed them):
 * - `textChars`: the description strings themselves;
 * - `withKeyChars`: what the serialization loses when every description is removed — the text
 *   plus `"description":""`, the separator and the escapes. Measured by removing them, not
 *   estimated per occurrence.
 */
export type DescriptionCount = { count: number; textChars: number; withKeyChars: number };

export type UnionBranch = {
  /** The branch's tag value (see `Union.tagKey`), or its index when the union has no tag. */
  tag: string;
  /** sha256 of the branch's compact serialization (keys the optional token counts). */
  sha256: string;
  shape: Shape;
};

export type Union = {
  /** Where it sits: `.actions[]`, `.items[].parts_task<order>.cells[]` … `(root)` for the root. */
  path: string;
  /** The exported zod union(s) with exactly these tags; `X ⊂ (n of m)` for a subset of X. */
  name: string | null;
  /** The property that is a required one-value enum in every branch, or null. */
  tagKey: string | null;
  /**
   * Where the tag is declared in each branch's `properties` (0 = first). The DECLARED order of
   * the emitted schema — what the model is shown, not the order it writes (E1, issue #281).
   */
  tagPositions: number[];
  shape: Shape;
  branches: UnionBranch[];
};

/** A zod discriminated union as it can be recognised in the serialized schema. */
export type NamedUnion = { name: string; key: string; tags: string[] };

function isObject(v: JsonValue | undefined): v is JsonSchema {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function schemaArray(v: JsonValue | undefined): JsonSchema[] {
  return Array.isArray(v) ? v.filter(isObject) : [];
}

/** The child schema nodes of a node, each with the path segment that leads to it. */
function children(node: JsonSchema): { segment: string; node: JsonSchema }[] {
  const out: { segment: string; node: JsonSchema }[] = [];
  const props = node.properties;
  if (isObject(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (isObject(value)) out.push({ segment: `.${key}`, node: value });
    }
  }
  if (isObject(node.items)) out.push({ segment: '[]', node: node.items });
  const branches = schemaArray(node.anyOf);
  if (branches.length > 0) {
    if (isNullable(node)) {
      // The value of a nullable field sits where the field is: no segment of its own.
      for (const b of branches) if (!isNull(b)) out.push({ segment: '', node: b });
    } else {
      const key = tagKeyOf(branches);
      branches.forEach((b, i) => out.push({ segment: `<${tagOf(b, key) ?? i}>`, node: b }));
    }
  }
  return out;
}

function isNull(node: JsonSchema): boolean {
  return Object.keys(node).length === 1 && node.type === 'null';
}

/** `anyOf: [X, {type:'null'}]` — what `toJsonSchema` makes of `.nullable()`. */
export function isNullable(node: JsonSchema): boolean {
  const branches = schemaArray(node.anyOf);
  return branches.length === 2 && branches.some(isNull) && !branches.every(isNull);
}

/** Required properties of an object node whose schema is a one-value enum, in declared order. */
function tagCandidates(node: JsonSchema): string[] {
  const props = node.properties;
  if (!isObject(props)) return [];
  const required = Array.isArray(node.required) ? node.required : [];
  return Object.entries(props)
    .filter(
      ([key, value]) =>
        required.includes(key) &&
        isObject(value) &&
        Array.isArray(value.enum) &&
        value.enum.length === 1,
    )
    .map(([key]) => key);
}

/** The first key (in the first branch's order) that tags every branch, or null. */
export function tagKeyOf(branches: JsonSchema[]): string | null {
  const [first, ...rest] = branches;
  if (!first) return null;
  return tagCandidates(first).find((k) => rest.every((b) => tagCandidates(b).includes(k))) ?? null;
}

function tagOf(node: JsonSchema, key: string | null): string | null {
  if (key === null) return null;
  const props = node.properties;
  if (!isObject(props)) return null;
  const value = props[key];
  if (!isObject(value) || !Array.isArray(value.enum)) return null;
  return String(value.enum[0]);
}

/** The same schema with every `description` keyword removed (never a property NAMED so). */
export function withoutDescriptions(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description') continue;
    if (key === 'properties' && isObject(value)) {
      const props: JsonSchema = {};
      for (const [name, child] of Object.entries(value)) {
        props[name] = isObject(child) ? withoutDescriptions(child) : child;
      }
      out[key] = props;
    } else if (key === 'items' && isObject(value)) {
      out[key] = withoutDescriptions(value);
    } else if (key === 'anyOf' && Array.isArray(value)) {
      out[key] = value.map((b) => (isObject(b) ? withoutDescriptions(b) : b));
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function serialize(node: JsonSchema): string {
  return JSON.stringify(node);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Counts every structural property of a (sub)schema. */
export function shapeOf(root: JsonSchema): Shape {
  const s: Shape = {
    chars: serialize(root).length,
    nodes: 0,
    maxDepth: 0,
    objects: 0,
    properties: 0,
    optionalFields: 0,
    anyOfNodes: 0,
    nullableAnyOf: 0,
    unions: 0,
    unionBranches: 0,
    enums: 0,
    enumValues: 0,
    singletonEnums: 0,
    descriptions: {
      count: 0,
      textChars: 0,
      withKeyChars: serialize(root).length - serialize(withoutDescriptions(root)).length,
    },
  };
  const visit = (node: JsonSchema, depth: number): void => {
    s.nodes += 1;
    s.maxDepth = Math.max(s.maxDepth, depth);
    if (typeof node.description === 'string') {
      s.descriptions.count += 1;
      s.descriptions.textChars += node.description.length;
    }
    const props = node.properties;
    if (isObject(props)) {
      const keys = Object.keys(props);
      const required = Array.isArray(node.required) ? node.required : [];
      s.objects += 1;
      s.properties += keys.length;
      s.optionalFields += keys.filter((k) => !required.includes(k)).length;
    }
    if (Array.isArray(node.enum)) {
      s.enums += 1;
      s.enumValues += node.enum.length;
      if (node.enum.length === 1) s.singletonEnums += 1;
    }
    const branches = schemaArray(node.anyOf);
    if (branches.length > 0) {
      s.anyOfNodes += 1;
      if (isNullable(node)) s.nullableAnyOf += 1;
      else {
        s.unions += 1;
        s.unionBranches += branches.length;
      }
    }
    for (const c of children(node)) visit(c.node, depth + 1);
  };
  visit(root, 1);
  return s;
}

function nameOf(key: string | null, tags: string[], named: NamedUnion[]): string | null {
  if (key === null) return null;
  const set = new Set(tags);
  const same = named.filter(
    (n) => n.key === key && n.tags.length === set.size && n.tags.every((t) => set.has(t)),
  );
  if (same.length > 0) return same.map((n) => n.name).join(' = ');
  const subset = named.filter(
    (n) => n.key === key && tags.length < n.tags.length && tags.every((t) => n.tags.includes(t)),
  );
  return subset.length > 0
    ? subset.map((n) => `${n.name} ⊂ (${tags.length} of ${n.tags.length})`).join(' / ')
    : null;
}

/** Every real union in the schema (nested ones too), in the order they are declared. */
export function unionsOf(root: JsonSchema, named: NamedUnion[] = []): Union[] {
  const out: Union[] = [];
  const visit = (node: JsonSchema, path: string): void => {
    const branches = schemaArray(node.anyOf);
    if (branches.length > 0 && !isNullable(node)) {
      const key = tagKeyOf(branches);
      const tags = branches.map((b, i) => tagOf(b, key) ?? String(i));
      out.push({
        path: path || '(root)',
        name: nameOf(key, tags, named),
        tagKey: key,
        tagPositions:
          key === null
            ? []
            : branches.map((b) =>
                Object.keys(isObject(b.properties) ? b.properties : {}).indexOf(key),
              ),
        shape: shapeOf(node),
        branches: branches.map((b, i) => ({
          tag: tags[i] ?? String(i),
          sha256: sha256(serialize(b)),
          shape: shapeOf(b),
        })),
      });
    }
    for (const c of children(node)) visit(c.node, path + c.segment);
  };
  visit(root, '');
  return out;
}

/** What each top-level property of an object schema costs (e.g. the `actions` container). */
export function topLevelOf(
  root: JsonSchema,
): { key: string; chars: number; share: number; descriptions: DescriptionCount }[] {
  const props = root.properties;
  if (!isObject(props)) return [];
  const total = serialize(root).length;
  return Object.entries(props)
    .filter((e): e is [string, JsonSchema] => isObject(e[1]))
    .map(([key, value]) => {
      const shape = shapeOf(value);
      return {
        key,
        chars: shape.chars,
        share: shape.chars / total,
        descriptions: shape.descriptions,
      };
    });
}
