// What a model may be told about a past message (issue #149).
//
// `buddy_messages.recall_block` is the single answer, and this module is the single place
// that reads it, so a new model context has one rule to respect instead of a convention to
// rediscover. The audit of 30.09. found the hole the other way round: the turn path swapped
// a blocked message for a fixed line, the session summariser read the same table with no
// such rule, and the one text the code swore never to send again went to the summary model.
//
// Her words stay hers either way — the app shows them, the export contains them, deleting
// the conversation deletes them (docs/privacy.md). This decides only what a MODEL is told.

import { t } from '../../i18n/index.js';

export type RecallBlock = 'blocked' | 'concern' | null;

export type RecallableMessage = {
  role: 'learner' | 'buddy';
  text: string;
  recall_block?: RecallBlock;
};

/**
 * The text a model may see for this message, or null when it may see nothing of it.
 *
 * - `blocked`: the provider's safety filter held her words. The conversation still needs a
 *   turn to exist there, or the dialogue would jump — so the model reads a fixed line that
 *   says something was held back, never the words themselves.
 * - `concern`: a distress disclosure. It stays in her conversation (privacy.md says so),
 *   but nothing may be DERIVED from it and kept — a session summary is exactly that. The
 *   model gets nothing, not even a placeholder: a summariser told "she said something
 *   concerning here" would write that down.
 */
export function recallText(
  m: RecallableMessage,
  locale: string,
  forDialogue: boolean,
): string | null {
  const block = m.recall_block ?? null;
  if (block === null) return m.text;
  if (block === 'concern') return null;
  // blocked
  if (!forDialogue) return null;
  return m.role === 'learner' ? t(locale, 'safeguarding.held_back') : m.text;
}
