// How the practice screen is heard (issue #386, Vorlesen): the question on screen is read once
// when it appears (`useQuestionVoice`), and so is Buddy's reply with the verdict word after every
// answer. Without Vorlesen a screen reader hears the same words — the verdict too, never raw
// LaTeX (audit M-82). A right answer is also felt; "not yet" is a soft nudge. Moved out of
// `app/practice/[id].tsx` (issue #311).
//
// A card pass and a Kopfrechnen round read their card or task themselves (`CardPass`,
// `DrillRound`, issue #434) and never arm the mic: there is no spoken answer to listen for. Nor a
// question the server says must not be heard (issue #238, `read_aloud`): a spelling task, a
// vocabulary prompt that holds its own answer — hearing it would hand over the solution.

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useSpokenWords } from '../../components/math/useSpokenMath.js';
import { useQuestionVoice } from '../../components/practice/useQuestionVoice.js';
import { announce } from '../announce.js';
import { haptic } from '../haptics.js';
import { currentLocale } from '../i18n/index.js';
import { afterFeedback, useHandsFree } from '../speech/handsFree.js';
import { type ListenEnd, speakInOrder } from '../speech/listen.js';
import { feedbackReadText, spokenText } from '../speech/spoken.js';
import { readsAloud, useVoiceMode } from '../speech/voiceMode.js';
import { questionOnScreen } from './offers.js';
import { verdictWordKey } from './onScreen.js';

/** A running test says no verdict and gives no feel of one (the result comes at the end). */
const testing = (res: AnswerResponse) =>
  res.session.mode === 'test' && res.session.status === 'active';

/**
 * `onNext`: a closed question read to its end in a conversation moves on to the next open one,
 * which is read and then listened for (the hands-free loop, `afterFeedback`).
 */
export function usePracticeVoice(
  session: SessionView | undefined,
  pinnedId: string | null,
  onNext: () => void,
) {
  const { t } = useTranslation(['practice', 'common']);
  const words = useSpokenWords();
  const next = useRef(onNext);
  next.current = onNext;

  const onScreen = session ? questionOnScreen(session, pinnedId) : null;
  const listens = !session?.card_pass && !session?.drill;
  const toRead =
    onScreen && onScreen.status === 'open' && listens && onScreen.item.read_aloud
      ? onScreen.item
      : null;
  // Read when it appears, and in a conversation the mic listens once it is read.
  const readQuestion = useQuestionVoice(toRead, words, t, { listens });

  /** Buddy's reply heard: read aloud with Vorlesen, else told to a screen reader. */
  function say(text: string, then?: (why: ListenEnd) => void): void {
    if (!readsAloud(useVoiceMode.getState())) {
      announce(text);
      return;
    }
    speakInOrder([{ text, lang: currentLocale() }], then);
  }

  return {
    readQuestion,
    /** Buddy's reaction after an answer or a hint, with the verdict word first and math in words. */
    readFeedback(res: AnswerResponse, itemId: string): void {
      if (!testing(res)) {
        if (res.verdict === 'correct') haptic.success();
        else if (res.verdict === 'partially_correct' || res.verdict === 'incorrect') haptic.soft();
      }
      const key = testing(res) ? null : verdictWordKey(res.verdict);
      say(feedbackReadText(key ? t(key) : null, res.reply.text, words), (why) => {
        if (why !== 'done') return;
        const hands = useHandsFree.getState();
        const then = afterFeedback(res.session.items, itemId, hands.armed);
        if (then === 'listen') hands.listenNow();
        if (then === 'next') setTimeout(() => next.current(), 400);
      });
    },
    /** Buddy's reply to "Anders erklären", heard like every reply of his. */
    readReply(text: string): void {
      say(spokenText(text, words));
    },
    /** "Lösung zeigen": the solution is said too, math in words (audit M-82). */
    sayRevealed(answer: string): void {
      announce(`${t('practice:solution.title')}: ${spokenText(answer, words)}`);
    },
  };
}

export type PracticeVoice = ReturnType<typeof usePracticeVoice>;
