// One EU-only client for chat, speech, audio and retrieval; no environment-derived SDK endpoint.
import OpenAI from 'openai';
import { OpenAIBaseUrl } from './openai-config.js';

type OpenAIConfig = { OPENAI_API_KEY?: string; OPENAI_BASE_URL: string };
const clients = new WeakMap<OpenAIConfig, OpenAI>();
export function openAIClient(config: OpenAIConfig, fetch?: typeof globalThis.fetch): OpenAI {
  if (!OpenAIBaseUrl.safeParse(config.OPENAI_BASE_URL).success)
    throw new Error('OPENAI_BASE_URL must be the EU endpoint');
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
  const cached = clients.get(config);
  if (cached && !fetch) return cached;
  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    organization: null,
    project: null,
    maxRetries: 0,
    fetchOptions: { redirect: 'error' },
    ...(fetch ? { fetch } : {}),
  });
  if (!fetch) clients.set(config, client);
  return client;
}
