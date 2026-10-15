// A streamed answer is never silent for long while its work runs (#662): the app ends a stream
// after STREAM_IDLE_MS without a byte, so the API sends a comment line more often than that —
// and none after the result, so nothing follows `done`.

import { STREAM_IDLE_MS, STREAM_KEEPALIVE_MS } from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppEnv } from '../context.js';
import { streamed } from '../stream.js';
import { Timeline } from '../timing.js';

function appWith(workMs: number, fail = false): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(async (c, next) => {
    c.set('timeline', new Timeline());
    await next();
  });
  app.post('/work', (c) =>
    streamed(c, 'progress', async (emit) => {
      emit({ step: 1 });
      await new Promise((r) => setTimeout(r, workMs));
      if (fail) throw new Error('boom');
      return { ok: true };
    }),
  );
  return app;
}

async function read(app: Hono<AppEnv>, runMs: number): Promise<string> {
  const res = await app.request('/work', { method: 'POST' });
  const text = res.text();
  await vi.advanceTimersByTimeAsync(runMs);
  return text;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('streamed', () => {
  it('keeps the line alive more often than the app waits', () => {
    expect(STREAM_KEEPALIVE_MS * 2).toBeLessThanOrEqual(STREAM_IDLE_MS);
  });

  it('sends a keepalive while long work runs, and nothing after the result', async () => {
    const body = await read(appWith(35_000), 60_000);
    const blocks = body.split('\n\n').filter(Boolean);
    expect(blocks.filter((b) => b === ': keepalive')).toHaveLength(3);
    expect(blocks.at(-1)).toMatch(/^event: done/);
    expect(blocks[0]).toMatch(/^event: progress/);
  });

  it('ends a failed run with its error and no keepalive after it', async () => {
    const body = await read(appWith(12_000, true), 60_000);
    const blocks = body.split('\n\n').filter(Boolean);
    expect(blocks.filter((b) => b === ': keepalive')).toHaveLength(1);
    expect(blocks.at(-1)).toMatch(/^event: error/);
  });

  it('sends none when the work is quick', async () => {
    const body = await read(appWith(500), 30_000);
    expect(body).not.toContain('keepalive');
  });
});
