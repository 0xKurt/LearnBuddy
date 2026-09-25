// Checks the configured model with one small structured call — the same path
// Buddy uses (JSON schema, timeout, token caps). Reads apps/api/.env.local.
//   cd apps/api && npx tsx scripts/probe-model.ts

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { loadConfig } from '../src/config.js';
import { LlmError } from '../src/llm/gateway.js';
import { toJsonSchema } from '../src/llm/json-schema.js';
import { VertexGateway } from '../src/llm/vertex.js';

loadDotenv({ path: '.env.local' });
const config = loadConfig();
if (config.LLM_BACKEND !== 'vertex') {
  console.error('LLM_BACKEND is not "vertex" — nothing to probe.');
  process.exit(1);
}

const Answer = z.object({ ok: z.boolean(), word: z.string() });
const gateway = new VertexGateway(config);
try {
  const res = await gateway.generate({
    purpose: 'buddy_turn',
    tier: 'smart',
    promptVersion: 'probe',
    system: 'Answer with the JSON object described by the schema.',
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Set ok to true and word to the German word for "hello".' }],
      },
    ],
    schema: toJsonSchema(Answer),
    maxOutputTokens: 256,
    temperature: 0,
    timeoutMs: 20_000,
    thinkingBudget: 0,
  });
  const parsed = Answer.safeParse(res.json);
  console.info({ ok: parsed.success && parsed.data.ok, answer: res.json, usage: res.usage });
} catch (err) {
  console.error(err instanceof LlmError ? `LlmError ${err.kind}: ${err.message}` : err);
  process.exit(1);
}
