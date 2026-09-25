import { describe, expect, it } from 'vitest';

import {
  looksLikeEmail,
  MIN_PASSWORD_LENGTH,
  parseRecoveryUrl,
  passwordProblem,
  withoutSecrets,
} from '../recovery.js';

describe('parseRecoveryUrl', () => {
  it('reads the implicit-flow tokens from the fragment (native deep link)', () => {
    expect(
      parseRecoveryUrl(
        'learnbuddy://reset-password#access_token=abc.def&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'abc.def', refreshToken: 'r1' });
  });

  it('reads the implicit-flow tokens on the web', () => {
    expect(
      parseRecoveryUrl(
        'https://app.example.org/reset-password#access_token=a%2Bb&refresh_token=r&type=recovery',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'a+b', refreshToken: 'r' });
  });

  it('only accepts tokens from a recovery link', () => {
    expect(
      parseRecoveryUrl('learnbuddy://reset-password#access_token=a&refresh_token=r&type=signup'),
    ).toEqual({ kind: 'invalid' });
    expect(parseRecoveryUrl('learnbuddy://reset-password#access_token=a&type=recovery')).toEqual({
      kind: 'invalid',
    });
  });

  it('reads a PKCE code', () => {
    expect(parseRecoveryUrl('learnbuddy://reset-password?code=c-123')).toEqual({
      kind: 'code',
      code: 'c-123',
    });
  });

  it('reads a token hash from a custom e-mail template', () => {
    expect(
      parseRecoveryUrl('https://app.example.org/reset-password?token_hash=h1&type=recovery'),
    ).toEqual({ kind: 'token_hash', tokenHash: 'h1' });
    expect(parseRecoveryUrl('learnbuddy://reset-password?token_hash=h1&type=email')).toEqual({
      kind: 'invalid',
    });
  });

  it('treats an expired or used link as invalid, in the fragment or the query', () => {
    expect(
      parseRecoveryUrl(
        'learnbuddy://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ kind: 'invalid' });
    expect(
      parseRecoveryUrl('learnbuddy://reset-password?error=access_denied&error_code=otp_expired'),
    ).toEqual({ kind: 'invalid' });
  });

  it('treats a link without recovery data as invalid', () => {
    expect(parseRecoveryUrl(null)).toEqual({ kind: 'invalid' });
    expect(parseRecoveryUrl('')).toEqual({ kind: 'invalid' });
    expect(parseRecoveryUrl('learnbuddy://reset-password')).toEqual({ kind: 'invalid' });
    expect(parseRecoveryUrl('learnbuddy://reset-password#%E0%A4%A')).toEqual({ kind: 'invalid' });
  });
});

describe('passwordProblem', () => {
  it('asks for the sign-up minimum length first', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(passwordProblem(short, short)).toBe('too_short');
  });

  it('asks for the same password twice', () => {
    expect(passwordProblem('long-enough-1', 'long-enough-2')).toBe('mismatch');
    expect(passwordProblem('long-enough-1', '')).toBe('mismatch');
  });

  it('accepts a long enough password typed twice', () => {
    expect(passwordProblem('long-enough', 'long-enough')).toBeNull();
  });
});

describe('looksLikeEmail', () => {
  it('matches the sign-up screen check', () => {
    expect(looksLikeEmail(' lena@example.org ')).toBe(true);
    expect(looksLikeEmail('lena@example')).toBe(false);
    expect(looksLikeEmail('lena example.org')).toBe(false);
  });
});

describe('withoutSecrets', () => {
  it('drops query and fragment', () => {
    expect(withoutSecrets('https://a.org/reset-password#access_token=x')).toBe(
      'https://a.org/reset-password',
    );
    expect(withoutSecrets('https://a.org/reset-password?code=1#x')).toBe(
      'https://a.org/reset-password',
    );
    expect(withoutSecrets('https://a.org/reset-password')).toBe('https://a.org/reset-password');
  });
});
