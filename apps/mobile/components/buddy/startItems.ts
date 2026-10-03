// The ways to start, as the ⋯ menu on Buddy's home lists them (issue #174; docs/UX-PRINCIPLES.md
// §6: examples of what Buddy does, not a feature catalog). The first one fits her situation;
// everything else she just says, and Buddy answers with a button.

import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';

import type { TopicKind } from '../learn/useStartTopic.js';
import type { StartItem } from './MenuSheet.js';

export function startItems(
  next: BuddyHome['next'],
  t: TFunction,
  do_: {
    send: (text: string) => void;
    setChoice: (choice: 'homework' | 'vocab') => void;
    setTopic: (kind: TopicKind) => void;
  },
): StartItem[] {
  const exam = next.find((i) => i.kind === 'exam');
  return [
    // Always "Arbeit" where she looks for it (user feedback #17); with a test planned it
    // prepares her for that one.
    {
      key: 'exam',
      icon: 'clock',
      label: t('buddy:suggest.exam_short'),
      onPress: () =>
        do_.send(
          exam ? t('buddy:suggest.test_message', { title: exam.title }) : t('buddy:suggest.exam'),
        ),
    },
    {
      key: 'homework',
      icon: 'pencil',
      label: t('buddy:suggest.homework'),
      onPress: () => do_.setChoice('homework'),
    },
    {
      key: 'speak',
      icon: 'mic',
      label: t('buddy:suggest.speak'),
      onPress: () => do_.setTopic('speak'),
    },
    {
      key: 'vocab',
      icon: 'book',
      label: t('buddy:suggest.vocab'),
      onPress: () => do_.setChoice('vocab'),
    },
    // "Erklär mir was" lives in the chat itself (owner decision 2026-09-28):
    // explanations are conversation, at whatever length the question needs.
  ];
}
