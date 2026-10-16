// How often the home asks while she sees it (#686, #671): the pace the server sends, or the same
// rule here for an older API — spread so that many phones never ask in the same second.

import {
  BuddyHome as BuddyHomeSchema,
  pollAfterMs,
  type BuddyHome,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { homePollMs, pollRule, staggered } from '../api/homePoll.js';

// The rule for an older API is the learning domain's (issue #107), filled as at app start.
pollRule.fill(pollAfterMs);

const home = (over: Partial<BuddyHome>): BuddyHome =>
  ({ working: null, thread: [], now: null, ...over }) as unknown as BuddyHome;
const middle = () => 0.5;

describe('home poll (#686, #671)', () => {
  it('follows the pace the server sent', () => {
    expect(homePollMs(home({ poll_after_ms: 2000 }), middle)).toBe(2000);
    // Nothing in progress, says the server: once a minute — whatever the app would have guessed.
    expect(
      homePollMs(
        home({ poll_after_ms: null, working: 'material' as BuddyHome['working'] }),
        middle,
      ),
    ).toBe(60_000);
  });

  it('decides itself with an API that does not send it yet', () => {
    expect(
      homePollMs(home({ now: { type: 'material_processing' } as BuddyHome['now'] }), middle),
    ).toBe(1500);
    expect(homePollMs(home({ working: 'material' as BuddyHome['working'] }), middle)).toBe(3000);
    expect(
      homePollMs(
        home({ thread: [{ status: 'processing' }] as unknown as BuddyHome['thread'] }),
        middle,
      ),
    ).toBe(3000);
    expect(homePollMs(home({}), middle)).toBe(60_000);
    expect(homePollMs(undefined)).toBe(false);
  });

  it('spreads every pace by ±15 %, so polls do not fall into step', () => {
    const h = home({ poll_after_ms: 3000 });
    expect(homePollMs(h, () => 0)).toBe(2550);
    expect(homePollMs(h, () => 0.999999)).toBe(3450);
  });

  it('never polls sooner than a second, whatever it is told (#818)', () => {
    expect(staggered(10, () => 0)).toBe(1000);
    expect(staggered(1500, () => 0)).toBe(1275);
  });

  it('does not take a pace outside 1 s–2 min from the server: the app rule applies', () => {
    const parsed = (v: unknown) =>
      BuddyHomeSchema.shape.poll_after_ms.parse(v) as number | null | undefined;
    expect(parsed(1)).toBeUndefined();
    expect(parsed(500_000)).toBeUndefined();
    expect(parsed(1500)).toBe(1500);
    expect(parsed(null)).toBeNull();
  });
});
