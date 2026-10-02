// The ways to start learning from something the learner names, with the icon
// and label they have everywhere (Buddy's home, the topic sheet, Buddy's offers).

import type { IconName } from '../lb/Icon.js';
import type { TopicKind } from './useStartTopic.js';

export const KIND_ICON: Record<TopicKind, IconName> = {
  practice: 'practice',
  test: 'check',
  vocab: 'book',
  speak: 'mic',
  // Hörverstehen: the speaker, the same icon everything that is READ ALOUD carries
  // (`ListenButton`) — the microphone above is for her own voice (issue #210).
  listen: 'speak',
  help: 'pencil',
};

/** learn:start.* – the same words as the start tiles on the home. */
export const KIND_LABEL: Record<TopicKind, string> = {
  practice: 'start.practice',
  test: 'start.test',
  vocab: 'start.vocab',
  speak: 'start.speak',
  listen: 'start.listen',
  help: 'start.homework',
};

/** How many one-tap examples a kind offers (learn:topic.<kind>.ex_1 …); own lists have none. */
export const KIND_EXAMPLES: Record<TopicKind, number> = {
  practice: 3,
  test: 3,
  vocab: 0,
  speak: 2,
  // Listening is asked for in the chat and prepared from what she says there (issue #210):
  // there is no sheet to open for it, so there is nothing to offer examples in.
  listen: 0,
  help: 0,
};
