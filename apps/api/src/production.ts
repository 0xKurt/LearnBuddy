// Production wiring of the dependencies (Node server and Vercel function).

import { SupabaseAuthVerifier } from './auth/verifier.js';
import { bootWarnings, type Config } from './config.js';
import type { Deps } from './deps.js';
import { createDb, type PgDb } from './lib/db.js';
import { OpenAIGateway } from './llm/openai.js';
import { DisabledEmbeddings } from './llm/embeddings.js';
import { DisabledGateway, type LlmGateway } from './llm/gateway.js';
import { VertexEmbeddings } from './llm/vertex-embeddings.js';
import { VertexGateway } from './llm/vertex.js';
import { DisabledPush, ExpoPush } from './push/transport.js';
import { DisabledSpeech } from './speech/gateway.js';
import { GoogleSpeech } from './speech/google.js';
import { OpenAISpeech } from './speech/openai.js';
import { OpenAIAudioGateway } from './speech/audio.js';
import { openAIClient } from './llm/openai-client.js';
import { OpenAIEmbeddings } from './embeddings/openai.js';
import { SupabaseStorage } from './storage/gateway.js';

/**
 * The model the app talks to, whichever provider `LLM_BACKEND` names: production and the live
 * evals take it from here, so a change of provider is made in one place.
 */
export function llmGateway(config: Config): LlmGateway {
  const gateway =
    config.LLM_BACKEND === 'openai'
      ? new OpenAIGateway(config)
      : config.LLM_BACKEND === 'vertex'
        ? new VertexGateway(config)
        : new DisabledGateway();
  return config.AUDIO_BACKEND === 'openai'
    ? new OpenAIAudioGateway(openAIClient(config), gateway, config)
    : gateway;
}

/** Production and evaluation use the same configured search and speech providers. */
export function embeddingGateway(config: Config): Deps['embeddings'] {
  return config.EMBEDDING_BACKEND === 'openai'
    ? new OpenAIEmbeddings(openAIClient(config))
    : config.EMBEDDING_BACKEND === 'vertex' && config.GOOGLE_CLOUD_PROJECT
      ? new VertexEmbeddings(config)
      : new DisabledEmbeddings();
}

export function speechGateway(config: Config): Deps['speech'] {
  return config.SPEECH_BACKEND === 'openai'
    ? new OpenAISpeech(openAIClient(config), config.OPENAI_TTS_VOICES, config.OPENAI_MODEL_SPEECH)
    : config.SPEECH_BACKEND === 'google'
      ? new GoogleSpeech(config)
      : new DisabledSpeech();
}

export function productionDeps(
  config: Config,
  background: Deps['background'],
  /** Hands the database pool to the host's lifecycle (Vercel: `attachDatabasePool`, #671). */
  attachPool?: (pool: PgDb['pool']) => void,
): Deps {
  for (const warning of bootWarnings(config)) console.warn(`[api] config warning: ${warning}`);
  const db = createDb(config.DATABASE_URL, { ca: config.DATABASE_CA_CERT });
  attachPool?.(db.pool);
  return {
    config,
    db,
    now: () => new Date(),
    auth: new SupabaseAuthVerifier(config),
    storage: new SupabaseStorage(config),
    llm: llmGateway(config),
    embeddings: embeddingGateway(config),
    push:
      config.PUSH_BACKEND === 'expo' ? new ExpoPush(config.EXPO_ACCESS_TOKEN) : new DisabledPush(),
    speech: speechGateway(config),
    background,
  };
}

/** Background work must never crash the process; failures stay visible in the logs and the jobs table. */
export function logBackgroundFailure(err: unknown): void {
  console.error(
    '[api] background task failed',
    err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : 'unknown',
  );
}
