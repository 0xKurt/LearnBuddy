import { describe, expect, it } from 'vitest';

import { afterFirstKey } from '../pinError.js';

// The line under the PIN pad (app/pin.tsx, #599): "Die PIN stimmt nicht" is about the entry she
// is now replacing and goes with her first key; a lockout or a missing PIN is still true while
// she types and stays.
describe('the PIN screen’s error line when she starts the next PIN', () => {
  it('lets go of the wrong-PIN line', () => {
    expect(afterFirstKey({ text: 'Die PIN stimmt nicht.', passes: true })).toBeNull();
  });

  it('keeps a lockout, a missing PIN and any other failure on screen', () => {
    const locked = { text: 'Gesperrt bis 14:05.', passes: false };
    expect(afterFirstKey(locked)).toBe(locked);
  });

  it('has nothing to clear without an error', () => {
    expect(afterFirstKey(null)).toBeNull();
  });
});
