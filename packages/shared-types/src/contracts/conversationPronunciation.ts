import { z } from 'zod';
import {
  checkedPronunciationPlan,
  gradePronunciation,
  pronunciationKey,
  pronunciationWords,
  PronunciationEvidence,
  PronunciationPlan,
} from './pronunciation.js';

/** No audio or client verdict enters a conversation request. */
export const ConversationPronunciation = z
  .object({
    plan: PronunciationPlan,
    evidence: PronunciationEvidence.extend({ source: z.literal('vosk') }),
  })
  .strict();
export type ConversationPronunciation = z.infer<typeof ConversationPronunciation>;

/** The phone transcript fixes the whole grammar; prepared competitors are optional. */
export function conversationPronunciationPlan(
  text: string,
  language: string,
  prepared?: PronunciationPlan | null,
): PronunciationPlan | null {
  const words = pronunciationWords(text);
  return checkedPronunciationPlan(
    text,
    language,
    words.map((word) =>
      prepared?.language === language
        ? (prepared.words.find((w) => pronunciationKey(w.expected) === pronunciationKey(word))
            ?.confusions ?? [])
        : [],
    ),
  );
}

/** Same grader as practice. Unconfirmed words must never become pronunciation advice. */
export function conversationPronunciationWords(input: ConversationPronunciation) {
  return gradePronunciation(input.plan, input.evidence).words.filter(
    (w) => w.verdict !== 'unsicher',
  );
}
