// The explain profiles (issue #281, D2), without a database: for every kind of run, what the model
// is shown and what code keeps.
//
//   1. The fallback is the schema every run without sheets was sent before D2, byte for byte.
//   2. Every profile is smaller than the fallback, and keeps every form its run can use: a valid
//      answer of every allowed form passes the decoder's constraint (`testing/schemaCheck.ts`, the
//      emitted keywords exactly) AND code's parse — nothing it keeps is lost.
//   3. A form outside the profile is rejected twice: the decoder would not let it through the
//      schema, and if it arrived anyway, code drops it (Rule 0 — reject, never repair).
//   4. The prefix streaming (`answerUpTo`, issue #220) validates under every profile with items.
//
// The fixtures are written once per FORM, so a new form shows up here as a row to add, not as a
// silently untested branch.

import { describe, expect, it } from 'vitest';

import { toJsonSchema } from '../../../llm/json-schema.js';
import { answerUpTo } from '../../../llm/partial.js';
import { schemaErrors } from '../../../testing/schemaCheck.js';
import {
  FALLBACK_PROFILE,
  GENERATED_SCHEMA,
  GeneratedSet,
  SET_PROFILES,
  explainSchemaFor,
  parseSetFor,
  setSchemaForModel,
} from '../generate.js';

type Kind = keyof typeof SET_PROFILES;
const KINDS = Object.keys(SET_PROFILES) as Kind[];
const TOPICS: [string, ...string[]] = ['Brüche addieren', 'Zahlenmauern', 'Keimung'];

/** The fields every item must write (no default), as the model writes them. */
const base = (kind: string, prompt: string, answer: string) => ({
  kind,
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Brüche addieren',
  difficulty: 2,
  source_excerpt: null,
});

/** One valid item per kind, each with the fields only that kind keeps. */
const ITEMS: Record<string, Record<string, unknown>> = {
  short: { ...base('short', 'Wie heißt der Nenner von 3/4?', '4'), spelling: 'gentle' },
  long: {
    ...base('long', 'Schreibe eine kurze Inhaltsangabe der Geschichte.', 'Eine Inhaltsangabe.'),
    rubric: {
      form: 'Inhaltsangabe',
      elements: [
        {
          name: 'Länge',
          missing: 'Schreib etwas mehr.',
          check: { by: 'word_count', min: 40, max: null },
        },
        { name: 'Präsens', missing: 'Bleib im Präsens.', check: { by: 'tense', tense: 'present' } },
      ],
    },
  },
  numeric: { ...base('numeric', 'Miss die Strecke in cm.', '4,5'), unit: 'cm', tolerance: 0.1 },
  multiple_choice: {
    ...base('multiple_choice', 'Welcher Bruch ist größer?', '3/4'),
    choices: ['1/2', '3/4'],
    correct_choice: 1,
  },
  formula: base('formula', 'Gib die Formel für den Flächeninhalt eines Rechtecks an.', 'A = a·b'),
  vocab: { ...base('vocab', 'le chat', 'die Katze'), prompt_lang: 'fr', lang: 'de' },
  speak: { ...base('speak', 'Bonjour', 'Bonjour'), lang: 'fr' },
};

const BAR = { task: 'shade', parts: 6, units: 3 };
const STAFF = { task: 'name_note', clef: 'treble', pitch: { name: 'E', octave: 4 } };
const STRUCTURED: Record<string, Record<string, unknown>> = {
  order: {
    type: 'order',
    prompt: 'Bring die Keimung in die richtige Reihenfolge.',
    elements: ['Wasser aufnehmen', 'Wurzel wächst', 'Stängel streckt sich', 'Blätter entfalten'],
    numeric: null,
    topic: 'Keimung',
    difficulty: 2,
    prompt_lang: 'de',
  },
  table_fill: {
    type: 'table_fill',
    prompt: 'Rechne die Zahlenmauer aus.',
    header: null,
    rows: [
      [{ text: '20', gap: true, also: [] }],
      [
        { text: '8', gap: false, also: [] },
        { text: '12', gap: true, also: [] },
      ],
    ],
    family: 'wall',
    fn: null,
    x_in: null,
    topic: 'Zahlenmauern',
    difficulty: 1,
    prompt_lang: 'de',
  },
  match: {
    type: 'match',
    prompt: 'Welches Verfassungsorgan hat welche Aufgabe?',
    pairs: [
      { left: 'Bundestag', right: 'beschließt Gesetze' },
      { left: 'Bundesrat', right: 'vertritt die Länder' },
      { left: 'Bundespräsident', right: 'unterzeichnet Gesetze' },
    ],
    groups: null,
    topic: 'Brüche addieren',
    difficulty: 2,
    prompt_lang: 'de',
  },
};
const LISTEN = {
  text: 'On Saturday Tom took the bus to the city centre. He bought a book about horses for his sister, because her birthday is on Sunday. Then he met his friend Sam at the café near the station, and they drank hot chocolate together before Tom went home by bike.',
  lang: 'en',
  questions: [
    {
      kind: 'short',
      prompt: 'What did Tom buy?',
      answer: 'a book about horses',
      accepted_answers: [],
      choices: null,
      correct_choice: null,
      topic: 'Tom',
      difficulty: 2,
    },
  ],
};

/** A valid answer of a run of this kind: every form its profile allows, in schema order. */
function validAnswer(kind: Kind): Record<string, unknown> {
  const p = SET_PROFILES[kind];
  return {
    usable: true,
    title: 'Übung',
    subject: { name: 'Mathe', kind: 'math' },
    ...(p.items.length > 0 ? { items: p.items.map((k) => ITEMS[k]) } : {}),
    ...(p.bars ? { bars: [BAR] } : {}),
    ...(p.listen ? { listen: LISTEN } : {}),
    ...(p.staffs ? { staffs: [STAFF] } : {}),
    ...(p.structured.length > 0 ? { structured: p.structured.map((t) => STRUCTURED[t]) } : {}),
  };
}

/** Everything a run of this kind can NOT use, each as the one change that adds it. */
function outsiders(kind: Kind): { what: string; add: (a: Record<string, unknown>) => void }[] {
  const p = SET_PROFILES[kind];
  const list = (a: Record<string, unknown>, key: string, value: unknown) => {
    const have = Array.isArray(a[key]) ? (a[key] as unknown[]) : [];
    a[key] = [...have, value];
  };
  const out: { what: string; add: (a: Record<string, unknown>) => void }[] = [];
  for (const k of Object.keys(ITEMS)) {
    if (!p.items.includes(k as never)) {
      out.push({ what: `item ${k}`, add: (a) => list(a, 'items', ITEMS[k]) });
    }
  }
  for (const t of Object.keys(STRUCTURED)) {
    if (!p.structured.includes(t as never)) {
      out.push({ what: `structured ${t}`, add: (a) => list(a, 'structured', STRUCTURED[t]) });
    }
  }
  if (!p.bars) out.push({ what: 'bars', add: (a) => list(a, 'bars', BAR) });
  if (!p.staffs) out.push({ what: 'staffs', add: (a) => list(a, 'staffs', STAFF) });
  if (!p.listen) out.push({ what: 'listen', add: (a) => void (a.listen = LISTEN) });
  return out;
}

/** What code keeps of an answer, form by form. */
function kept(kind: Kind, answer: unknown) {
  const set = parseSetFor(kind, null).parse(answer);
  return {
    items: set.items.map((i) => i.kind),
    rubrics: set.items.filter((i) => i.rubric !== null).length,
    bars: set.bars.length,
    staffs: set.staffs.length,
    structured: set.structured.map((s) => s.type),
    listen: set.listen === null ? 0 : 1,
  };
}

describe('the fallback', () => {
  it('is the pre-D2 global schema byte for byte', () => {
    expect(JSON.stringify(GENERATED_SCHEMA)).toBe(
      JSON.stringify(toJsonSchema(GeneratedSet.omit({ listen: true }))),
    );
    expect(JSON.stringify(toJsonSchema(setSchemaForModel(null, null)))).toBe(
      JSON.stringify(GENERATED_SCHEMA),
    );
  });

  it('allows every form any profile allows (except the listening task, which is never unknown)', () => {
    for (const p of Object.values(SET_PROFILES)) {
      expect(FALLBACK_PROFILE.items).toEqual(expect.arrayContaining([...p.items]));
      expect(FALLBACK_PROFILE.structured).toEqual(expect.arrayContaining([...p.structured]));
      if (p.bars) expect(FALLBACK_PROFILE.bars).toBe(true);
      if (p.staffs) expect(FALLBACK_PROFILE.staffs).toBe(true);
    }
  });
});

describe.each(KINDS)('the profile of a %s run', (kind) => {
  const schema = explainSchemaFor(kind, null);

  it('is smaller than the fallback', () => {
    expect(JSON.stringify(schema).length).toBeLessThan(JSON.stringify(GENERATED_SCHEMA).length);
  });

  it('accepts a valid answer of every allowed form — through the decoder and through code', () => {
    const answer = validAnswer(kind);
    expect(schemaErrors(schema, answer)).toEqual([]);
    const p = SET_PROFILES[kind];
    expect(kept(kind, answer)).toEqual({
      items: [...p.items],
      rubrics: p.items.includes('long') ? 1 : 0,
      bars: p.bars ? 1 : 0,
      staffs: p.staffs ? 1 : 0,
      structured: [...p.structured],
      listen: p.listen ? 1 : 0,
    });
  });

  it('rejects every form outside it — the decoder would not write it, code drops it', () => {
    const answer = validAnswer(kind);
    const keeps = kept(kind, answer);
    const all = outsiders(kind);
    expect(all.length).toBeGreaterThan(0);
    for (const o of all) {
      const bad = structuredClone(answer);
      o.add(bad);
      expect(schemaErrors(schema, bad), o.what).not.toEqual([]);
      expect(kept(kind, bad), o.what).toEqual(keeps);
    }
  });

  it('streams: the first finished items of an answer validate under the profile', () => {
    const answer = validAnswer(kind);
    const raw = JSON.stringify(answer);
    const items = Array.isArray(answer.items) ? answer.items.length : 0;
    if (items === 0) {
      // No items, no early start: a listening run starts on its whole answer.
      expect(answerUpTo(raw, 'items', 1)).toBeNull();
      return;
    }
    for (let n = 1; n <= items; n++) {
      const prefix = answerUpTo(raw, 'items', n);
      const parsed = parseSetFor(kind, null).safeParse(prefix);
      expect(parsed.success, `${kind} prefix ${n}`).toBe(true);
      if (parsed.success) expect(parsed.data.items).toHaveLength(n);
      expect(schemaErrors(schema, prefix), `${kind} prefix ${n}`).toEqual([]);
    }
  });
});

describe('the nested unions', () => {
  it('the item kind enum, the structured branches and the item fields follow the profile', () => {
    const itemOf = (kind: Kind) => {
      const items = explainSchemaFor(kind, null).properties as Record<string, unknown>;
      const item = (items.items as { items: { properties: Record<string, { enum?: string[] }> } })
        .items;
      return item.properties;
    };
    expect(itemOf('vocab').kind?.enum).toEqual(['vocab']);
    expect(Object.keys(itemOf('vocab'))).not.toContain('rubric');
    expect(Object.keys(itemOf('vocab'))).not.toContain('tolerance');
    expect(Object.keys(itemOf('speak'))).not.toContain('spelling');
    // A test has no long answer, so no rubric and no RubricCheck union in it.
    expect(Object.keys(itemOf('test'))).not.toContain('rubric');
    expect(JSON.stringify(explainSchemaFor('test', null))).not.toContain('word_count');
    // Practice keeps them all — but no speak item, which practice never kept.
    expect(itemOf('practice').kind?.enum).not.toContain('speak');
    expect(Object.keys(itemOf('practice'))).toEqual(
      expect.arrayContaining(['rubric', 'tolerance', 'spelling']),
    );
  });

  it('a sheet-bound run keeps its topic enum inside the profile', () => {
    const schema = explainSchemaFor('test', TOPICS);
    const answer = validAnswer('test');
    expect(schemaErrors(schema, answer)).toEqual([]);
    const off = structuredClone(answer);
    (off.items as Record<string, unknown>[])[0]!.topic = 'Etwas anderes';
    expect(schemaErrors(schema, off)).not.toEqual([]);
    expect(parseSetFor('test', TOPICS).parse(off).items).toHaveLength(
      SET_PROFILES.test.items.length - 1,
    );
  });
});
