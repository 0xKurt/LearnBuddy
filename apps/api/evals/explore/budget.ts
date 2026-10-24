// requires live verification in Claude Code session (eval tooling; measured pilot documented in docs/measurements)
import {
  LlmError,
  type LlmGateway,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from '../../src/llm/gateway.js';

/** One shared ceiling for Buddy, explorer, judge and replays. Unknown bills retain reservations. */
export class Budget {
  readonly started = performance.now();
  readonly receipts: Array<{ purpose: string; usage: LlmUsage | null; reservedUsd: number }> = [];
  private held = 0;
  private stopReason: string | null = null;
  private readonly controller = new AbortController();
  spent = 0;
  onChange?: () => void;
  get reservedUsd() {
    return this.held;
  }
  constructor(
    readonly maxUsd = 15,
    readonly maxMs = 40 * 60_000,
  ) {
    if (!(maxUsd > 0 && maxUsd <= 15 && maxMs > 0 && maxMs <= 60 * 60_000))
      throw new Error('Invalid pilot bounds');
  }
  stop(reason: string) {
    this.stopReason = reason;
    this.controller.abort();
  }
  check() {
    if (this.stopReason) throw new Error(this.stopReason);
    if (performance.now() - this.started >= this.maxMs) throw new Error('budget: wall-clock limit');
  }
  reserve(usd: number) {
    this.check();
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid reservation');
    if (this.spent + this.held + usd > this.maxUsd) throw new Error('budget: cost limit');
    this.held += usd;
    this.onChange?.();
    let settled = false;
    return (purpose: string, usage: LlmUsage | null) => {
      if (settled) throw new Error('budget reservation already settled');
      settled = true;
      this.held -= usd;
      this.spent += usage ? usage.costMicros / 1e6 : usd;
      this.receipts.push({ purpose, usage, reservedUsd: usage ? 0 : usd });
      this.onChange?.();
    };
  }
  wrap(inner: LlmGateway): LlmGateway {
    return {
      available: inner.available,
      profile: inner.profile,
      generate: async (req: LlmRequest): Promise<LlmResult> => {
        // Byte-count bounds tokens conservatively; extra 40k input tokens covers <=2 images.
        // Three attempts is the transport's maximum. Reject larger requests before sending.
        const bytes = Buffer.byteLength(JSON.stringify([req.system, req.schema, req.contents]));
        if (bytes > 1_000_000 || req.maxOutputTokens > 16_384)
          throw new Error('budget: request size');
        const textBytes = Buffer.byteLength(
          JSON.stringify([
            req.system,
            req.schema,
            req.contents.map((m) => m.parts.filter((p) => 'text' in p)),
          ]),
        );
        const images = req.contents.flatMap((m) => m.parts).filter((p) => 'inlineData' in p).length;
        if (images > 2) throw new Error('budget: media count');
        const ceiling =
          (3 * ((textBytes + 4000 + images * 40_000) * 0.825 + req.maxOutputTokens * 4.95)) / 1e6;
        const settle = this.reserve(ceiling);
        const signal = AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(
            Math.max(1, Math.min(req.timeoutMs, this.maxMs - (performance.now() - this.started))),
          ),
          ...(req.signal ? [req.signal] : []),
        ]);
        try {
          const result = await inner.generate({ ...req, signal });
          settle(req.purpose, result.usage);
          return result;
        } catch (error) {
          settle(req.purpose, error instanceof LlmError ? error.usage : null);
          throw error;
        }
      },
    };
  }
}
