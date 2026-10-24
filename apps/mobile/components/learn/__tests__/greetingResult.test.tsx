// The way into the practice Buddy's greeting names rides with the greeting (issue #195): only for
// the result this home reports, and only for the practice the greeting told about.

import { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { greetingResult } from '../ResultNotice.js';

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

it.each([
  { pass: 'cards' as const, mode: 'practice' as const, title: 'Durch!' },
  { pass: null, mode: 'test' as const, ran_out: true, title: 'Die Zeit ist um' },
])('uses the result title for $title, without false praise', async (facts) => {
  const { screen } = await import('@testing-library/react');
  const { renderInApp } = await import('../../../testing/render.js');
  const { ResultNotice } = await import('../ResultNotice.js');
  const { practiceGreeting } = await import('../../../lib/learning/greeting.js');
  const now = { ...result, ...facts, total: 6, finished_at: '2026-10-24T12:00:00.000Z' };
  renderInApp(<ResultNotice now={now} {...on} />);
  expect(screen.getByText(facts.title)).toBeTruthy();
  expect(practiceGreeting(now)).toBeNull();
});

it('uses the same result sentences as the session page', async () => {
  const { screen } = await import('@testing-library/react');
  const { renderInApp } = await import('../../../testing/render.js');
  const { ResultNotice } = await import('../ResultNotice.js');
  const { SessionSummary } = await import('../../practice/SessionSummary.js');
  const summary = {
    answered: 4,
    first_try: 2,
    right: 4,
    secure_topics: ['Brüche'],
    shaky_topics: ['Brüche'],
  };
  const view = renderInApp(<SessionSummary mode="practice" summary={summary} />);
  const line = screen.getByTestId('summary-lead').textContent!;
  view.unmount();
  renderInApp(<ResultNotice now={{ ...result, result: summary }} {...on} />);
  expect(screen.getByText(line)).toBeTruthy();
});
