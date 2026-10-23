// requires live verification in Claude Code session
import {
  EMBED_DIMENSIONS,
  normalise,
  type EmbeddingGateway,
  type EmbedRequest,
  type EmbedResult,
} from '../llm/embeddings.js';
import { type LlmError } from '../llm/gateway.js';
import { fakeDeadline } from './fake-deadline.js';
/**
 * Embeddings in tests: deterministic, no semantics. Unregistered texts get a
 * hash-derived unit vector (distinct texts land nearly orthogonal); a test that
 * needs "these texts mean the same" registers them under one cluster with
 * `meaning` — the fake then returns that cluster's basis direction, so vector
 * search ranks them together. Semantic quality itself is measured only against
 * the live model (apps/api/evals/lookup), never faked (CLAUDE.md rule 3).
 */
export class FakeEmbeddings implements EmbeddingGateway {
  available = true;
  readonly model = 'fake-embedding';
  readonly dimensions = EMBED_DIMENSIONS;
  readonly microsPerInputToken = 1;
  /** Hold the scripted provider until its caller cancels or its deadline expires. */
  waitForAbort = false;
  readonly calls: EmbedRequest[] = [];
  private readonly clusters: Array<{ cluster: number; needle: string }> = [];
  private failures: LlmError[] = [];

  /** Texts containing `needle` (case-insensitive) embed near cluster `cluster` (0–49). */
  meaning(cluster: number, ...needles: string[]): this {
    for (const needle of needles) this.clusters.push({ cluster, needle: needle.toLowerCase() });
    return this;
  }

  failNext(...errors: LlmError[]): this {
    this.failures.push(...errors);
    return this;
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    await fakeDeadline(
      this.waitForAbort ? new Promise<void>(() => {}) : Promise.resolve(),
      req.timeoutMs ?? 20_000,
      req.signal,
    );
    this.calls.push(req);
    const failure = this.failures.shift();
    if (failure) throw failure;
    return {
      vectors: req.texts.map((t) => this.vectorOf(t)),
      usage: {
        model: this.model,
        inputTokens: req.texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
        costMicros: 1,
        latencyMs: 1,
      },
    };
  }

  private vectorOf(text: string): number[] {
    const v = new Array<number>(EMBED_DIMENSIONS).fill(0);
    const lower = text.toLowerCase();
    let inCluster = false;
    for (const { cluster, needle } of this.clusters) {
      if (lower.includes(needle)) {
        v[cluster % 50] = (v[cluster % 50] ?? 0) + 1;
        inCluster = true;
      }
    }
    // A stable pseudo-random direction in the dimensions above the cluster space;
    // small next to a cluster hit, dominant without one.
    let h = 2166136261;
    for (let i = 0; i < lower.length; i++) {
      h = Math.imul(h ^ lower.charCodeAt(i), 16777619);
    }
    const scale = inCluster ? 0.05 : 1;
    for (let i = 50; i < EMBED_DIMENSIONS; i++) {
      h = Math.imul(h ^ i, 16777619);
      v[i] = scale * (((h >>> 0) % 2001) / 1000 - 1);
    }
    return normalise(v);
  }
}
