// Configuration only: no network, credentials or model calls.
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { llmGateway, productionDeps } from '../production.js';

const base = {
  DATABASE_URL: 'postgres://postgres@127.0.0.1:54316/postgres',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
};
const direct = { ...base, LLM_BACKEND: 'openai', OPENAI_API_KEY: 'not-a-real-key' };

describe('direct EU gateway configuration', () => {
  it('constructs production services without a Google project or credentials', async () => {
    let close = async () => {};
    const deps = productionDeps(
      loadConfig({ ...base, OPENAI_API_KEY: 'not-a-real-key' }),
      () => {},
      (pool) => {
        close = () => pool.end();
      },
    );
    try {
      expect(deps.llm.available).toBe(true);
      expect(deps.llm.profile.name).toBe('openai+openai-audio');
      expect(deps.embeddings.model).toBe('text-embedding-3-small');
      expect(deps.speech.available).toBe(true);
    } finally {
      await close();
    }
  });

  it('selects the direct gateway with EU defaults and no other provider credentials', () => {
    const config = loadConfig(direct);
    expect(config).toMatchObject({
      OPENAI_BASE_URL: 'https://eu.api.openai.com/v1',
      OPENAI_MODEL_SMART: 'gpt-5.4-mini',
      OPENAI_MODEL_FAST: 'gpt-5.4-mini',
      OPENAI_MODEL_PRONOUNCE: 'gpt-realtime-2.1',
      OPENAI_MODEL_SPEECH: 'gpt-realtime-2.1-mini',
      OPENAI_MODEL_TRANSCRIBE: 'gpt-transcribe',
      OPENAI_TTS_VOICES: { warm: 'marin', deep: 'echo' },
    });
    expect(llmGateway(config).profile.name).toBe('openai+openai-audio');
  });

  it('keeps an explicitly selected provider switchable by environment', () => {
    expect(
      loadConfig({
        ...base,
        LLM_BACKEND: 'vertex',
        GOOGLE_CLOUD_PROJECT: 'test',
        OPENAI_API_KEY: 'unused',
      }).LLM_BACKEND,
    ).toBe('vertex');
  });

  it.each(['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1-mini'])(
    'accepts the documented EU model %s',
    (model) => {
      expect(loadConfig({ ...direct, OPENAI_MODEL_SMART: model })).toMatchObject({
        OPENAI_MODEL_SMART: model,
      });
    },
  );

  it.each([
    ['OPENAI_ROUTES', '{"unknown":"gpt-5.4-mini"}'],
    ['OPENAI_ROUTES', '{"tutor":"gemini-3.6-flash"}'],
    ['OPENAI_ROUTES', '{broken'],
    ['OPENAI_API_KEY', undefined],
    ['OPENAI_API_KEY', ''],
    ['OPENAI_BASE_URL', 'https://api.openai.com/v1'],
    ['OPENAI_BASE_URL', 'http://eu.api.openai.com/v1'],
    ['OPENAI_BASE_URL', 'https://eu.api.openai.com.evil.test/v1'],
    ['OPENAI_BASE_URL', 'https://user:secret@eu.api.openai.com/v1'],
    ['OPENAI_BASE_URL', 'https://eu.api.openai.com/v1?redirect=global'],
    ['OPENAI_BASE_URL', 'https://eu.api.openai.com/v1#fragment'],
    ['OPENAI_MODEL_FAST', 'gpt-unknown'],
    ['OPENAI_MODEL_FAST', 'gpt-4.1-nano'],
    ['OPENAI_MODEL_PRONOUNCE', 'gpt-audio-1.5'],
    ['OPENAI_MODEL_PRONOUNCE', 'gpt-audio'],
    ['OPENAI_MODEL_SPEECH', 'gpt-4o-mini-tts'],
    ['OPENAI_TTS_VOICES', '{"warm":"onyx"}'],
  ])('rejects unsafe or incomplete %s', (key, value) => {
    expect(() => loadConfig({ ...direct, [key]: value })).toThrow(key);
  });
});
