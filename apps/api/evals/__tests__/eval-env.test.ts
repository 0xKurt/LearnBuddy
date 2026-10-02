// Evals never share the live model quota by accident (issue #206). Pure: no model, no
// network, no .env.local — resolveEvalEnv is handed the environment it decides on.

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';
import { EvalEnvError, resolveEvalEnv, type Env } from '../eval-env.js';

const base: Env = {
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'vertex',
  GOOGLE_CLOUD_PROJECT: 'learnbuddy-live',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: '{"live":"sa"}',
};

describe('eval environment (issue #206)', () => {
  it('refuses to run against the app’s project when nothing says otherwise', () => {
    expect(() => resolveEvalEnv(base)).toThrow(EvalEnvError);
    expect(() => resolveEvalEnv(base)).toThrow(/EVAL_GOOGLE_CLOUD_PROJECT/);
  });

  it('moves every call to the eval project, labelled as eval traffic', () => {
    const { env, notice } = resolveEvalEnv({ ...base, EVAL_GOOGLE_CLOUD_PROJECT: 'lb-evals' });
    const config = loadConfig(env);
    expect(config.GOOGLE_CLOUD_PROJECT).toBe('lb-evals');
    expect(config.LLM_TRAFFIC).toBe('eval');
    expect(notice).toContain('lb-evals');
    // Without a credentials file of its own, the eval project uses the same service account.
    expect(config.GOOGLE_APPLICATION_CREDENTIALS_JSON).toBe('{"live":"sa"}');
  });

  it('uses the eval project’s own service account and location when given', () => {
    const { env } = resolveEvalEnv({
      ...base,
      EVAL_GOOGLE_CLOUD_PROJECT: 'lb-evals',
      EVAL_GOOGLE_APPLICATION_CREDENTIALS: '/keys/evals.json',
      EVAL_GOOGLE_VERTEX_LOCATION: 'europe-west1',
    });
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBe('/keys/evals.json');
    // The live inline key would otherwise win over the file (llm/vertex.ts ensureCredentialsFile).
    expect(env.GOOGLE_APPLICATION_CREDENTIALS_JSON).toBeUndefined();
    expect(loadConfig(env).GOOGLE_VERTEX_LOCATION).toBe('europe-west1');
  });

  it('does not accept the live project under the eval name', () => {
    expect(() =>
      resolveEvalEnv({ ...base, EVAL_GOOGLE_CLOUD_PROJECT: ' learnbuddy-live ' }),
    ).toThrow(/live quota/);
  });

  it('shares the live quota only on purpose, and says so loudly', () => {
    const { env, notice } = resolveEvalEnv({ ...base, EVAL_SHARE_LIVE_QUOTA: '1' });
    expect(loadConfig(env).GOOGLE_CLOUD_PROJECT).toBe('learnbuddy-live');
    expect(loadConfig(env).LLM_TRAFFIC).toBe('eval');
    expect(notice).toMatch(/LIVE quota/);
    // Anything but exactly "1" is not "on purpose".
    expect(() => resolveEvalEnv({ ...base, EVAL_SHARE_LIVE_QUOTA: 'yes' })).toThrow(EvalEnvError);
  });
});
