import { describe, expect, it } from 'vitest';

import type { ReadingConsumer } from '../streamReading.js';
import { streamReading } from '../streamReading.js';
import { EXTRACTION_SCHEMA } from '../sources.js';

const question = {
  kind: 'short',
  prompt: 'Wie heißt die Hauptstadt?',
  answer: 'Paris',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Europa',
  difficulty: 2,
  source_excerpt: null,
};
const header = {
  source: 'sheet',
  marked: [],
  other_subject: null,
  is_learning_material: true,
  readable: true,
  title: 'Europa',
  subject: null,
  extracted_text: 'Hauptstädte',
};

describe('validated reading prefixes', () => {
  it('puts source and subject decisions before questions without adding schema properties', () => {
    const keys = Object.keys(EXTRACTION_SCHEMA.properties as Record<string, unknown>);
    for (const key of ['source', 'marked', 'other_subject']) {
      expect(keys.indexOf(key)).toBeLessThan(keys.indexOf('items'));
      expect(EXTRACTION_SCHEMA.required).toContain(key);
    }
  });

  it('waits for metadata and a whole question, repairs strings and serializes consumers', async () => {
    const seen: Parameters<ReadingConsumer>[0][] = [];
    const stream = streamReading(null, async (x) => {
      seen.push(x);
    });
    const { source: _source, ...withoutSource } = header;
    stream.onPartial(JSON.stringify({ ...withoutSource, items: [question] }));
    const raw = JSON.stringify({
      ...header,
      items: [{ ...question, prompt: '$\\frac{1}{2}$' }, question],
    }).replace('\\\\frac', '\\frac');
    const at = raw.indexOf('},', raw.indexOf('"items"'));
    stream.onPartial(raw.slice(0, at));
    await stream.drain();
    expect(seen).toEqual([]);
    stream.onPartial(raw.slice(0, at + 2));
    stream.onPartial(raw);
    stream.onPartial(raw);
    await stream.drain();
    expect(seen.map((x) => x.items.length)).toEqual([1, 2]);
    expect(seen[0]?.items[0]?.prompt).toBe('$\\frac{1}{2}$');
  });

  it('does not accept questions outside the chosen figures', async () => {
    const seen: Parameters<ReadingConsumer>[0][] = [];
    const stream = streamReading({ forms: new Set(), figures: new Set() }, async (x) => {
      seen.push(x);
    });
    stream.onPartial(
      JSON.stringify({
        ...header,
        items: [{ ...question, figure: { type: 'fraction', numerator: 1, denominator: 2 } }],
      }),
    );
    await stream.drain();
    expect(seen.flatMap((x) => x.items)).toEqual([]);
  });

  it('drains rejected writes without an unhandled promise or any later writes', async () => {
    let writes = 0;
    const stream = streamReading(null, async () => {
      writes++;
      throw new Error('database unavailable');
    });
    stream.onPartial(JSON.stringify({ ...header, items: [question, question] }));
    await expect(stream.drain()).rejects.toThrow('database unavailable');
    expect(writes).toBe(1);
  });
});
