// What the card says while Buddy reads a sheet (gap 5): the real stage from the
// server — photos on their way, waiting for the reader, being read, read and
// practice being made — as a title, a line and a few steps. Nothing the server
// did not report (CLAUDE.md rule 5): no page-by-page progress (one reading for
// all pages), no bar that moves by itself. Pure logic (unit tests).

import type { NowCard, ReadingStage } from '@learnbuddy/shared-types/contracts';

import type { ReadingView, StepState } from '../../components/buddy/extensions.js';

type Processing = Extract<NowCard, { type: 'material_processing' }>;
type StepKey = ReadingView['steps'][number]['key'];

/** The stage; an older server only sends the status. */
export function stageOf(card: Processing): ReadingStage {
  if (card.stage) return card.stage;
  switch (card.status) {
    case 'awaiting_upload':
      return 'sending';
    case 'queued':
      return 'waiting';
    case 'processing':
      return 'reading';
    case 'ready':
      return 'building';
  }
}

const ORDER: Record<ReadingStage, number> = { sending: 0, waiting: 1, reading: 1, building: 2 };

export function readingView(card: Processing, preparing: boolean): ReadingView {
  const stage = stageOf(card);
  const pages = card.pages ?? 1;
  // Homework is help right after reading: no practice to make.
  const keys: StepKey[] =
    card.purpose === 'homework' ? ['sent', 'read'] : ['sent', 'read', 'build'];
  const at = ORDER[stage];
  const steps = keys.map((key, i) => ({
    key,
    state: (i < at ? 'done' : i === at ? 'active' : 'todo') as StepState,
  }));
  switch (stage) {
    case 'sending':
      return {
        stage,
        title: { key: 'now.sending_title' },
        body: { key: 'now.sending_body' },
        steps,
      };
    case 'waiting':
      return {
        stage,
        title: { key: 'now.waiting_title' },
        body: { key: preparing ? 'now.processing_body_practice' : 'now.processing_body' },
        steps,
      };
    case 'reading':
      return {
        stage,
        title: { key: 'now.reading_title', count: pages },
        body: { key: preparing ? 'now.processing_body_practice' : 'now.processing_body' },
        steps,
      };
    case 'building':
      return {
        stage,
        title: { key: 'now.building_title' },
        body:
          card.found !== null && card.found !== undefined
            ? { key: 'now.building_body', count: card.found }
            : { key: 'working.material' },
        steps,
      };
  }
}
