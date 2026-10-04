// How the state block is layered for the provider's prefix cache (issue #25): the
// sections that stay the same between two turns of one learner come first, the clock
// comes last. The point is not the order itself — it is that two turns a few minutes
// apart share everything up to "## Now", so a prefix cache has something to match.

import { describe, expect, it } from 'vitest';

import { buildContext } from '../context.js';
import type { BuddyState, SettingsRow } from '../state.js';

const settings: SettingsRow = {
  learner_id: 'l1',
  timezone: 'Europe/Berlin',
  contact_enabled: true,
  contact_changed_by: 'account_holder',
  quiet_start: '21:00',
  quiet_end: '07:30',
  preferred_start: '15:00',
  preferred_end: '19:00',
  avoid_weekdays: [],
  paused_until: null,
  phone_only_important: false,
  opt_in_prompt_hidden_until: null,
  context_version: 4,
  last_seen_at: null,
  version: 1,
  voice: 'warm',
  voice_speed: 0,
};

const state: BuddyState = {
  settings,
  goals: [
    {
      id: 'g-1',
      kind: 'exam',
      title: 'Mathearbeit',
      subject_id: null,
      subject_name: null,
      due_date: '2026-10-02',
      topics: ['Brüche'],
      status: 'active',
      outcome: null,
      version: 1,
      created_at: new Date('2026-09-20T10:00:00Z'),
      closed_at: null,
    },
  ],
  steps: [],
  memories: [
    {
      id: 'm-1',
      kind: 'fact',
      statement: 'Geht in die 6. Klasse',
      source: 'learner_stated',
      quote: 'ich bin in der 6',
      valid_until: null,
      version: 1,
      created_at: new Date('2026-09-10T10:00:00Z'),
    },
  ],
  messages: [],
  summaries: [{ day: '2026-09-27', summary: 'Vokabeln geübt.', topics: ['Englisch'] }],
  subjects: [{ id: 's-1', name: 'Mathe', kind: 'math', item_count: 12, material_count: 1 }],
  topics: [{ subject_id: 's-1', topic: 'Brüche', total: 12, seen: 8, secure: 5, shaky: 1, due: 0 }],
  focus: null,
  materials: [],
  sessions: [],
  standing: [],
  later: [],
  outreach: [],
  totals: { activeGoals: 1, openSteps: 0, memories: 1, items: 12, materials: 1 },
};

const learner = {
  display_name: 'Lena',
  birth_date: '2014-02-10',
  level: 'school' as const,
  grade: 6,
  locale: 'de' as const,
  isMinor: true,
};

const at = (iso: string): string =>
  buildContext(learner, state, new Date(iso), { pushAvailable: true }).state;

describe('the state block is layered for the prefix cache', () => {
  it('opens with what does not change and ends with the clock', () => {
    const block = at('2026-09-28T08:00:00Z');
    const headings = block.split('\n').filter((l) => l.startsWith('## '));
    expect(headings[0]).toBe('## Learner');
    expect(headings[headings.length - 1]).toBe('## Now');
    // Every section is written once — reordering must never duplicate or drop one.
    expect(new Set(headings).size).toBe(headings.length);
    expect(headings).toContain('## What Buddy knows (said by the learner; correctable)');
    expect(headings).toContain('## Goals and plan');
    expect(headings).toContain('## Recent practice');
  });

  it('two turns minutes apart share everything before "## Now"', () => {
    const first = at('2026-09-28T08:00:00Z');
    const second = at('2026-09-28T08:07:00Z');
    expect(first).not.toBe(second); // the clock moved
    const stable = first.slice(0, first.indexOf('## Now'));
    expect(second.startsWith(stable)).toBe(true);
    // Not a trivial prefix: the learner, what Buddy knows and the plan are all in it.
    expect(stable).toContain('Name: Lena');
    expect(stable).toContain('Geht in die 6. Klasse');
    expect(stable).toContain('Mathearbeit');
  });

  it('the day note stays behind the clock, so it never splits the stable part', () => {
    const noted = buildContext(learner, state, new Date('2026-09-28T08:00:00Z'), {
      pushAvailable: true,
      modelNote: 'NOTE: the learner wrote yesterday.',
    }).state;
    expect(noted.indexOf('NOTE:')).toBeGreaterThan(noted.indexOf('## Now'));
    expect(noted.startsWith('## Learner')).toBe(true);
  });
});
