// The ways to start learning from something the learner names, with the icon
// and label they have everywhere (Buddy's home, the topic sheet, Buddy's offers).

import type { IconName } from '../lb/Icon.js';
import type { TopicKind } from './useStartTopic.js';

export const KIND_ICON: Record<TopicKind, IconName> = {
  explain: 'bulb',
  practice: 'practice',
  vocab: 'book',
  speak: 'mic',
  help: 'pencil',
};

/** learn:start.* – the same words as the start tiles on the home. */
export const KIND_LABEL: Record<TopicKind, string> = {
  explain: 'start.explain',
  practice: 'start.practice',
  vocab: 'start.vocab',
  speak: 'start.speak',
  help: 'start.homework',
};

/** How many one-tap examples a kind offers (learn:topic.<kind>.ex_1 …); own lists have none. */
export const KIND_EXAMPLES: Record<TopicKind, number> = {
  explain: 3,
  practice: 3,
  vocab: 0,
  speak: 2,
  help: 0,
};
