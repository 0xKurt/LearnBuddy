// requires live verification in Claude Code session (only provider HTTP is replaced).
import { vi, type Mock } from 'vitest';
import { loadConfig } from '../../config.js';
import { createTestEnv, onboard, type TestEnv, type Learner } from '../../testing/harness.js';
export const mediaConfig = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'disabled',
  GOOGLE_CLOUD_PROJECT: 'test',
  OPENAI_API_KEY: 'test',
});
export type MediaScenario = 'ok' | 'timeout' | 'rate_limited' | 'refused' | 'cancelled';
export function mediaHttp(
  scenario: MediaScenario,
  response: Response,
): Mock<typeof globalThis.fetch> & { Response: typeof Response } {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (scenario === 'timeout' || scenario === 'cancelled')
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
        else
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
      });
    if (scenario === 'rate_limited' || scenario === 'refused') {
      const status = scenario === 'rate_limited' ? 429 : 400;
      return Response.json(
        {
          error: {
            code: status,
            message: 'rejected',
            status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'INVALID_ARGUMENT',
          },
        },
        { status },
      );
    }
    return response.clone();
  });
  return Object.assign(fetch, { Response });
}
export async function withLearner(run: (env: TestEnv, learner: Learner) => Promise<void>) {
  const env = await createTestEnv();
  try {
    await run(env, await onboard(env, { relation: 'self' }));
  } finally {
    await env.closeChecked();
  }
}
