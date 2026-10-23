// requires live verification in Claude Code session (HTTP is faked; Postgres is real).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config.js';
import { OpenAIGateway } from '../llm/openai.js';
import { AzureOpenAIGateway } from '../llm/azure.js';
import { callModel } from '../llm/call.js';
import type { LlmRequest } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv, type Learner } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const req: LlmRequest = {
  purpose: 'tutor',
  tier: 'smart',
  promptVersion: 'azure-test',
  system: 'SYSTEM',
  contents: [{ role: 'user', parts: [{ text: 'PRIVATE_INPUT' }] }],
  schema: {
    type: 'object',
    properties: { reply: { type: 'string' } },
    required: ['reply'],
    additionalProperties: false,
  },
  maxOutputTokens: 100,
  temperature: 0.3,
  timeoutMs: 200,
  thinking: 'low',
};
const usage = {
  prompt_tokens: 1000,
  completion_tokens: 100,
  total_tokens: 1100,
  prompt_tokens_details: { cached_tokens: 600 },
  completion_tokens_details: { reasoning_tokens: 30 },
};

describe.skipIf(!dbReady).each(['azure', 'openai'] as const)(
  '%s accounting through callModel',
  (provider) => {
    const cost = provider === 'azure' ? 2800 : 1320;
    let env: TestEnv;
    let learner: Learner;
    beforeEach(async () => {
      env = await createTestEnv();
      learner = await onboard(env);
    });
    afterEach(() => env.closeChecked());

    function gateway(reason: string) {
      const config = loadConfig({
        DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
        SUPABASE_URL: 'http://unused.local',
        SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
        ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
        LLM_BACKEND: provider,
        OPENAI_API_KEY: 'not-real',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_KEY: 'not-real',
        AZURE_OPENAI_DEPLOYMENT: 'buddy',
        AZURE_OPENAI_DEPLOYMENT_FAST: 'small',
        AZURE_OPENAI_REGION: 'swedencentral',
        AZURE_OPENAI_DEPLOYMENT_TYPE: 'DataZoneStandard',
        // Fictional rates exercise arithmetic; these are not Azure price claims.
        AZURE_OPENAI_PRICES: JSON.stringify({
          source: 'https://example.test/test-rates',
          readOn: '2026-10-23',
          models: {
            'gpt-5.4': { inputPerM: 2, outputPerM: 8 },
            'gpt-5.4-mini': { inputPerM: 0.5, outputPerM: 2 },
          },
        }),
      });
      const Gateway = provider === 'azure' ? AzureOpenAIGateway : OpenAIGateway;
      return new Gateway(
        config,
        vi.fn<typeof fetch>(async () =>
          Response.json({
            model: 'gpt-5.4-2026-03-05',
            usage,
            choices: [
              {
                index: 0,
                finish_reason: reason,
                message: { content: '{"reply":"PRIVATE_OUTPUT"}' },
              },
            ],
          }),
        ),
      );
    }

    it.each(['stop', 'content_filter'])(
      'records tokens and cost on %s, without prompt or response content',
      async (reason) => {
        const pending = callModel(
          { ...env.deps, llm: gateway(reason) },
          learner.learnerId,
          '2026-09-28',
          req,
        );
        if (reason === 'stop')
          await expect(pending).resolves.toMatchObject({ usage: { costMicros: cost } });
        else
          await expect(pending).rejects.toMatchObject({
            kind: 'blocked',
            usage: { costMicros: cost },
          });
        const row = await env.db.one<{
          input_tokens: number;
          output_tokens: number;
          thought_tokens: number;
          cached_tokens: number;
          cost_micros: number;
          model: string;
          outcome: string;
          error_code: string | null;
        }>('select * from llm_calls where learner_id = $1 and purpose = $2', [
          learner.learnerId,
          'tutor',
        ]);
        expect(row).toMatchObject({
          input_tokens: 1000,
          output_tokens: 70,
          thought_tokens: 30,
          cached_tokens: 600,
          cost_micros: cost,
          model: 'gpt-5.4-2026-03-05',
          outcome: reason === 'stop' ? 'ok' : 'error',
          error_code: reason === 'stop' ? null : 'blocked:content_filter',
        });
        expect(JSON.stringify(row)).not.toContain('PRIVATE_');
        const daily = await env.db.one<{ calls: number; cost_micros: number }>(
          'select calls, cost_micros from usage_daily where learner_id = $1 and kind = $2',
          [learner.learnerId, 'tutor'],
        );
        expect(daily.calls).toBe(reason === 'stop' ? 1 : 0);
        if (reason === 'stop') expect(daily.cost_micros).toBe(cost);
      },
    );
  },
);
