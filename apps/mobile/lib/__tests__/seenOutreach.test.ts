// Buddy's message counts as opened only once it stood on screen in her thread (#805, rule 5):
// at least half of it inside the room the thread can be read in, reported once.

import { describe, expect, it } from 'vitest';

import { seenTracker, shownEnough } from '../buddy/seenOutreach.js';

/** The thread's readable room: from 100 to 600 in the window. */
const view = { top: 100, height: 500 };

describe('seen in her thread', () => {
  it('counts a message at least half inside the room, not one scrolled away or under the card', () => {
    expect(shownEnough({ top: 200, height: 80 }, view)).toBe(true);
    // Half of it under the top edge (a card lying there, or scrolled up): still half seen.
    expect(shownEnough({ top: 60, height: 80 }, view)).toBe(true);
    // Mostly above the room, or below it, or not laid out yet.
    expect(shownEnough({ top: 30, height: 80 }, view)).toBe(false);
    expect(shownEnough({ top: 590, height: 80 }, view)).toBe(false);
    expect(shownEnough({ top: 200, height: 0 }, view)).toBe(false);
    // Taller than the room: it counts once it fills half of the room.
    expect(shownEnough({ top: 350, height: 2000 }, view)).toBe(true);
    expect(shownEnough({ top: 400, height: 2000 }, view)).toBe(false);
  });

  it('reports each message once, only when it is shown, and again after a failed report', async () => {
    const reported: string[] = [];
    let fail = true;
    const tracker = seenTracker((id) => {
      reported.push(id);
      return fail ? Promise.reject(new Error('offline')) : Promise.resolve();
    });
    const rows = [
      { id: 'o1', box: { top: 200, height: 80 } },
      { id: 'o2', box: { top: 900, height: 80 } },
    ];
    tracker.check(view, rows);
    expect(reported).toEqual(['o1']);
    await Promise.resolve();
    await Promise.resolve();
    // The report did not arrive: the next rest tries again.
    fail = false;
    tracker.check(view, rows);
    expect(reported).toEqual(['o1', 'o1']);
    await Promise.resolve();
    // Arrived: seen again, it is not reported again; o2 counts once it is scrolled to.
    tracker.check(view, rows);
    tracker.check(view, [{ id: 'o2', box: { top: 300, height: 80 } }]);
    expect(reported).toEqual(['o1', 'o1', 'o2']);
  });
});
