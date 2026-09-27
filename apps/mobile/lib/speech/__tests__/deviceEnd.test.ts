import { describe, expect, it } from 'vitest';

import { deviceEnd } from '../deviceEnd.js';

describe('the end of an on-device recognition', () => {
  it('delivers what she said when she ended it', () => {
    expect(deviceEnd('drei Viertel', 'none', false)).toEqual({
      kind: 'text',
      text: 'drei Viertel',
    });
  });

  it('an interruption by the system delivers no half sentence, and says so (p2-lc-recogniser-abort-sends-partial)', () => {
    expect(deviceEnd('drei', 'none', true)).toEqual({ kind: 'failed' });
    expect(deviceEnd('', 'failed', true)).toEqual({ kind: 'failed' });
  });

  it('otherwise: the recording path, "nothing heard", or an error already reported', () => {
    expect(deviceEnd('', 'fallback', false)).toEqual({ kind: 'fallback' });
    expect(deviceEnd('', 'none', false)).toEqual({ kind: 'empty' });
    expect(deviceEnd('', 'failed', false)).toEqual({ kind: 'silent' });
  });
});
