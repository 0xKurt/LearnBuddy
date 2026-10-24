import { afterEach, expect, it, vi } from 'vitest';
import { buildReport } from '../inventory.js';

afterEach(() => vi.unstubAllEnvs());

it('inventories the selected provider and its strict wire schema without Google credentials', async () => {
  vi.stubEnv('LLM_BACKEND', 'openai');
  vi.stubEnv('OPENAI_API_KEY', 'inventory-does-not-send-requests');
  vi.stubEnv('OPENAI_MODEL_SMART', 'gpt-5.4-mini');
  vi.stubEnv('OPENAI_MODEL_FAST', 'gpt-5.4-nano');
  vi.stubEnv('OPENAI_ROUTES', '{"tutor":"gpt-4.1-mini"}');
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', undefined);
  const report = await buildReport();
  expect(report.sdk).toMatch(/^openai /);
  expect(report.models.smart).toBe('gpt-5.4-mini');
  expect(report.tokens.status).toBe('not counted');
  const tutors = report.variants.filter((v) => v.purpose === 'tutor');
  expect(tutors.length).toBeGreaterThan(0);
  expect(tutors.every((v) => v.model === 'gpt-4.1-mini')).toBe(true);
  expect(report.variants.every((v) => v.schema.shape.optionalFields === 0)).toBe(true);
});
