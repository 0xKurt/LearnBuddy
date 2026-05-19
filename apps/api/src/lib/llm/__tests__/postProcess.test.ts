// Tests for parseVisionPayload — specifically the truncation-recovery path
// added after a live extraction failed with
//   "Vertex output failed JSON validation: Unterminated string in JSON…"
// on a real worksheet (4096 maxOutputTokens clipped the model output
// mid-string).

import { describe, it, expect } from 'vitest';

import { parseVisionPayload } from '../postProcess.js';

const completeItem = (i: number) =>
  JSON.stringify({
    question: `Frage ${i}`,
    expected_answer: `Antwort ${i}`,
    acceptable_answers: [],
    answer_kind: 'short',
    stimulus_kind: 'none',
    stimulus_data: {},
    difficulty: 2,
    language: 'de',
  });

describe('parseVisionPayload — truncation recovery', () => {
  it('parses a complete, valid payload', async () => {
    const payload = {
      detected_language: 'de',
      extracted_markdown: '# Worksheet\n\nHello.',
      items: [
        JSON.parse(completeItem(1)),
        JSON.parse(completeItem(2)),
        JSON.parse(completeItem(3)),
      ],
      diagrams: [],
      problem_templates: [],
    };
    const res = await parseVisionPayload(JSON.stringify(payload), { dropDiagrams: false });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.items).toHaveLength(3);
  });

  it('recovers items when Vertex truncates inside a later item', async () => {
    // Simulate: 3 complete items, then a 4th cut off mid-string.
    const truncated =
      '{"detected_language":"de","extracted_markdown":"some text","items":[' +
      [completeItem(1), completeItem(2), completeItem(3)].join(',') +
      ',{"question":"This one was cut o';
    const res = await parseVisionPayload(truncated, { dropDiagrams: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.items).toHaveLength(3);
      expect(res.value.items[0]?.question).toBe('Frage 1');
      // detected_language survived
      expect(res.value.detected_language).toBe('de');
    }
  });

  it('returns ok:false on truncation with zero complete items', async () => {
    const noItems = '{"detected_language":"de","items":[{"question":"unfini';
    const res = await parseVisionPayload(noItems, { dropDiagrams: false });
    expect(res.ok).toBe(false);
  });

  it('returns ok:false on a payload with no items field at all', async () => {
    const res = await parseVisionPayload('{"foo": "bar"', { dropDiagrams: false });
    expect(res.ok).toBe(false);
  });

  it('repairs Vertex JSON with bad escape sequences (e.g. \\$ in LaTeX)', async () => {
    // Real Vertex output sometimes contains things like `"expected_answer": "\$5"`
    // — a backslash-dollar that's not a valid JSON escape. jsonrepair fixes it
    // without losing the data.
    const itemRaw = `{"question":"Frage 1","expected_answer":"\\$5","acceptable_answers":[],"answer_kind":"short","stimulus_kind":"none","stimulus_data":{},"difficulty":2,"language":"de"}`;
    const itemFmt = JSON.stringify({
      question: 'Frage 2',
      expected_answer: 'OK',
      acceptable_answers: [],
      answer_kind: 'short',
      stimulus_kind: 'none',
      stimulus_data: {},
      difficulty: 2,
      language: 'de',
    });
    const broken = `{"detected_language":"de","extracted_markdown":"x","items":[${itemRaw},${itemFmt},${itemFmt}],"diagrams":[],"problem_templates":[]}`;
    const res = await parseVisionPayload(broken, { dropDiagrams: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.items).toHaveLength(3);
    }
  });

  it('passes through Markdown-fenced JSON', async () => {
    const payload = {
      detected_language: 'en',
      extracted_markdown: 'x',
      items: [
        JSON.parse(completeItem(1)),
        JSON.parse(completeItem(2)),
        JSON.parse(completeItem(3)),
      ],
      diagrams: [],
      problem_templates: [],
    };
    const fenced = '```json\n' + JSON.stringify(payload) + '\n```';
    const res = await parseVisionPayload(fenced, { dropDiagrams: false });
    expect(res.ok).toBe(true);
  });
});
