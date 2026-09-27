import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authenticatedAtOf, SupabaseAuthVerifier, verifyFailureOf } from '../verifier.js';

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

// The real verifier against a stand-in Supabase Auth over HTTP (audit H-27):
// only a definite "this token is not valid" is null; an outage is 503.
describe('SupabaseAuthVerifier failure classes', () => {
  let server: Server;
  let base = '';
  let answer: { status: number; body: unknown } = { status: 200, body: {} };
  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });
  const verifier = (url: string) =>
    new SupabaseAuthVerifier({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  const unavailable = { name: 'AppError', code: 'unavailable' };

  it('returns the user for a valid token', async () => {
    answer = { status: 200, body: { id: 'u1', email: 'a@example.test', aud: 'authenticated' } };
    expect(await verifier(base).verify('tok')).toMatchObject({ userId: 'u1' });
  });

  it('returns null only for a token the service rejects', async () => {
    answer = { status: 403, body: { code: 'bad_jwt', msg: 'invalid JWT' } };
    expect(await verifier(base).verify('tok')).toBeNull();
    answer = { status: 401, body: { msg: 'expired' } };
    expect(await verifier(base).verify('tok')).toBeNull();
  });

  it('throws unavailable on 5xx, 429 and an unreachable service', async () => {
    for (const status of [500, 502, 503, 504, 429]) {
      answer = { status, body: { msg: 'down' } };
      await expect(verifier(base).verify('tok')).rejects.toMatchObject(unavailable);
    }
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    await expect(verifier(`http://127.0.0.1:${port}`).verify('tok')).rejects.toMatchObject(
      unavailable,
    );
  });

  it('classifies bare statuses', () => {
    expect(verifyFailureOf({})).toBe('unavailable');
    expect(verifyFailureOf({ status: 0 })).toBe('unavailable');
    expect(verifyFailureOf({ status: 408 })).toBe('unavailable');
    expect(verifyFailureOf({ status: 400 })).toBe('invalid');
  });
});
