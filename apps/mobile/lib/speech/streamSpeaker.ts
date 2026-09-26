// Speaks a reply sentence by sentence while it arrives (lib/speech/sentences.ts):
// feed it the text so far; `end` fires once the last sentence was read ('done')
// or reading was stopped or failed. Starting anything else aloud stops it.

import { speak, stop, type ListenEnd } from './listen.js';
import { nextSentences } from './sentences.js';

export type StreamSpeaker = {
  /** The reply as far as it is written; `done` once it is complete. */
  feed: (text: string, done: boolean) => void;
  /** Stops reading; `end` fires with 'stopped'. */
  cancel: () => void;
  /** The text fed so far (what is being or was read). */
  readonly text: string;
};

export function createStreamSpeaker(
  lang: string,
  transform: (sentence: string) => string,
  end: (why: ListenEnd) => void,
): StreamSpeaker {
  let upTo = 0;
  let text = '';
  let complete = false;
  let speaking = false;
  let over = false;
  const queue: string[] = [];

  const finish = (why: ListenEnd) => {
    if (over) return;
    over = true;
    queue.length = 0;
    end(why);
  };

  const pump = () => {
    if (over || speaking) return;
    const next = queue.shift();
    if (next === undefined) {
      if (complete) finish('done');
      return;
    }
    speaking = true;
    void speak(transform(next), lang, {
      onEnd: (why) => {
        speaking = false;
        if (why === 'done') pump();
        else finish(why);
      },
    });
  };

  return {
    feed(next, done) {
      if (over) return;
      text = next;
      const r = nextSentences(next, upTo, done);
      upTo = r.upTo;
      queue.push(...r.parts);
      if (done) complete = true;
      pump();
    },
    cancel() {
      if (over) return;
      const wasSpeaking = speaking;
      finish('stopped');
      if (wasSpeaking) stop();
    },
    get text() {
      return text;
    },
  };
}
