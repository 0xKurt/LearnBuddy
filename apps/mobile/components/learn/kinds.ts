// The ways to start learning from something the learner names, with the label they have
// everywhere (the topic sheet, Buddy's offers). An offer's sign is the one sparkle of the
// thread's card (components/buddy/ChatCard.tsx, #599), no longer an icon per kind.

import type { TopicKind } from './useStartTopic.js';

/** learn:start.* – the same words as the start tiles on the home. */
export const KIND_LABEL: Record<TopicKind, string> = {
  practice: 'start.practice',
  test: 'start.test',
  vocab: 'start.vocab',
  speak: 'start.speak',
  listen: 'start.listen',
  spelling_dictation: 'start.spelling_dictation',
  teach_back: 'start.teach_back',
  read: 'start.read',
  essay: 'start.essay',
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
  // Asked for in the chat like listening; the words are hers or her sheet's, not examples.
  spelling_dictation: 0,
  // Asked for in the chat ("Frag mich ab", "Darf ich's dir erklären?"), about a topic or her sheet.
  teach_back: 0,
  // Asked for in the chat ("Lass uns Lesen üben"); Buddy writes the text on the topic she names.
  read: 0,
  // Asked for in the chat, about a topic she names or the writing task on her sheet.
  essay: 0,
  help: 0,
};
