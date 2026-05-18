// Pure resume-transcript tests (node).

import { describe, it, expect } from 'vitest';
import type { ConversationTurn, Item } from '@learnbuddy/shared-types';

import { buildResumeTranscript, normVerdict } from '../transcript.js';

function turn(p: Partial<ConversationTurn> & { turn_index: number }): ConversationTurn {
  return {
    id: `t${p.turn_index}`,
    session_id: 's',
    item_id: 'i1',
    role: 'learner',
    kind: 'answer',
    content: '',
    verdict: null,
    mode: 'text',
    client_turn_id: null,
    created_at: '2026-05-16T10:00:00Z',
    ...p,
  } as ConversationTurn;
}
const item = (id: string, question: string): Item => ({ id, question }) as unknown as Item;

describe('normVerdict', () => {
  it('passes the 3 display verdicts through, maps skipped→incorrect, null→undefined', () => {
    expect(normVerdict('correct')).toBe('correct');
    expect(normVerdict('partially_correct')).toBe('partially_correct');
    expect(normVerdict('incorrect')).toBe('incorrect');
    expect(normVerdict('skipped')).toBe('incorrect');
    expect(normVerdict(null)).toBeUndefined();
    expect(normVerdict(undefined)).toBeUndefined();
  });
});

describe('buildResumeTranscript', () => {
  const items = [item('i1', 'Q one?'), item('i2', 'Q two?')];

  it('interleaves a question bubble the first time each item appears, in order', () => {
    const turns = [
      turn({ turn_index: 0, item_id: 'i1', role: 'learner', kind: 'answer', content: 'wrong' }),
      turn({
        turn_index: 1,
        item_id: 'i1',
        role: 'tutor',
        kind: 'feedback',
        content: 'not quite',
        verdict: 'incorrect',
      }),
      turn({ turn_index: 2, item_id: 'i1', role: 'learner', kind: 'answer', content: 'right' }),
      turn({
        turn_index: 3,
        item_id: 'i1',
        role: 'tutor',
        kind: 'feedback',
        content: 'yes!',
        verdict: 'correct',
      }),
    ];
    const { messages, startIdx } = buildResumeTranscript(turns, items);
    expect(messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      'question:Q one?',
      'learner:wrong',
      'tutor:not quite',
      'learner:right',
      'tutor:yes!',
    ]);
    // i1 has a correct tutor turn → resume on i2.
    expect(startIdx).toBe(1);
  });

  it('sorts unordered turns by turn_index before rebuilding', () => {
    const turns = [
      turn({ turn_index: 2, item_id: 'i1', role: 'learner', content: 'second' }),
      turn({ turn_index: 0, item_id: 'i1', role: 'learner', content: 'first' }),
    ];
    const { messages } = buildResumeTranscript(turns, items);
    expect(messages.filter((m) => m.role === 'learner').map((m) => m.text)).toEqual([
      'first',
      'second',
    ]);
  });

  it('startIdx = items.length when every item already has a correct tutor turn', () => {
    const turns = [
      turn({ turn_index: 0, item_id: 'i1', role: 'tutor', kind: 'feedback', verdict: 'correct' }),
      turn({ turn_index: 1, item_id: 'i2', role: 'tutor', kind: 'feedback', verdict: 'correct' }),
    ];
    expect(buildResumeTranscript(turns, items).startIdx).toBe(2);
  });

  it('normalises a skipped verdict to incorrect on the bubble', () => {
    const turns = [
      turn({ turn_index: 0, item_id: 'i1', role: 'tutor', kind: 'feedback', verdict: 'skipped' }),
    ];
    const tutorMsg = buildResumeTranscript(turns, items).messages.find((m) => m.role === 'tutor');
    expect(tutorMsg?.verdict).toBe('incorrect');
  });
});
