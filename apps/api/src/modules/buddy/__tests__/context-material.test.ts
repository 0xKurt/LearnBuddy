// What the state block says about sheets that are not ready (issue #115). Before this, a
// send that hung was not in STATE at all and a failure was one counted line ("N sheet(s)
// could not be read (learner can retry)") — so Buddy asked for a photo she had already sent,
// and offered a second reading where the API refuses one (CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { buildContext } from '../context.js';
import type { BuddyState, MaterialBrief, SettingsRow } from '../state.js';

const settings: SettingsRow = {
  learner_id: 'l1',
  timezone: 'Europe/Berlin',
  contact_enabled: false,
  contact_changed_by: 'account_holder',
  quiet_start: '21:00',
  quiet_end: '07:30',
  preferred_start: '15:00',
  preferred_end: '19:00',
  avoid_weekdays: [],
  paused_until: null,
  phone_only_important: false,
  opt_in_prompt_hidden_until: null,
  context_version: 1,
  last_seen_at: null,
  version: 1,
  voice: 'warm',
  voice_speed: 0,
};

const material = (over: Partial<MaterialBrief>): MaterialBrief => ({
  id: 'm-1',
  title: null,
  status: 'ready',
  items_incomplete: false,
  not_practicable: [],
  unclear: [],
  failure_reason: null,
  subject_id: null,
  goal_id: null,
  item_count: 0,
  photo_count: 2,
  page_problems: [],
  created_at: new Date('2026-09-28T16:05:00Z'),
  failed_at: null,
  ...over,
});

const learner = {
  display_name: 'Lena',
  birth_date: '2014-02-10',
  level: 'school' as const,
  grade: 6,
  locale: 'de' as const,
  isMinor: true,
};

function block(materials: MaterialBrief[]): string {
  const state: BuddyState = {
    settings,
    goals: [],
    steps: [],
    memories: [],
    messages: [],
    summaries: [],
    subjects: [],
    topics: [],
    materials,
    focus: null,
    sessions: [],
    standing: [],
    later: [],
    outreach: [],
    totals: {
      activeGoals: 0,
      openSteps: 0,
      memories: 0,
      items: 0,
      materials: materials.length,
    },
  };
  return buildContext(learner, state, new Date('2026-09-29T09:00:00Z'), { pushAvailable: false })
    .state;
}

describe('the state block names sheets that are not ready', () => {
  it('says that photos are still on their way, and since when', () => {
    const text = block([material({ status: 'awaiting_upload', photo_count: 3 })]);
    expect(text).toContain('a sheet of 3 page(s) is still being sent (since 2026-09-28 18:05)');
    expect(text).toContain('not all photos have arrived');
  });

  it('names why a sheet failed, and whether reading it again is possible at all', () => {
    const given_up = block([
      material({ status: 'failed', failure_reason: 'photos_missing', title: null }),
    ]);
    expect(given_up).toContain('never arrived completely (the send was given up)');
    expect(given_up).toContain('reading it again is not possible');

    const unreadable = block([
      material({ status: 'failed', failure_reason: 'unreadable', title: 'Brüche' }),
    ]);
    expect(unreadable).toContain('"Brüche" could not be read: the photos were hard to read');
    expect(unreadable).toContain('she can have it read again');

    const refused = block([
      material({ status: 'failed', failure_reason: 'not_learning_material', title: 'Foto' }),
    ]);
    expect(refused).toContain('was not learning material');
    expect(refused).toContain('reading it again is not possible');
  });

  it('a sheet on its way is not counted as "being read" for its goal either', () => {
    const text = block([material({ status: 'awaiting_upload' })]);
    expect(text).not.toContain('are being read right now');
  });
});
