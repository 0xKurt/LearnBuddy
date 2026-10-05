// What code makes of the source a reading names (issue #259): the checks that decide which
// questions of a corrected test are kept, without a model and without a word list.

import { describe, expect, it } from 'vitest';

import { applySource, differsFromOriginal, EXTRACTION_SCHEMA, ReadingParse } from '../sources.js';

const reading = (over: Record<string, unknown>) =>
  ReadingParse.parse({
    is_learning_material: true,
    readable: true,
    title: 'Probe',
    subject: null,
    extracted_text: 'Note 2, 18/20 Punkte',
    items: [],
    other_subject: null,
    ...over,
  });

const item = (prompt: string) => ({
  kind: 'short',
  prompt,
  answer: 'x',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 't',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

describe('a new task is not the marked one again', () => {
  it('with numbers: the numbers must differ, in whatever order or wording', () => {
    expect(differsFromOriginal('26 + 59', 'Rechne: 37 + 48')).toBe(true);
    expect(differsFromOriginal('37 + 48', 'Rechne: 37 + 48')).toBe(false);
    expect(differsFromOriginal('Was ist 48 plus 37?', 'Rechne: 37 + 48')).toBe(false);
    // A decimal comma and point are the same number.
    expect(differsFromOriginal('2.5 · 4', '2,5 · 4')).toBe(false);
  });

  it('without numbers: at least one word of the task must be gone', () => {
    expect(differsFromOriginal('Übersetze: the cat sleeps', 'Übersetze: the dog sleeps')).toBe(
      true,
    );
    expect(
      differsFromOriginal('Übersetze bitte: the dog sleeps', 'Übersetze: the dog sleeps'),
    ).toBe(false);
    expect(differsFromOriginal('  übersetze:  THE dog sleeps ', 'Übersetze: the dog sleeps')).toBe(
      false,
    );
  });
});

describe('what each source keeps of a reading', () => {
  it('a worksheet: everything, and never a marked task', () => {
    const { reading: r, nothingMarked } = applySource(
      reading({ items: [item('a b')], marked: [{ page: 1, task: 'x y', questions: ['a b'] }] }),
      1,
    );
    expect(nothingMarked).toBe(false);
    expect(r.items).toHaveLength(1);
    expect(r.marked).toEqual([]);
    expect(r.extracted_text).toBe('Note 2, 18/20 Punkte');
  });

  it('a corrected test: only listed, new questions; the transcript is the marked tasks', () => {
    const { reading: r, nothingMarked } = applySource(
      reading({
        source: 'corrected_test',
        items: [item('cat sleeps'), item('dog sleeps'), item('unlisted')],
        marked: [{ page: 1, task: 'dog sleeps', questions: ['cat sleeps', 'dog sleeps'] }],
        more_items: true,
        unclear: [{ page: 1, task: 'dog sleeps', about: 'Wort', readings: ['dog', 'dig'] }],
      }),
      1,
    );
    expect(nothingMarked).toBe(false);
    expect(r.items.map((i) => i.prompt)).toEqual(['cat sleeps']);
    expect(r.extracted_text).toBe('- dog sleeps');
    expect(r.unclear).toEqual([]);
    expect(r.more_items).toBe(false);
  });

  it('a corrected test whose marks stand on no page it has is one with nothing marked', () => {
    const { nothingMarked } = applySource(
      reading({
        source: 'corrected_test',
        items: [item('cat')],
        marked: [{ page: 2, task: 'dog', questions: ['cat'] }],
      }),
      1,
    );
    expect(nothingMarked).toBe(true);
  });

  it('a notebook entry: at most five questions, never read on', () => {
    const { reading: r } = applySource(
      reading({
        source: 'notebook_entry',
        items: Array.from({ length: 7 }, (_, n) => item(`q${n}`)),
        more_items: true,
      }),
      1,
    );
    expect(r.items).toHaveLength(5);
    expect(r.more_items).toBe(false);
  });

  it('a source the model got wrong is a worksheet, and a broken mark costs only itself', () => {
    const r = reading({
      source: 'exam',
      marked: [
        { page: 1, task: 'ok', questions: ['a'] },
        { page: 'one', task: '' },
      ],
    });
    expect(r.source).toBe('sheet');
    expect(r.marked).toHaveLength(1);
  });
});

describe('the schema the reading answers with', () => {
  type Obj = { properties: Record<string, { items?: Obj }> };
  it('has a place for the source and the marked tasks, and none for a grade or points', () => {
    const top = EXTRACTION_SCHEMA as unknown as Obj;
    expect(Object.keys(top.properties)).toEqual(expect.arrayContaining(['source', 'marked']));
    const mark = top.properties.marked!.items!;
    expect(Object.keys(mark.properties).sort()).toEqual(['page', 'questions', 'task']);
    for (const key of Object.keys(top.properties)) {
      expect(key).not.toMatch(/grade|point|score|note|mark_value/i);
    }
  });
});
