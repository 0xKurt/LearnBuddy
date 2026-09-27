import { describe, expect, it } from 'vitest';

import { dayGroups } from '../dayGroups.js';
import { dayBreaks } from '../time.js';

const at = (d: number, h: number) => ({ created_at: new Date(2026, 8, d, h).toISOString(), d, h });

describe('the history in days (gaps.md #22)', () => {
  const now = new Date(2026, 8, 28, 16);

  it('keeps every message once, in order, one piece per day', () => {
    const all = [at(26, 9), at(27, 17), at(27, 18), at(28, 9), at(28, 15)];
    const groups = dayGroups(all, now);
    expect(groups.map((g) => g.day)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
    expect(groups.flatMap((g) => g.messages)).toEqual(all);
  });

  it('shows the same day lines as one long conversation would', () => {
    const all = [at(27, 17), at(27, 18), at(28, 9)];
    const whole = dayBreaks(
      all.map((m) => m.created_at),
      now,
    ).filter((b) => b !== null);
    // Each piece shows its own line when it is not today; today's line comes from the list.
    const pieces = dayGroups(all, now).flatMap((g) =>
      g.todayLine
        ? [g.day]
        : dayBreaks(
            g.messages.map((m) => m.created_at),
            now,
          ).filter((b) => b !== null),
    );
    expect(pieces).toEqual(whole);
  });

  it('draws no line above a conversation that is only from today', () => {
    expect(dayGroups([at(28, 9), at(28, 10)], now)).toEqual([
      { day: '2026-09-28', messages: [at(28, 9), at(28, 10)], todayLine: false },
    ]);
  });
});
