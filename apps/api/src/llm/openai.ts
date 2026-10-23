import OpenAI from 'openai';
import type { Config } from '../config.js';
import { CHAT_PROFILE, ChatGateway } from './chat.js';
import { OPENAI_EU_PRICES } from './openai-config.js';

export const OPENAI_PROFILE = {
  ...CHAT_PROFILE,
  name: 'openai',
  // Application bounds: 20 MB base64 combined / 20 worksheet pages, below API limits.
  structuredOutput: { ...CHAT_PROFILE.structuredOutput, maxSchemaProperties: 5000 },
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
      prices: OPENAI_EU_PRICES,
      model,
      deployment: model,
      maxImages: 20,
      depth: 10,
      repairDeepJson: true,
      inMemoryCache: true,
    });
  }
}
