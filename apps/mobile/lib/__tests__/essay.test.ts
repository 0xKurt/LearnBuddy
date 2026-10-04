// What a long text (issue #258) changes on the practice screen, decided by code from the kind:
// the field's length, that her text stays for the next version, and how a version is named.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { answerMax, freeText, keepsSentText, versionsOf, wordCount } from '../practice/essay.js';
import { returnKey } from '../practice/pathEntry.js';

const turn = (id: string, role: 'learner' | 'tutor', essay = false): PracticeTurnView => ({
  id,
  item_id: 'i1',
  role,
  text: role === 'learner' ? 'Mein Text.' : 'Rückmeldung.',
  verdict: null,
  pronunciation: null,
  reexplain: null,
  essay: essay ? { form: 'Erörterung', points: [], places: [], last: false } : null,
  created_at: '2026-10-04T09:00:00.000Z',
});

describe('a long text on the practice screen (#258)', () => {
  it('takes 12 000 characters; every other answer 2000, as the server does', () => {
    expect(answerMax('essay')).toBe(12_000);
    expect(answerMax('long')).toBe(2000);
    expect(answerMax('short')).toBe(2000);
  });

  it('has no solution to show, like a long answer, and keeps her text for the next version', () => {
    expect(freeText('essay')).toBe(true);
    expect(freeText('long')).toBe(true);
    expect(freeText('short')).toBe(false);
    expect(keepsSentText('essay')).toBe(true);
    expect(keepsSentText('long')).toBe(false);
  });

  it('is prose: the return key always takes the line', () => {
    expect(returnKey('essay', 'Ein Satz.')).toBe('newline');
  });

  it('counts her words the way a teacher does', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
    expect(wordCount('Ich finde,  dass\nein Verbot hilft.')).toBe(6);
  });

  it('numbers only the versions Buddy gave feedback on', () => {
    // The first text met an outage (no feedback): it is no version, as the server counts tries.
    const turns = [
      turn('a1', 'learner'),
      turn('r1', 'tutor'),
      turn('a2', 'learner'),
      turn('r2', 'tutor', true),
      turn('a3', 'learner'),
      turn('r3', 'tutor', true),
    ];
    const versions = versionsOf(turns);
    expect(versions.get('a1')).toBeUndefined();
    expect(versions.get('a2')).toBe(1);
    expect(versions.get('a3')).toBe(2);
    expect(versions.has('r2')).toBe(false);
  });
});
