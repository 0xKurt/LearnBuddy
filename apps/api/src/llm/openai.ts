import OpenAI from 'openai';
import type { Config } from '../config.js';
import { ChatGateway } from './chat.js';
import { OPENAI_EU_PRICES } from './openai-config.js';

import type { GatewayProfile } from './profile.js';

export const OPENAI_PROFILE: GatewayProfile = {
  name: 'openai',
  media: new Set(['image', 'pdf']),
  acceptedMimeTypes: new Set(['image/jpeg', 'image/png', 'application/pdf']),
  maxInlineBytes: 20_000_000,
  maxImages: 20,
  cache: 'in_memory',
  repairJsonStrings: true,
  prices: OPENAI_EU_PRICES,
  structuredOutput: {
    keywords: new Set([
      'type',
      'description',
      'enum',
      'items',
      'anyOf',
      'properties',
      'additionalProperties',
      'required',
    ]),
    keepsPropertyOrder: true,
    streamsPartialJson: true,
    maxSchemaProperties: 5000,
    maxSchemaDepth: 10,
    maxEnumValues: 1000,
    maxSchemaStringChars: 120_000,
    largeEnumThreshold: 250,
    maxLargeEnumChars: 15_000,
  },
};

export class OpenAIGateway extends ChatGateway {
  constructor(config: Config, fetch?: typeof globalThis.fetch) {
    if (!config.OPENAI_API_KEY) throw new Error('Direct API configuration is incomplete');
    const model = { smart: config.OPENAI_MODEL_SMART, fast: config.OPENAI_MODEL_FAST };
    super({
      client: new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        baseURL: config.OPENAI_BASE_URL,
        organization: null,
        project: null,
        fetch,
        maxRetries: 0,
        fetchOptions: { redirect: 'error' },
      }),
      profile: OPENAI_PROFILE,
      model,
    });
  }
}
