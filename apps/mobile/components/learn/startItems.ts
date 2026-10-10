// The ways to start, as the ⋯ menu on Buddy's home lists them (issue #174; docs/UX-PRINCIPLES.md
// §6: examples of what Buddy does, not a feature catalog). The first one fits her situation;
// everything else she just says, and Buddy answers with a button. The menu is the core's
// (components/buddy/StartSheets.tsx); these ways and the sheets they open are the learning
// domain's (./StartSheets.tsx, issue #107).

import type { StartMenu } from '../buddy/extensions.js';
import { topicSheet } from './StartSheets.js';

export const startItems: StartMenu['items'] = (next, t, act) => {
  const exam = next.find((i) => i.kind === 'exam');
  return [
    // Always "Arbeit" where she looks for it (user feedback #17); with a test planned it
    // prepares her for that one.
    {
      key: 'exam',
      icon: 'clock',
      label: t('buddy:suggest.exam_short'),
      onPress: () =>
        act.send(
          exam ? t('buddy:suggest.test_message', { title: exam.title }) : t('buddy:suggest.exam'),
        ),
    },
    {
      key: 'homework',
      icon: 'pencil',
      label: t('buddy:suggest.homework'),
      onPress: () => act.open('homework'),
    },
    {
      key: 'speak',
      icon: 'mic',
      label: t('buddy:suggest.speak'),
      onPress: () => act.open(topicSheet('speak')),
    },
    {
      key: 'vocab',
      icon: 'book',
      label: t('buddy:suggest.vocab'),
      onPress: () => act.open('vocab'),
    },
    // "Erklär mir was" lives in the chat itself (owner decision 2026-09-28):
    // explanations are conversation, at whatever length the question needs.
  ];
};
