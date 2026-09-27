import { describe, expect, it } from 'vitest';

import { olderThan } from '../version.js';

describe('olderThan', () => {
  it('compares versions part by part, numerically', () => {
    expect(olderThan('1.3.9', '1.4.0')).toBe(true);
    expect(olderThan('1.4', '1.4.0')).toBe(false);
    expect(olderThan('1.10.0', '1.9.0')).toBe(false);
    expect(olderThan('0.9', '1')).toBe(true);
    expect(olderThan('2', '1.99.99')).toBe(false);
  });
});
