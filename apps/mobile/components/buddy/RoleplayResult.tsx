// The feedback after a roleplay (issue #384), as the same "So lief's" list the Probetest ends
// with (lb/ResultList.tsx): each task on her role card — managed ones on mint with her own words
// as the proof, the others named kindly as not there yet — then up to three of her lines with a
// more natural way to say them. Read from the structured feedback the server checked
// (`MessageView.roleplay_feedback`), never parsed out of the message's text. No grade, no score,
// no count (CLAUDE.md rule 6): a scene is not a test.

import type { RoleplayFeedback } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { ResultList, type ResultRow } from '../lb/ResultList.js';

export function RoleplayResult({ feedback }: { feedback: RoleplayFeedback }) {
  const { t } = useTranslation(['buddy', 'practice']);
  const quoted = (quote: string) => t('buddy:roleplay.result.quote', { quote });
  const rows: ResultRow[] = [
    ...feedback.points.map((p, i) => ({
      key: `point-${i}`,
      right: p.met,
      label: t(p.met ? 'buddy:roleplay.result.met' : 'buddy:roleplay.result.open'),
      text: p.name,
      detail: p.met && p.quote !== null ? quoted(p.quote) : null,
    })),
    ...feedback.better.map((b, i) => ({
      key: `better-${i}`,
      right: false,
      label: t('buddy:roleplay.result.better'),
      text: quoted(b.said),
      detail: quoted(b.better),
    })),
  ];
  // In the chat it arrives like every card there (Conversation's riseIn), and one that was
  // already there when the chat opened stands still: no motion of its own.
  return <ResultList title={t('practice:summary_test.review')} rows={rows} animate={false} />;
}
