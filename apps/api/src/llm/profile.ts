// What a gateway can do, said in the gateway's own words (issue #646, KI-Audit F1 (2)). The call
// sites ask in neutral terms — a thinking level, media parts, a JSON schema — and every gateway
// says here what it accepts and how it translates it, so a second provider is plugged in by
// writing its gateway and its profile, never by touching a call site. docs/architecture.md §Model
// calls.
//
// Prices are the gateway's too: it reports each call's cost in `LlmUsage.costMicros` from its own
// table (`pricing.ts`).

import type { PriceTable } from './pricing.js';
import { LlmError, TOO_LARGE, type LlmPart, type LlmRequest } from './gateway.js';

/**
 * How much the model may think before it answers, in the call site's terms. Each gateway maps it
 * onto what its provider offers (a level, a token budget, a model, or nothing at all).
 */
export type Thinking = 'off' | 'minimal' | 'low' | 'medium' | 'high';

/** What a media part is, as far as a model's abilities go. */
export type MediaKind = 'image' | 'pdf' | 'audio';

/**
 * Every JSON Schema keyword the response schemas we send use (`json-schema.ts` emits only these).
 * A gateway lists the ones its provider serves; `__tests__/profile.test.ts` holds every schema we
 * send to the keywords of the gateway in production.
 */
type SchemaKeyword =
  | 'type'
  | 'description'
  | 'enum'
  | 'items'
  | 'anyOf'
  | 'properties'
  | 'additionalProperties'
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'minItems'
  | 'maxItems';

export type GatewayProfile = {
  /** For logs and errors: which provider and endpoint. */
  name: string;
  /** The media a request may carry; a part of another kind is refused before it is sent. */
  media: ReadonlySet<MediaKind>;
  /**
   * The most bytes of media one request may carry inline, as sent (base64): past it the provider
   * answers with an error for certain, so the request is refused before it is sent (#688).
   */
  maxInlineBytes: number;
  acceptedMimeTypes: ReadonlySet<string>;
  maxImages: number;
  cache: 'none' | 'implicit' | 'in_memory';
  /** Escape normalization only; never an extra generation/repair request. */
  repairJsonStrings: boolean;
  prices: PriceTable;
  structuredOutput: {
    keywords: ReadonlySet<SchemaKeyword>;
    /**
     * Whether the model writes the properties in the order the schema declares them. The stream
     * reads a reply before the actions behind it (`buddy/stream.ts`) because of it.
     */
    keepsPropertyOrder: boolean;
    /**
     * Whether the JSON arrives piece by piece while it is written. Without it nothing is spoken
     * early (`partial.ts`, `buddy/stream.ts`): the whole answer comes at once, and is still right.
     */
    streamsPartialJson: boolean;
    /** The most properties over every object of a schema the provider serves (`schemaBudget.ts`). */
    maxSchemaProperties: number;
    /** Prefer form selection above this size, even when the provider accepts a larger schema. */
    preferredSchemaProperties?: number;
    maxSchemaDepth: number;
    maxEnumValues: number;
    maxSchemaStringChars: number;
    largeEnumThreshold: number;
    maxLargeEnumChars: number;
  };
};

export function mediaKindOf(part: LlmPart): MediaKind | null {
  if (!('inlineData' in part)) return null;
  const mime = part.inlineData.mimeType;
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  return 'audio';
}

/** The media kinds `req` carries that `profile` does not accept, each once. */
export function unsupportedMedia(profile: GatewayProfile, req: LlmRequest): MediaKind[] {
  const kinds = new Set<MediaKind>();
  for (const m of req.contents)
    for (const p of m.parts) {
      const kind = mediaKindOf(p);
      if (
        kind !== null &&
        (!profile.media.has(kind) ||
          ('inlineData' in p && !profile.acceptedMimeTypes.has(p.inlineData.mimeType)))
      )
        kinds.add(kind);
    }
  return [...kinds];
}

/** The bytes of media `req` carries inline, as sent (the base64 text of every media part). */
export function inlineBytesOf(req: LlmRequest): number {
  let bytes = 0;
  for (const m of req.contents)
    for (const p of m.parts) if ('inlineData' in p) bytes += p.inlineData.data.length;
  return bytes;
}

/** Every keyword a schema uses, over all its nodes. */
export function schemaKeywordsOf(schema: object): Set<string> {
  const used = new Set<string>();
  const walk = (node: unknown, asProperties = false): void => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n));
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      // The names under `properties` are field names, not keywords.
      if (!asProperties) used.add(key);
      walk(value, !asProperties && key === 'properties');
    }
  };
  walk(schema);
  return used;
}

/** Shared preflight: every adapter rejects unsupported media before transport/consumption. */
export function assertMedia(profile: GatewayProfile, req: LlmRequest): void {
  const refused = unsupportedMedia(profile, req);
  if (refused.length)
    throw new LlmError('refused', `${profile.name} does not read ${refused.join(', ')}`);
  if (
    inlineBytesOf(req) > profile.maxInlineBytes ||
    req.contents.flatMap((m) => m.parts).filter((p) => mediaKindOf(p) === 'image').length >
      profile.maxImages
  )
    throw new LlmError('refused', 'inline input limit exceeded', null, TOO_LARGE);
}
