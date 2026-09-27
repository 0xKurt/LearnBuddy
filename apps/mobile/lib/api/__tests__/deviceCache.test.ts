import { BuddyHome, MeResponse } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { cacheKey, fromStored, settledHome, toStored } from '../deviceCache.js';

const LENA = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const message = (id: string, status: 'done' | 'processing' | 'failed', role = 'learner') => ({
  id,
  role,
  text: `Nachricht ${id.slice(0, 2)}`,
  status,
  failure_code: null,
  client_message_id: null,
  options: null,
  reply_to_id: null,
  outreach: null,
  actions: [],
  created_at: '2026-09-27T10:00:00.000Z',
});

const home = BuddyHome.parse({
  learner: { id: LENA, name: 'Lena', is_minor: true },
  now: {
    type: 'resume_practice',
    session_id: '33333333-3333-4333-8333-333333333333',
    mode: 'practice',
    title: 'Brüche',
    remaining: 2,
  },
  notice: null,
  decision: null,
  done: [],
  next: [],
  thread: [
    message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'done'),
    message('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'done', 'buddy'),
    message('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'processing'),
  ],
  thread_has_more: true,
  system: { model: true, push: 'active', contact_enabled: false, scheduler: 'ok' },
  working: 'session',
  context_version: 7,
});

const me = MeResponse.parse({
  account: null,
  learner: null,
  consent_version: '2026-09',
  capabilities: { model: true, push: false },
});

describe('what is kept on the device for an instant start (gaps.md #2)', () => {
  it('keeps the settled conversation, never what claims "now" (CLAUDE.md rule 5)', () => {
    const kept = settledHome(home);
    expect(kept.now).toBeNull();
    expect(kept.working).toBeNull();
    expect(kept.notice).toBeNull();
    expect(kept.decision).toBeNull();
    // A message still being answered would show Buddy thinking: it waits for the server.
    expect(kept.thread.map((m) => m.status)).toEqual(['done', 'done']);
    expect(kept.thread_has_more).toBe(true);
    expect(kept.learner.name).toBe('Lena');
  });

  it('reads back what it stored, for the same person only', () => {
    const raw = JSON.stringify(toStored(LENA, 1000, me, home));
    const back = fromStored(raw, LENA);
    expect(back?.home?.thread).toHaveLength(2);
    expect(back?.me).toEqual(me);
    // Someone else signed in on this phone: her copy is not shown to them.
    expect(fromStored(raw, OTHER)).toBeNull();
  });

  it('ignores copies it cannot trust: broken, another version, another shape', () => {
    expect(fromStored(null, LENA)).toBeNull();
    expect(fromStored('{not json', LENA)).toBeNull();
    const stored = toStored(LENA, 1000, me, home);
    expect(fromStored(JSON.stringify({ ...stored, v: 0 }), LENA)).toBeNull();
    expect(fromStored(JSON.stringify({ ...stored, home: { thread: 'x' } }), LENA)).toBeNull();
  });

  it('keys each person’s copy apart', () => {
    expect(cacheKey(LENA)).not.toBe(cacheKey(OTHER));
    expect(cacheKey(LENA).startsWith('lb.cache.')).toBe(true);
  });
});
