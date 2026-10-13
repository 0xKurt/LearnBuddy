// The feedback after a roleplay (issue #384), as the design's one result card (`ModeResult`,
// components/practice/Modes.jsx:52–66): each task on her role card she managed with a tick and her
// own words as the proof, and in the box for next time the tasks that were not there yet and up
// to three of her lines with a more natural way to say them. Read from the structured feedback
// the server checked (`MessageView.roleplay_feedback`), never parsed out of the message's text.
// No grade, no score, no count (CLAUDE.md rule 6): a scene is not a test.

import type { RoleplayFeedback } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { ModeResult, type ModeRow } from './RoleplayModeResult.js';

export function RoleplayResult({ feedback }: { feedback: RoleplayFeedback }) {
  const { t } = useTranslation(['buddy', 'practice']);
  const quoted = (quote: string) => t('buddy:roleplay.result.quote', { quote });
  const rows: ModeRow[] = [
    ...feedback.points.map((p, i): ModeRow => {
      if (!p.met)
        return {
          key: `point-${i}`,
          right: false,
          label: t('buddy:roleplay.result.open'),
          text: p.name,
          detail: null,
        };
      const quote = p.quote === null ? null : quoted(p.quote);
      return {
        key: `point-${i}`,
        right: true,
        // The tick says "managed"; a screen reader hears the word for it.
        label: null,
        text: p.name,
        detail: quote,
        spoken: [t('buddy:roleplay.result.met'), p.name, ...(quote ? [quote] : [])].join(': '),
      };
    }),
    ...feedback.better.map((b, i) => ({
      key: `better-${i}`,
      right: false,
      label: t('buddy:roleplay.result.better'),
      text: quoted(b.said),
      detail: quoted(b.better),
    })),
  ];
  return (
    <ModeResult
      label={t('buddy:roleplay.label')}
      title={t('practice:summary_test.review')}
      rows={rows}
    />
  );
}
