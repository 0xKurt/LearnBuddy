// A rejected question costs itself, not the whole stream (#928).
import { answerUpTo } from '../../llm/partial.js';
import { keepChosen, type Keep } from './formChoice.js';
import type { GeneratedSet, parseSetFor } from './setProfiles.js';

/** Examine each completed prefix once until enough questions survive both checks. */
export function firstQuestions(opts: {
  count: number;
  parse: ReturnType<typeof parseSetFor>;
  keep: () => Keep | null;
  accept: (set: GeneratedSet) => boolean;
}): (raw: string) => void {
  let handedOver = false;
  let examined = opts.count - 1;
  return (raw) => {
    if (handedOver) return;
    for (;;) {
      const prefix = answerUpTo(raw, 'items', examined + 1);
      if (prefix === null) return;
      examined++;
      const parsed = opts.parse.safeParse(keepChosen(prefix, opts.keep()));
      if (!parsed.success || !parsed.data.usable || parsed.data.items.length < opts.count) continue;
      if (opts.accept(parsed.data)) {
        handedOver = true;
        return;
      }
    }
  };
}
