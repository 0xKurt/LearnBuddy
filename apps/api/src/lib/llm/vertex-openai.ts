// Vertex AI OpenAI-compatible client for partner models (DeepSeek,
// Llama, Mistral, etc.). Partner MaaS models on Vertex don't speak the
// Gemini-native protocol — they use a Chat-Completions endpoint that
// mirrors OpenAI's:
//
//   POST https://{region}-aiplatform.googleapis.com/v1/projects/{project}/
//        locations/{region}/endpoints/openapi/chat/completions
//
// Auth: regular GCP ADC (same credentials as Gemini), exchanged for a
// short-lived OAuth access token via google-auth-library. The
// `cloud-platform` scope covers Vertex calls.
//
// We use this for:
//   - Tutor (agentTurn) when TUTOR_MODEL_ID starts with `deepseek-ai/`
//   - Regenerate (text → items) when ITEMS_MODEL_ID starts with `deepseek-ai/`
//
// Vision and STT/TTS stay on the Gemini-native path — DeepSeek MaaS
// has no vision endpoint and Chirp/Speech are Google-only anyway.

import { GoogleAuth } from 'google-auth-library';

import { ApiError } from '../errors.js';

let cachedAuth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!cachedAuth) {
    cachedAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return cachedAuth;
}

async function getAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const tok = await client.getAccessToken();
  if (!tok.token) {
    throw new ApiError('evaluation_failed', 'GCP ADC returned no access token');
  }
  return tok.token;
}

export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenAIChatRequest = {
  /** Partner model id, e.g. `deepseek-ai/deepseek-v3.2-maas`. */
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  stream?: false;
};

export type OpenAIChatResponse = {
  choices: Array<{
    message: { role: 'assistant'; content: string | null };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    /** DeepSeek-specific: cache hit on prefix tokens. */
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
};

/** Call the Vertex OpenAI-compatible chat-completions endpoint. Throws
 *  ApiError('evaluation_failed') on non-2xx so the route's outer SSE
 *  catch sends a proper error frame. */
export async function vertexOpenAIChat(args: {
  project: string;
  location: string;
  body: OpenAIChatRequest;
}): Promise<OpenAIChatResponse> {
  // The global endpoint has a different host (no `{region}-` prefix).
  // Used for partner models that aren't regional (e.g. DeepSeek V3.2
  // on Vertex is only available via the global endpoint as of 2026-05).
  const host =
    args.location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${args.location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${args.project}/locations/${args.location}/endpoints/openapi/chat/completions`;
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args.body),
    });
  } catch (err) {
    throw new ApiError(
      'evaluation_failed',
      `Vertex OpenAI-compat fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(
      'evaluation_failed',
      `Vertex OpenAI-compat ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return (await res.json()) as OpenAIChatResponse;
}

/** True when the model id refers to a partner MaaS model that uses the
 *  OpenAI-compatible endpoint instead of the Gemini-native protocol. */
export function isOpenAICompatModel(modelId: string): boolean {
  // Vertex partner publishers: deepseek-ai, meta, mistralai, etc.
  // We only ship DeepSeek today; add more prefixes here when needed.
  return modelId.startsWith('deepseek-ai/');
}
