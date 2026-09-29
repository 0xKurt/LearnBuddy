// Speaks a reply sentence by sentence while it arrives (lib/speech/sentences.ts):
// feed it the text so far; `end` fires once the last sentence was read ('done')
// or reading was stopped or failed. Starting anything else aloud stops it.
//
// It is one utterance, not one per sentence (issue #24): the audio of the next sentence is
// fetched while the current one plays, so there is no silence in between. Measured 29.09.
// (apps/api/evals/tts): synthesising a sentence takes 0.74–1.6 s, a sentence plays 3–9 s —
// fetching one ahead closes every gap, fetching more ahead gains nothing.

import { speakStream, type ListenEnd } from './listen.js';

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
  let text = '';
  let over = false;
  const finish = (why: ListenEnd) => {
    if (over) return;
    over = true;
    end(why);
  };
  const stream = speakStream(lang, { transform, onEnd: finish });
  return {
    feed(next, done) {
      if (over) return;
      text = next;
      stream.feed(next, done);
    },
    cancel() {
      if (over) return;
      over = true;
      // Whatever is already playing stops, the phone's voice too; `end` is reported here so
      // it also fires when the utterance was already replaced by something else.
      stream.cancel();
      end('stopped');
    },
    get text() {
      return text;
    },
  };
}
