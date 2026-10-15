// The gateway profile (issue #646): what a gateway accepts is said by the gateway, and every
// schema we send stays inside what the production gateway (Vertex) serves — keyword by keyword,
// without a model call.

import { describe, expect, it } from 'vitest';

import { variants } from '../../../evals/schema/inventory.js';
import type { LlmRequest } from '../gateway.js';
import {
  mediaKindOf,
  schemaKeywordsOf,
  unsupportedMedia,
  type GatewayProfile,
} from '../profile.js';
import { MAX_SCHEMA_PROPERTIES } from '../schemaBudget.js';
import { VERTEX_PROFILE } from '../vertex.js';

const request = (parts: LlmRequest['contents'][number]['parts']): LlmRequest => ({
  purpose: 'transcribe',
  tier: 'fast',
  promptVersion: 'test',
  system: '',
  contents: [{ role: 'user', parts }],
  schema: {},
  maxOutputTokens: 10,
  temperature: 0,
  timeoutMs: 1000,
  thinking: 'off',
});

const deaf: GatewayProfile = {
  ...VERTEX_PROFILE,
  name: 'deaf',
  media: new Set(['image', 'pdf']),
};

describe('gateway profiles (#646)', () => {
  it('every schema we send uses only keywords Vertex serves', () => {
    const used = new Set<string>();
    for (const v of variants()) for (const k of schemaKeywordsOf(v.schema!)) used.add(k);
    expect(
      [...used].filter((k) => !VERTEX_PROFILE.structuredOutput.keywords.has(k as never)),
    ).toEqual([]);
    // The ones the code leans on are really in use, so the list is no wish list.
    expect([...used].sort()).toEqual(expect.arrayContaining(['anyOf', 'description', 'enum']));
  });

  it('reads field names under `properties` as names, not keywords', () => {
    const schema = {
      type: 'object',
      properties: { anyOf: { type: 'string' }, $ref: { type: 'string' } },
    };
    expect([...schemaKeywordsOf(schema)].sort()).toEqual(['properties', 'type']);
  });

  it('knows each media part by its kind', () => {
    expect(mediaKindOf({ text: 'x' })).toBeNull();
    expect(mediaKindOf({ inlineData: { mimeType: 'image/png', data: '' } })).toBe('image');
    expect(mediaKindOf({ inlineData: { mimeType: 'application/pdf', data: '' } })).toBe('pdf');
    expect(mediaKindOf({ inlineData: { mimeType: 'audio/mp4', data: '' } })).toBe('audio');
  });

  it('names the media a gateway cannot read, each once', () => {
    const req = request([
      { text: 'hör zu' },
      { inlineData: { mimeType: 'audio/webm', data: '' } },
      { inlineData: { mimeType: 'audio/mp4', data: '' } },
      { inlineData: { mimeType: 'image/jpeg', data: '' } },
    ]);
    expect(unsupportedMedia(deaf, req)).toEqual(['audio']);
    expect(unsupportedMedia(VERTEX_PROFILE, req)).toEqual([]);
  });

  it('carries the Vertex schema bound measured in #627', () => {
    expect(VERTEX_PROFILE.structuredOutput.maxSchemaProperties).toBe(MAX_SCHEMA_PROPERTIES);
  });
});
