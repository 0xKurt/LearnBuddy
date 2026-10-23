// Configuration only: no network, credentials or model calls.
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { llmGateway } from '../production.js';

const base = {
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
};
const direct = { ...base, LLM_BACKEND: 'openai', OPENAI_API_KEY: 'not-a-real-key' };

describe('direct EU gateway is opt-in', () => {
  it('selects the direct gateway with EU defaults and no Google or Azure credentials', () => {
    const config = loadConfig(direct);
    expect(config).toMatchObject({
      OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
      OPENAI_MODEL_SMART: 'gpt-5.4-mini',
      OPENAI_MODEL_FAST: 'gpt-5.4-nano',
    });
    expect(llmGateway(config).profile.name).toBe('openai');
  });

  it('keeps Vertex the default, and a key alone does not switch it', () => {
    expect(
      loadConfig({ ...base, GOOGLE_CLOUD_PROJECT: 'test', OPENAI_API_KEY: 'unused' }).LLM_BACKEND,
    ).toBe('vertex');
  });

  it.each(['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1-mini', 'gpt-4.1-nano'])(
    'accepts the documented EU model %s',
    (model) => {
      expect(loadConfig({ ...direct, OPENAI_MODEL_SMART: model })).toMatchObject({
        OPENAI_MODEL_SMART: model,
      });
    },
  );

  it.each([
    ['OPENAI_API_KEY', undefined],
    ['OPENAI_API_KEY', ''],
    ['OPENAI_BASE_URL', 'https://api.openai.com/v1'],
    ['OPENAI_BASE_URL', 'http://eu.api.openai.com/v1'],
    ['OPENAI_BASE_URL', 'https://eu.api.openai.com.evil.test/v1'],
    ['OPENAI_BASE_URL', 'https://user:secret@eu.api.openai.com/v1'],
    ['OPENAI_BASE_URL', 'https://eu.api.openai.com/v1?redirect=global'],
    ['OPENAI_BASE_URL', 'https://eu.api.openai.com/v1#fragment'],
    ['OPENAI_MODEL_FAST', 'gpt-unknown'],
  ])('rejects unsafe or incomplete %s', (key, value) => {
    expect(() => loadConfig({ ...direct, [key]: value })).toThrow(key);
  });
});
