// Vertex AI implementation of the embedding seam (gemini-embedding-001, EU region).
//
// Verified live 2026-09-29: the model serves europe-west4 and europe-west1 but not
// the EU multi-region "eu"; batches of 128 texts work in one request; every
// embedding carries statistics.tokenCount; 768d vectors come back unnormalised.

import { GoogleGenAI } from '@google/genai';

import type { Config } from '../config.js';
import {
  EMBED_DIMENSIONS,
  normalise,
  type EmbeddingGateway,
  type EmbedRequest,
  type EmbedResult,
} from './embeddings.js';
import { LlmError } from './gateway.js';
import { costMicros } from './pricing.js';
import { classify, ensureCredentialsFile, splitModelSpec } from './vertex.js';

/** Texts per request; far above what one material yields, far below the measured 128. */
const MAX_BATCH = 64;

export class VertexEmbeddings implements EmbeddingGateway {
  readonly available = true;
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: Config) {
    ensureCredentialsFile(config);
  }

  private clientFor(location: string): GoogleGenAI {
    this.client ??= new GoogleGenAI({
      vertexai: true,
      project: this.config.GOOGLE_CLOUD_PROJECT,
      location,
    });
    return this.client;
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const { location, model } = splitModelSpec(
      this.config.VERTEX_MODEL_EMBEDDING,
      this.config.GOOGLE_VERTEX_LOCATION,
    );
    const started = Date.now();
    const vectors: number[][] = [];
    let inputTokens = 0;
    for (let at = 0; at < req.texts.length; at += MAX_BATCH) {
      const batch = req.texts.slice(at, at + MAX_BATCH);
      let response;
      try {
        response = await this.clientFor(location).models.embedContent({
          model,
          contents: batch,
          config: { taskType: req.task, outputDimensionality: EMBED_DIMENSIONS },
        });
      } catch (err) {
        if (err instanceof LlmError) throw err;
        throw classify(err);
      }
      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== batch.length) {
        throw new LlmError(
          'invalid_output',
          `expected ${batch.length} embeddings, got ${embeddings.length}`,
        );
      }
      for (const [i, e] of embeddings.entries()) {
        const values = e.values ?? [];
        if (values.length !== EMBED_DIMENSIONS) {
          throw new LlmError('invalid_output', `embedding has ${values.length} dimensions`);
        }
        vectors.push(normalise(values));
        // Provider-reported tokens; when a provider version stops reporting them, a
        // conservative estimate (≈ 1 token per 3 characters of German) keeps the cost
        // record a ceiling, never an undercount (rule 5).
        inputTokens += e.statistics?.tokenCount ?? Math.ceil((batch[i]?.length ?? 0) / 3);
      }
    }
    return {
      vectors,
      usage: {
        model,
        inputTokens,
        costMicros: costMicros(model, inputTokens, 0, 0),
        latencyMs: Date.now() - started,
      },
    };
  }
}
