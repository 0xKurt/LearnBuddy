import { describe, expect, it } from 'vitest';

import { newestBuddyId, seenAfter, showNewReply } from '../newReply.js';

const thread = [
  { id: 'a', role: 'buddy' as const },
  { id: 'b', role: 'learner' as const },
];

describe('new reply pill', () => {
  it("finds Buddy's newest message", () => {
    expect(newestBuddyId(thread)).toBe('a');
    expect(newestBuddyId([{ id: 'b', role: 'learner' }])).toBeNull();
  });
  it('never shows at the end of the conversation', () => {
    expect(showNewReply({ seen: null }, true, 'c', true)).toBe(false);
  });
  it('does not show for what was there when she scrolled up', () => {
    const seen = seenAfter({ seen: null }, true, 'a');
    expect(showNewReply(seenAfter(seen, false, 'a'), false, 'a', false)).toBe(false);
  });
  it('shows once a new reply arrives, or while one is being written, after she scrolled up', () => {
    const seen = seenAfter({ seen: null }, true, 'a');
    expect(showNewReply(seen, false, 'c', false)).toBe(true);
    expect(showNewReply(seen, false, 'a', true)).toBe(true);
  });
  it('hides again once she is back at the end', () => {
    const seen = seenAfter({ seen: 'a' }, true, 'c');
    expect(showNewReply(seen, false, 'c', false)).toBe(false);
  });
});
