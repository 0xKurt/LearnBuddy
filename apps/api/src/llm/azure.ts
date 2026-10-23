import OpenAI, { AzureOpenAI } from 'openai';
import type { Config } from '../config.js';
import { CHAT_PROFILE, ChatGateway } from './chat.js';

/** Legacy provider configuration; the direct gateway shares the entire protocol implementation. */
export class AzureOpenAIGateway extends ChatGateway {
  constructor(config: Config, fetch?: typeof globalThis.fetch) {
    const endpoint = config.AZURE_OPENAI_ENDPOINT;
    if (!endpoint || !config.AZURE_OPENAI_KEY || !config.AZURE_OPENAI_PRICES)
      throw new Error('Azure configuration is incomplete');
    const baseURL = `${endpoint.replace(/\/$/, '')}/openai`;
    const options = {
      apiKey: config.AZURE_OPENAI_KEY,
      fetch,
      maxRetries: 0,
      organization: null,
      project: null,
      fetchOptions: { redirect: 'error' as const },
    };
    super({
      client:
        config.AZURE_OPENAI_API_VERSION === 'v1'
          ? new OpenAI({ ...options, baseURL: `${baseURL}/v1` })
          : new AzureOpenAI({ ...options, baseURL, apiVersion: config.AZURE_OPENAI_API_VERSION }),
      profile: { ...CHAT_PROFILE, name: 'azure' },
      prices: config.AZURE_OPENAI_PRICES,
      model: { smart: config.AZURE_OPENAI_MODEL, fast: config.AZURE_OPENAI_MODEL_FAST },
      deployment: {
        smart: config.AZURE_OPENAI_DEPLOYMENT!,
        fast: config.AZURE_OPENAI_DEPLOYMENT_FAST!,
      },
      maxImages: 10,
      depth: 5,
      repairDeepJson: false,
      inMemoryCache: false,
    });
  }
}
