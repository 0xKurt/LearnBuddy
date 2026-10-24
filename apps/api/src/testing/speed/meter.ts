// Endpoint audit only: real dependencies, synthetic learners, no recorded text or credentials.
// requires live verification in Claude Code session
import { appendFileSync } from 'node:fs';
import type { Config } from '../../config.js';
import type { Db } from '../../lib/db.js';
import { LlmError, type LlmGateway, type LlmRequest, type LlmUsage } from '../../llm/gateway.js';
import { strictSchema } from '../../llm/chat-schema.js';
import { schemaProperties } from '../../llm/schemaBudget.js';
import { costMicros } from '../../llm/pricing.js';
import { llmGateway, embeddingGateway, speechGateway } from '../../production.js';
import type { TestEnv } from '../harness.js';

type Span = { kind: 'db' | 'model'; start: number; end: number };
type Call = {
  purpose: string;
  stage: string;
  round: number;
  attempts: number;
  start: number;
  end: number;
  first: number | null;
  systemChars: number;
  schemaChars: number;
  properties: number;
  textChars: number;
  thinking: string;
  usage: LlmUsage | null;
  error: string | null;
};

/** Partition wall time, counting overlapping waits only once (model wins over DB). */
export function partition(spans: Span[], start: number, end: number) {
  const clipped = spans
    .map((s) => ({ ...s, start: Math.max(start, s.start), end: Math.min(end, s.end) }))
    .filter((s) => s.end > s.start);
  const points = [...new Set([start, end, ...clipped.flatMap((s) => [s.start, s.end])])].sort(
    (a, b) => a - b,
  );
  const out = { db: 0, model: 0, other: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const active = clipped.filter((s) => s.start <= a && s.end >= b);
    const kind = active.some((s) => s.kind === 'model') ? 'model' : active.length ? 'db' : 'other';
    out[kind] += b - a;
  }
  return out;
}

export class AuditMeter {
  stage = '';
  round = 0;
  spans: Span[] = [];
  calls: Call[] = [];
  charged: number;
  private reserved = 0;
  constructor(
    readonly config: Config,
    readonly output: string,
    alreadySpent = 0,
  ) {
    this.charged = alreadySpent;
  }
  async timed<T>(kind: Span['kind'], fn: () => Promise<T>): Promise<T> {
    const span: Span = { kind, start: performance.now(), end: Infinity };
    this.spans.push(span);
    try {
      return await fn();
    } finally {
      span.end = performance.now();
    }
  }
  private reserve(ceiling: number): (receipt: number | null) => void {
    if (!Number.isFinite(ceiling) || ceiling <= 0 || this.charged + this.reserved + ceiling > 3)
      throw new Error('Audit budget reservation would exceed $3');
    this.reserved += ceiling;
    return (receipt) => {
      this.reserved -= ceiling;
      const charge = receipt ?? ceiling;
      this.charged += charge;
      appendFileSync(
        `${process.env.HOME}/.local/share/learnbuddy-agents/BUDGET-LEDGER.md`,
        `\n2026-10-24 | cx-speed | #928 | 1 gateway operation (may include retries) | ${charge.toFixed(6)} | endpoint audit; ${receipt === null ? 'missing receipt: full reservation' : 'receipt ceiling, no cache discount'}; cumulative $${this.charged.toFixed(6)}\n`,
      );
    };
  }
  gateway(): LlmGateway {
    const real = llmGateway(this.config);
    return {
      available: real.available,
      profile: real.profile,
      generate: (req) => this.generate(real, req),
    };
  }
  private async generate(real: LlmGateway, req: LlmRequest) {
    const hintThinking = process.env.SPEED_HINT_THINKING;
    if (req.purpose === 'hints' && hintThinking) {
      if (
        hintThinking !== 'high' &&
        hintThinking !== 'medium' &&
        hintThinking !== 'low' &&
        hintThinking !== 'off'
      )
        throw new Error('SPEED_HINT_THINKING must be high, medium, low or off');
      req = { ...req, thinking: hintThinking };
    }
    const schema = JSON.stringify(strictSchema(req.schema));
    const text = req.contents
      .flatMap((m) => m.parts.map((p) => ('text' in p ? p.text : '')))
      .join('\n');
    const media = req.contents.flatMap((m) => m.parts).filter((p) => 'inlineData' in p);
    const audio = req.purpose === 'transcribe' || req.purpose === 'pronounce';
    const input = Buffer.byteLength(req.system + schema + text) + 2000 + media.length * 20000;
    const model =
      (req.purpose === 'pronounce' ? undefined : this.config.OPENAI_ROUTES[req.purpose]) ??
      this.config.OPENAI_MODEL_SMART;
    const ceiling = audio
      ? 0.25
      : (3 *
          costMicros(real.profile.prices, model, {
            inputTokens: input,
            outputTokens: req.maxOutputTokens,
            thoughtTokens: 0,
            audioInputTokens: 0,
          })) /
        1e6;
    const settle = this.reserve(ceiling);
    const call: Call = {
      purpose: req.purpose,
      stage: this.stage,
      round: this.round,
      attempts: 0,
      start: performance.now(),
      end: 0,
      first: null,
      systemChars: req.system.length,
      schemaChars: schema.length,
      properties: schemaProperties(req.schema),
      textChars: text.length,
      thinking: req.thinking,
      usage: null,
      error: null,
    };
    this.calls.push(call);
    let receipt: number | null = null;
    try {
      const result = await this.timed('model', () =>
        real.generate({
          ...req,
          ...(req.onPartial
            ? {
                onPartial: (raw: string) => {
                  call.first ??= performance.now();
                  req.onPartial!(raw);
                },
              }
            : {}),
        }),
      );
      call.usage = result.usage;
      call.attempts = result.attempts ?? 1;
      receipt = result.usage.costMicros / 1e6;
      return result;
    } catch (e) {
      call.error = e instanceof LlmError ? `${e.kind}:${e.finishReason ?? ''}` : 'unexpected';
      call.attempts = e instanceof LlmError ? e.attempts : 0;
      call.usage = e instanceof LlmError ? e.usage : null;
      throw e;
    } finally {
      call.end = performance.now();
      settle(receipt);
      appendFileSync(this.output, JSON.stringify({ type: 'call', ...call }) + '\n');
    }
  }
  attach(env: TestEnv): void {
    const wrap = (db: Db): Db => ({
      query: (sql, values) => this.timed('db', () => db.query(sql, values)),
      one: (sql, values) => this.timed('db', () => db.one(sql, values)),
      maybeOne: (sql, values) => this.timed('db', () => db.maybeOne(sql, values)),
      tx: (fn) => db.tx((tx) => fn(wrap(tx))),
    });
    env.deps.db = wrap(env.db);
    const speech = speechGateway(this.config);
    env.deps.speech = {
      available: speech.available,
      microsPerCharacter: speech.microsPerCharacter,
      localeFor: (l) => speech.localeFor(l),
      voiceId: (v, l) => speech.voiceId(v, l),
      synthesize: async (input) => {
        // Realtime max_output_tokens=4096, highest audio output price <= $0.022/1k.
        const settle = this.reserve(0.15);
        let receipt: number | null = null;
        try {
          const r = await this.timed('model', () => speech.synthesize(input));
          receipt = r.costMicros === undefined ? null : r.costMicros / 1e6;
          return r;
        } finally {
          settle(receipt);
        }
      },
    };
    const embeddings = embeddingGateway(this.config);
    env.deps.embeddings = {
      available: embeddings.available,
      model: embeddings.model,
      dimensions: embeddings.dimensions,
      space: embeddings.space,
      microsPerInputToken: embeddings.microsPerInputToken,
      embed: async (req) => {
        const settle = this.reserve(0.005);
        let receipt: number | null = null;
        try {
          const r = await this.timed('model', () => embeddings.embed(req));
          receipt = r.usage.costMicros / 1e6;
          return r;
        } finally {
          settle(receipt);
        }
      },
    };
  }
}
