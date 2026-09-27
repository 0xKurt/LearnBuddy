import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { readingView, stageOf } from '../readingStages.js';

type Processing = Extract<NowCard, { type: 'material_processing' }>;
const card = (over: Partial<Processing>): Processing => ({
  type: 'material_processing',
  material_id: '00000000-0000-4000-8000-000000000001',
  status: 'processing',
  ...over,
});
const states = (c: Processing) => readingView(c, false).steps.map((s) => `${s.key}:${s.state}`);

describe('reading stages', () => {
  it('follows the server stage step by step', () => {
    expect(states(card({ status: 'awaiting_upload', stage: 'sending' }))).toEqual([
      'sent:active',
      'read:todo',
      'build:todo',
    ]);
    expect(states(card({ status: 'queued', stage: 'waiting' }))).toEqual([
      'sent:done',
      'read:active',
      'build:todo',
    ]);
    expect(states(card({ stage: 'reading' }))).toEqual(['sent:done', 'read:active', 'build:todo']);
    expect(states(card({ status: 'ready', stage: 'building', found: 6 }))).toEqual([
      'sent:done',
      'read:done',
      'build:active',
    ]);
  });
  it('names the pages while reading and the tasks found once read', () => {
    expect(readingView(card({ stage: 'reading', pages: 2 }), false).title).toEqual({
      key: 'now.reading_title',
      count: 2,
    });
    expect(readingView(card({ status: 'ready', stage: 'building', found: 6 }), false).body).toEqual(
      {
        key: 'now.building_body',
        count: 6,
      },
    );
    // Without a count nothing is invented.
    expect(readingView(card({ status: 'ready', stage: 'building' }), false).body).toEqual({
      key: 'working.material',
    });
  });
  it('homework has no practice step', () => {
    expect(states(card({ stage: 'reading', purpose: 'homework' }))).toEqual([
      'sent:done',
      'read:active',
    ]);
  });
  it('an older server without stages is read from the status', () => {
    expect(stageOf(card({ status: 'awaiting_upload' }))).toBe('sending');
    expect(stageOf(card({ status: 'queued' }))).toBe('waiting');
    expect(stageOf(card({ status: 'processing' }))).toBe('reading');
  });
  it('says practice follows while it is prepared in the card', () => {
    expect(readingView(card({ stage: 'reading' }), true).body.key).toBe(
      'now.processing_body_practice',
    );
  });
});
