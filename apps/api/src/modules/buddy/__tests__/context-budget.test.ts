// STATE and the conversation share one character budget per model call (KI-Audit F19, #672).

import { describe, expect, it } from 'vitest';

import { buildContents, CONTEXT_CHARS, fitDialogue } from '../context.js';

type Line = { role: 'learner' | 'buddy'; text: string };
const said = (role: Line['role'], n: number, chars: number): Line => ({
  role,
  text: `${role} ${n} `.padEnd(chars, 'x'),
});

/** 24 messages of the longest kind, ending with two of hers since Buddy's last answer. */
function longAfternoon(): Line[] {
  const lines: Line[] = [];
  for (let i = 0; i < 11; i++) lines.push(said('learner', i, 2000), said('buddy', i, 700));
  lines.push(said('learner', 98, 2000), said('learner', 99, 2000));
  return lines;
}

const chars = (lines: readonly Line[]) => lines.reduce((n, m) => n + m.text.length, 0);

describe('the conversation within what STATE leaves of the budget', () => {
  it('sends an ordinary conversation as it is', () => {
    const lines = [said('learner', 1, 300), said('buddy', 1, 200), said('learner', 2, 100)];
    expect(fitDialogue(8000, lines)).toEqual(lines);
  });

  it('drops the oldest messages first and keeps STATE plus conversation within the budget', () => {
    const lines = longAfternoon();
    const state = 12_000;
    expect(state + chars(lines)).toBeGreaterThan(CONTEXT_CHARS);
    const kept = fitDialogue(state, lines);
    expect(state + chars(kept)).toBeLessThanOrEqual(CONTEXT_CHARS);
    expect(kept).toEqual(lines.slice(lines.length - kept.length));
    // It still starts with her words, not with an answer to something no longer there.
    expect(kept[0]!.role).toBe('learner');
  });

  it('never cuts what she wrote since Buddy’s last answer, whatever the budget', () => {
    const lines = longAfternoon();
    const kept = fitDialogue(CONTEXT_CHARS, lines);
    expect(kept.map((m) => m.text)).toEqual(lines.slice(-2).map((m) => m.text));
  });

  it('keeps the last message of a background check, which has no run of hers', () => {
    const lines = [said('learner', 1, 2000), said('buddy', 1, 700)];
    expect(fitDialogue(CONTEXT_CHARS, lines)).toEqual([lines[1]]);
  });

  it('is what buildContents sends', () => {
    const contents = buildContents('x'.repeat(30_000), longAfternoon());
    const sent = contents.flatMap((c) => c.parts.map((p) => ('text' in p ? (p.text ?? '') : '')));
    expect(sent.join('').length).toBeLessThanOrEqual(CONTEXT_CHARS + 100);
  });
});
