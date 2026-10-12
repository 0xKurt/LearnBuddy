// One subject in "Dein Material" (issue #189): its name, a glimpse of what is in it, and a
// chevron that says one tap goes in. Nothing more — this is the way in, not a report.
//
// The glimpse NAMES the newest things ("Les vacances · Passé composé · und mehr") instead of
// counting them. That is the honest answer to "wie viel ist da": she sees what she would
// find. A number next to a subject would read as a workload the moment it stood there, and a
// learner is never shown a tally of what is due or left over (CLAUDE.md rule 6).

import type { LibrarySubject } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { Row } from '../lb/ListGroup.js';
import { glimpseOf } from './subjects.js';
import { KIND_TONE } from './tone.js';

type Props = {
  /** A real subject, or the sheets whose subject is not known yet ("Ohne Fach"). */
  subject: LibrarySubject | null;
  /** Shown instead of the subject's name when there is none ("Ohne Fach"). */
  name: string;
  onPress: () => void;
};

export function SubjectCard({ subject, name, onPress }: Props) {
  const { t } = useTranslation('library');
  const glimpse = subject
    ? glimpseOf(subject, { untitled: t('untitled'), exercise: t('subject.exercise_untitled') })
    : { names: [], more: false };
  // "und mehr" rather than how many more: the point is that there is more, not a figure.
  const line = [...glimpse.names, ...(glimpse.more ? [t('subject.more')] : [])].join(' · ');
  const said = line || t('subject.nothing_yet');
  return (
    <Row
      icon={subject ? undefined : 'folder'}
      tile={subject ? { letter: name.slice(0, 1), tone: KIND_TONE[subject.kind] } : undefined}
      title={name}
      sub={said}
      onPress={onPress}
      accessibilityLabel={`${name}: ${said}`}
      accessibilityHint={t('subject.open_hint')}
    />
  );
}
