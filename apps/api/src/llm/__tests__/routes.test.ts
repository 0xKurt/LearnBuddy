import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../config.js';
import { splitModelSpec } from '../vertex.js';

const env = {
  DATABASE_URL: 'x',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'disabled',
};

describe('model routes', () => {
  it('reads a location in front of the model, else the default location', () => {
    expect(splitModelSpec('eu/gemini-3.1-flash-lite', 'europe-west4')).toEqual({
      location: 'eu',
      model: 'gemini-3.1-flash-lite',
    });
    expect(splitModelSpec('gemini-2.5-flash', 'europe-west4')).toEqual({
      location: 'europe-west4',
      model: 'gemini-2.5-flash',
    });
  });

  it('takes per-task models from VERTEX_ROUTES and rejects anything unknown', () => {
    expect(loadConfig(env).VERTEX_ROUTES).toEqual({});
    expect(
      loadConfig({ ...env, VERTEX_ROUTES: '{"tutor":"eu/gemini-3.1-flash-lite"}' }).VERTEX_ROUTES,
    ).toEqual({ tutor: 'eu/gemini-3.1-flash-lite' });
    expect(() => loadConfig({ ...env, VERTEX_ROUTES: '{"tutr":"gemini-2.5-flash"}' })).toThrow();
    expect(() => loadConfig({ ...env, VERTEX_ROUTES: '{"tutor":"gpt-4o"}' })).toThrow();
    expect(() => loadConfig({ ...env, VERTEX_ROUTES: 'not json' })).toThrow();
  });
});
