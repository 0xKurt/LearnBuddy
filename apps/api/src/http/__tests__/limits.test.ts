// Which requests carry the hourly abuse budget (docs/architecture.md §Limits). The gap
// this pins down: `speak-word` joined the spoken answers (#83) but the answers regex ended
// on `speak$`, and dictation never stood in the table at all — both parsed megabytes of
// base64 per request with no hourly bound (issue #86).

import { describe, expect, it } from 'vitest';

import { scopeFor } from '../limits.js';

const id = '3b1c0a52-9c1e-4a37-9d55-0e6f6f5a2b10';

describe('the hourly budget covers every expensive request', () => {
  it('practice answers: typed, spoken, and one word on its own', () => {
    expect(scopeFor('POST', `/practice/sessions/${id}/answer`)).toBe('answers');
    expect(scopeFor('POST', `/practice/sessions/${id}/speak`)).toBe('answers');
    expect(scopeFor('POST', `/practice/sessions/${id}/speak-word`)).toBe('answers');
  });

  it('messages to Buddy and dictation', () => {
    expect(scopeFor('POST', '/buddy/messages')).toBe('messages');
    expect(scopeFor('POST', '/voice/transcribe')).toBe('voice');
  });

  it('account and learner writes carry the signup budget (issue #72)', () => {
    expect(scopeFor('POST', '/account')).toBe('signup');
    expect(scopeFor('POST', '/learner')).toBe('signup');
    // Deeper account routes keep their own guards (PIN, admin token), not this budget.
    expect(scopeFor('POST', '/account/admin-session')).toBeNull();
    expect(scopeFor('POST', '/account/deletion')).toBeNull();
    expect(scopeFor('POST', '/learner/consent')).toBeNull();
  });

  it('cheap reads stay unbudgeted', () => {
    expect(scopeFor('GET', '/buddy')).toBeNull();
    expect(scopeFor('POST', `/practice/sessions/${id}/hint`)).toBeNull();
  });
});
