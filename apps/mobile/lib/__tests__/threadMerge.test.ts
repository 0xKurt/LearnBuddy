import { describe, expect, it } from 'vitest';

import { mergeThread } from '../threadMerge.js';

const msg = (n: number, text = `Nachricht ${n}`) => ({
  id: `m${n}`,
  text,
  created_at: new Date(Date.UTC(2026, 8, 28, 14, 0, n)).toISOString(),
});

describe('mergeThread (audit M-75, repro-25)', () => {
  it('keeps a message that slid out of the live window after an older page was loaded', () => {
    // History shows the live window m5..m7 and an older page m1..m4.
    const older = [msg(1), msg(2), msg(3), msg(4)];
    let seen = mergeThread(older, [msg(5), msg(6), msg(7)]);
    // Two new messages arrive: the window is now m7..m9; m5 and m6 left it.
    seen = mergeThread(seen, [msg(7), msg(8), msg(9)]);
    expect(seen.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
  });

  it('takes the newer copy of a message and keeps each message once', () => {
    const merged = mergeThread([msg(1), msg(2, 'Buddy schreibt …')], [msg(2, 'Fertig'), msg(3)]);
    expect(merged.map((m) => m.text)).toEqual(['Nachricht 1', 'Fertig', 'Nachricht 3']);
  });

  it('orders by time, messages of the same moment in the order they came', () => {
    const same = new Date(Date.UTC(2026, 8, 28, 14)).toISOString();
    const a = { id: 'a', created_at: same };
    const b = { id: 'b', created_at: same };
    expect(mergeThread([a], [b]).map((m) => m.id)).toEqual(['a', 'b']);
    expect(mergeThread([msg(2)], [msg(1)]).map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});
