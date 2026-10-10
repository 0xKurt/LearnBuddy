// What Buddy sends the model stays byte-identical while the learning domain moves out of the core
// (issue #107, cut 5). The prompts and the STATE block are built from pieces the domain
// registers (modules/learning/register.ts); this test pins the exact result — every byte of the
// system prompts and schemas, the prompt version that is hashed from them, and the STATE text of
// a learner with something in every section — to the values measured on main before the cut.
//
// A change that is MEANT to change the prompt updates these pins in the same commit, and the
// version moves with it (`promptVersion`, issue #425). A pin that moves without such a change is
// the bug this test is for.

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { registerLearning } from '../../learning/register.js';
import { setStateAudit, type StateSample } from '../blocks.js';
import { buildContext } from '../context.js';
import { buddyPrompt } from '../prompts.js';
import type { BuddyState, SettingsRow } from '../state.js';

const sha = (x: unknown): string =>
  createHash('sha256')
    .update(typeof x === 'string' ? x : JSON.stringify(x))
    .digest('hex');

beforeAll(() => registerLearning());

describe('the prompt Buddy sends (pinned, issue #107)', () => {
  it('is byte for byte what it was before the domain registered its part', () => {
    const p = buddyPrompt();
    expect([p.turnSystem.length, sha(p.turnSystem)]).toEqual([
      31331,
      '6e3f9660bcb30d9776045894d68d957e772d46d1c6f9c07c0c1b218e241f3646',
    ]);
    expect([p.checkSystem.length, sha(p.checkSystem)]).toEqual([
      11292,
      '632adcd93bdfe3bb2217bc77ce669989aa1d435a7769c19a4c25a1f25df8df34',
    ]);
    expect(sha(p.turnSchema)).toBe(
      '43b426b45c7b6ed851c9b8cc899b694c8f5a6ce4f74c18f83d0b6b131fa03d5b',
    );
    expect(sha(p.turnStepSchema)).toBe(
      'dd2f46559f2a1c4e3a772d1b10b4deae0c5853a1ebfd1051199f358e7d76a33a',
    );
    expect(sha(p.checkSchema)).toBe(
      '0a7874ec5fc394d76afc190ac95080cb3dbc432372653fbd815ab3006d80a914',
    );
    expect(sha(p.checkStepSchema)).toBe(
      '18acc60f409edb3fd3a4f1ef1d3c3bbe29de390890b4e0b3ab011031f8ecb182',
    );
    expect(p.version).toBe('buddy.8c2de358');
  });

  it('is built once: every call hands out the same prompt', () => {
    expect(buddyPrompt()).toBe(buddyPrompt());
  });
});

// ─────────────── STATE ───────────────

const settings: SettingsRow = {
  learner_id: 'l1',
  timezone: 'Europe/Berlin',
  contact_enabled: true,
  contact_changed_by: 'account_holder',
  contact_changed_at: null,
  quiet_start: '21:00',
  quiet_end: '07:30',
  preferred_start: '15:00',
  preferred_end: '19:00',
  avoid_weekdays: [6],
  paused_until: null,
  phone_only_important: true,
  opt_in_prompt_hidden_until: null,
  context_version: 4,
  last_seen_at: null,
  version: 1,
  voice: 'warm',
  voice_speed: -1,
};

const day = (iso: string) => new Date(iso);
const material = {
  status: 'ready' as const,
  failure_reason: null,
  source: 'sheet' as const,
  ready_at: day('2026-09-27T10:00:00Z'),
  subject_id: 's-1',
  goal_id: null,
  item_count: 8,
  photo_count: 2,
  page_problems: [],
  items_incomplete: false,
  not_practicable: [],
  unclear: [],
  created_at: day('2026-09-27T09:00:00Z'),
  failed_at: null,
};

/** A learner with something in every section of STATE. */
const state: BuddyState = {
  settings,
  goals: [
    {
      id: 'g-1',
      kind: 'exam',
      title: 'Mathearbeit',
      subject_id: 's-1',
      subject_name: 'Mathe',
      due_date: '2026-10-02',
      topics: ['Brüche'],
      status: 'active',
      outcome: null,
      version: 1,
      created_at: day('2026-09-20T10:00:00Z'),
      closed_at: null,
    },
    {
      id: 'g-2',
      kind: 'talk',
      talk_minutes: 5,
      title: 'Referat Vulkane',
      subject_id: null,
      subject_name: null,
      due_date: '2026-10-20',
      topics: [],
      status: 'active',
      outcome: null,
      version: 1,
      created_at: day('2026-09-21T10:00:00Z'),
      closed_at: null,
    },
    {
      id: 'g-3',
      kind: 'exam',
      title: 'Englischtest',
      subject_id: null,
      subject_name: null,
      due_date: '2026-09-25',
      topics: [],
      status: 'done',
      outcome: 'good',
      version: 2,
      created_at: day('2026-09-10T10:00:00Z'),
      closed_at: day('2026-09-25T15:00:00Z'),
    },
  ],
  steps: [
    {
      id: 'st-1',
      goal_id: 'g-1',
      kind: 'practice',
      title: 'Brüche üben',
      state: 'prepared',
      planned_date: '2026-09-28',
      planned_time: '16:00',
      agreed: true,
      repeat: null,
      repeat_until: null,
      payload: { item_ids: ['i1', 'i2', 'i3'], est_minutes: 10 },
      evidence: null,
      done_source: null,
      version: 1,
      created_at: day('2026-09-26T10:00:00Z'),
      finished_at: null,
    },
    {
      id: 'st-2',
      goal_id: 'g-2',
      kind: 'task',
      title: 'Probevortrag',
      state: 'done',
      planned_date: '2026-09-27',
      planned_time: null,
      agreed: false,
      repeat: null,
      repeat_until: null,
      payload: { stage: 'rehearsal' },
      evidence: { duration_s: 290, target_s: 300, words_per_minute: 120, fillers: 3 },
      done_source: 'evidence',
      version: 2,
      created_at: day('2026-09-21T10:00:00Z'),
      finished_at: day('2026-09-27T17:00:00Z'),
    },
    {
      id: 'st-3',
      goal_id: null,
      kind: 'capture',
      title: 'Vokabeln lesen',
      state: 'planned',
      planned_date: '2026-09-29',
      planned_time: '17:30',
      agreed: true,
      repeat: 'daily',
      repeat_until: '2026-10-05',
      payload: {},
      evidence: null,
      done_source: 'learner_reported',
      version: 1,
      created_at: day('2026-09-26T10:00:00Z'),
      finished_at: null,
    },
  ],
  memories: [
    {
      id: 'm-1',
      kind: 'fact',
      statement: 'Geht in die 6. Klasse',
      source: 'learner_stated',
      quote: 'ich bin in der 6',
      valid_until: null,
      version: 1,
      created_at: day('2026-09-10T10:00:00Z'),
    },
    {
      id: 'm-2',
      kind: 'constraint',
      statement: 'Hat diese Woche Training',
      source: 'consolidated',
      quote: null,
      valid_until: day('2026-10-03T22:00:00Z'),
      version: 1,
      created_at: day('2026-09-26T10:00:00Z'),
    },
  ],
  messages: [],
  summaries: [{ day: '2026-09-27', summary: 'Vokabeln geübt.', topics: ['Englisch'] }],
  subjects: [
    { id: 's-1', name: 'Mathe', kind: 'math', item_count: 12, material_count: 2 },
    { id: 's-2', name: 'Englisch', kind: 'language', item_count: 0, material_count: 0 },
  ],
  topics: [
    { subject_id: 's-1', topic: 'Brüche', total: 12, seen: 8, secure: 5, shaky: 1, due: 0 },
    { subject_id: 's-1', topic: 'Dezimalzahlen', total: 4, seen: 4, secure: 4, shaky: 0, due: 0 },
    { subject_id: 's-1', topic: 'Prozent', total: 4, seen: 4, secure: 1, shaky: 0, due: 2 },
    { subject_id: 's-1', topic: 'Geometrie', total: 3, seen: 0, secure: 0, shaky: 0, due: 0 },
  ],
  focus: {
    material_id: 'mat-1',
    material_title: 'Bruchrechnen',
    subject_id: 's-1',
    subject_name: 'Mathe',
    goal_id: 'g-1',
    goal_title: 'Mathearbeit',
    vocabulary_only: false,
    direction: null,
    said: 'die brüche für freitag',
    updated_at: day('2026-09-27T10:00:00Z'),
  },
  materials: [
    {
      ...material,
      id: 'mat-1',
      title: 'Bruchrechnen',
      goal_id: 'g-1',
      items_incomplete: true,
      page_problems: [{ page: 2, read: 'part', problem: 'blurry' }],
      not_practicable: [{ task: 'Zeichne ein Kreisdiagramm', form: 'drawing' }],
      unclear: [
        {
          ref: 'u1',
          material_id: 'mat-1',
          page: 1,
          photo_count: 2,
          task: 'Aufgabe 3',
          about: 'Zahl',
          readings: ['3/4', '5/4'],
          status: 'open',
          answer: null,
          items_added: 0,
        },
        {
          ref: 'u2',
          material_id: 'mat-1',
          page: 2,
          photo_count: 2,
          task: 'Aufgabe 5',
          about: 'Nenner',
          readings: ['8', '9'],
          status: 'answered',
          answer: '8',
          items_added: 0,
        },
        {
          ref: 'u3',
          material_id: 'mat-1',
          page: 2,
          photo_count: 2,
          task: 'Aufgabe 6',
          about: 'Zähler',
          readings: ['1', '7'],
          status: 'read',
          answer: '7',
          items_added: 0,
        },
      ],
    },
    {
      ...material,
      id: 'mat-2',
      title: 'Klassenarbeit',
      source: 'corrected_test',
      item_count: 4,
    },
    { ...material, id: 'mat-3', title: 'Hefteintrag', source: 'notebook_entry', item_count: 3 },
    { ...material, id: 'mat-4', title: null, status: 'processing', item_count: 0 },
    {
      ...material,
      id: 'mat-5',
      title: 'Unleserlich',
      status: 'failed',
      failure_reason: 'unreadable',
      item_count: 0,
      failed_at: day('2026-09-27T11:00:00Z'),
    },
    { ...material, id: 'mat-6', title: null, status: 'awaiting_upload', item_count: 0 },
  ],
  sessions: [
    {
      id: 'ps-1',
      mode: 'practice',
      title: 'Brüche',
      status: 'finished',
      goal_id: 'g-1',
      step_id: null,
      started_at: day('2026-09-27T14:00:00Z'),
      last_activity_at: day('2026-09-27T14:20:00Z'),
      finished_at: day('2026-09-27T14:20:00Z'),
      total: 10,
      answered: 9,
      first_try: 6,
      secure_topics: ['Dezimalzahlen'],
      shaky_topics: ['Brüche kürzen'],
    },
  ],
  standing: [
    {
      id: 'a-1',
      kind: 'practice',
      text: 'Vokabeln Unit 3',
      goal_id: null,
      material_id: null,
      difficulty: null,
      direction: 'produce',
      minutes: null,
      created_at: day('2026-09-28T07:00:00Z'),
    },
  ],
  later: [
    {
      role: 'learner',
      recall_block: null,
      text: 'Warum kürzt man Brüche?',
      session_title: 'Brüche',
      ended_at: day('2026-09-27T14:20:00Z'),
    },
  ],
  outreach: [
    {
      id: 'o-1',
      kind: 'reminder',
      origin: 'agreed',
      topic_key: 'step:st-1',
      title: 'Zeit zum Üben',
      body: 'Deine Übung ist bereit.',
      why: null,
      status: 'sent',
      send_at: day('2026-09-27T14:00:00Z'),
      sent_at: day('2026-09-27T14:00:00Z'),
      opened_at: null,
      responded_at: null,
      response: null,
      goal_id: 'g-1',
      step_id: 'st-1',
      created_at: day('2026-09-27T13:00:00Z'),
    },
  ],
  totals: { activeGoals: 3, openSteps: 2, memories: 2, items: 19, materials: 14 },
};

const learner = {
  display_name: 'Lena',
  birth_date: '2014-02-10',
  level: 'school' as const,
  grade: null,
  locale: 'de' as const,
  isMinor: true,
};

describe('the STATE block Buddy sends (pinned, issue #107)', () => {
  it('is byte for byte what it was before the domain rendered its sections', () => {
    // The block measurement (issue #168) sees the same sections with the same data.
    const samples: StateSample[] = [];
    setStateAudit((s) => samples.push(s));
    const { state: text, aliases } = buildContext(learner, state, day('2026-09-28T08:00:00Z'), {
      pushAvailable: false,
      modelNote: 'NOTE: a note.',
    });
    setStateAudit(null);
    expect([text.length, sha(text)]).toEqual([
      6838,
      'a9bb3804c7380075277f5ebe13d9b07c7ccd3af53e79d7608f1756671e5280f2',
    ]);
    expect(sha(samples)).toBe('54e484b76d2ededcc8327b654efe715a2f14e1b06bb2b55e408ab7fa1e0f8fe9');
    expect(Object.fromEntries(Object.entries(aliases).map(([k, m]) => [k, [...m.keys()]]))).toEqual(
      {
        goals: ['g1', 'g2', 'g3'],
        steps: ['st1', 'st2', 'st3'],
        memories: ['m1', 'm2'],
        subjects: ['f1', 'f2'],
        materials: ['sh1', 'sh2', 'sh3', 'sh4', 'sh5', 'sh6'],
      },
    );
  });
});
