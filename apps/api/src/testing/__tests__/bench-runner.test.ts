// requires live verification in Claude Code session (scripted outside world, no database).
import { describe, expect, it, vi } from 'vitest';
import { LlmError } from '../../llm/gateway.js';
import { VERTEX_PROFILE } from '../../llm/vertex.js';
import { request } from '../../llm/__tests__/chat-fixtures.js';
import { runBench, type BenchCandidate } from '../bench/runner.js';
const receipt = {
  model: 'test',
  inputTokens: 10,
  outputTokens: 10,
  thoughtTokens: 0,
  cachedTokens: 0,
  costMicros: 100,
  latencyMs: 1,
};
const candidate = (name: string): BenchCandidate => ({
  name,
  ceiling: () => 0.1,
  gateway: {
    available: true,
    profile: VERTEX_PROFILE,
    generate: vi.fn(async () => ({ json: {}, usage: receipt })),
  },
  workloads: ['one', 'two'].map((id) => ({
    id,
    purpose: 'tutor',
    req: request({ system: id }),
    aliases: new Set(),
  })),
});
describe('benchmark failure isolation and budget', () => {
  it('calibrates only repeated identical requests from the same candidate', async () => {
    const c = candidate('same');
    c.ceiling = vi.fn(() => 0.1);
    await runBench({ candidates: [c], rounds: 2, budget: 1, valid: () => true, record: () => {} });
    expect(vi.mocked(c.ceiling).mock.calls.map((call) => call[1]?.inputTokens)).toEqual([
      undefined,
      undefined,
      10,
      10,
    ]);
  });
  it('records a failed call and continues every remaining candidate/workload/round', async () => {
    const bad = candidate('bad'),
      good = candidate('good');
    vi.mocked(bad.gateway.generate).mockRejectedValue(
      new LlmError('refused', 'provider rejected request (400)', null, 'HTTP_400'),
    );
    const record = vi.fn();
    const rows = await runBench({
      candidates: [bad, good],
      rounds: 2,
      budget: 1,
      valid: () => true,
      record,
    });
    expect(rows).toHaveLength(8);
    expect(rows[0]?.error).toContain('HTTP_400');
    expect(rows.filter((r) => r.valid)).toHaveLength(4);
    expect(record).toHaveBeenCalledTimes(8);
  });
  it('keeps a complete receipt even when domain validation rejects the answer', async () => {
    const rows = await runBench({
      candidates: [candidate('invalid')],
      rounds: 1,
      budget: 1,
      valid: () => false,
      record: () => {},
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      valid: false,
      error: 'invalid_output: domain validation failed',
      costStatus: 'receipt',
      budgetCharge: 0.0001,
    });
  });
  it('reserves unreceipted failures and never launches a request that could exceed the total budget', async () => {
    const bad = candidate('bad'),
      good = candidate('good');
    bad.ceiling = () => 0.5;
    vi.mocked(bad.gateway.generate).mockRejectedValue(
      new LlmError('timeout', 'lost receipt', receipt),
    );
    const rows = await runBench({
      candidates: [bad, good],
      rounds: 2,
      budget: 1,
      alreadySpent: 0.2,
      valid: () => true,
      record: () => {},
    });
    expect(rows).toHaveLength(8);
    expect(vi.mocked(bad.gateway.generate)).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ costStatus: 'reserved', budgetCharge: 0.5 });
    expect(rows.filter((r) => r.valid)).toHaveLength(4);
    expect(rows.reduce((sum, r) => sum + r.budgetCharge, 0) + 0.2).toBeLessThanOrEqual(1);
  });
});
