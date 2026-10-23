// Benchmark-only orchestration. Production requests and adapters stay unchanged.
// requires live verification in Claude Code session (only authorized synthetic benchmark calls).
import { LlmError, type LlmGateway, type LlmUsage } from '../../llm/gateway.js';
import { replyProgress } from '../../modules/buddy/stream.js';
import type { Workload } from './workloads.js';

export type BenchCandidate = {
  name: string;
  gateway: LlmGateway;
  workloads: Workload[];
  /** Conservative ceiling including all possible retry attempts, in USD. */
  ceiling: (w: Workload, previous?: LlmUsage) => number;
  /** Vertex introductory credits arrive later; reserve the gross invoice now. */
  costMultiplier?: number;
};
export type BenchRow = {
  round: number;
  candidate: string;
  workload: string;
  valid: boolean;
  error: string | null;
  firstPartialMs: number | null;
  firstReplyMs: number | null;
  totalMs: number;
  attempts: number;
  usage: LlmUsage | null;
  budgetCharge: number;
  receiptUsd: number;
  costStatus: 'receipt' | 'reserved' | 'not_sent';
};
export async function runBench(options: {
  candidates: BenchCandidate[];
  rounds: number;
  budget: number;
  alreadySpent?: number;
  valid: (w: Workload, json: unknown) => boolean;
  record: (rows: BenchRow[]) => void | Promise<void>;
}): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  const measuredInputs = new Map<string, LlmUsage>();
  let charged = options.alreadySpent ?? 0;
  const ids = [...new Set(options.candidates.flatMap((c) => c.workloads.map((w) => w.id)))];
  for (let round = 0; round < options.rounds; round++) {
    for (const id of ids) {
      for (let i = 0; i < options.candidates.length; i++) {
        const c = options.candidates[(i + round) % options.candidates.length]!;
        const w = c.workloads.find((w) => w.id === id);
        if (!w) continue;
        // The exact same prepared request is repeated in later rounds. Its measured input
        // count avoids reserving one token per UTF-8 byte a second time. No changed prompt/schema
        // or candidate can borrow that measurement.
        const key = c.name + JSON.stringify(w.req);
        const ceiling = c.ceiling(w, measuredInputs.get(key));
        const row: BenchRow = {
          round: round + 1,
          candidate: c.name,
          workload: id,
          valid: false,
          error: null,
          firstPartialMs: null,
          firstReplyMs: null,
          totalMs: 0,
          attempts: 0,
          usage: null,
          receiptUsd: 0,
          budgetCharge: 0,
          costStatus: 'not_sent',
        };
        const start = performance.now();
        let completed = false;
        if (!(ceiling > 0 && Number.isFinite(ceiling)) || charged + ceiling > options.budget) {
          row.error = 'budget: insufficient remaining reservation';
        } else {
          try {
            const result = await c.gateway.generate({
              ...w.req,
              signal: undefined,
              onPartial: (raw) => {
                row.firstPartialMs ??= performance.now() - start;
                if (w.purpose === 'buddy_turn' && replyProgress(raw, w.aliases)?.speakable)
                  row.firstReplyMs ??= performance.now() - start;
              },
            });
            completed = true;
            row.usage = result.usage;
            row.attempts = result.attempts ?? 1;
            row.valid = options.valid(w, result.json);
            if (!row.valid) row.error = 'invalid_output: domain validation failed';
          } catch (error) {
            row.error =
              error instanceof LlmError
                ? `${error.kind}:${error.finishReason ?? ''}: ${error.message}`
                : 'unexpected error';
            if (error instanceof LlmError) {
              row.usage = error.usage;
              row.attempts = error.attempts;
            }
          }
          // Errors may have partial receipts; reserve the entire ceiling for that uncertainty.
          // A successful response with a nonzero receipt can release the unused reservation.
          row.receiptUsd = ((row.usage?.costMicros ?? 0) / 1e6) * (c.costMultiplier ?? 1);
          const complete =
            completed &&
            row.usage &&
            row.usage.inputTokens + row.usage.outputTokens + row.usage.thoughtTokens > 0;
          row.budgetCharge = complete ? row.receiptUsd : ceiling;
          row.costStatus = complete ? 'receipt' : 'reserved';
          if (complete && row.usage!.inputTokens > 0) measuredInputs.set(key, row.usage!);
          charged += row.budgetCharge;
        }
        row.totalMs = performance.now() - start;
        rows.push(row);
        await options.record(rows);
      }
    }
  }
  return rows;
}
