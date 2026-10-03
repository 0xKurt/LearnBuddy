// The counting logic of the schema inventory (issue #281, D1) on small handmade zod schemas:
// every number here was counted by hand from the schema below, so a change in what is counted
// shows up as a failing number, not as a silently different inventory.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toJsonSchema } from '../../../src/llm/json-schema.js';
import {
  isNullable,
  serialize,
  shapeOf,
  tagKeyOf,
  topLevelOf,
  unionsOf,
  withoutDescriptions,
} from '../measure.js';

const Mark = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dot'), size: z.number().int().min(1).max(3) }),
  z.object({
    kind: z.literal('box'),
    label: z.string().describe('Text'),
    color: z.enum(['red', 'blue']).nullable(),
  }),
]);

const Root = z.object({
  title: z.string(),
  note: z.string().nullable().describe('Why'),
  // A property NAMED description is data, not the description keyword.
  description: z.string().optional(),
  marks: z.array(Mark).max(2),
  pick: z.union([z.string(), z.number()]),
});

const schema = toJsonSchema(Root);

describe('shapeOf', () => {
  const s = shapeOf(schema);

  it('tells nullable wrappers from real unions', () => {
    // note and color are .nullable(); marks[] and pick are choices.
    expect(s.anyOfNodes).toBe(4);
    expect(s.nullableAnyOf).toBe(2);
    expect(s.unions).toBe(2);
    expect(s.unionBranches).toBe(4);
  });

  it('counts objects, optional fields, enums and depth', () => {
    expect(s.objects).toBe(3);
    expect(s.properties).toBe(10);
    expect(s.optionalFields).toBe(1);
    // two tags (one value each) and the colour enum (two values)
    expect(s.enums).toBe(3);
    expect(s.enumValues).toBe(4);
    expect(s.singletonEnums).toBe(2);
    // title note description marks pick · kind size · kind label color
    expect(s.propertyNameChars).toBe(5 + 4 + 11 + 5 + 4 + (4 + 4) + (4 + 5 + 5));
    // dot · box · red blue
    expect(s.enumValueChars).toBe(3 + 3 + 3 + 4);
    // root → marks → items → box → color (nullable) → the enum
    expect(s.maxDepth).toBe(6);
    // the null branches of the two nullable fields are not nodes of their own
    expect(s.nodes).toBe(18);
  });

  it('counts description text and description-with-key separately', () => {
    // "(1–3)" from the bounds, "Text", "Why", "(at most 2 items)" from the array length
    expect(s.descriptions.count).toBe(4);
    expect(s.descriptions.textChars).toBe(5 + 4 + 3 + 17);
    // each one also costs `"description":` (14), its quotes (2) and a comma (1)
    expect(s.descriptions.withKeyChars).toBe(5 + 4 + 3 + 17 + 4 * 17);
    expect(s.chars).toBe(serialize(schema).length);
  });

  it('never strips a property that is merely called description', () => {
    const stripped = withoutDescriptions(schema);
    expect(Object.keys((stripped.properties ?? {}) as object)).toContain('description');
    expect(serialize(stripped)).not.toContain('"Why"');
  });
});

describe('unionsOf: the per-branch breakdown', () => {
  it('finds every real union with its path, tag and branches', () => {
    const unions = unionsOf(schema, [{ name: 'Mark', key: 'kind', tags: ['dot', 'box'] }]);
    expect(unions.map((u) => [u.path, u.name, u.tagKey])).toEqual([
      ['.marks[]', 'Mark', 'kind'],
      ['.pick', null, null],
    ]);
    const [marks, pick] = unions;
    expect(marks?.branches.map((b) => b.tag)).toEqual(['dot', 'box']);
    expect(marks?.tagPositions).toEqual([0, 0]);
    expect(pick?.branches.map((b) => b.tag)).toEqual(['0', '1']);
  });

  it('counts each branch on its own', () => {
    const [marks] = unionsOf(schema);
    const [dot, box] = marks?.branches ?? [];
    expect(dot?.shape.descriptions).toEqual({ count: 1, textChars: 5, withKeyChars: 22 });
    expect(dot?.shape.nullableAnyOf).toBe(0);
    expect(box?.shape.descriptions).toEqual({ count: 1, textChars: 4, withKeyChars: 21 });
    expect(box?.shape.nullableAnyOf).toBe(1);
    expect(box?.shape.enumValues).toBe(3);
    const total = (marks?.branches ?? []).reduce((sum, b) => sum + b.shape.chars, 0);
    // the branches plus `{"anyOf":[` `,` `]}` — nothing is counted twice or lost
    expect(total + '{"anyOf":[,]}'.length).toBe(marks?.shape.chars);
  });

  it('names a union that is a subset of an exported one', () => {
    const [marks] = unionsOf(schema, [
      { name: 'AllMarks', key: 'kind', tags: ['dot', 'box', 'star'] },
    ]);
    expect(marks?.name).toBe('AllMarks ⊂ (2 of 3)');
  });

  it('reports where the tag is declared, and nests paths through tagged branches', () => {
    const Inner = z.discriminatedUnion('t', [
      z.object({ t: z.literal('a') }),
      z.object({ t: z.literal('b') }),
    ]);
    const Late = z.union([
      z.object({ text: z.string(), kind: z.literal('x'), inner: Inner }),
      z.object({ kind: z.literal('y') }),
    ]);
    const unions = unionsOf(toJsonSchema(z.object({ late: Late })));
    expect(unions.map((u) => u.path)).toEqual(['.late', '.late<x>.inner']);
    expect(unions[0]?.tagPositions).toEqual([1, 0]);
  });
});

describe('small helpers', () => {
  it('a union whose branches share no one-value enum has no tag', () => {
    const s = toJsonSchema(z.union([z.object({ a: z.literal('x') }), z.object({ b: z.string() })]));
    expect(tagKeyOf((s.anyOf ?? []) as never)).toBeNull();
  });

  it('isNullable only for [X, null]', () => {
    expect(isNullable(toJsonSchema(z.string().nullable()))).toBe(true);
    expect(isNullable(toJsonSchema(z.union([z.string(), z.number()])))).toBe(false);
  });

  it('topLevelOf splits an object schema by field', () => {
    const top = topLevelOf(schema);
    expect(top.map((t) => t.key)).toEqual(['title', 'note', 'description', 'marks', 'pick']);
    expect(top.find((t) => t.key === 'title')?.chars).toBe('{"type":"string"}'.length);
    expect(top.find((t) => t.key === 'note')?.descriptions.textChars).toBe(3);
  });
});

describe('the inventory measures what the call sites send', () => {
  it("the explain seam is what the call site sends: the kind's profile, GENERATED_SCHEMA the fallback", async () => {
    const { GENERATED_SCHEMA, explainSchemaFor, setSchemaForModel } =
      await import('../../../src/modules/practice/generate.js');
    expect(serialize(toJsonSchema(setSchemaForModel(null, null)))).toBe(
      serialize(GENERATED_SCHEMA),
    );
    for (const kind of ['practice', 'test', 'vocab', 'speak', 'help', 'listen'] as const) {
      expect(serialize(explainSchemaFor(kind, null))).toBe(
        serialize(toJsonSchema(setSchemaForModel(kind, null))),
      );
    }
  });

  it('a baseline is compared call by call, and an unchanged call says so', async () => {
    const { buildReport, changesBetween, renderComparison } = await import('../inventory.js');
    const after = await buildReport();
    const before = structuredClone(after);
    const turn = before.variants.find((v) => v.purpose === 'buddy_turn');
    if (!turn) throw new Error('no buddy_turn variant');
    turn.schema.sha256 = 'older';
    turn.schema.shape = { ...turn.schema.shape, chars: turn.schema.shape.chars * 2 };
    before.variants.push({ ...turn, profile: 'gone since' });
    const changes = changesBetween(before, after);
    expect(changes).toHaveLength(after.variants.length);
    const changed = changes.filter((c) => !c.sameSchema);
    expect(changed.map((c) => c.purpose)).toEqual(['buddy_turn']);
    const md = renderComparison(before, after);
    expect(md).toContain('−50.0 %');
    expect(md).toContain('Only in the baseline: buddy_turn / gone since.');
  });
});
