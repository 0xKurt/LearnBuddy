import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerImportProblems } from './provider-imports.mjs';

test('SDK imports cannot escape adapter folders, including type imports and dynamic subpaths', () => {
  for (const source of [
    'import OpenAI from "openai";',
    'import type { GoogleGenAI } from "@google/genai";',
    'export { OpenAI } from "openai";',
    'const sdk = await import("openai/resources/chat/completions");',
    'const sdk = require("@google/genai");',
    'import SDK = require("openai");',
    'type SDK = import("openai").OpenAI;',
  ])
    assert.equal(providerImportProblems('apps/api/src/modules/buddy/bad.ts', source).length, 1);
});
test('adapters and the two existing evaluation imports are explicit exceptions', () => {
  for (const path of [
    'apps/api/src/llm/openai.ts',
    'apps/api/src/speech/openai.ts',
    'apps/api/src/embeddings/openai.ts',
  ])
    assert.deepEqual(providerImportProblems(path, 'import SDK from "openai";'), []);
  assert.deepEqual(
    providerImportProblems(
      'apps/api/evals/schema/inventory.ts',
      'import SDK from "@google/genai";',
    ),
    [],
  );
  assert.deepEqual(
    providerImportProblems(
      'apps/api/evals/requests/measure.ts',
      'await import("@google/genai/tokenizer/node");',
    ),
    [],
  );
  assert.equal(
    providerImportProblems('apps/api/evals/new.ts', 'import SDK from "openai";').length,
    1,
  );
  assert.equal(
    providerImportProblems('apps/api/evals/schema/inventory.ts', 'import SDK from "openai";')
      .length,
    1,
  );
});
test('comments, string examples and neutral adapter imports are not SDK dependencies', () => {
  assert.deepEqual(
    providerImportProblems(
      'apps/api/src/production.ts',
      `
    // import SDK from 'openai';
    const example = "import SDK from 'openai'";
    import { OpenAIGateway } from './llm/openai.js';
  `,
    ),
    [],
  );
});
