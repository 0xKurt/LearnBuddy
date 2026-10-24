import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/apiError.js';
import { safeguardingReply } from '../safeguarding.js';

describe('a free-text refusal carries only the explicit safeguarding reply', () => {
  it('reads the fixed reply separately from the engine message', () => {
    expect(
      safeguardingReply(
        new ApiError('invalid_input', 'Never show this', 422, {
          reason: 'safeguarding',
          reply: 'Fixed help answer',
        }),
      ),
    ).toBe('Fixed help answer');
  });

  it.each([
    new Error('Never show this'),
    new ApiError('internal', 'Never show this', 500),
    new ApiError('invalid_input', 'Never show this', 422, { reply: 'Unrelated text' }),
    new ApiError('invalid_input', 'Never show this', 422, { reason: 'safeguarding', reply: 5 }),
    new ApiError('invalid_input', 'Never show this', 422, { reason: 'safeguarding', reply: '' }),
  ])('leaves ordinary and malformed errors to messageFor', (error) => {
    expect(safeguardingReply(error)).toBeNull();
  });
});
