// What she writes to Buddy on the home, and Buddy's reply to it (docs/architecture.md §Turns,
// §Speed): her bubble at once, Buddy's reply while it is written when the answer changes nothing,
// "Stopp" while he writes. With Vorlesen on (issue #386) the reply is read aloud — along from its
// first finished sentence (owner decision 28.09., issue #65) or, when it could not be read along,
// once it is stored; with Vorlesen off a screen reader hears it (audit M-81). Only while the home
// is the screen she sees: a reply is never read over practice or talk (M-79).

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSpokenWords } from '../../components/math/useSpokenMath.js';
import { toast } from '../../components/lb/Toast.js';
import { announce } from '../announce.js';
import { ApiError, newId } from '../api/client.js';
import { sendMessageStreamed, stopMessage } from '../api/endpoints.js';
import { keys, queryClient, setHome } from '../api/queries.js';
import { messageFor, turnFailureText } from '../errors.js';
import { haptic } from '../haptics.js';
import { currentLocale } from '../i18n/index.js';
import { dropped, reacted, tapped } from '../perf.js';
import { speakInOrder, stop as stopListening } from '../speech/listen.js';
import { replyAfter, spokenText } from '../speech/spoken.js';
import { createStreamSpeaker, type StreamSpeaker } from '../speech/streamSpeaker.js';
import { readsAloud, useVoiceMode } from '../speech/voiceMode.js';
import { refreshHome } from './useHomeAct.js';
import { inThread } from './unsent.js';

type Options = {
  /** The conversation as the home has it now. */
  thread: readonly MessageView[] | undefined;
  /** She sent something: the conversation follows to its end. */
  onSend: () => void;
};

export function useHomeSend({ thread, onSend }: Options) {
  const { t } = useTranslation('buddy');
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  /** Buddy's reply while it is being written (an answer that changes nothing). */
  const [live, setLive] = useState<string | null>(null);
  /** The message being answered right now and how to end its stream ("Stopp"). */
  const sending = useRef<{ id: string; controller: AbortController } | null>(null);
  // Vorlesen (the speaker in the head, issue #386): Buddy's replies are read aloud.
  const voiceOn = useVoiceMode(readsAloud);
  const words = useSpokenWords();
  /** The message she sent last whose reply hasn't been read aloud yet (Vorlesen). */
  const awaitingReply = useRef<string | null>(null);
  /** The home is the screen she sees (a reply is never read over practice or talk, M-79). */
  const focused = useRef(true);

  // Buddy's reply to what she just sent, once it is there (right with the answer, or later
  // when a slow turn finishes): read aloud with Vorlesen on, otherwise announced to a screen
  // reader (audit M-81) — only while the home is on screen.
  useEffect(() => {
    const sent = awaitingReply.current;
    if (!sent || !thread || !focused.current) return;
    const reply = replyAfter(thread, sent);
    if (!reply) return;
    awaitingReply.current = null;
    const text = spokenText(reply.text, words);
    if (voiceOn) speakInOrder([{ text, lang: currentLocale() }]);
    else announce(t('buddy:a11y.reply', { text }));
  }, [thread, voiceOn, words, t]);

  // Going to another screen ends whatever is being read, and a reply that comes later is not
  // read there.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        awaitingReply.current = null;
        stopListening();
      };
    }, []),
  );

  async function send(
    text: string,
    clientMessageId: string = newId(),
    replyToId: string | null = null,
  ): Promise<boolean> {
    // Tap → her bubble on screen: the span she calls "hängt" (issue #66).
    tapped('send');
    // And tap → Buddy's FIRST WORD on screen, which is the wait she actually sits
    // through (issue #169). Server-side we only ever saw the model's share of it.
    tapped('reply');
    setPending({ id: clientMessageId, text });
    reacted('send');
    setLive(null);
    onSend();
    awaitingReply.current = clientMessageId;
    const controller = new AbortController();
    sending.current = { id: clientMessageId, controller };
    // Buddy's reply appears while it is written when the answer changes nothing
    // (docs/architecture.md §Speed) — and with Vorlesen on it is read along from the
    // first finished sentence (owner decision 28.09., issue #65). `speakable` is the
    // server's word that this answer changes nothing and carries no safeguarding; anything
    // else is read only once it is stored (audit M-52), by the effect above.
    let round = 0;
    const along: { speaker: StreamSpeaker | null } = { speaker: null };
    try {
      const res = await sendMessageStreamed(
        text,
        clientMessageId,
        replyToId,
        (e) => {
          if (e.round !== round) {
            // A new attempt replaces what was shown — and what was already said of it.
            round = e.round;
            setLive(null);
            along.speaker?.cancel();
            along.speaker = null;
          }
          if (!e.speakable) return;
          // Written at the end: seen there while she follows it; scrolled up to read, she
          // stays where she is and "↓ Neue Antwort" shows.
          setLive(e.text);
          // The first character of the answer is on screen.
          if (e.text.length > 0) reacted('reply');
          if (!voiceOn) return;
          if (!along.speaker) {
            along.speaker = createStreamSpeaker(
              currentLocale(),
              (sentence) => spokenText(sentence, words),
              () => undefined,
            );
            // What is read along is not read again from the thread.
            awaitingReply.current = null;
          }
          along.speaker.feed(e.text, e.done);
        },
        controller.signal,
      );
      setHome(res.home);
      // The failed message says why in the thread, with "Nochmal senden" right there; a toast
      // would sit on top of exactly that. Screen readers still hear it.
      if (res.status === 'failed') {
        // Whatever was said of a withdrawn answer stops mid-sentence.
        along.speaker?.cancel();
        // No first word ever came: her wait is not the app's measurement (lib/perf.ts).
        dropped('reply');
        announce(turnFailureText(res.error_code));
      } else along.speaker?.feed(replyAfter(res.home.thread, clientMessageId)?.text ?? '', true);
      return true;
    } catch (err) {
      along.speaker?.cancel();
      dropped('reply');
      // Nothing to read when the reply comes after a failure she was told about.
      awaitingReply.current = null;
      // She stopped it: the home from the stop says where it stands.
      if (err instanceof ApiError && err.code === 'aborted') return true;
      haptic.soft();
      toast.show(messageFor(err), 'error');
      // The message may have reached the server (then it shows as failed or processing);
      // otherwise the composer gets her text back (audit M-76).
      await refreshHome().catch(() => undefined);
      return inThread(queryClient.getQueryData<BuddyHome>(keys.home), clientMessageId);
    } finally {
      if (sending.current?.id === clientMessageId) sending.current = null;
      setPending(null);
      setLive(null);
    }
  }

  /**
   * "Stopp": the server ends the turn (stopped — or it was answered already, then the reply
   * is there), then this side stops listening to the stream. A message the server has not
   * stored yet is asked about once more; failing that, the answer comes as usual.
   */
  async function stopReply(): Promise<void> {
    const cur = sending.current;
    if (!cur) return;
    haptic.tap();
    const ask = () => stopMessage(cur.id);
    try {
      let res;
      try {
        res = await ask();
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'not_found')) throw err;
        await new Promise((r) => setTimeout(r, 700));
        res = await ask();
      }
      // Nothing of a stopped (or answered-and-stopped) reply is read aloud.
      awaitingReply.current = null;
      cur.controller.abort();
      setHome(res.home);
      if (res.status === 'failed') announce(t('buddy:thread.stopped'));
    } catch (err) {
      // Not found twice (it never arrived) or no connection: the reply goes on as it is.
      if (err instanceof ApiError && err.code === 'not_found') return;
      haptic.soft();
      toast.show(messageFor(err), 'error');
    }
  }

  return {
    /** What she just sent, until the home has it. */
    pending,
    live,
    send,
    stopReply,
  };
}
