// What a rehearsal measured (issue #264), as the same "So lief's" list the Probetest and the
// roleplay end with (lb/ResultList.tsx) — one result card in the whole app. Read from the numbers
// the server computed (`MessageView.rehearsal`), never parsed out of the message's text. No grade
// and no score (CLAUDE.md rule 6): the length against the length she was given, her pace, the
// hesitation sounds, which parts of a talk were heard — or, read aloud, the words to look at again.

import type { RehearsalView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { lengthVerdict, wordsToPractise } from '../../lib/buddy/rehearsal.js';
import { formatClock } from '../../lib/speech/voice.js';
import { ResultList, type ResultRow } from '../lb/ResultList.js';

export function RehearsalResult({ rehearsal: r }: { rehearsal: RehearsalView }) {
  const { t } = useTranslation(['buddy', 'practice']);
  const pace: ResultRow = {
    key: 'pace',
    right: true,
    label: t('buddy:rehearse.result.pace'),
    text: t('buddy:rehearse.result.pace_text', { wpm: r.words_per_minute }),
    detail: null,
  };
  const rows: ResultRow[] =
    r.kind === 'read_aloud'
      ? readRows(r, pace, t)
      : [
          lengthRow(r, t),
          pace,
          {
            key: 'fillers',
            right: r.fillers === 0,
            label: t('buddy:rehearse.result.fillers'),
            text: t('buddy:rehearse.result.fillers_text', { count: r.fillers ?? 0 }),
            detail: null,
          },
          ...(r.structure ?? []).map((p) => ({
            key: `part-${p.part}`,
            right: p.status === 'heard',
            label: t(`buddy:rehearse.result.part.${p.part}`),
            text: t(`buddy:rehearse.result.status.${p.status}`),
            detail: null,
          })),
        ];
  // In the chat it arrives like every card there (Conversation's riseIn): no motion of its own.
  return <ResultList title={t('practice:summary_test.review')} rows={rows} animate={false} />;
}

type T = ReturnType<typeof useTranslation>['t'];

function lengthRow(r: RehearsalView, t: T): ResultRow {
  const verdict = lengthVerdict(r.duration_s, r.target_s);
  const duration = formatClock(r.duration_s * 1000);
  return {
    key: 'length',
    right: verdict === null || verdict === 'fits',
    label: t('buddy:rehearse.result.length'),
    text:
      r.target_s === null
        ? duration
        : t('buddy:rehearse.result.length_of', {
            duration,
            target: formatClock(r.target_s * 1000),
          }),
    detail: verdict === null ? null : t(`buddy:rehearse.result.verdict.${verdict}`),
  };
}

function readRows(r: RehearsalView, pace: ResultRow, t: T): ResultRow[] {
  const words = wordsToPractise(r);
  return [
    pace,
    {
      key: 'words',
      right: words.length === 0,
      label: t('buddy:rehearse.result.words'),
      text: words.length === 0 ? t('buddy:rehearse.result.words_none') : words.join(', '),
      detail: null,
    },
  ];
}
