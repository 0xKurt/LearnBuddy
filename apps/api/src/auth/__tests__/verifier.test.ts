import { describe, expect, it } from 'vitest';

import { authenticatedAtOf } from '../verifier.js';

const jwt = (payload: Record<string, unknown>) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

describe('authenticatedAtOf', () => {
  it('uses the latest interactive sign-in from amr, not the token issue time', () => {
    const token = jwt({
      iat: 2_000_000,
      amr: [
        { method: 'password', timestamp: 1_000_000 },
        { method: 'otp', timestamp: 1_500_000 },
      ],
    });
    expect(authenticatedAtOf(token)).toBe(1_500_000);
  });

  it('never treats a refreshed token as a fresh sign-in', () => {
    expect(authenticatedAtOf(jwt({ iat: 2_000_000 }))).toBeNull();
    expect(
      authenticatedAtOf(
        jwt({ iat: 2_000_000, amr: [{ method: 'token_refresh', timestamp: 2_000_000 }] }),
      ),
    ).toBeNull();
    expect(authenticatedAtOf('not-a-jwt')).toBeNull();
  });
});
