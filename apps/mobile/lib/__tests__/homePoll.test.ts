// How often the home asks while she sees it (#686, KI-Audit D-F13): a sheet being read every
// 1.5 s, like a practice being prepared — at 3 s its "read" showed up to 3 s late.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { homePollMs } from '../api/homePoll.js';

const home = (over: Partial<BuddyHome>): BuddyHome =>
  ({ working: null, thread: [], now: null, ...over }) as unknown as BuddyHome;

describe('home poll (#686)', () => {
  it('asks every 1.5 s while a sheet is being read', () => {
    expect(homePollMs(home({ now: { type: 'material_processing' } as BuddyHome['now'] }))).toBe(
      1500,
    );
  });

  it('asks every 3 s while Buddy works or a turn is in flight, else once a minute', () => {
    expect(homePollMs(home({ working: 'material' as BuddyHome['working'] }))).toBe(3000);
    expect(
      homePollMs(home({ thread: [{ status: 'processing' }] as unknown as BuddyHome['thread'] })),
    ).toBe(3000);
    expect(homePollMs(home({}))).toBe(60_000);
    expect(homePollMs(undefined)).toBe(false);
  });
});
