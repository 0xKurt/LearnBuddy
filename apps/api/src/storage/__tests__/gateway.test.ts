// The real storage adapter against a stand-in Supabase Storage over HTTP (audit S-7, M-16):
// absent is null, everything else is a StorageError with the shared outcome.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { StorageError, storageOutcomeOf, SupabaseStorage } from '../gateway.js';

describe('SupabaseStorage outcomes', () => {
  let server: Server;
  let base = '';
  let answer: { status: number; body: unknown } = { status: 200, body: {} };
  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server = createServer((_req, res) => {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const storage = (url = base) =>
    new SupabaseStorage({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'service-key' });

  it('classifies bare errors', () => {
    expect(storageOutcomeOf(null)).toBe('unknown');
    expect(storageOutcomeOf({ status: 403 })).toBe('refused');
    expect(storageOutcomeOf({ status: 429 })).toBe('transient');
    expect(storageOutcomeOf({ originalError: { status: 500 } })).toBe('transient');
  });

  it('a missing photo is absent; an outage or a refusal is an error with its outcome', async () => {
    answer = {
      status: 404,
      body: { statusCode: '404', error: 'not_found', message: 'Object not found' },
    };
    expect(await storage().download('a/b/0.jpg')).toBeNull();

    answer = { status: 503, body: { message: 'down' } };
    const down = await storage()
      .download('a/b/0.jpg')
      .catch((e: unknown) => e);
    expect(down).toBeInstanceOf(StorageError);
    expect((down as StorageError).outcome).toBe('transient');

    answer = { status: 403, body: { statusCode: '403', message: 'denied' } };
    const denied = await storage()
      .remove(['a/b/0.jpg'])
      .catch((e: unknown) => e);
    expect((denied as StorageError).outcome).toBe('refused');
  });

  it('an unreachable service is unknown, never absent', async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const err = await storage(`http://127.0.0.1:${port}`)
      .download('a/b/0.jpg')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).outcome).toBe('unknown');
  });
});
