// Guards the invariant that a misconfigured non-test build NEVER silently
// serves the FakeLlmGateway (canned "Erklärung … (fake)" tutoring). A parent
// once test-drove a dev build that fell back to fake and concluded the AI was
// broken — fail loudly at boot instead. CLAUDE.md §rule #5.

import { describe, it, expect } from 'vitest';

import { Env } from '../../env.js';
import { FakeLlmGateway } from '../../../test/fake-llm.js';
import { createLlmGateway } from '../factory.js';

function env(overrides: Record<string, string | undefined>): Env {
  return Env.parse({
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'anon_key_at_least_twenty_chars',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_at_least_twenty_chars',
    ...overrides,
  });
}

describe('createLlmGateway backend selection', () => {
  it('uses the fake in tests', () => {
    expect(createLlmGateway(env({ NODE_ENV: 'test' }))).toBeInstanceOf(FakeLlmGateway);
  });

  it('uses the fake only when explicitly opted in via LLM_BACKEND=fake', () => {
    const g = createLlmGateway(env({ NODE_ENV: 'development', LLM_BACKEND: 'fake' }));
    expect(g).toBeInstanceOf(FakeLlmGateway);
  });

  it('THROWS in development when no backend is resolvable (no silent fake)', () => {
    expect(() => createLlmGateway(env({ NODE_ENV: 'development' }))).toThrowError(
      /no LLM backend resolvable/i,
    );
  });

  it('THROWS in production when GOOGLE_CLOUD_PROJECT is missing', () => {
    expect(() => createLlmGateway(env({ NODE_ENV: 'production' }))).toThrowError(
      /no LLM backend resolvable/i,
    );
  });
});
