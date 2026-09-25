import { describe, expect, it } from 'vitest';

import { onlineFrom } from '../net.js';

describe('onlineFrom', () => {
  it('is offline only when the device has no network at all', () => {
    expect(onlineFrom({ isConnected: false })).toBe(false);
    expect(onlineFrom({ isConnected: true })).toBe(true);
    expect(onlineFrom({ isConnected: null })).toBe(true);
  });
});
