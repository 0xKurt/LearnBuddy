import { useRef, useState } from 'react';
import { transcribe } from '../api/endpoints.js';
import { prevTail } from './dictation.js';
import { ContinuousTurns } from './continuousTurns.js';
import { voiceStore } from './voiceState.js';
import type { LiveRecording } from './liveRecording.js';
import { transcriptLang } from './spoken.js';

type Options = {
  lang: string | null;
  onStart(): void;
  onPending(value: boolean): void;
  onLive?(text: string): void;
  onText(text: string, current: () => boolean): void;
  onFailed(error: unknown): void;
};

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 8192)
    text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(text);
}

/** One recording session, ordered transcripts, separate normal messages for continuations. */
export function useConversationCapture(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [ready, setReady] = useState(false);
  const session = useRef(0);
  const utterance = useRef(0);
  const tail = useRef('');
  const chain = useRef(Promise.resolve());
  const turns = useRef<ContinuousTurns | null>(null);

  function begin(): void {
    const token = ++session.current;
    utterance.current = 0;
    tail.current = '';
    chain.current = Promise.resolve();
    setReady(false);
    turns.current = new ContinuousTurns({
      start() {
        utterance.current++;
        latest.current.onPending(false);
        latest.current.onStart();
      },
      turn(bytes) {
        const number = utterance.current;
        const current = () => session.current === token && utterance.current === number;
        const lang = latest.current.lang;
        latest.current.onPending(true);
        chain.current = chain.current.then(async () => {
          if (session.current !== token) return;
          const request = {
            mime: 'audio/aac' as const,
            audio_base64: base64(bytes),
            purpose: 'message' as const,
            lang: transcriptLang(lang),
            prev_tail: prevTail(tail.current),
          };
          try {
            const attempt = () =>
              transcribe(request, {
                onProgress: (event) => {
                  if (current()) latest.current.onLive?.(event.text);
                },
              });
            const result = await attempt().catch(attempt);
            if (session.current !== token) return;
            const text = result.text.trim();
            tail.current = text;
            if (current()) latest.current.onPending(false);
            if (text) latest.current.onText(text, current);
          } catch (error) {
            if (session.current === token) {
              latest.current.onPending(false);
              latest.current.onFailed(error);
            }
          }
        });
      },
    });
  }

  function cancel(): void {
    session.current++;
    turns.current = null;
    setReady(false);
  }
  const stream: LiveRecording = {
    data: (bytes) => turns.current?.push(bytes),
    meter(db, elapsedMs) {
      turns.current?.observe(db, elapsedMs, voiceStore.get().phase === 'speaking');
      if (turns.current?.ready) setReady(true);
    },
    end(deliver) {
      if (deliver) turns.current?.finish();
      else cancel();
    },
  };
  return { stream, ready, begin, cancel, finish: () => turns.current?.requestFinish() };
}
