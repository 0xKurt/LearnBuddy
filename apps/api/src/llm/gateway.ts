// The single seam to the language model. docs/architecture.md §Model calls.
//
// Feature code asks for a structured JSON answer that matches a schema and
// validates it again with zod; free text is never parsed for decisions.
// Implementations: OpenAIGateway (default), VertexGateway (explicit opt-in), DisabledGateway (no model
// configured — callers degrade honestly), ScriptedGateway (tests only).

import type { AudioMime } from '@learnbuddy/shared-types/contracts';

import type { Outcome } from '../lib/outcome.js';
import type { GatewayProfile, Thinking } from './profile.js';

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

/**
 * A recording from the app as a part of the model's message (speak, spoken word, dictation). m4a
 * goes as mp4: the same container, under the name the model knows.
 */
export function recordingPart(recording: { mime: AudioMime; audio_base64: string }): LlmPart {
  const mimeType = recording.mime === 'audio/m4a' ? 'audio/mp4' : recording.mime;
  return { inlineData: { mimeType, data: recording.audio_base64 } };
}

export type LlmMessage = { role: 'user' | 'model'; parts: LlmPart[] };

export type LlmPurpose =
  | 'buddy_turn'
  | 'buddy_check'
  | 'tutor'
  /**
   * Does what she wrote tell of danger to herself (#747,
   * `buddy/distress.ts`), or in a chat or roleplay turn whose model call failed (#761)? Metered on its own (`DAILY_LIMITS.safeguard`), so ordinary practice
   * never uses up the reserve her words need.
   */
  | 'safeguard'
  | 'explain'
  | 'extraction'
  /** Boxes of the teaching figures on a photographed page (concept images, issue #50). */
  | 'figures'
  | 'pronounce'
  | 'transcribe'
  | 'hints'
  | 'reexplain'
  | 'summary'
  | 'consolidate'
  /**
   * The forms and figures an explain or extraction call needs, chosen before it (#627,
   * `practice/formChoice.ts`). Metered as part of that call (`callAhead`), not on its own.
   */
  | 'forms'
  /**
   * The scheduler's hourly check that the model answers at all (#650, `scheduler/canary.ts`): one
   * tiny call on no learner's behalf, so it reserves nothing and is recorded without a learner.
   */
  | 'canary';

export type LlmRequest = {
  purpose: LlmPurpose;
  /** 'smart' for general tasks; 'fast' for narrow decisions with their own passing evaluation. */
  tier: 'smart' | 'fast';
  promptVersion: string;
  system: string;
  contents: LlmMessage[];
  /** Known recording language, independent of question/target text; BCP-47 or ISO 639-1. */
  audioLanguage?: string;
  schema: JsonSchema;
  /** Original domain validator after structured decoding; never sent to the provider. */
  validateOutput?: (json: unknown) => boolean;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  /**
   * How much the model may think first (#646): the call site's choice in neutral terms, which
   * the gateway maps onto its provider (`profile.ts`). Thinking is billed as output and the first
   * byte waits for it.
   */
  thinking: Thinking;
  /**
   * Streaming: called with the JSON written so far, as it arrives. Only for showing
   * progress — decisions are still made on the whole, validated result.
   */
  onPartial?: (rawSoFar: string) => void;
  /**
   * What `llm_calls` notes about this call beyond its purpose (#652): the decision it is part
   * of, its round within that decision's turn, and which variant of its schema went out. Never
   * sent to the provider.
   */
  trace?: CallTrace;
  /**
   * Nobody waits for this answer any more (#684): the caller's stream dropped. The gateway stops
   * the request at once and ends with `LlmError('cancelled')`; a cancelled call is never retried.
   */
  signal?: AbortSignal;
};

type CallTrace = {
  /** The Buddy decision (`buddy_decisions.id`) this call is a round of. */
  decisionId?: string;
  /** The model round within the turn or check, 1 first (lookups and repairs add rounds). */
  round?: number;
  /** Which schema went out: `step`/`final` for Buddy, `whole`/`chosen`/`fallback` for a run. */
  schemaVariant?: string;
};

export type LlmUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  /**
   * The part of `inputTokens` the provider served from its prefix cache (issue #25).
   * Provider-reported, never computed here: 0 means "not reported", which is also what
   * a provider without caching gives — so it is a floor, never a claim (rule 5).
   */
  cachedTokens: number;
  costMicros: number;
  latencyMs: number;
};

export type LlmResult = {
  json: unknown;
  usage: LlmUsage;
  /** How many requests the gateway sent for this answer, retries included (absent: one). */
  attempts?: number;
};

export type LlmErrorKind =
  | 'unavailable' // not configured / provider down (5xx, network)
  | 'timeout'
  | 'rate_limited'
  | 'blocked' // the provider's safety filter held the answer back, or no candidate
  | 'refused' // the provider rejected the request itself (4xx other than 429)
  | 'invalid_output' // not JSON / truncated
  | 'cancelled'; // the caller stopped waiting (`LlmRequest.signal`, #684)

/** The finish reason of an answer cut off at the output token limit. */
export const TRUNCATED = 'MAX_TOKENS';
/** Ours, not a provider's: the request carried more inline than the gateway takes (#688). */
export const TOO_LARGE = 'INLINE_TOO_LARGE';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly usage: LlmUsage | null;
  /** The provider's finish reason when it stopped the answer (e.g. SAFETY), for the audit. */
  readonly finishReason: string | null;
  /** How many requests the gateway sent before it gave up, retries included (#652). */
  attempts = 1;
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
    // Cut off at the token limit: the same request can well finish the next time (a model
    // that ran into a loop), so it is worth another try (live finding 2).
    if (this.truncated) return 'transient';
    switch (this.kind) {
      case 'unavailable':
      case 'rate_limited':
        return 'transient';
      // A cancelled call was stopped by us mid-call: the provider may have done (and billed) part.
      case 'timeout':
      case 'cancelled':
        return 'unknown';
      case 'blocked':
      case 'refused':
      case 'invalid_output':
        return 'refused';
    }
  }
  /** Refused before it was sent: more media inline than the gateway takes (#688). */
  get tooLarge(): boolean {
    return this.kind === 'refused' && this.finishReason === TOO_LARGE;
  }
  /** The answer was cut off at the output token limit (finish reason MAX_TOKENS). */
  get truncated(): boolean {
    return this.kind === 'invalid_output' && this.finishReason === TRUNCATED;
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
  /** What this gateway accepts and how it is bounded (#646, `profile.ts`). */
  readonly profile: GatewayProfile;
  generate(req: LlmRequest): Promise<LlmResult>;
}

/** No model: no media, and no schema is narrowed for a call that cannot run anyway. */
const NO_MODEL: GatewayProfile = {
  name: 'disabled',
  media: new Set(),
  maxInlineBytes: 0,
  acceptedMimeTypes: new Set(),
  maxImages: 0,
  cache: 'none',
  repairJsonStrings: false,
  prices: { source: 'disabled', readOn: '', models: {} },
  structuredOutput: {
    keywords: new Set(),
    keepsPropertyOrder: false,
    streamsPartialJson: false,
    maxSchemaProperties: Number.POSITIVE_INFINITY,
    maxSchemaDepth: Number.POSITIVE_INFINITY,
    maxEnumValues: Number.POSITIVE_INFINITY,
    maxSchemaStringChars: Number.POSITIVE_INFINITY,
    largeEnumThreshold: Number.POSITIVE_INFINITY,
    maxLargeEnumChars: Number.POSITIVE_INFINITY,
  },
};

export class DisabledGateway implements LlmGateway {
  readonly available = false;
  readonly profile = NO_MODEL;
  async generate(): Promise<LlmResult> {
    throw new LlmError('unavailable', 'No language model is configured (LLM_BACKEND=disabled)');
  }
}
