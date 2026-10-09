// What she does with the question on screen, each a call to the server (docs/architecture.md
// §Practice): her answer, a spoken one, "Tipp", "Lösung zeigen", "Später", her question to the
// tutor, "Merk ich mir für nachher", "Anders erklären", the cards after a run. One call at a time
// (`useOneCall`); the session the server returns replaces the cached one, and Buddy's reply is
// heard (`usePracticeVoice`). Moved out of `app/practice/[id].tsx` (issue #311).

import type {
  AnswerResponse,
  ReexplainWay,
  SessionView,
  StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { announce } from '../announce.js';
import { isOutdated } from '../api/apiError.js';
import { newId } from '../api/client.js';
import {
  answerItem,
  askItem,
  deferItem,
  explainItem,
  hintItem,
  keepForLater,
  revealItem,
  startCardPass,
} from '../api/endpoints.js';
import { keys, queryClient, seedSession, storeTurn } from '../api/queries.js';
import { haptic } from '../haptics.js';
import { reacted } from '../perf.js';
import { leftAfterSend } from './essay.js';
import type { Pending } from './questionView.js';
import type { PracticeDrafts } from './usePracticeDrafts.js';
import type { PracticeVoice } from './usePracticeVoice.js';
import { useOneCall } from './useOneCall.js';

/**
 * What she sent, and how (issue #163). `via` is not decoration: since #147 a tapped word
 * travels as ordinary text so grading stays one path — so the text alone no longer shows
 * whether she recognised the word or wrote it, and a class test asks for the second.
 */
type AnswerInput = ({ text: string } | { choice: number } | { parts: StructuredAnswer }) & {
  via?: 'typed' | 'tapped' | 'spoken';
};

type Deps = {
  /** The session's id. */
  id: string;
  /** Keeps a question on screen (or, with null, lets the next open one come). */
  pin: (itemId: string | null) => void;
  drafts: PracticeDrafts;
  voice: PracticeVoice;
};

export function usePracticeActions({ id, pin, drafts, voice }: Deps) {
  const { t } = useTranslation(['practice', 'common']);
  const { busy, run } = useOneCall();
  /** What is on its way: an answer, or her question (`asked`). */
  const [pending, setPending] = useState<Pending | null>(null);
  /** "Anders erklären": the way she tapped, while Buddy writes. */
  const [again, setAgain] = useState<{ itemId: string; way: ReexplainWay } | null>(null);
  // The division step Buddy's reply names, opened on the board (#420), keyed by that reply.
  const [stepOpen, setStepOpen] = useState<{ itemId: string; step: number; turn: string } | null>(
    null,
  );

  /** The session as the server now holds it; a refetch that started before must not overwrite it. */
  async function store(next: SessionView): Promise<void> {
    await queryClient.cancelQueries({ queryKey: keys.session(id) });
    queryClient.setQueryData(keys.session(id), next);
  }

  /** The session fetched again (the server called the view outdated). */
  function refetch(): void {
    void queryClient.invalidateQueries({ queryKey: keys.session(id) });
  }

  /** One call at a time; a view the server calls outdated is fetched again. */
  function act(work: () => Promise<void>, onError?: (err: unknown) => void): Promise<void> {
    return run(work, (err) => {
      onError?.(err);
      if (isOutdated(err)) refetch();
    });
  }

  /** Buddy's reply to an answer, a hint or her question: on the board where it names a step, heard. */
  function replied(res: AnswerResponse, itemId: string): void {
    setStepOpen(res.column_step ? { itemId, step: res.column_step, turn: res.reply.id } : null);
    voice.readFeedback(res, itemId);
  }

  function answer(itemId: string, input: AnswerInput, shownText: string): Promise<void> {
    const answerText = 'text' in input ? input.text : null;
    const choice = 'choice' in input ? input.choice : null;
    const parts = 'parts' in input ? JSON.stringify(input.parts) : null;
    const { lastSent } = drafts;
    return act(
      async () => {
        const prev = lastSent.current;
        // Retrying the very same answer keeps its id, so the server records it only once.
        const clientTurnId =
          prev &&
          prev.itemId === itemId &&
          prev.text === answerText &&
          prev.choice === choice &&
          prev.parts === parts
            ? prev.clientTurnId
            : newId();
        lastSent.current = { clientTurnId, itemId, text: answerText, choice, parts };
        haptic.tap();
        pin(itemId);
        setPending({ itemId, text: shownText });
        try {
          const body = { client_turn_id: clientTurnId, item_id: itemId, ...input };
          const res = await answerItem(id, body);
          lastSent.current = null;
          await store(res.session);
          // Tap on "Prüfen" → the verdict on screen (issue #66).
          reacted('check');
          const after = res.session.items.find((i) => i.item.id === itemId);
          // A long text stays in the field: her next version starts from it (#258).
          if (answerText !== null)
            drafts.setText((c) => leftAfterSend(c, answerText, after?.item.kind));
          if (after?.status !== 'open') Keyboard.dismiss();
          replied(res, itemId);
        } finally {
          setPending(null);
        }
      },
      // The typed answer stays in the field, so trying again is one tap.
      (err) => {
        if (isOutdated(err)) lastSent.current = null;
      },
    );
  }

  return {
    busy,
    pending,
    again,
    stepOpen,
    store,
    act,
    refetch,
    answer,

    /** Buddy listened to a recording (SpeakPanel sends it and retries it itself). */
    async spoke(itemId: string, res: AnswerResponse): Promise<void> {
      pin(itemId);
      await store(res.session);
      replied(res, itemId);
    },

    reveal(itemId: string): Promise<void> {
      return act(async () => {
        pin(itemId);
        const revealed = await revealItem(id, itemId);
        await store(revealed);
        const solution = revealed.items.find((i) => i.item.id === itemId)?.answer;
        if (solution) voice.sayRevealed(solution);
        drafts.clearAnswer();
      });
    },

    /** "Tipp": the next prepared hint, at once. */
    askHint(itemId: string): Promise<void> {
      return act(async () => {
        haptic.tap();
        pin(itemId);
        const res = await hintItem(id, itemId);
        await store(res.session);
        replied(res, itemId);
      });
    },

    /**
     * Her question to the tutor (issue #402): never graded, never a try; the reply joins the
     * conversation like a hint's. What she typed stays in the field until the reply is there.
     */
    ask(itemId: string, text: string): Promise<void> {
      return act(async () => {
        haptic.tap();
        pin(itemId);
        setPending({ itemId, text, asked: true });
        try {
          const res = await askItem(id, itemId, text);
          await store(res.session);
          drafts.question.setText('');
          replied(res, itemId);
        } finally {
          setPending(null);
        }
      });
    },

    /** "Merk ich mir für nachher" (issue #402): Buddy brings her question up after the practice. */
    keep(turnId: string): Promise<void> {
      return act(async () => {
        haptic.tap();
        storeTurn(id, (await keepForLater(id, turnId)).turn);
      });
    },

    /** "Anders erklären", or with `choice` the reason she tapped (#388): Buddy's answer under it. */
    explainAgain(itemId: string, way: ReexplainWay, choice?: number): Promise<void> {
      return act(async () => {
        haptic.tap();
        setAgain({ itemId, way });
        try {
          const res = await explainItem(id, itemId, way, choice);
          await store(res.session);
          voice.readReply(res.reply.text);
        } finally {
          setAgain(null);
        }
      });
    },

    /** Homework help "Später": the task stays open and comes back after the others. */
    later(itemId: string): Promise<void> {
      return act(async () => {
        await store(await deferItem(id, itemId));
        pin(null);
        drafts.clearAnswer();
        announce(t('practice:later_done'));
      });
    },

    /**
     * "Die Wörter als Karten durchgehen" (issue #147): the server picks the words of this
     * finished run that did not sit and opens the pass in place of the result — the result has
     * been read by then, and the pass is where she is now.
     */
    goThroughCards(): Promise<void> {
      return act(async () => {
        haptic.tap();
        const pass = await startCardPass(id);
        seedSession(pass);
        router.replace(`/practice/${pass.id}`);
      });
    },
  };
}

export type PracticeActions = ReturnType<typeof usePracticeActions>;
