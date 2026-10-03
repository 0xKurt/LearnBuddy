import { TEST_MINUTES, TestMinutes } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { ACT_SCHEMAS, TEST_MINUTE_CHOICES } from '../decision.js';

describe('the minutes of a test with time (issue #241)', () => {
  it('offers the model exactly the list the server accepts', () => {
    expect(TEST_MINUTE_CHOICES.map(Number)).toEqual([...TEST_MINUTES]);
    for (const m of TEST_MINUTE_CHOICES)
      expect(TestMinutes.safeParse(Number(m)).success).toBe(true);
  });

  it('takes no free number from the model', () => {
    const offer = (minutes: unknown) =>
      ACT_SCHEMAS.offer_learning.safeParse({
        tool: 'offer_learning',
        args: {
          kind: 'test',
          text: 'Brüche',
          goal: null,
          time_limit: { minutes, quote: 'mit Zeit' },
        },
      }).success;
    expect(offer('45')).toBe(true);
    expect(offer('25')).toBe(false);
    expect(offer(45)).toBe(false);
    expect(offer('2026-10-02T15:00:00Z')).toBe(false);
    // No wish, no clock: absent and null are both "no time limit".
    expect(
      ACT_SCHEMAS.offer_learning.safeParse({
        tool: 'offer_learning',
        args: { kind: 'test', text: 'Brüche', goal: null },
      }).success,
    ).toBe(true);
  });
});
