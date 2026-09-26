import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../config.js';
import { modelFor, splitModelSpec } from '../vertex.js';

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

  it('processes in the EU only: other locations are refused at startup', () => {
    expect(loadConfig(env).VERTEX_MODEL_SMART).toBe('eu/gemini-3.6-flash');
    expect(
      loadConfig({ ...env, VERTEX_ROUTES: '{"tutor":"europe-west4/gemini-2.5-flash"}' })
        .VERTEX_ROUTES,
    ).toEqual({ tutor: 'europe-west4/gemini-2.5-flash' });
    for (const bad of ['global/gemini-3.6-flash', 'us-central1/gemini-3.6-flash']) {
      expect(() => loadConfig({ ...env, VERTEX_ROUTES: `{"tutor":"${bad}"}` })).toThrow();
      expect(() => loadConfig({ ...env, VERTEX_MODEL_SMART: bad })).toThrow();
    }
    expect(() => loadConfig({ ...env, GOOGLE_VERTEX_LOCATION: 'global' })).toThrow();
  });

  it('runs each task on its measured model unless a route says otherwise', () => {
    const c = loadConfig(env);
    expect(modelFor(c, { purpose: 'pronounce', tier: 'smart' })).toBe('eu/gemini-3.1-flash-lite');
    expect(modelFor(c, { purpose: 'tutor', tier: 'smart' })).toBe('eu/gemini-3.6-flash');
    const routed = loadConfig({ ...env, VERTEX_ROUTES: '{"pronounce":"eu/gemini-3.6-flash"}' });
    expect(modelFor(routed, { purpose: 'pronounce', tier: 'smart' })).toBe('eu/gemini-3.6-flash');
  });
});
