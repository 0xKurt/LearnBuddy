// The practice screen's voice (issue #386): the question on screen is read aloud when it appears
// (Vorlesen, or Gespräch, which reads too), and in a conversation the mic then listens by itself —
// Gespräch means the same as on /talk. Reading to the end lets the mic listen, a closed question
// moves on by itself (the hands-free loop, lib/speech/handsFree.ts; the mic is the conversation
// row's, `useHandsFreeMic`).
//
// The loop is armed while a conversation runs — not with a screen reader on, whose own speech the
// mic would record (`talkListensByItself`, audit M-85); then her tap on the mic arms it. Leaving
// the screen ends whatever is being read, and the loop.
//
// A Kopfrechnen round and a card pass (issue #434) are read the same way, but they never listen:
// there is no spoken answer to them (`listens: false`).

import type { ItemView } from '@learnbuddy/shared-types/contracts';
import { useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef } from 'react';

import { questionParts } from '../../lib/practice/questionParts.js';
import { talkListensByItself, useHandsFree } from '../../lib/speech/handsFree.js';
import { speakInOrder, stop as stopSpeaking } from '../../lib/speech/listen.js';
import { readsAloud, useVoiceMode } from '../../lib/speech/voiceMode.js';
import { useScreenReader } from '../../lib/useScreenReader.js';
import type { SpokenWords } from '../../lib/math/speak.js';

/**
 * Reads `toRead` (the open question that may be heard, else null) when it appears and runs the
 * loop; returns how to read a question again ("Nochmal vorlesen").
 */
export function useQuestionVoice(
  toRead: ItemView | null,
  words: SpokenWords,
  t: TFunction,
  { listens = true }: { listens?: boolean } = {},
): (item: ItemView) => void {
  const reads = useVoiceMode(readsAloud);
  const conversation = useVoiceMode((s) => s.conversation);
  const screenReader = useScreenReader();
  const loopOn = useRef(false);
  loopOn.current = listens && conversation && talkListensByItself(screenReader);
  const syncLoop = () => {
    const hands = useHandsFree.getState();
    if (loopOn.current) hands.arm();
    else hands.disarm();
  };
  // Declared before the reading below: the loop is armed when the first reading ends.
  useEffect(syncLoop, [conversation, screenReader]);

  const readQuestion = (item: ItemView) =>
    speakInOrder(questionParts(item, words, t), (why) => {
      if (why === 'done' && listens) useHandsFree.getState().listenNow();
    });

  // A new question, or reading or a conversation starting, reads it; "Nochmal vorlesen" repeats
  // it. Going back to the keyboard is no reason to read it again.
  const wasTalking = useRef(conversation);
  useEffect(() => {
    const ended = wasTalking.current && !conversation;
    wasTalking.current = conversation;
    if (ended || !reads) return;
    if (toRead) readQuestion(toRead);
    // Nothing to read (the server says it must not be heard): the mic listens at once.
    else if (conversation && listens) useHandsFree.getState().listenNow();
  }, [reads, conversation, toRead?.id]);

  useFocusEffect(
    useCallback(() => {
      syncLoop();
      return () => {
        useHandsFree.getState().disarm();
        stopSpeaking();
      };
    }, []),
  );
  return readQuestion;
}
