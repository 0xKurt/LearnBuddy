// The single seam to the language model. docs/architecture.md §Model calls.
//
// Feature code asks for a structured JSON answer that matches a schema and
// validates it again with zod; free text is never parsed for decisions.
// Implementations: VertexGateway (production), DisabledGateway (no model
// configured — callers degrade honestly), ScriptedGateway (tests only).

export type JsonSchema = { [key: string]: JsonValue };
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type LlmPart =
  | { text: string }
  | { inlineData: { mimeType: 'image/jpeg' | 'image/png' | AudioMime; data: string } };

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
  | 'unavailable' // not configured / provider down
  | 'timeout'
  | 'rate_limited'
  | 'blocked' // safety filter or no candidate
  | 'invalid_output'; // not JSON / truncated

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly usage: LlmUsage | null;
  constructor(kind: LlmErrorKind, message: string, usage: LlmUsage | null = null) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.usage = usage;
  }
  /** Transient provider problems may be retried later; bad output may not. */
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'rate_limited' || this.kind === 'unavailable';
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
