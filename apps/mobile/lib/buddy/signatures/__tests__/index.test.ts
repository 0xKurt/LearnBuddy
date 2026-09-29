import { describe, expect, it } from 'vitest';

import { DEFAULT_SIGNATURE, SIGNATURE_KEYS } from '../index.js';

describe('signatures', () => {
  it('the moon is the default; every prepared signature has one key', () => {
    expect(DEFAULT_SIGNATURE).toBe('mond');
    expect(new Set(SIGNATURE_KEYS).size).toBe(SIGNATURE_KEYS.length);
    expect(SIGNATURE_KEYS).toEqual(['mond', 'ring', 'stern', 'sternchen', 'nurstern']);
  });
});
