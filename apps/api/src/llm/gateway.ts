// The single seam to the language model. docs/architecture.md §Model calls.
//
// Feature code asks for a structured JSON answer that matches a schema and
// validates it again with zod; free text is never parsed for decisions.
// Implementations: VertexGateway (production), DisabledGateway (no model
// configured — callers degrade honestly), ScriptedGateway (tests only).

import type { Outcome } from '../lib/outcome.js';

export type JsonSchema = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type LlmPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: 'image/jpeg' | 'image/png' | 'application/pdf' | AudioMime;
        data: string;
      };
    };

/** Recordings the model listens to directly (speak questions). */
export type AudioMime =
  | 'audio/mp4'
  | 'audio/aac'
  | 'audio/m4a'
  | 'audio/webm'
  | 'audio/wav'
  | 'audio/mpeg';

export type LlmMessage = { role: 'user' | 'model'; parts: LlmPart[] };

export type LlmPurpose =
  | 'buddy_turn'
  | 'buddy_check'
  | 'tutor'
  | 'explain'
  | 'extraction'
  | 'pronounce'
  | 'transcribe'
  | 'hints';

export type LlmRequest = {
  purpose: LlmPurpose;
  /** 'smart' for everything today; 'fast' is the cheaper model for low-stakes tasks. */
  tier: 'smart' | 'fast';
  promptVersion: string;
  system: string;
  contents: LlmMessage[];
  schema: JsonSchema;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  /** Tokens the model may spend thinking (0 = off where the model allows). */
  thinkingBudget?: number;
  /**
   * Streaming: called with the JSON written so far, as it arrives. Only for showing
   * progress — decisions are still made on the whole, validated result.
   */
  onPartial?: (rawSoFar: string) => void;
};

export type LlmUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  costMicros: number;
  latencyMs: number;
};

export type LlmResult = { json: unknown; usage: LlmUsage };

export type LlmErrorKind =
  | 'unavailable' // not configured / provider down (5xx, network)
  | 'timeout'
  | 'rate_limited'
  | 'blocked' // the provider's safety filter held the answer back, or no candidate
  | 'refused' // the provider rejected the request itself (4xx other than 429)
  | 'invalid_output'; // not JSON / truncated

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly usage: LlmUsage | null;
  /** The provider's finish reason when it stopped the answer (e.g. SAFETY), for the audit. */
  readonly finishReason: string | null;
  constructor(
    kind: LlmErrorKind,
    message: string,
    usage: LlmUsage | null = null,
    finishReason: string | null = null,
  ) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.usage = usage;
    this.finishReason = finishReason;
  }
  /** The shared classification of external results (lib/outcome.ts). */
  get outcome(): Exclude<Outcome, 'ok'> {
    switch (this.kind) {
      case 'unavailable':
      case 'rate_limited':
        return 'transient';
      case 'timeout':
        return 'unknown';
      case 'blocked':
      case 'refused':
      case 'invalid_output':
        return 'refused';
    }
  }
  /**
   * A model call changes nothing outside, so transient and unknown outcomes may be retried
   * later; a refusal (a block, a rejected request, unusable output) gives the same answer again.
   */
  get retryable(): boolean {
    return this.outcome !== 'refused';
  }
}

export interface LlmGateway {
  readonly available: boolean;
  generate(req: LlmRequest): Promise<LlmResult>;
}

export class DisabledGateway implements LlmGateway {
  readonly available = false;
  async generate(): Promise<LlmResult> {
    throw new LlmError('unavailable', 'No language model is configured (LLM_BACKEND=disabled)');
  }
}
