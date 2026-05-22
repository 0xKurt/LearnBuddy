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

/** One delta event from the streaming endpoint. `content` is the chunk
 *  of text appended this tick (may be ''). `done` is true on the final
 *  `[DONE]` marker. `usage` may be present on the last delta when the
 *  provider includes it (DeepSeek does; OpenAI sometimes; we tolerate
 *  both). */
export type OpenAIChatStreamDelta = {
  content: string;
  done: boolean;
  finish_reason?: string;
  usage?: OpenAIChatResponse['usage'];
};

/** Stream the Vertex OpenAI-compatible chat-completions endpoint as an
 *  async iterable. Each yielded value is one parsed `data:` SSE line,
 *  decomposed into a `content` delta + an end flag. Lets the caller
 *  emit text incrementally and start downstream work (sentence-level
 *  TTS, on-screen typing) without waiting for the full reply.
 *
 *  Auth + URL shape match `vertexOpenAIChat`. We append `stream: true`
 *  to the body; everything else is identical. */
export async function* streamVertexOpenAIChat(args: {
  project: string;
  location: string;
  body: OpenAIChatRequest;
}): AsyncGenerator<OpenAIChatStreamDelta, void, undefined> {
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
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...args.body, stream: true }),
    });
  } catch (err) {
    throw new ApiError(
      'evaluation_failed',
      `Vertex OpenAI-compat stream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok || !res.body) {
    const text = res.body ? await res.text().catch(() => '') : '';
    throw new ApiError(
      'evaluation_failed',
      `Vertex OpenAI-compat stream ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastUsage: OpenAIChatResponse['usage'] | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by \n\n. Split, keep the trailing
      // partial in the buffer for the next read.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') {
            yield { content: '', done: true, usage: lastUsage };
            return;
          }
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{
                delta?: { content?: string | null };
                finish_reason?: string | null;
              }>;
              usage?: OpenAIChatResponse['usage'];
            };
            if (json.usage) lastUsage = json.usage;
            const ch = json.choices?.[0];
            const content = ch?.delta?.content ?? '';
            const finish = ch?.finish_reason ?? undefined;
            if (content || finish) {
              yield { content, done: false, finish_reason: finish ?? undefined };
            }
          } catch {
            // tolerate malformed frames — DeepSeek occasionally emits
            // a keep-alive comment we can ignore
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  // If we exit the loop without [DONE], still signal completion so
  // the caller can finalise.
  yield { content: '', done: true, usage: lastUsage };
}
