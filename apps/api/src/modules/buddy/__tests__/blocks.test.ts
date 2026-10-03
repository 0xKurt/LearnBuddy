// The STATE measurement (issue #168) must not change what it measures, and it must not
// claim a block offered something it does not offer. Both are checked here on a state that
// fills every section:
//   1. the text handed to the model is identical with the audit registered and without it;
//   2. every string the audit attributes to a block really stands in that block — otherwise
//      the attribution has drifted away from context.ts and the table would credit the wrong
//      section;
//   3. the sections recorded are exactly the sections of the text, with their real lengths.

import { afterEach, describe, expect, it } from 'vitest';

import {
  BLOCK_NAMES,
  blockData,
  referencedBlocks,
  setStateAudit,
  type BlockSample,
  type StateSample,
} from '../blocks.js';
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

/** Every section filled: otherwise the checks below would pass on an empty block. */
const state: BuddyState = {
  settings,
  goals: [
    {
      id: 'g-1',
      kind: 'exam',
      title: 'Mathearbeit Brüche',
      subject_id: 's-1',
      subject_name: 'Mathe',
      due_date: '2026-10-02',
      topics: ['Brüche kürzen'],
      status: 'active',
      outcome: null,
      version: 1,
      created_at: new Date('2026-09-20T10:00:00Z'),
      closed_at: null,
    },
  ],
  steps: [
    {
      id: 'st-1',
      goal_id: 'g-1',
      kind: 'practice',
      title: 'Brüche üben',
      state: 'prepared',
      planned_date: '2026-09-29',
      planned_time: '16:00',
      agreed: true,
      repeat: null,
      repeat_until: null,
      payload: { item_ids: ['i-1', 'i-2'], est_minutes: 10 },
      evidence: null,
      done_source: null,
      version: 1,
      created_at: new Date('2026-09-27T10:00:00Z'),
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
      created_at: new Date('2026-09-10T10:00:00Z'),
    },
    {
      id: 'm-2',
      kind: 'constraint',
      statement: 'Hat Handballtraining',
      source: 'learner_stated',
      quote: 'hab Handball',
      valid_until: new Date('2026-10-05T22:00:00Z'),
      version: 1,
      created_at: new Date('2026-09-26T10:00:00Z'),
    },
  ],
  messages: [],
  summaries: [{ day: '2026-09-27', summary: 'Vokabeln geübt.', topics: ['Unit 3'] }],
  subjects: [{ id: 's-1', name: 'Mathe', kind: 'math', item_count: 12, material_count: 1 }],
  topics: [
    { subject_id: 's-1', topic: 'Brüche kürzen', total: 12, seen: 8, secure: 5, shaky: 1, due: 0 },
  ],
  materials: [
    {
      id: 'mat-1',
      title: 'Arbeitsblatt Brüche',
      status: 'ready',
      failure_reason: null,
      subject_id: 's-1',
      goal_id: 'g-1',
      item_count: 12,
      photo_count: 2,
      page_problems: [],
      unclear: [],
      items_incomplete: false,
      not_practicable: [],
      created_at: new Date('2026-09-26T10:00:00Z'),
      failed_at: null,
    },
  ],
  focus: {
    material_id: 'mat-1',
    material_title: 'Arbeitsblatt Brüche',
    subject_id: 's-1',
    subject_name: 'Mathe',
    goal_id: 'g-1',
    goal_title: 'Mathearbeit Brüche',
    vocabulary_only: false,
    direction: null,
    said: 'die Brüche von gestern',
    updated_at: new Date('2026-09-27T16:00:00Z'),
  },
  sessions: [
    {
      id: 'ps-1',
      mode: 'practice',
      title: null,
      status: 'finished',
      goal_id: 'g-1',
      step_id: null,
      started_at: new Date('2026-09-27T14:00:00Z'),
      last_activity_at: new Date('2026-09-27T14:20:00Z'),
      finished_at: new Date('2026-09-27T14:20:00Z'),
      total: 10,
      answered: 10,
      first_try: 6,
      secure_topics: ['Begriffe'],
      shaky_topics: ['Brüche erweitern'],
    },
  ],
  standing: [
    {
      id: 'a-1',
      kind: 'practice',
      text: 'Brüche kürzen üben',
      goal_id: 'g-1',
      difficulty: null,
      direction: null,
      minutes: null,
      created_at: new Date('2026-09-28T07:30:00Z'),
    },
  ],
  outreach: [],
  totals: { activeGoals: 1, openSteps: 1, memories: 2, items: 12, materials: 1 },
};

const learner = {
  display_name: 'Lena',
  birth_date: '2014-02-10',
  level: 'school' as const,
  grade: 6,
  locale: 'de' as const,
  isMinor: true,
};

const now = new Date('2026-09-28T08:00:00Z');

function withAudit(): { samples: StateSample[] } {
  const samples: StateSample[] = [];
  setStateAudit((s) => samples.push(s));
  return { samples };
}

afterEach(() => setStateAudit(null));

describe('the STATE measurement does not change STATE', () => {
  it('hands the model the same text with the audit on and off', () => {
    const off = buildContext(learner, state, now, { pushAvailable: true }).state;
    const { samples } = withAudit();
    const on = buildContext(learner, state, now, { pushAvailable: true }).state;
    expect(on).toBe(off);
    expect(samples).toHaveLength(1);
  });

  it('records the sections of exactly that text, with their lengths', () => {
    const { samples } = withAudit();
    const built = buildContext(learner, state, now, { pushAvailable: true }).state;
    const blocks = samples[0]!.blocks;
    // Recorded in the order of the text, and together they ARE the text.
    expect(blocks.map((b) => b.text).join('\n\n')).toBe(built);
    for (const b of blocks) expect(b.chars).toBe(b.text.length);
    // This state fills every section but the day note.
    expect(blocks.map((b) => b.name)).toEqual(BLOCK_NAMES.filter((n) => n !== 'note'));
  });

  it('records the day note as its own section when there is one', () => {
    const { samples } = withAudit();
    buildContext(learner, state, now, { pushAvailable: true, modelNote: 'NOTE: yesterday.' });
    expect(samples[0]!.blocks.at(-1)).toMatchObject({ name: 'note', text: 'NOTE: yesterday.' });
  });
});

describe('what the audit says a block offers', () => {
  it('really stands in that block (or the attribution has drifted)', () => {
    const { samples } = withAudit();
    buildContext(learner, state, now, { pushAvailable: true });
    const byName = new Map(samples[0]!.blocks.map((b) => [b.name, b]));
    for (const [name, data] of Object.entries(blockData(state, learner))) {
      const block = byName.get(name as BlockSample['name']);
      if (data.length === 0) continue;
      expect(block, `block ${name} has data but is not in STATE`).toBeDefined();
      for (const datum of data) {
        expect(block!.text, `${name} should contain ${JSON.stringify(datum)}`).toContain(datum);
      }
    }
  });

  it('includes the aliases the block offers', () => {
    const { samples } = withAudit();
    buildContext(learner, state, now, { pushAvailable: true });
    const byName = new Map(samples[0]!.blocks.map((b) => [b.name, b]));
    expect(byName.get('goals')!.data).toContain('g1');
    expect(byName.get('goals')!.data).toContain('st1');
    expect(byName.get('knows')!.data).toContain('m1');
    expect(byName.get('temporary')!.data).toContain('m2');
    expect(byName.get('material')!.data).toContain('sh1');
  });
});

describe('which blocks an answer points back at', () => {
  const blocks: BlockSample[] = [
    { name: 'goals', chars: 10, text: '', data: ['g1', 'Mathearbeit', 'Mathe'] },
    { name: 'material', chars: 10, text: '', data: ['sh1', 'Mathe'] },
  ];

  it('credits a block for a string only it offers', () => {
    const { byBlock, shared } = referencedBlocks(blocks, 'Ich habe die Mathearbeit (g1) gesehen');
    expect(byBlock.goals?.sort()).toEqual(['Mathearbeit', 'g1']);
    expect(byBlock.material).toBeUndefined();
    expect(shared).toEqual([]);
  });

  it('credits neither block for a string both offer', () => {
    const { byBlock, shared } = referencedBlocks(blocks, 'In Mathe läuft es gut');
    expect(byBlock.goals).toBeUndefined();
    expect(byBlock.material).toBeUndefined();
    expect(shared).toEqual(['Mathe']);
  });
});
