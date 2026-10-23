// Completed prefixes use the final parser, chosen forms and the same JSON string repair (#874).
import type { z } from 'zod';

import { answerUpTo } from '../../llm/partial.js';
import { keepChosen, type Keep } from '../practice/formChoice.js';
import { ReadingParse } from './sources.js';

export type ReadingConsumer = (reading: z.infer<typeof ReadingParse>) => Promise<void>;

/** Serial writes, drained even on a provider error: no prefix can arrive after the final state. */
export function streamReading(keep: Keep | null, accept: ReadingConsumer) {
  const next = new Map(['items', 'structured', 'reading', 'part_tasks'].map((key) => [key, 1]));
  let writes = Promise.resolve();
  let failure: unknown;
  return {
    onPartial(raw: string) {
      if (failure) return;
      for (const [key, n] of next) {
        for (let count = n; ; count++) {
          const prefix = answerUpTo(raw, key, count);
          if (!prefix || typeof prefix !== 'object') break;
          // Defaults may parse a finished legacy answer, but cannot guess a decision still
          // coming. Source and second subject precede questions in the outgoing schema.
          if (!('source' in prefix) || !('marked' in prefix) || !('other_subject' in prefix)) break;
          next.set(key, count + 1);
          const parsed = ReadingParse.safeParse(keepChosen(prefix, keep));
          if (!parsed.success) continue;
          writes = writes
            .then(() => (failure ? undefined : accept(parsed.data)))
            .catch((err: unknown) => {
              failure = err;
            });
        }
      }
    },
    async drain() {
      await writes;
      if (failure) throw failure;
    },
  };
}
