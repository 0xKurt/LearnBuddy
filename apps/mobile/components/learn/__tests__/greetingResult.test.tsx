// The way into the practice Buddy's greeting names rides with the greeting (issue #195): only for
// the result this home reports, and only for the practice the greeting told about.

import { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { greetingResult } from '../GreetingResult.js';

const SESSION = '00000000-0000-4000-8000-000000000002';

const home = (now: BuddyHome['now']) =>
  BuddyHome.parse({
    learner: { id: '11111111-1111-4111-8111-111111111111', name: 'Lena', is_minor: true },
    now,
    notice: null,
    decision: null,
    done: [],
    next: [],
    thread: [],
    thread_has_more: false,
    system: { model: true, push: 'active', contact_enabled: false, scheduler: 'ok' },
    working: null,
    context_version: 1,
    practiced_today: true,
  });

const result: BuddyHome['now'] = {
  type: 'practice_result',
  session_id: SESSION,
  mode: 'practice',
  result: { answered: 4, first_try: 4, secure_topics: [], shaky_topics: [] },
  next: null,
};
const on = { busy: false, quiet: 'primary' as const };

describe('the greeting offers the practice it named (issue #195)', () => {
  it('for the result this home reports', () => {
    expect(greetingResult(home(result), SESSION, on)).not.toBeNull();
  });

  it('not for another practice, nor without a result', () => {
    expect(greetingResult(home(result), '00000000-0000-4000-8000-000000000009', on)).toBeNull();
    expect(greetingResult(home(null), SESSION, on)).toBeNull();
  });
});
