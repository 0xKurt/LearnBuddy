// Where the waiting goes (issue #165), on a real Postgres with call-log rows whose answer is
// known: the window, the percentiles, the 429 count, the cache share, and a latency fit that
// must recover the slope it was built from — and refuse one it cannot separate.
// requires live verification in Claude Code session (needs a running Postgres; the rows are synthetic)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../../../src/testing/database.js';
import { createTestEnv, type TestEnv } from '../../../src/testing/harness.js';
import { fitLatency, MIN_FIT_CALLS, renderTimeTable, whereTimeGoes } from '../where-time-goes.js';

const dbReady = await testDatabaseAvailable();
const FROM = new Date('2026-09-28T00:00:00Z');
const TO = new Date('2026-09-29T00:00:00Z');

describe('latency fit', () => {
  it('recovers base and per-token costs from exact data', () => {
    const rows = Array.from({ length: 40 }, (_, i) => {
      const input = 8_000 + (i % 7) * 1_000;
      const output = 100 + ((i * 3) % 11) * 40;
      return { input, output, latency: 400 + 0.05 * input + 4 * output };
    });
    const fit = fitLatency(rows)!;
    expect(fit.baseMs).toBeCloseTo(400, 6);
    expect(fit.msPer1kInput).toBeCloseTo(50, 6);
    expect(fit.msPer1kOutput).toBeCloseTo(4000, 6);
    expect(fit.r2).toBeCloseTo(1, 9);
  });

  it('withholds a fit it cannot make', () => {
    const few = Array.from({ length: MIN_FIT_CALLS - 1 }, (_, i) => ({
      input: i,
      output: i,
      latency: i,
    }));
    expect(fitLatency(few)).toBeNull();
    // Input never varies: its slope is not separable from the base.
    const flat = Array.from({ length: 40 }, (_, i) => ({
      input: 9_000,
      output: i * 10,
      latency: 1000 + i,
    }));
    expect(fitLatency(flat)).toBeNull();
  });
});

describe.skipIf(!dbReady)('where the time goes, from llm_calls', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T12:00:00Z' });
    const insert = (
      purpose: string,
      at: string,
      latency: number,
      opts: {
        input?: number;
        output?: number;
        cached?: number;
        outcome?: string;
        code?: string;
      } = {},
    ) =>
      env.db.query(
        `insert into llm_calls (purpose, model, prompt_version, input_tokens, output_tokens,
                                cached_tokens, latency_ms, outcome, error_code, created_at)
         values ($1, 'gemini-3.6-flash', 't', $2, $3, $4, $5, $6, $7, $8)`,
        [
          purpose,
          opts.input ?? 15_000,
          opts.output ?? 200,
          opts.cached ?? 0,
          latency,
          opts.outcome ?? 'ok',
          opts.code ?? null,
          at,
        ],
      );
    // buddy_turn: 1..10 s, half of the input from the cache.
    for (let i = 1; i <= 10; i++)
      await insert('buddy_turn', `2026-09-28T10:0${i % 10}:00Z`, i * 1000, { cached: 7_500 });
    // One throttled call and one timeout: counted, but not in the latency percentiles.
    await insert('buddy_turn', '2026-09-28T11:00:00Z', 50, {
      outcome: 'error',
      code: 'rate_limited',
    });
    await insert('buddy_turn', '2026-09-28T11:01:00Z', 60_000, { outcome: 'timeout' });
    await insert('extraction', '2026-09-28T09:00:00Z', 9_000, { input: 3_000, output: 6_000 });
    // Outside the window on both sides: never counted.
    await insert('tutor', '2026-09-27T23:59:59Z', 700);
    await insert('tutor', '2026-09-29T00:00:00Z', 700);
  });
  afterAll(async () => {
    await env?.close();
  });

  it('counts per purpose inside the window, most waited-on first', async () => {
    const rows = await whereTimeGoes(env.db, FROM, TO);
    expect(rows.map((r) => r.purpose)).toEqual(['buddy_turn', 'extraction']);
    const turn = rows[0]!;
    expect(turn).toMatchObject({ calls: 12, ok: 10, rateLimited: 1, timeouts: 1 });
    expect(turn.p50Ms).toBeCloseTo(5_500, 6);
    expect(turn.p90Ms).toBeCloseTo(9_100, 6);
    expect(turn.cachedShare).toBeCloseTo(0.5, 9);
    // 55 s + 50 ms + 60 s of buddy_turn against 9 s of extraction.
    expect(turn.shareOfWait).toBeCloseTo(115_050 / 124_050, 9);
    // Ten calls are too few to fit three coefficients.
    expect(turn.fit).toBeNull();
    const text = renderTimeTable(rows, FROM, TO);
    expect(text).toContain('| buddy_turn | 12 | 10 | 1 | 1 | 5.50 s | 9.10 s |');
    expect(text).not.toContain('tutor');
  });

  it('refuses a window that ends before it starts', async () => {
    await expect(whereTimeGoes(env.db, TO, FROM)).rejects.toThrow(/window/);
  });
});
