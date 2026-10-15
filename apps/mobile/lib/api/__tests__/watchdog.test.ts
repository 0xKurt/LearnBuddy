// A call whose answer never comes ends honestly instead of hanging (#662, audit F14-a): a plain
// JSON call after 15 s (a model call after its own longer bound), a stream after 20 s of silence —
// and a stream that keeps sending its keepalives lives on.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0' } } }));
vi.mock('../../env.js', () => ({ ENV: { API_URL: 'https://api.test' } }));
vi.mock('../../admin.js', () => ({ adminToken: () => null }));
vi.mock('../../time.js', () => ({ deviceTimeZone: () => 'Europe/Berlin' }));
vi.mock('../../auth/session.js', () => ({ currentSession: () => null }));
vi.mock('../../auth/supabase.js', () => ({ refreshSession: () => Promise.resolve(null) }));
const streaming = vi.hoisted(() => ({
  fetch: (_url: string, _init: RequestInit): Promise<Response> => new Promise(() => undefined),
}));
vi.mock('../streamingFetch.js', () => ({
  streamingFetch: (url: string, init: RequestInit) => streaming.fetch(url, init),
}));

import { ApiError } from '../apiError';
import { request, streamRequest } from '../client';

/** A fetch whose answer never arrives — and that does not even listen to its AbortSignal. */
const hanging = () => new Promise<Response>(() => undefined);

/** Where a promise stands right now, without waiting for it. */
async function state(p: Promise<unknown>): Promise<'pending' | 'resolved' | ApiError | unknown> {
  let out: unknown = 'pending';
  p.then(
    () => (out = 'resolved'),
    (err: unknown) => (out = err),
  );
  await vi.advanceTimersByTimeAsync(0);
  return out;
}

/** A streamed answer that sends `chunks`, each after `gapMs`, then stays silent forever. */
function streamOf(chunks: string[], gapMs: number): Response {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull: (ctl) =>
      new Promise<void>((resolve) => {
        if (i >= chunks.length) return; // silence: never resolves
        setTimeout(() => {
          ctl.enqueue(enc.encode(chunks[i++]));
          resolve();
        }, gapMs);
      }),
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(hanging));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a JSON call without an answer', () => {
  it('ends as a network failure with the reason "timeout" after 15 s', async () => {
    const call = request('GET', '/buddy', { schema: z.unknown() });
    call.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(14_900);
    expect(await state(call)).toBe('pending');
    await vi.advanceTimersByTimeAsync(200);
    const err = await state(call);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('network');
    expect((err as ApiError).reason).toBe('timeout');
  });

  it('gives a call that waits for the model its longer bound', async () => {
    const call = request('POST', '/practice/topic', { schema: z.unknown(), wait: 'long' });
    call.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await state(call)).toBe('pending');
    await vi.advanceTimersByTimeAsync(91_000);
    expect((await state(call)) as ApiError).toMatchObject({ code: 'network', reason: 'timeout' });
  });

  it('leaves an answer that came in time alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 }))),
    );
    await expect(
      request('GET', '/buddy', { schema: z.object({ ok: z.boolean() }) }),
    ).resolves.toEqual({ ok: true });
    // The timer of the finished call never fires into anything.
    await vi.advanceTimersByTimeAsync(20_000);
  });
});

describe('a streamed call', () => {
  const opts = { schema: z.unknown(), onEvent: () => undefined };

  it('lives on while the API sends keepalives, then ends as a lost stream after 20 s of silence', async () => {
    streaming.fetch = () =>
      Promise.resolve(
        streamOf(
          Array.from({ length: 6 }, () => ': keepalive\n\n'),
          10_000,
        ),
      );
    const call = streamRequest('POST', '/buddy/messages', opts);
    call.catch(() => undefined);
    // Six keepalives, ten seconds apart: a minute without a word, and still alive.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await state(call)).toBe('pending');
    await vi.advanceTimersByTimeAsync(19_000);
    expect(await state(call)).toBe('pending');
    await vi.advanceTimersByTimeAsync(1_500);
    expect((await state(call)) as ApiError).toMatchObject({
      code: 'network',
      reason: 'stream_lost',
    });
  });

  it('ends a request whose answer never starts after 20 s', async () => {
    streaming.fetch = hanging;
    const call = streamRequest('POST', '/buddy/messages', opts);
    call.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(20_100);
    expect((await state(call)) as ApiError).toMatchObject({
      code: 'network',
      reason: 'stream_lost',
    });
  });

  it('still reads her own "Stopp" as stopped, not as a timeout', async () => {
    streaming.fetch = (_url, init) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const stop = new AbortController();
    const call = streamRequest('POST', '/buddy/messages', { ...opts, signal: stop.signal });
    call.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    stop.abort();
    expect((await state(call)) as ApiError).toMatchObject({ code: 'aborted' });
  });
});
