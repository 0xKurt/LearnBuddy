import { describe, expect, it } from 'vitest';
import { embeddingGateway, llmGateway, speechGateway } from '../../production.js';
import { loadConfig, bootWarnings } from '../../config.js';
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres@localhost/test',
  SUPABASE_URL: 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'disabled',
};
describe('EU speech and search configuration', () => {
  it.each(['vertex', 'openai', 'disabled'] as const)(
    'wraps %s chat with the configured audio adapter',
    (LLM_BACKEND) => {
      const gateway = llmGateway(
        loadConfig({
          ...env,
          LLM_BACKEND,
          GOOGLE_CLOUD_PROJECT: 'test',
          OPENAI_API_KEY: 'test',
          AUDIO_BACKEND: 'openai',
        }),
      );
      expect(gateway.profile.name).toContain('+openai-audio');
      expect(gateway.profile.media.has('audio')).toBe(true);
      expect(gateway.profile.acceptedMimeTypes.has('audio/webm')).toBe(true);
    },
  );
  it('reads the pronunciation model from validated configuration', () => {
    expect(loadConfig({ ...env, OPENAI_MODEL_PRONOUNCE: 'gpt-audio' })).toMatchObject({
      OPENAI_MODEL_PRONOUNCE: 'gpt-audio',
    });
    expect(() => loadConfig({ ...env, OPENAI_MODEL_PRONOUNCE: 'unpriced-model' })).toThrow(
      /OPENAI_MODEL_PRONOUNCE/,
    );
  });
  it('accepts the EU provider independently of the chat provider', () => {
    const c = loadConfig({
      ...env,
      SPEECH_BACKEND: 'openai',
      EMBEDDING_BACKEND: 'openai',
      OPENAI_API_KEY: 'test',
    });
    expect(c.SPEECH_BACKEND).toBe('openai');
    expect(c.EMBEDDING_BACKEND).toBe('openai');
    expect(c.OPENAI_BASE_URL).toBe('https://eu.api.openai.com/v1');
    expect(bootWarnings(c)).toEqual([]);
    expect(embeddingGateway(c)).toMatchObject({
      available: true,
      model: 'text-embedding-3-small',
      dimensions: 1536,
    });
    expect(speechGateway(c).voiceId('warm', 'de-DE')).toContain('openai:');
  });
  it.each([
    'https://api.openai.com/v1',
    'https://eu.api.openai.com.evil/v1',
    'http://eu.api.openai.com/v1',
    'https://eu.api.openai.com/v1?proxy=1',
  ])('rejects %s even before activation', (OPENAI_BASE_URL) => {
    expect(() => loadConfig({ ...env, OPENAI_BASE_URL })).toThrow(/OPENAI_BASE_URL/);
  });
  it.each(['SPEECH_BACKEND', 'EMBEDDING_BACKEND'])('requires credentials for %s', (key) => {
    expect(() => loadConfig({ ...env, [key]: 'openai' })).toThrow(/OPENAI_API_KEY/);
  });
  it('preserves the existing defaults', () => {
    const c = loadConfig(env);
    expect(c.SPEECH_BACKEND).toBe('disabled');
    expect(c.EMBEDDING_BACKEND).toBe('vertex');
  });
});
